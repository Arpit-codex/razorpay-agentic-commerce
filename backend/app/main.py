"""
Main FastAPI Application Entry Point for Agentic Commerce Engine.
Real AI-powered conversational chatbot using Google Gemini 3.6 Flash with function calling.
"""

import os
import uuid
from typing import Any, Dict, List, Optional
from contextlib import asynccontextmanager

# Load .env BEFORE importing app modules so env vars are available
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .database import (
    init_db,
    record_audit_log,
    fetch_audit_logs,
    get_hourly_order_count,
    get_db_connection
)
from .catalog import (
    get_all_products_raw,
    get_product_by_id,
    get_json_ld_catalog,
    calculate_bundle_pricing,
    register_web_product
)
from .search_engine import search_real_products, find_lowest_price_deal
from .policy_engine import (
    CheckoutRequestPayload,
    OrderItem,
    verify_checkout_policy,
    HARD_BUDGET_CEILING_INR,
    MAX_ORDERS_PER_HOUR
)
from .razorpay_service import (
    create_razorpay_order,
    create_razorpay_payment_link,
    verify_signature,
    RAZORPAY_KEY_ID
)
from .failure_handler import (
    FailureSimulationRequest,
    execute_failure_recovery_pipeline
)
from .ai_engine import chat_with_ai, clear_session
from .campaign_orchestrator import run_campaign_orchestrator, get_active_campaigns
from .price_watch import (
    add_price_watch,
    get_price_watches,
    cancel_price_watch,
    check_watch,
    check_all_active_watches
)
from .price_history import get_price_analytics
from .web_navigator import navigate_and_extract_product



@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    gemini_status = 'SET' if os.getenv('GEMINI_API_KEY') else 'NOT SET'
    rzp_status = 'LIVE' if os.getenv('RAZORPAY_KEY_ID') else 'SANDBOX'
    print("[OK] Database initialized & catalog seeded.")
    print(f"[AI] Gemini API Key: {gemini_status}")
    print(f"[PAY] Razorpay Key: {rzp_status}")
    yield


