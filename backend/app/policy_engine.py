"""
Deterministic Policy Engine for Bounded Money Actions.
Rule 1 of Safety & Audit Guardrails ("The Bar"):
- DO NOT allow LLMs or Autonomous Agents to call Razorpay APIs directly.
- Wrap all checkout actions in a Pydantic Policy Engine.
- Enforce: order_amount <= budget_limit (Hard ceiling: ₹10,000 per order).
- Enforce: velocity limits (max 2 orders/hour per session).
- Support Emerging Protocols:
    1. NPCI UAP (Unified Agent Protocol / UPI Circle + Reserve Pay bounded pool)
    2. Google AP2 (Agent Payments Protocol cryptographically signed mandates)
    3. OpenAI/Stripe ACP (Agentic Commerce Protocol headless checkout)
"""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator
from .database import get_hourly_order_count, record_audit_log
from .catalog import get_product_by_id

# Constants defined by prompt guardrails
HARD_BUDGET_CEILING_INR: float = 10000.0
MAX_ORDERS_PER_HOUR: int = 2


class OrderItem(BaseModel):
    product_id: str
    quantity: int = Field(default=1, ge=1, le=10)


class UAPDelegationPayload(BaseModel):
    """NPCI UAP (Unified Agent Protocol) Delegated Authority Token & Reserve Pay Pool."""
    delegation_token: str = Field(..., description="UPI Circle Delegation Token issued by primary account")
    reserve_pay_id: str = Field(..., description="NPCI Reserve Pay pre-blocked fund block identifier")
    reserve_pay_pool_inr: float = Field(..., ge=100.0, description="Pre-allocated maximum spending limit for this agent session")
    delegatee_agent_id: str = Field(default="agent_uap_autobuyer_01", description="Registered agent identity")


class AP2MandatePayload(BaseModel):
    """Google AP2 (Agent Payments Protocol) Cryptographically Signed Mandate."""
    mandate_id: str = Field(..., description="Unique FIDO/AP2 mandate identifier")
    authorized_agent_id: str = Field(..., description="Authorized Agent public identifier")
    max_amount_inr: float = Field(..., ge=100.0, description="Mandate bounded upper spending ceiling")
    expires_at: str = Field(..., description="ISO timestamp until which mandate is valid")
    signature: str = Field(..., description="Cryptographic signature from authorizing human buyer")


class CheckoutRequestPayload(BaseModel):
    session_id: str = Field(..., min_length=3, description="Client or Agent session identifier")
    actor_type: Literal["HUMAN_USER", "EXTERNAL_AI_BUYER"] = Field(
        default="HUMAN_USER",
        description="Originating identity of the purchaser"
    )
    protocol: Literal["DIRECT", "NPCI_UAP", "GOOGLE_AP2", "ACP"] = Field(
        default="DIRECT",
        description="Commerce protocol utilized for this transaction"
    )
    user_intent: str = Field(default="DIRECT_BUY", description="Commerce intent")
    items: List[OrderItem] = Field(..., min_length=1, description="List of items to purchase")
    is_bundle: bool = Field(default=False, description="Whether items are purchased as an approved bundle")
    claimed_total_inr: Optional[float] = Field(default=None, description="Client computed total")
    shipping_name: Optional[str] = "Buildathon Demo Buyer"
    shipping_email: Optional[str] = "buyer@razorpay-buildathon.local"
    ai_reasoning: Optional[str] = "Policy gate verification invoked prior to payment initiation."
    uap_delegation: Optional[UAPDelegationPayload] = None
    ap2_mandate: Optional[AP2MandatePayload] = None


class PolicyCheckResult(BaseModel):
    passed: bool
    violation_reason: Optional[str] = None
    calculated_total_inr: float
    verified_items: List[Dict[str, Any]]
    session_id: str
    actor_type: str
    protocol: str
    hourly_order_count: int


