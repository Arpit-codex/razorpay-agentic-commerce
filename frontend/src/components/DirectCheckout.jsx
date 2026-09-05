import React, { useState } from 'react';
import { CreditCard, ShieldCheck, CheckCircle2, AlertCircle, Loader2, ExternalLink } from 'lucide-react';

const API_BASE = "http://localhost:8000/api/v1";

export default function DirectCheckout({ orderDetails, sessionId, onPaymentSuccess, onPaymentError }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  if (!orderDetails) return null;

  const handlePay = async () => {
    setLoading(true);
    setError(null);

    try {
      // Step 1: Create order via Policy-Gated backend
      const res = await fetch(`${API_BASE}/checkout/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          actor_type: "HUMAN_USER",
          user_intent: orderDetails.userIntent || "AI_RECOMMENDATION_PURCHASE",
          items: orderDetails.items,
          is_bundle: Boolean(orderDetails.isBundle),
          claimed_total_inr: orderDetails.totalAmount,
          ai_reasoning: orderDetails.reasoning || "Purchase initiated via AI recommendation"
        })
      });

      const data = await res.json();

      if (!res.ok) {
        const reason = data.detail?.reason || "Order blocked by safety policy.";
        setError(reason);
        if (onPaymentError) onPaymentError(reason);
        setLoading(false);
        return;
      }

      const { order } = data;

      // Step 2: Open Razorpay Checkout.js if available (live key)
      if (typeof window.Razorpay === "function" && !order.is_sandbox_simulated) {
        const options = {
          key: order.key_id,
          amount: order.amount,
          currency: order.currency || "INR",
          name: "Agentic Commerce Store",
          description: `${orderDetails.items?.length} item(s)`,
          image: "https://cdn.razorpay.com/static/assets/logo/rzp.svg",
          order_id: order.id,
          handler: async function (response) {
            const verifyRes = await fetch(`${API_BASE}/checkout/verify`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                session_id: sessionId,
                razorpay_order_id: order.id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              })
            });
            const verifyData = await verifyRes.json();
            setLoading(false);
            if (verifyData.verified) {
              setSuccess({ orderId: order.id, paymentId: response.razorpay_payment_id, amount: orderDetails.totalAmount });
              if (onPaymentSuccess) onPaymentSuccess(verifyData);
            } else {
              setError("Payment signature verification failed.");
            }
          },
          prefill: { name: "Demo Buyer", email: "buyer@razorpay-buildathon.local" },
          theme: { color: "#2563eb" },
          modal: { ondismiss: () => setLoading(false) }
        };
        const rzp = new window.Razorpay(options);
        rzp.on("payment.failed", function (resp) {
          setError(resp.error.description || "Payment failed.");
          setLoading(false);
        });
        rzp.open();
        return;
      }

      // Step 3: Sandbox simulation (no live key / sandbox order ID)
      setTimeout(async () => {
        const fakePaymentId = `pay_sim_${Date.now()}`;
        await fetch(`${API_BASE}/checkout/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            razorpay_order_id: order.id,
            razorpay_payment_id: fakePaymentId,
            razorpay_signature: "sig_mock_test"
          })
        });
        setSuccess({ orderId: order.id, paymentId: fakePaymentId, amount: orderDetails.totalAmount });
        if (onPaymentSuccess) onPaymentSuccess({ orderId: order.id });
        setLoading(false);
      }, 1000);

    } catch (err) {
      setError(err.message || "Failed to connect to payment service.");
      setLoading(false);
    }
  };

  return (
    <div style={{
      backgroundColor: '#ffffff',
      border: '1px solid #bfdbfe',
      borderRadius: '12px', padding: '16px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={16} color="#1d4ed8" />
          <span style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: '#1e40af', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Razorpay Secure Checkout
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '10px', color: '#475569', fontWeight: 600 }}>Total</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', fontFamily: 'JetBrains Mono, monospace' }}>
            ₹{orderDetails.totalAmount?.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      {/* Items Summary */}
      <div style={{ marginBottom: '14px', padding: '10px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', color: '#334155', fontWeight: 600 }}>
        {orderDetails.items?.length} item(s) · {orderDetails.isBundle ? '🎁 Bundle discount applied' : '📦 Standalone pricing'}
        {orderDetails.reasoning && (
          <div style={{ marginTop: '4px', color: '#475569', fontSize: '11px', fontStyle: 'italic', fontWeight: 500 }}>
            "{orderDetails.reasoning?.slice(0, 80)}..."
          </div>
        )}
      </div>

      {/* Success State */}
      {success ? (
        <div style={{
          padding: '14px', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0',
          borderRadius: '8px', display: 'flex', gap: '10px', alignItems: 'flex-start'
        }}>
          <CheckCircle2 size={18} color="#059669" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <div style={{ fontWeight: 800, color: '#047857', fontSize: '13px' }}>Payment Successful! 🎉</div>
            <div style={{ fontSize: '11px', color: '#047857', fontFamily: 'JetBrains Mono, monospace', marginTop: '4px', fontWeight: 700 }}>
              {success.orderId} · {success.paymentId}
            </div>
            <div style={{ fontSize: '11px', color: '#334155', marginTop: '4px', fontWeight: 600 }}>
              Audit log updated · Policy gate: PASSED
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {error && (
            <div style={{
              padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecdd3',
              borderRadius: '8px', display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12px', color: '#b91c1c'
            }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
              <div>
                <span style={{ fontWeight: 800 }}>Policy Gate: </span>{error}
              </div>
            </div>
          )}

          {/* Safety Badges */}
          <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#334155', fontWeight: 600 }}>
            <span>🛡️ ₹10,000 Hard Cap</span>
            <span>·</span>
            <span>⚡ Max 2/hr per session</span>
            <span>·</span>
            <span>🔒 HMAC Verified</span>
          </div>

          <button
            onClick={handlePay}
            disabled={loading}
            style={{
              width: '100%', padding: '12px', borderRadius: '8px', border: 'none',
              backgroundColor: loading ? '#cbd5e1' : '#1d4ed8',
              color: 'white', fontSize: '14px', fontWeight: 800,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              boxShadow: loading ? 'none' : '0 2px 8px rgba(29,78,216,0.3)',
              transition: 'all 0.15s'
            }}
          >
            {loading ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Verifying Policy & Initiating Payment...
              </>
            ) : (
              <>
                <CreditCard size={16} />
                Pay ₹{orderDetails.totalAmount?.toLocaleString('en-IN')} with Razorpay
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