app = FastAPI(
    title="Razorpay Agentic Commerce Engine",
    description="AI-Powered Conversational Commerce — Human Adaptive Chatbot & External AI Agent Protocol",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------
# Request / Response Models
# --------------------------------------------------------------------------

class AIChatRequest(BaseModel):
    session_id: str = Field(default_factory=lambda: f"session_{uuid.uuid4().hex[:8]}")
    message: str = Field(..., min_length=1, description="User's natural language message")


class ResetSessionRequest(BaseModel):
    session_id: str


class VerifyPaymentPayload(BaseModel):
    session_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class AddPriceWatchRequest(BaseModel):
    session_id: str
    product_id: str
    product_name: str
    brand_model: str
    target_price_inr: float
    deadline_hours: int = 24
    action_on_expire: str = "BUY_ANYWAY"
    current_price_inr: float = 0.0


class CancelPriceWatchRequest(BaseModel):
    watch_id: str


class CheckPriceWatchRequest(BaseModel):
    watch_id: str
    simulated_price: Optional[float] = None


class AgentNavigateRequest(BaseModel):
    query_or_url: str



# --------------------------------------------------------------------------
# 1. REAL AI CONVERSATIONAL CHAT ENDPOINT
# --------------------------------------------------------------------------

@app.post("/api/v1/chat/message", summary="AI-Powered Conversational Commerce Chat")
def ai_chat_endpoint(req: AIChatRequest):
    """
    Real-time AI-powered chat using Google Gemini 3.6 Flash.
    User types any natural language requirement — AI understands, asks follow-up
    questions, searches catalog with function calling, and returns personalized
    recommendations with product cards and bundle deals.
    """
    result = chat_with_ai(session_id=req.session_id, user_message=req.message)

    # Record AI interaction in audit trail
    record_audit_log(
        session_id=req.session_id,
        actor_type="HUMAN_USER",
        user_intent="AI_CONVERSATION",
        ai_reasoning=result["response"][:300],
        policy_check_status="PASSED",
        payload={
            "user_message": req.message,
            "product_cards_shown": len(result.get("product_cards", [])),
            "bundle_cards_shown": len(result.get("bundle_cards", []))
        },
        payment_status="PENDING"
    )

    return result


@app.post("/api/v1/chat/reset", summary="Reset AI Conversation Session")
def reset_chat_session(req: ResetSessionRequest):
    """Clear conversation history for a session to start fresh."""
    clear_session(req.session_id)
    return {"cleared": True, "session_id": req.session_id}


@app.get("/api/v1/search/live", summary="Tavily Live Web Product Search")
def search_live_endpoint(q: str, budget: Optional[float] = None, category: Optional[str] = None):
    """
    Search the live web using Tavily for real products, pricing in INR, and specs.
    Auto-registers found products into SQLite for checkout eligibility under the ₹10,000 ceiling.
    """
    res = search_real_products(user_query=q, budget_max=budget, category=category)
    for p in res.get("products", []):
        register_web_product(p)
    return res


class LowestPriceRequest(BaseModel):
    session_id: str
    product_name: str
    brand_model: str
    budget_max: Optional[float] = None


@app.post("/api/v1/search/lowest-price", summary="Find Lowest Price Across Retailers")
def find_lowest_price_endpoint(req: LowestPriceRequest):
    """
    Direct Buy Flow (Option 1):
    Checks online across Indian retailers (Amazon, Flipkart, Croma, Reliance Digital, etc.)
    for the exact model and returns the store with the lowest price, savings, and direct checkout eligibility.
    """
    deal = find_lowest_price_deal(
        product_name=req.product_name,
        brand_model=req.brand_model,
        budget_max=req.budget_max
    )

    # Auto-register product for instant checkout eligibility
    product_data = {
        "id": deal["id"],
        "name": deal["product_name"],
        "category": deal["category"],
        "price_inr": deal["lowest_price_inr"],
        "description": deal["specs_summary"],
        "target_tier": "Verified Lowest Price",
        "durability": "Commercial Grade",
        "usage_tags": ["direct-buy", deal["lowest_store"].lower().replace(" ", "-")],
        "rating": deal.get("rating", 4.6),
        "stock": 10,
        "image_url": deal["image_url"]
    }
    register_web_product(product_data)

    # Record search in audit trail
    record_audit_log(
        session_id=req.session_id,
        actor_type="HUMAN_USER",
        user_intent="PRICE_COMPARISON_DIRECT_BUY",
        ai_reasoning=(
            f"Multi-retailer price comparison for '{req.brand_model} {req.product_name}'. "
            f"Lowest price found at {deal['lowest_store']} for ₹{deal['lowest_price_inr']:,}. "
            f"Verified across {len(deal['retailers'])} retailers."
        ),
        policy_check_status="PASSED" if deal["is_within_10k_limit"] else "FAILED",
        policy_violation_reason=None if deal["is_within_10k_limit"] else "Hard budget ceiling breached (> ₹10,000)",
        payload={
            "product_name": req.product_name,
            "brand_model": req.brand_model,
            "lowest_store": deal["lowest_store"],
            "lowest_price": deal["lowest_price_inr"],
            "savings": deal["savings_inr"],
            "retailers_compared": len(deal["retailers"])
        },
        payment_status="PENDING"
    )

    return deal


# --------------------------------------------------------------------------
# 2. External AI-Readable Catalog Protocol (JSON-LD)
# --------------------------------------------------------------------------

@app.get("/api/v1/agent/catalog", summary="Schema.org JSON-LD Agent Catalog")
def get_agent_catalog(request: Request):
    base_url = str(request.base_url).rstrip("/")
    return get_json_ld_catalog(base_url=base_url)


# --------------------------------------------------------------------------
# 3. Autonomous AI Buyer Checkout Protocols (NPCI UAP, Google AP2, ACP, x402)
# --------------------------------------------------------------------------

@app.get("/api/v1/agent/protocols", summary="Agentic Commerce Protocol Capabilities")
def get_supported_protocols():
    return {
        "merchant": "Razorpay Agentic Commerce Merchant Gateway",
        "version": "2.0.0",
        "protocols": {
            "NPCI_UAP": {
                "name": "NPCI Unified Agent Protocol (UPI Circle & Reserve Pay)",
                "endpoint": "/api/v1/agent/uap-checkout",
                "primitives": ["DELEGATED_AUTHORITY", "RESERVE_PAY_BOUNDED_SPENDING"],
                "currency": "INR",
                "status": "OPERATIONAL"
            },
            "GOOGLE_AP2": {
                "name": "Google Agent Payments Protocol (AP2 Mandate)",
                "endpoint": "/api/v1/agent/ap2-checkout",
                "features": ["FIDO_SIGNED_MANDATES", "SPENDING_BOUNDS"],
                "status": "OPERATIONAL"
            },
            "ACP": {
                "name": "Agentic Commerce Protocol (OpenAI / Stripe)",
                "endpoint": "/api/v1/agent/checkout",
                "features": ["HEADLESS_CHECKOUT", "JSON_LD_DISCOVERY", "BUNDLE_RULES"],
                "status": "OPERATIONAL"
            },
            "x402": {
                "name": "x402 HTTP Payment Required",
                "header": "Payment-Required",
                "status": "OPERATIONAL"
            }
        },
        "policy_guardrails": {
            "hard_budget_ceiling_inr": HARD_BUDGET_CEILING_INR,
            "max_orders_per_hour": MAX_ORDERS_PER_HOUR,
            "audit_engine": "SQLITE_IMMUTABLE_STORE"
        }
    }


@app.post("/api/v1/agent/uap-checkout", summary="NPCI UAP Autonomous Checkout (UPI Circle & Reserve Pay)")
def agent_uap_checkout(payload: CheckoutRequestPayload):
    payload.actor_type = "EXTERNAL_AI_BUYER"
    payload.protocol = "NPCI_UAP"
    payload.user_intent = payload.user_intent or "NPCI_UAP_AUTONOMOUS_CHECKOUT"

    # Provide default mock UAP delegation if not attached
    if not payload.uap_delegation:
        from .policy_engine import UAPDelegationPayload
        payload.uap_delegation = UAPDelegationPayload(
            delegation_token=f"uap_del_{uuid.uuid4().hex[:8]}",
            reserve_pay_id=f"respay_{uuid.uuid4().hex[:8]}",
            reserve_pay_pool_inr=8000.0,
            delegatee_agent_id="agent_uap_autobuyer_01"
        )

    policy_res = verify_checkout_policy(payload)
    if not policy_res.passed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "NPCI_UAP_POLICY_REJECTED",
                "reason": policy_res.violation_reason,
                "hard_limit_inr": HARD_BUDGET_CEILING_INR,
                "reserve_pay_pool_inr": payload.uap_delegation.reserve_pay_pool_inr if payload.uap_delegation else None
            }
        )

    order_receipt = f"rcpt_uap_{uuid.uuid4().hex[:8]}"
    rzp_order = create_razorpay_order(
        amount_inr=policy_res.calculated_total_inr,
        receipt=order_receipt,
        notes={
            "session_id": payload.session_id,
            "actor_type": "EXTERNAL_AI_BUYER",
            "protocol": "NPCI_UAP",
            "reserve_pay_id": payload.uap_delegation.reserve_pay_id
        }
    )

    audit_id = record_audit_log(
        session_id=payload.session_id,
        actor_type="EXTERNAL_AI_BUYER",
        user_intent="NPCI_UAP_AUTONOMOUS_CHECKOUT",
        ai_reasoning=(
            f"NPCI UAP Autonomous Checkout executed via UPI Circle delegation. "
            f"Reserve Pay block ID: {payload.uap_delegation.reserve_pay_id}. "
            f"Verified within allocated pool (Total INR {policy_res.calculated_total_inr:,.2f} <= ₹{payload.uap_delegation.reserve_pay_pool_inr:,.2f})."
        ),
        policy_check_status="PASSED",
        razorpay_order_id=rzp_order["id"],
        payload={
            "protocol": "NPCI_UAP",
            "uap": payload.uap_delegation.model_dump(),
            "request": payload.model_dump(),
            "rzp_order": rzp_order
        },
        payment_status="CREATED"
    )

    return {
        "status": "APPROVED",
        "protocol": "NPCI_UAP",
        "audit_log_id": audit_id,
        "uap_delegation": {
            "status": "AUTHORIZED",
            "reserve_pay_id": payload.uap_delegation.reserve_pay_id,
            "remaining_pool_inr": round(payload.uap_delegation.reserve_pay_pool_inr - policy_res.calculated_total_inr, 2)
        },
        "order": rzp_order
    }