def verify_checkout_policy(payload: CheckoutRequestPayload) -> PolicyCheckResult:
    """
    Deterministic gate that evaluates spending ceilings, velocity limits,
    protocol-specific mandates (UAP Reserve Pay / AP2 Mandates),
    and product inventory BEFORE any payment gateway invocation is allowed.
    """
    protocol_name = payload.protocol

    # 1. Velocity Limit Check
    hourly_orders = get_hourly_order_count(payload.session_id)
    if hourly_orders >= MAX_ORDERS_PER_HOUR:
        violation = (
            f"Velocity limit exceeded: Session '{payload.session_id}' has already created {hourly_orders} "
            f"successful orders in the last hour (Limit: {MAX_ORDERS_PER_HOUR}/hour)."
        )
        record_audit_log(
            session_id=payload.session_id,
            actor_type=payload.actor_type,
            user_intent=payload.user_intent,
            ai_reasoning=payload.ai_reasoning or "Attempted checkout blocked by velocity gate.",
            policy_check_status="FAILED",
            policy_violation_reason=violation,
            razorpay_order_id=None,
            payload={"protocol": protocol_name, **payload.model_dump()},
            payment_status="BLOCKED"
        )
        return PolicyCheckResult(
            passed=False,
            violation_reason=violation,
            calculated_total_inr=0.0,
            verified_items=[],
            session_id=payload.session_id,
            actor_type=payload.actor_type,
            protocol=protocol_name,
            hourly_order_count=hourly_orders
        )

    # 2. Item & Pricing Verification from single-source-of-truth database
    total_calculated = 0.0
    verified_items = []
    primary_product = None
    addon_products = []

    for idx, item in enumerate(payload.items):
        product = get_product_by_id(item.product_id)
        if not product:
            violation = f"Catalog item not found: '{item.product_id}'"
            record_audit_log(
                session_id=payload.session_id,
                actor_type=payload.actor_type,
                user_intent=payload.user_intent,
                ai_reasoning=f"Catalog lookup failed for product id: {item.product_id}",
                policy_check_status="FAILED",
                policy_violation_reason=violation,
                razorpay_order_id=None,
                payload={"protocol": protocol_name, **payload.model_dump()},
                payment_status="BLOCKED"
            )
            return PolicyCheckResult(
                passed=False,
                violation_reason=violation,
                calculated_total_inr=0.0,
                verified_items=[],
                session_id=payload.session_id,
                actor_type=payload.actor_type,
                protocol=protocol_name,
                hourly_order_count=hourly_orders
            )

        # Inventory check
        if product["stock"] < item.quantity:
            violation = f"Insufficient stock for '{product['name']}': Available {product['stock']}, requested {item.quantity}."
            record_audit_log(
                session_id=payload.session_id,
                actor_type=payload.actor_type,
                user_intent=payload.user_intent,
                ai_reasoning=f"Stock exhausted during checkout verification for {product['id']}",
                policy_check_status="FAILED",
                policy_violation_reason=violation,
                razorpay_order_id=None,
                payload={"protocol": protocol_name, **payload.model_dump()},
                payment_status="BLOCKED"
            )
            return PolicyCheckResult(
                passed=False,
                violation_reason=violation,
                calculated_total_inr=0.0,
                verified_items=[],
                session_id=payload.session_id,
                actor_type=payload.actor_type,
                protocol=protocol_name,
                hourly_order_count=hourly_orders
            )

        item_total = product["price_inr"] * item.quantity
        total_calculated += item_total
        is_web = product["id"].startswith("prod_web_")
        verified_items.append({
            "product_id": product["id"],
            "name": product["name"],
            "unit_price": product["price_inr"],
            "quantity": item.quantity,
            "subtotal": item_total,
            "data_source": "TAVILY_LIVE_WEB" if is_web else "INTERNAL_CATALOG"
        })

        if idx == 0:
            primary_product = product
        else:
            addon_products.append(product)

    # 3. Apply approved bundle discount if applicable
    if payload.is_bundle and primary_product and addon_products:
        bundle_rules = primary_product.get("bundle_rules", {})
        allowed_addons = bundle_rules.get("complementary_product_ids", [])
        all_eligible = all(a["id"] in allowed_addons for a in addon_products)
        if all_eligible:
            discount_pct = bundle_rules.get("bundle_discount_pct", 10)
            discount_factor = (100.0 - discount_pct) / 100.0
            total_calculated = round(total_calculated * discount_factor, 2)

    # 4. NPCI UAP Protocol Bounded Pool Check (Reserve Pay)
    if payload.protocol == "NPCI_UAP" and payload.uap_delegation:
        pool_limit = payload.uap_delegation.reserve_pay_pool_inr
        if total_calculated > pool_limit:
            violation = (
                f"NPCI UAP Reserve Pay breach: Order amount ₹{total_calculated:,.2f} exceeds "
                f"the agent's pre-allocated Reserve Pay pool of ₹{pool_limit:,.2f}."
            )
            record_audit_log(
                session_id=payload.session_id,
                actor_type=payload.actor_type,
                user_intent=payload.user_intent,
                ai_reasoning=f"NPCI UAP Reserve Pay bounded check rejected over-pool transaction (₹{total_calculated} > ₹{pool_limit}).",
                policy_check_status="FAILED",
                policy_violation_reason=violation,
                razorpay_order_id=None,
                payload={"protocol": protocol_name, **payload.model_dump()},
                payment_status="BLOCKED"
            )
            return PolicyCheckResult(
                passed=False,
                violation_reason=violation,
                calculated_total_inr=total_calculated,
                verified_items=verified_items,
                session_id=payload.session_id,
                actor_type=payload.actor_type,
                protocol=protocol_name,
                hourly_order_count=hourly_orders
            )

    # 5. Google AP2 Mandate Bounded Check
    if payload.protocol == "GOOGLE_AP2" and payload.ap2_mandate:
        mandate_limit = payload.ap2_mandate.max_amount_inr
        if total_calculated > mandate_limit:
            violation = (
                f"Google AP2 Mandate violation: Order amount ₹{total_calculated:,.2f} exceeds "
                f"the signed human buyer authorization ceiling of ₹{mandate_limit:,.2f}."
            )
            record_audit_log(
                session_id=payload.session_id,
                actor_type=payload.actor_type,
                user_intent=payload.user_intent,
                ai_reasoning=f"Google AP2 Mandate ceiling rejected transaction (₹{total_calculated} > ₹{mandate_limit}).",
                policy_check_status="FAILED",
                policy_violation_reason=violation,
                razorpay_order_id=None,
                payload={"protocol": protocol_name, **payload.model_dump()},
                payment_status="BLOCKED"
            )
            return PolicyCheckResult(
                passed=False,
                violation_reason=violation,
                calculated_total_inr=total_calculated,
                verified_items=verified_items,
                session_id=payload.session_id,
                actor_type=payload.actor_type,
                protocol=protocol_name,
                hourly_order_count=hourly_orders
            )

    # 6. Global Hard Spending Ceiling Check (₹10,000 max)
    if total_calculated > HARD_BUDGET_CEILING_INR:
        violation = (
            f"Hard budget ceiling breached: Order total ₹{total_calculated:,.2f} exceeds "
            f"the maximum allowed safety threshold of ₹{HARD_BUDGET_CEILING_INR:,.2f} per transaction."
        )
        record_audit_log(
            session_id=payload.session_id,
            actor_type=payload.actor_type,
            user_intent=payload.user_intent,
            ai_reasoning=f"Deterministic spending ceiling policy blocked order of ₹{total_calculated:,.2f}.",
            policy_check_status="FAILED",
            policy_violation_reason=violation,
            razorpay_order_id=None,
            payload={"protocol": protocol_name, **payload.model_dump()},
            payment_status="BLOCKED"
        )
        return PolicyCheckResult(
            passed=False,
            violation_reason=violation,
            calculated_total_inr=total_calculated,
            verified_items=verified_items,
            session_id=payload.session_id,
            actor_type=payload.actor_type,
            protocol=protocol_name,
            hourly_order_count=hourly_orders
        )

    # All policy checks PASSED
    return PolicyCheckResult(
        passed=True,
        violation_reason=None,
        calculated_total_inr=total_calculated,
        verified_items=verified_items,
        session_id=payload.session_id,
        actor_type=payload.actor_type,
        protocol=protocol_name,
        hourly_order_count=hourly_orders
    )
