"""
Failure Handler and Graceful Recovery Routines.
Rule 3 of Safety & Audit Guardrails ("The Bar"):
- Dedicated test endpoint /api/v1/test/trigger-failure
- Simulates payment gateway failure or out-of-stock mid-checkout
- Catches exception safely, records failure state in audit trail
- Generates alternate Razorpay Payment Link with extended expiry (24 hours) as a backup flow
"""

import uuid
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field
from .database import record_audit_log
from .razorpay_service import create_razorpay_payment_link


class FailureSimulationRequest(BaseModel):
    session_id: str = Field(default="session_test_failure_demo")
    actor_type: str = Field(default="HUMAN_USER")
    failure_type: str = Field(
        default="GATEWAY_TIMEOUT",
        description="Type of failure to simulate: 'GATEWAY_TIMEOUT', 'CARD_NETWORK_DECLINE', 'INVENTORY_RACE_CONDITION'"
    )
    product_id: Optional[str] = "prod_kb_01"
    amount_inr: Optional[float] = 4999.0
    customer_name: Optional[str] = "Buildathon Demo Buyer"
    customer_email: Optional[str] = "demo-recovery@razorpay.test"


class FailureRecoveryResult(BaseModel):
    success: bool
    status: str
    simulated_error_code: str
    simulated_error_message: str
    audit_log_id: int
    fallback_activated: bool
    fallback_payment_link: Optional[str]
    link_expiry_hours: int
    user_guidance_message: str


def execute_failure_recovery_pipeline(request: FailureSimulationRequest) -> FailureRecoveryResult:
    """
    Simulates a mid-flight checkout exception, intercepts it cleanly without crashing,
    commits the incident to the audit trail, and issues an alternate Razorpay payment link.
    """
    error_matrix = {
        "GATEWAY_TIMEOUT": (
            "RZP_GATEWAY_TIMEOUT_504",
            "Payment Gateway response timed out after 30000ms while contacting acquiring bank switch."
        ),
        "CARD_NETWORK_DECLINE": (
            "CARD_DECLINED_INSUFFICIENT_FUNDS_OR_RISK",
            "Card issuing bank rejected the charge attempt (Risk Rule 104: High Velocity)."
        ),
        "INVENTORY_RACE_CONDITION": (
            "STOCK_LOCK_MUTEX_TIMEOUT",
            "Target item stock reserved by another concurrent transaction during final settlement step."
        )
    }

    err_code, err_msg = error_matrix.get(
        request.failure_type,
        ("UNKNOWN_PAYMENT_FAILURE", "An unhandled upstream processing exception occurred.")
    )

    # 1. Record the failed transaction step in the audit trail
    fail_audit_id = record_audit_log(
        session_id=request.session_id,
        actor_type=request.actor_type,
        user_intent="TRIGGER_FAILURE_TEST",
        ai_reasoning=(
            f"Simulated fault injected: [{err_code}] {err_msg}. "
            f"Graceful fallback agent triggered to protect merchant revenue and buyer experience."
        ),
        policy_check_status="FAILED",
        policy_violation_reason=f"Exception caught in gateway communication: {err_code}",
        razorpay_order_id=f"err_{uuid.uuid4().hex[:8]}",
        payload={
            "failure_type": request.failure_type,
            "error_code": err_code,
            "error_message": err_msg,
            "amount_inr": request.amount_inr,
            "product_id": request.product_id
        },
        payment_status="FAILED"
    )

    # 2. Execute Graceful Fallback Flow: Generate Razorpay Alternate Payment Link
    fallback_link = create_razorpay_payment_link(
        amount_inr=request.amount_inr or 4999.0,
        description=f"Backup Settlement Link for Order #{fail_audit_id}",
        customer={
            "name": request.customer_name or "Valued Customer",
            "email": request.customer_email or "customer@example.com"
        },
        expire_in_hours=24
    )

    # 3. Record the fallback creation in the audit trail
    record_audit_log(
        session_id=request.session_id,
        actor_type=request.actor_type,
        user_intent="FALLBACK_LINK_GENERATION",
        ai_reasoning=(
            f"Autonomous recovery executed. Generated alternate Razorpay Payment Link "
            f"({fallback_link['id']}) with 24-hour reserved session to prevent transaction loss."
        ),
        policy_check_status="PASSED",
        policy_violation_reason=None,
        razorpay_order_id=fallback_link["id"],
        payload={
            "original_failed_audit_id": fail_audit_id,
            "payment_link_id": fallback_link["id"],
            "short_url": fallback_link["short_url"],
            "expire_by": fallback_link["expire_by"]
        },
        payment_status="FALLBACK_LINK_GENERATED"
    )

    guidance = (
        f"We noticed a payment disruption ({err_code}). "
        f"Don't worry! Your order and price have been reserved. "
        f"You can safely complete your purchase anytime within the next 24 hours using your secure backup link."
    )

    return FailureRecoveryResult(
        success=True,
        status="RECOVERED_VIA_FALLBACK_LINK",
        simulated_error_code=err_code,
        simulated_error_message=err_msg,
        audit_log_id=fail_audit_id,
        fallback_activated=True,
        fallback_payment_link=fallback_link["short_url"],
        link_expiry_hours=24,
        user_guidance_message=guidance
    )