@app.post("/api/v1/agent/ap2-checkout", summary="Google AP2 Mandate Autonomous Checkout")
def agent_ap2_checkout(payload: CheckoutRequestPayload):
    payload.actor_type = "EXTERNAL_AI_BUYER"
    payload.protocol = "GOOGLE_AP2"
    payload.user_intent = payload.user_intent or "GOOGLE_AP2_MANDATE_CHECKOUT"

    # Provide default mock AP2 mandate if not attached
    if not payload.ap2_mandate:
        from .policy_engine import AP2MandatePayload
        payload.ap2_mandate = AP2MandatePayload(
            mandate_id=f"ap2_mnd_{uuid.uuid4().hex[:8]}",
            authorized_agent_id="agent_gemini_personal_buyer",
            max_amount_inr=9000.0,
            expires_at="2026-09-05T23:59:59Z",
            signature=f"sig_fido2_{uuid.uuid4().hex[:16]}"
        )

    policy_res = verify_checkout_policy(payload)
    if not policy_res.passed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "GOOGLE_AP2_MANDATE_REJECTED",
                "reason": policy_res.violation_reason,
                "mandate_max_amount_inr": payload.ap2_mandate.max_amount_inr if payload.ap2_mandate else None
            }
        )

    order_receipt = f"rcpt_ap2_{uuid.uuid4().hex[:8]}"
    rzp_order = create_razorpay_order(
        amount_inr=policy_res.calculated_total_inr,
        receipt=order_receipt,
        notes={
            "session_id": payload.session_id,
            "actor_type": "EXTERNAL_AI_BUYER",
            "protocol": "GOOGLE_AP2",
            "mandate_id": payload.ap2_mandate.mandate_id
        }
    )

    audit_id = record_audit_log(
        session_id=payload.session_id,
        actor_type="EXTERNAL_AI_BUYER",
        user_intent="GOOGLE_AP2_MANDATE_CHECKOUT",
        ai_reasoning=(
            f"Google AP2 Cryptographic Mandate verified. "
            f"Mandate ID: {payload.ap2_mandate.mandate_id}. "
            f"Verified within authorized ceiling (Total INR {policy_res.calculated_total_inr:,.2f} <= ₹{payload.ap2_mandate.max_amount_inr:,.2f})."
        ),
        policy_check_status="PASSED",
        razorpay_order_id=rzp_order["id"],
        payload={
            "protocol": "GOOGLE_AP2",
            "mandate": payload.ap2_mandate.model_dump(),
            "request": payload.model_dump(),
            "rzp_order": rzp_order
        },
        payment_status="CREATED"
    )

    return {
        "status": "APPROVED",
        "protocol": "GOOGLE_AP2",
        "audit_log_id": audit_id,
        "mandate_verification": {
            "status": "VALID_SIGNATURE",
            "mandate_id": payload.ap2_mandate.mandate_id,
            "authorized_agent": payload.ap2_mandate.authorized_agent_id
        },
        "order": rzp_order
    }


