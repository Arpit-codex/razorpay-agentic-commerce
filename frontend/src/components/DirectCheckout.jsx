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
      background: 'rgba(37,99,235,0.07)',
      border: '1px solid rgba(37,99,235,0.35)',
      borderRadius: '16px', padding: '16px',
      backdropFilter: 'blur(20px)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={16} color="#60a5fa" />
          <span style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: '#93c5fd', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Razorpay Secure Checkout
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '10px', color: '#64748b' }}>Total</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'white', fontFamily: 'JetBrains Mono, monospace' }}>
            ₹{orderDetails.totalAmount?.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      {/* Items Summary */}
      <div style={{ marginBottom: '14px', padding: '10px', background: 'rgba(0,0,0,0.25)', borderRadius: '10px', fontSize: '12px', color: '#94a3b8' }}>
        {orderDetails.items?.length} item(s) · {orderDetails.isBundle ? '🎁 Bundle discount applied' : '📦 Standalone pricing'}
        {orderDetails.reasoning && (
          <div style={{ marginTop: '4px', color: '#475569', fontSize: '11px', fontStyle: 'italic' }}>
            "{orderDetails.reasoning?.slice(0, 80)}..."
          </div>
        )}
      </div>

      {/* Success State */}
      {success ? (
        <div style={{
          padding: '14px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.35)',
          borderRadius: '12px', display: 'flex', gap: '10px', alignItems: 'flex-start'
        }}>
          <CheckCircle2 size={18} color="#34d399" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <div style={{ fontWeight: 700, color: 'white', fontSize: '13px' }}>Payment Successful! 🎉</div>
            <div style={{ fontSize: '11px', color: '#34d399', fontFamily: 'JetBrains Mono, monospace', marginTop: '4px' }}>
              {success.orderId} · {success.paymentId}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
              Audit log updated · Policy gate: PASSED
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {error && (
            <div style={{
              padding: '10px 14px', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.35)',
              borderRadius: '10px', display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12px', color: '#fb7185'
            }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
              <div>
                <span style={{ fontWeight: 600 }}>Policy Gate: </span>{error}
              </div>
            </div>
          )}

          {/* Safety Badges */}
          <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#475569' }}>
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
              width: '100%', padding: '12px', borderRadius: '12px', border: 'none',
              background: loading ? 'rgba(37,99,235,0.4)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: 'white', fontSize: '14px', fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              boxShadow: loading ? 'none' : '0 4px 18px rgba(37,99,235,0.45)',
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
