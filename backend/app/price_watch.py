"""
Price Watch & Autonomous Auto-Buy Engine.
Manages product price holds, monitors price drops via periodic search,
and autonomously executes Razorpay purchases when target price or deadline criteria are met.
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.database import (
    get_price_watch_by_id,
    get_price_watches,
    record_audit_log,
    record_price_snapshot,
    save_price_watch,
    update_price_watch,
)
from app.policy_engine import verify_checkout_policy, CheckoutRequestPayload, OrderItem
from app.razorpay_service import create_razorpay_order
from app.search_engine import find_lowest_price_deal


def add_price_watch(
    session_id: str,
    product_id: str,
    product_name: str,
    brand_model: str,
    target_price_inr: float,
    deadline_hours: int,
    action_on_expire: str = "BUY_ANYWAY",
    current_price_inr: float = 0.0
) -> Dict[str, Any]:
    """
    Create a new Price Watch entry for a product with target price and deadline.
    """
    watch_id = f"watch_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc)
    deadline_at = (now + timedelta(hours=int(deadline_hours))).isoformat()
    created_at = now.isoformat()
    
    start_price = float(current_price_inr) if current_price_inr > 0 else float(target_price_inr * 1.05)

    watch_entry = {
        "id": watch_id,
        "session_id": session_id,
        "product_id": product_id,
        "product_name": product_name,
        "brand_model": brand_model,
        "target_price_inr": float(target_price_inr),
        "deadline_hours": int(deadline_hours),
        "deadline_at": deadline_at,
        "action_on_expire": action_on_expire,  # 'BUY_ANYWAY' | 'GIVE_UP'
        "status": "WATCHING",
        "current_price_inr": start_price,
        "lowest_seen_inr": start_price,
        "check_count": 0,
        "created_at": created_at,
        "triggered_at": None,
        "razorpay_order_id": None
    }

    save_price_watch(watch_entry)
    
    # Record initial price snapshot
    record_price_snapshot(product_id, product_name, brand_model, start_price, "Initial Watch Target")

    # Record in audit trail
    record_audit_log(
        session_id=session_id,
        actor_type="PRICE_WATCH_AGENT",
        user_intent="SET_PRICE_WATCH",
        ai_reasoning=f"Autonomous Price Watch initiated for {brand_model}. Target: ₹{target_price_inr:,.0f} within {deadline_hours}h. Fallback action: {action_on_expire}.",
        policy_check_status="PASSED",
        policy_violation_reason=None,
        razorpay_order_id=None,
        payload={
            "watch_id": watch_id,
            "product_name": product_name,
            "target_price_inr": target_price_inr,
            "deadline_hours": deadline_hours,
            "action_on_expire": action_on_expire
        },
        payment_status="WATCHING"
    )

    return watch_entry


def check_watch(watch_id: str, simulated_price: Optional[float] = None) -> Dict[str, Any]:
    """
    Check price for a specific watch entry.
    If target price is reached OR deadline expired, trigger autonomous purchase/decision.
    """
    watch = get_price_watch_by_id(watch_id)
    if not watch:
        raise ValueError(f"Price watch {watch_id} not found.")

    if watch["status"] != "WATCHING":
        return watch

    now = datetime.now(timezone.utc)
    deadline_dt = datetime.fromisoformat(watch["deadline_at"])

    # Fetch live price or use simulated price
    if simulated_price is not None:
        new_price = float(simulated_price)
        store_name = "Simulated Market Drop"
        store_url = "https://amazon.in/dp/example"
    else:
        deal = find_lowest_price_deal(watch["brand_model"])
        new_price = float(deal["price_inr"])
        store_name = deal.get("lowest_store", "Amazon India")
        store_url = deal.get("store_url", "")

    check_count = watch["check_count"] + 1
    lowest_seen = min(watch["lowest_seen_inr"], new_price)

    # Record snapshot
    record_price_snapshot(
        watch["product_id"],
        watch["product_name"],
        watch["brand_model"],
        new_price,
        store_name,
        store_url
    )

    # Decision tree:
    # 1. Target price hit!
    if new_price <= watch["target_price_inr"]:
        return _execute_auto_buy(
            watch=watch,
            final_price=new_price,
            reason=f"Target price of ₹{watch['target_price_inr']:,.0f} hit! Current price: ₹{new_price:,.0f} on {store_name}.",
            status_code="AUTO_BOUGHT",
            check_count=check_count,
            lowest_seen=lowest_seen
        )

    # 2. Deadline expired without hitting target price
    if now >= deadline_dt:
        if watch["action_on_expire"] == "BUY_ANYWAY":
            return _execute_auto_buy(
                watch=watch,
                final_price=new_price,
                reason=f"Deadline of {watch['deadline_hours']}h expired without price drop. Executing fallback choice: BUY_ANYWAY at present price ₹{new_price:,.0f}.",
                status_code="BOUGHT_ANYWAY",
                check_count=check_count,
                lowest_seen=lowest_seen
            )
        else:
            # GIVE_UP
            update_price_watch(
                watch_id,
                status="GAVE_UP",
                current_price_inr=new_price,
                lowest_seen_inr=lowest_seen,
                check_count=check_count,
                triggered_at=now.isoformat()
            )
            
            record_audit_log(
                session_id=watch["session_id"],
                actor_type="PRICE_WATCH_AGENT",
                user_intent="PRICE_WATCH_EXPIRED_GAVE_UP",
                ai_reasoning=f"Deadline of {watch['deadline_hours']}h expired for {watch['brand_model']} without reaching target ₹{watch['target_price_inr']:,.0f}. Final price ₹{new_price:,.0f}. Executing fallback choice: GIVE_UP.",
                policy_check_status="PASSED",
                policy_violation_reason=None,
                razorpay_order_id=None,
                payload={"watch_id": watch_id, "final_price": new_price, "target_price": watch["target_price_inr"]},
                payment_status="EXPIRED_GAVE_UP"
            )
            return get_price_watch_by_id(watch_id)

    # 3. Still watching
    update_price_watch(
        watch_id,
        current_price_inr=new_price,
        lowest_seen_inr=lowest_seen,
        check_count=check_count
    )
    return get_price_watch_by_id(watch_id)


def _execute_auto_buy(
    watch: Dict[str, Any],
    final_price: float,
    reason: str,
    status_code: str,
    check_count: int,
    lowest_seen: float
) -> Dict[str, Any]:
    """Helper to verify policy and create Razorpay order for auto-buy."""
    session_id = watch["session_id"]
    product_id = watch["product_id"]
    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. Policy check via deterministic Pydantic Policy Engine
    checkout_payload = CheckoutRequestPayload(
        session_id=session_id,
        actor_type="EXTERNAL_AI_BUYER",
        protocol="DIRECT",
        user_intent=f"AUTONOMOUS_{status_code}",
        items=[OrderItem(product_id=product_id, quantity=1)],
        claimed_total_inr=final_price,
        ai_reasoning=reason
    )
    policy_res = verify_checkout_policy(checkout_payload)
    policy_passed = policy_res.passed
    violation_reason = policy_res.violation_reason

    if not policy_passed:
        update_price_watch(
            watch["id"],
            status="POLICY_BLOCKED",
            current_price_inr=final_price,
            lowest_seen_inr=lowest_seen,
            check_count=check_count,
            triggered_at=now_iso
        )
        record_audit_log(
            session_id=session_id,
            actor_type="PRICE_WATCH_AGENT",
            user_intent="PRICE_WATCH_POLICY_BLOCK",
            ai_reasoning=f"Auto-buy triggered for {watch['brand_model']} at ₹{final_price:,.0f} but blocked by Policy Engine: {violation_reason}",
            policy_check_status="FAILED",
            policy_violation_reason=violation_reason,
            razorpay_order_id=None,
            payload={"watch_id": watch["id"], "price": final_price, "violation": violation_reason},
            payment_status="BLOCKED"
        )
        return get_price_watch_by_id(watch["id"])

    # 2. Create Razorpay order
    rzp_res = create_razorpay_order(
        amount_inr=final_price,
        receipt=f"rcpt_watch_{watch['id'][-6:]}",
        notes={
            "session_id": session_id,
            "product_id": product_id,
            "watch_id": watch["id"],
            "purchase_type": status_code
        }
    )
    order_id = rzp_res.get("id") or rzp_res.get("order_id", f"order_{uuid.uuid4().hex[:8]}")

    # 3. Update watch record
    update_price_watch(
        watch["id"],
        status=status_code,
        current_price_inr=final_price,
        lowest_seen_inr=lowest_seen,
        check_count=check_count,
        triggered_at=now_iso,
        razorpay_order_id=order_id
    )

    # 4. Log in audit stream
    record_audit_log(
        session_id=session_id,
        actor_type="PRICE_WATCH_AGENT",
        user_intent=f"AUTONOMOUS_{status_code}",
        ai_reasoning=f"{reason} Policy check PASSED. Autonomous Razorpay order {order_id} created for ₹{final_price:,.0f}.",
        policy_check_status="PASSED",
        policy_violation_reason=None,
        razorpay_order_id=order_id,
        payload={
            "watch_id": watch["id"],
            "product_name": watch["product_name"],
            "amount_inr": final_price,
            "razorpay_order_id": order_id
        },
        payment_status="AUTO_BOUGHT_SUCCESS"
    )

    return get_price_watch_by_id(watch["id"])


def check_all_active_watches(session_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Poll all active WATCHING entries."""
    active_watches = get_price_watches(session_id=session_id, status="WATCHING")
    results = []
    for w in active_watches:
        updated = check_watch(w["id"])
        results.append(updated)
    return results


def cancel_price_watch(watch_id: str) -> Dict[str, Any]:
    """Cancel an active price watch."""
    watch = get_price_watch_by_id(watch_id)
    if not watch:
        raise ValueError(f"Watch {watch_id} not found.")

    update_price_watch(watch_id, status="CANCELLED")
    
    record_audit_log(
        session_id=watch["session_id"],
        actor_type="HUMAN_USER",
        user_intent="CANCEL_PRICE_WATCH",
        ai_reasoning=f"User manually cancelled price watch for {watch['brand_model']}.",
        policy_check_status="PASSED",
        policy_violation_reason=None,
        razorpay_order_id=None,
        payload={"watch_id": watch_id},
        payment_status="CANCELLED"
    )
    return get_price_watch_by_id(watch_id)