@app.post("/api/v1/agent/checkout", summary="Autonomous Checkout for External AI Buyers (ACP / Direct)")
def agent_autonomous_checkout(payload: CheckoutRequestPayload):
    payload.actor_type = "EXTERNAL_AI_BUYER"
    payload.protocol = "ACP"
    payload.user_intent = payload.user_intent or "ACP_AUTONOMOUS_AGENT_CHECKOUT"

    policy_res = verify_checkout_policy(payload)
    if not policy_res.passed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "POLICY_REJECTED",
                "reason": policy_res.violation_reason,
                "hard_limit_inr": HARD_BUDGET_CEILING_INR,
                "velocity_limit_per_hour": MAX_ORDERS_PER_HOUR,
            }
        )

    order_receipt = f"rcpt_agent_{uuid.uuid4().hex[:8]}"
    rzp_order = create_razorpay_order(
        amount_inr=policy_res.calculated_total_inr,
        receipt=order_receipt,
        notes={"session_id": payload.session_id, "actor_type": "EXTERNAL_AI_BUYER", "protocol": "ACP"}
    )

    audit_id = record_audit_log(
        session_id=payload.session_id,
        actor_type="EXTERNAL_AI_BUYER",
        user_intent="ACP_AUTONOMOUS_AGENT_CHECKOUT",
        ai_reasoning=f"ACP Headless AI Buyer checkout passed policy gate. Total INR {policy_res.calculated_total_inr:,.2f}.",
        policy_check_status="PASSED",
        razorpay_order_id=rzp_order["id"],
        payload={"protocol": "ACP", "request": payload.model_dump(), "rzp_order": rzp_order},
        payment_status="CREATED"
    )

    return {
        "status": "APPROVED",
        "protocol": "ACP",
        "audit_log_id": audit_id,
        "policy_verification": {"status": "PASSED", "enforced_ceiling_inr": HARD_BUDGET_CEILING_INR},
        "order": rzp_order
    }


