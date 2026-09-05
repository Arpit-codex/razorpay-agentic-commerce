import React, { useState } from 'react';

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
        product_name: product.name || product.product_name || 'Market Gear',
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
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-300 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 text-slate-900 animate-in fade-in zoom-in duration-200">
        {/* Modal Header */}
        <div className="flex justify-between items-start border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-300 flex items-center justify-center text-xl">
              🔔
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Set AI Price Watch</h3>
              <p className="text-xs text-slate-600 font-medium">Autonomous Hold & Auto-Buy Agent</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900 bg-slate-100 w-7 h-7 rounded-full flex items-center justify-center text-xs transition font-bold"
          >
            ✕
          </button>
        </div>

        {/* Product Preview Card */}
        <div className="bg-slate-50 border border-slate-300 rounded-xl p-3.5 flex items-center gap-3">
          {product.image_url && (
            <img 
              src={product.image_url} 
              alt={product.name} 
              className="w-12 h-12 object-cover rounded-lg border border-slate-300 flex-shrink-0"
            />
          )}
          <div className="overflow-hidden">
            <h4 className="font-bold text-xs text-slate-900 truncate">{product.name || product.brand_model}</h4>
            <p className="text-[11px] text-slate-600 font-medium">
              Current Market Price: <span className="font-bold text-emerald-700">₹{currentPrice.toLocaleString('en-IN')}</span>
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Target Price Selection */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <label className="font-bold text-slate-800">My Target Price (INR):</label>
              <span className="font-bold text-emerald-700">₹{parseFloat(targetPrice).toLocaleString('en-IN')}</span>
            </div>
            <input 
              type="number"
              min="100"
              max={currentPrice}
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              className="w-full bg-white border border-slate-400 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-none focus:border-emerald-600"
              required
            />
            <div className="flex justify-between text-[10px] text-slate-600 font-medium">
              <span>Current: ₹{currentPrice.toLocaleString('en-IN')}</span>
              <span>15% drop: ₹{Math.round(currentPrice * 0.85).toLocaleString('en-IN')}</span>
              <span>25% drop: ₹{Math.round(currentPrice * 0.75).toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Timeline / Deadline selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              Monitor Timeline (Deadline):
            </label>
            <div className="grid grid-cols-4 gap-2">
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
                  className={`py-2 text-[11px] font-bold rounded-xl border transition ${
                    deadlineHours === opt.hrs
                      ? 'bg-emerald-50 border-emerald-600 text-emerald-800'
                      : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fallback Action if deadline expires without price drop */}
          <div className="space-y-2 border-t border-slate-200 pt-3">
            <label className="block text-xs font-bold text-slate-800">
              If target price is NOT reached within timeline:
            </label>
            <div className="space-y-2">
              <label 
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                  actionOnExpire === 'BUY_ANYWAY' 
                    ? 'bg-emerald-50 border-emerald-500 text-slate-900' 
                    : 'bg-slate-50 border-slate-300 text-slate-700'
                }`}
              >
                <input 
                  type="radio"
                  name="action_on_expire"
                  value="BUY_ANYWAY"
                  checked={actionOnExpire === 'BUY_ANYWAY'}
                  onChange={() => setActionOnExpire('BUY_ANYWAY')}
                  className="mt-0.5 accent-emerald-600"
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-900">🛒 Buy at present price anyway</span>
                  <p className="text-[11px] text-slate-600 font-medium">If urgent or high need, agent buys at best available price when deadline ends.</p>
                </div>
              </label>

              <label 
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                  actionOnExpire === 'GIVE_UP' 
                    ? 'bg-emerald-50 border-emerald-500 text-slate-900' 
                    : 'bg-slate-50 border-slate-300 text-slate-700'
                }`}
              >
                <input 
                  type="radio"
                  name="action_on_expire"
                  value="GIVE_UP"
                  checked={actionOnExpire === 'GIVE_UP'}
                  onChange={() => setActionOnExpire('GIVE_UP')}
                  className="mt-0.5 accent-emerald-600"
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-900">🚫 Give up / Cancel hold</span>
                  <p className="text-[11px] text-slate-600 font-medium">If non-urgent item, agent cancels watch without purchasing.</p>
                </div>
              </label>
            </div>
          </div>

          {error && (
            <p className="text-xs text-rose-800 bg-rose-50 p-2 rounded-lg border border-rose-300 font-semibold">
              {error}
            </p>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3 px-4 rounded-xl shadow-md transition duration-200 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              {submitting ? 'Setting AI Price Watch...' : `🤖 Activate Autonomous Watch (Target: ₹${parseFloat(targetPrice).toLocaleString('en-IN')})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
