import React, { useState } from 'react';
import { Bell, X, ShoppingCart, Ban, Clock } from 'lucide-react';

export default function PriceWatchModal({ product, sessionId, onClose, onWatchCreated }) {
  const currentPrice = product.price_inr || product.lowest_price_inr || 9999;
  const suggestedTarget = Math.round(currentPrice * 0.88); // 12% drop target

  const [targetPrice, setTargetPrice] = useState(suggestedTarget);
  const [deadlineHours, setDeadlineHours] = useState(48); // default 48h
  const [actionOnExpire, setActionOnExpire] = useState('BUY_ANYWAY'); // 'BUY_ANYWAY' | 'GIVE_UP'
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        session_id: sessionId || 'session_demo_default',
        product_id: product.id || product.product_id || 'prod_watched',
        product_name: product.name || product.product_name || product.brand_model || 'Market Gear',
        brand_model: product.brand_model || product.name || 'Core Peripheral',
        target_price_inr: parseFloat(targetPrice),
        deadline_hours: parseInt(deadlineHours),
        action_on_expire: actionOnExpire,
        current_price_inr: parseFloat(currentPrice)
      };

      const res = await fetch('http://127.0.0.1:8000/api/v1/price-watch/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Failed to set price watch");
      const watch = await res.json();
      if (onWatchCreated) onWatchCreated(watch);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '16px',
        maxWidth: '480px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '20px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        color: '#0f172a',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#047857'
            }}>
              <Bell size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Set AI Price Watch</h3>
              <p style={{ fontSize: '11px', color: '#475569', margin: '2px 0 0', fontWeight: 500 }}>Autonomous Hold & Auto-Buy Agent</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569',
              width: '28px', height: '28px', borderRadius: '50%', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Product Card Preview */}
        <div style={{
          backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px',
          padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          {product.image_url && (
            <img
              src={product.image_url}
              alt={product.name || product.brand_model}
              style={{
                width: '52px', height: '52px', minWidth: '52px', minHeight: '52px',
                objectFit: 'contain', borderRadius: '8px', border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff', flexShrink: 0
              }}
              onError={e => { e.target.src = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=300&q=80'; }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {product.name || product.brand_model || 'Selected Item'}
            </h4>
            <p style={{ fontSize: '12px', color: '#475569', margin: 0, fontWeight: 500 }}>
              Current Market Price: <strong style={{ color: '#047857', fontWeight: 800 }}>₹{currentPrice.toLocaleString('en-IN')}</strong>
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Target Price Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <label style={{ fontWeight: 700, color: '#0f172a' }}>My Target Price (INR):</label>
              <span style={{ fontWeight: 800, color: '#047857', fontFamily: 'JetBrains Mono, monospace' }}>
                ₹{parseFloat(targetPrice || 0).toLocaleString('en-IN')}
              </span>
            </div>
            <input
              type="number"
              min="100"
              max={currentPrice}
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              style={{
                width: '100%', backgroundColor: '#ffffff', border: '1px solid #94a3b8',
                borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#0f172a',
                fontWeight: 700, outline: 'none', boxSizing: 'border-box'
              }}
              required
            />
            {/* Quick target presets */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px', marginTop: '2px' }}>
              {[
                { label: 'Current', price: currentPrice },
                { label: '10% Drop', price: Math.round(currentPrice * 0.90) },
                { label: '15% Drop', price: Math.round(currentPrice * 0.85) },
                { label: '25% Drop', price: Math.round(currentPrice * 0.75) }
              ].map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setTargetPrice(p.price)}
                  style={{
                    backgroundColor: String(targetPrice) === String(p.price) ? '#ecfdf5' : '#f1f5f9',
                    border: String(targetPrice) === String(p.price) ? '1px solid #059669' : '1px solid #cbd5e1',
                    color: String(targetPrice) === String(p.price) ? '#047857' : '#475569',
                    borderRadius: '6px', padding: '3px 6px', fontSize: '10px', fontWeight: 700,
                    cursor: 'pointer', flex: 1, textAlign: 'center'
                  }}
                >
                  {p.label}: ₹{p.price.toLocaleString('en-IN')}
                </button>
              ))}
            </div>
          </div>

          {/* Monitor Timeline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Clock size={13} color="#0f172a" />
              Monitor Timeline (Deadline):
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
              {[
                { label: '24 Hours', hrs: 24 },
                { label: '48 Hours', hrs: 48 },
                { label: '72 Hours', hrs: 72 },
                { label: '1 Week', hrs: 168 }
              ].map(opt => (
                <button
                  key={opt.hrs}
                  type="button"
                  onClick={() => setDeadlineHours(opt.hrs)}
                  style={{
                    padding: '7px 4px', fontSize: '11px', fontWeight: 700, borderRadius: '8px',
                    backgroundColor: deadlineHours === opt.hrs ? '#ecfdf5' : '#f8fafc',
                    border: deadlineHours === opt.hrs ? '1.5px solid #059669' : '1px solid #cbd5e1',
                    color: deadlineHours === opt.hrs ? '#047857' : '#334155',
                    cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s'
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Expiration action option */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
              If target price is NOT reached within timeline:
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px',
                borderRadius: '8px', cursor: 'pointer',
                backgroundColor: actionOnExpire === 'BUY_ANYWAY' ? '#ecfdf5' : '#f8fafc',
                border: actionOnExpire === 'BUY_ANYWAY' ? '1.5px solid #059669' : '1px solid #cbd5e1'
              }}>
                <input
                  type="radio"
                  name="action_on_expire"
                  value="BUY_ANYWAY"
                  checked={actionOnExpire === 'BUY_ANYWAY'}
                  onChange={() => setActionOnExpire('BUY_ANYWAY')}
                  style={{ marginTop: '2px', accentColor: '#059669' }}
                />
                <div style={{ fontSize: '12px' }}>
                  <span style={{ fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ShoppingCart size={13} color="#047857" /> Buy at present price anyway
                  </span>
                  <p style={{ fontSize: '11px', color: '#475569', margin: '2px 0 0', fontWeight: 500, lineHeight: 1.3 }}>
                    If urgent or high need, agent buys at best available price when deadline ends.
                  </p>
                </div>
              </label>

              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px',
                borderRadius: '8px', cursor: 'pointer',
                backgroundColor: actionOnExpire === 'GIVE_UP' ? '#ecfdf5' : '#f8fafc',
                border: actionOnExpire === 'GIVE_UP' ? '1.5px solid #059669' : '1px solid #cbd5e1'
              }}>
                <input
                  type="radio"
                  name="action_on_expire"
                  value="GIVE_UP"
                  checked={actionOnExpire === 'GIVE_UP'}
                  onChange={() => setActionOnExpire('GIVE_UP')}
                  style={{ marginTop: '2px', accentColor: '#059669' }}
                />
                <div style={{ fontSize: '12px' }}>
                  <span style={{ fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Ban size={13} color="#dc2626" /> Give up / Cancel hold
                  </span>
                  <p style={{ fontSize: '11px', color: '#475569', margin: '2px 0 0', fontWeight: 500, lineHeight: 1.3 }}>
                    If non-urgent item, agent cancels watch without purchasing.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {error && (
            <div style={{
              fontSize: '12px', color: '#991b1b', backgroundColor: '#fef2f2',
              border: '1px solid #fecdd3', borderRadius: '6px', padding: '8px 12px', fontWeight: 600
            }}>
              {error}
            </div>
          )}

          {/* Submit Button */}
          <div style={{ paddingTop: '4px' }}>
            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%', backgroundColor: '#059669', color: '#ffffff',
                border: 'none', borderRadius: '10px', padding: '11px', fontSize: '13px',
                fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 6px rgba(5,150,105,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                opacity: submitting ? 0.6 : 1
              }}
            >
              {submitting ? 'Setting AI Price Watch...' : `🤖 Activate Autonomous Watch (Target: ₹${parseFloat(targetPrice || 0).toLocaleString('en-IN')})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