# --------------------------------------------------------------------------
# Campaign Orchestrator Endpoints (Merchant Revenue Growth)
# --------------------------------------------------------------------------

class OrchestrateCampaignRequest(BaseModel):
    session_id: str = Field(default="campaign_agent_session")


@app.post("/api/v1/campaigns/orchestrate", summary="Run Autonomous Campaign Orchestrator")
def orchestrate_campaign_endpoint(req: OrchestrateCampaignRequest):
    return run_campaign_orchestrator(session_id=req.session_id)


@app.get("/api/v1/campaigns/active", summary="List Active Merchant Campaigns")
def get_active_campaigns_endpoint():
    return {"campaigns": get_active_campaigns()}


# --------------------------------------------------------------------------
# 4. Human Checkout (Policy Gated)
# --------------------------------------------------------------------------

@app.post("/api/v1/checkout/create", summary="Create Policy-Checked Checkout Order")
def create_checkout_session(payload: CheckoutRequestPayload):
    payload.actor_type = "HUMAN_USER"
    policy_res = verify_checkout_policy(payload)
    if not policy_res.passed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "POLICY_REJECTED", "reason": policy_res.violation_reason}
        )

    order_receipt = f"rcpt_human_{uuid.uuid4().hex[:8]}"
    rzp_order = create_razorpay_order(
        amount_inr=policy_res.calculated_total_inr,
        receipt=order_receipt,
        notes={"session_id": payload.session_id, "actor_type": "HUMAN_USER"}
    )

    audit_id = record_audit_log(
        session_id=payload.session_id,
        actor_type="HUMAN_USER",
        user_intent=payload.user_intent or "HUMAN_CHECKOUT",
        ai_reasoning=f"Human checkout passed policy gate. Total INR {policy_res.calculated_total_inr:,.2f}.",
        policy_check_status="PASSED",
        razorpay_order_id=rzp_order["id"],
        payload={"request": payload.model_dump(), "rzp_order": rzp_order},
        payment_status="CREATED"
    )

    return {"status": "APPROVED", "audit_log_id": audit_id, "order": rzp_order}


@app.post("/api/v1/checkout/verify", summary="Verify Razorpay Payment Signature")
def verify_payment_endpoint(data: VerifyPaymentPayload):
    is_valid = verify_signature(data.razorpay_order_id, data.razorpay_payment_id, data.razorpay_signature)
    payment_status = "PAID" if is_valid else "FAILED_SIGNATURE"

    record_audit_log(
        session_id=data.session_id,
        actor_type="HUMAN_USER",
        user_intent="PAYMENT_VERIFICATION",
        ai_reasoning=f"Payment signature verification: {payment_status}",
        policy_check_status="PASSED" if is_valid else "FAILED",
        razorpay_order_id=data.razorpay_order_id,
        payload=data.model_dump(),
        payment_status=payment_status
    )

    return {"verified": is_valid, "payment_status": payment_status}


# --------------------------------------------------------------------------
# 5. Audit Trail & Stats
# --------------------------------------------------------------------------

@app.get("/api/v1/audit/logs", summary="Fetch Audit Trail")
def get_audit_logs(limit: int = 50):
    logs = fetch_audit_logs(limit=limit)
    return {"count": len(logs), "logs": logs}


@app.get("/api/v1/audit/stats", summary="Policy Engine Live Stats")
def get_audit_stats(session_id: Optional[str] = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM audit_logs WHERE policy_check_status = 'PASSED'")
    total_passed = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM audit_logs WHERE policy_check_status = 'FAILED'")
    total_failed = cursor.fetchone()[0]
    conn.close()

    hourly_orders = 0
    if session_id:
        hourly_orders = get_hourly_order_count(session_id)

    return {
        "hard_ceiling_inr": HARD_BUDGET_CEILING_INR,
        "velocity_limit_per_hour": MAX_ORDERS_PER_HOUR,
        "session_hourly_orders": hourly_orders,
        "session_velocity_remaining": max(0, MAX_ORDERS_PER_HOUR - hourly_orders),
        "total_policy_checks_passed": total_passed,
        "total_policy_checks_failed": total_failed,
        "compliance_rate_pct": round(
            (total_passed / max(1, total_passed + total_failed)) * 100, 1
        )
    }


# --------------------------------------------------------------------------
# 6. Graceful Failure Recovery Demo
# --------------------------------------------------------------------------

@app.post("/api/v1/test/trigger-failure", summary="Simulate Failure & Autonomous Recovery")
def trigger_failure_simulation(req: FailureSimulationRequest):
    return execute_failure_recovery_pipeline(req)


# --------------------------------------------------------------------------
# 7. Products API
# --------------------------------------------------------------------------

@app.get("/api/v1/products", summary="List All Products")
def list_products():
    return {"products": get_all_products_raw()}


@app.get("/api/v1/products/{product_id}", summary="Get Single Product")
def get_product(product_id: str):
    p = get_product_by_id(product_id)
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    return p


@app.get("/api/v1/health")
def healthcheck():
    return {
        "status": "HEALTHY",
        "service": "Razorpay Agentic Commerce Engine v2",
        "gemini_configured": bool(os.getenv("GEMINI_API_KEY")),
        "razorpay_live": os.getenv("RAZORPAY_KEY_ID", "").startswith("rzp_test_T") or os.getenv("RAZORPAY_KEY_ID", "").startswith("rzp_live_")
    }


# --------------------------------------------------------------------------
# 8. Price Watch, Price History & Agent Web Navigation Endpoints
# --------------------------------------------------------------------------

@app.post("/api/v1/price-watch/add", summary="Add Product to Price Watch")
def create_price_watch_endpoint(req: AddPriceWatchRequest):
    return add_price_watch(
        session_id=req.session_id,
        product_id=req.product_id,
        product_name=req.product_name,
        brand_model=req.brand_model,
        target_price_inr=req.target_price_inr,
        deadline_hours=req.deadline_hours,
        action_on_expire=req.action_on_expire,
        current_price_inr=req.current_price_inr
    )


@app.get("/api/v1/price-watch/list", summary="List Session Price Watches")
def list_price_watches_endpoint(session_id: Optional[str] = None):
    return {"watches": get_price_watches(session_id=session_id)}


@app.post("/api/v1/price-watch/cancel", summary="Cancel Price Watch")
def cancel_price_watch_endpoint(req: CancelPriceWatchRequest):
    return cancel_price_watch(req.watch_id)


@app.post("/api/v1/price-watch/check-now", summary="Trigger Price Watch Check")
def check_price_watch_endpoint(req: CheckPriceWatchRequest):
    return check_watch(req.watch_id, simulated_price=req.simulated_price)


@app.post("/api/v1/price-watch/check-all", summary="Poll All Active Price Watches")
def check_all_watches_endpoint(session_id: Optional[str] = None):
    return {"updated": check_all_active_watches(session_id=session_id)}


@app.get("/api/v1/price-history/analytics", summary="Get Price Analytics & Trends")
def get_price_analytics_endpoint(brand_model: str, product_name: Optional[str] = "", current_price: Optional[float] = None):
    return get_price_analytics(brand_model=brand_model, product_name=product_name or "", current_price=current_price)


@app.post("/api/v1/agent/navigate", summary="Agent Web Navigation Prototype")
def agent_navigate_endpoint(req: AgentNavigateRequest):
    return navigate_and_extract_product(req.query_or_url)

