import React, { useState, useEffect } from 'react';

export default function PriceWatchPanel({ sessionId }) {
  const [watches, setWatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingId, setCheckingId] = useState(null);

  useEffect(() => {
    fetchWatches();
    const interval = setInterval(fetchWatches, 5000); // refresh every 5s
    return () => clearInterval(interval);
  }, [sessionId]);

  const fetchWatches = async () => {
    try {
      const url = sessionId 
        ? `http://127.0.0.1:8000/api/v1/price-watch/list?session_id=${sessionId}`
        : 'http://127.0.0.1:8000/api/v1/price-watch/list';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setWatches(data.watches || []);
      }
    } catch (e) {
      console.error("Error fetching price watches:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleManualCheck = async (watchId) => {
    setCheckingId(watchId);
    try {
      await fetch('http://127.0.0.1:8000/api/v1/price-watch/check-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watch_id: watchId })
      });
      await fetchWatches();
    } catch (e) {
      console.error("Error checking watch:", e);
    } finally {
      setCheckingId(null);
    }
  };

  const handleCancelWatch = async (watchId) => {
    try {
      await fetch('http://127.0.0.1:8000/api/v1/price-watch/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watch_id: watchId })
      });
      await fetchWatches();
    } catch (e) {
      console.error("Error cancelling watch:", e);
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-slate-600 text-xs font-semibold animate-pulse">
        Loading active Price Watch agent state...
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 text-slate-900 bg-white">
      {/* Panel Top Bar */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <span>🔔</span> Active AI Price Watches ({watches.length})
          </h3>
          <p className="text-[11px] text-slate-600 font-medium">Autonomous holds, deadline tracking & auto-buy</p>
        </div>
        <button 
          onClick={fetchWatches}
          className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold px-2.5 py-1 rounded-lg border border-slate-300 transition"
        >
          🔄 Refresh
        </button>
      </div>

      {watches.length === 0 ? (
        <div className="bg-slate-50 border border-slate-300 rounded-xl p-6 text-center text-slate-600 space-y-2">
          <span className="text-3xl block">🏷️</span>
          <p className="font-bold text-xs text-slate-900">No active price watches</p>
          <p className="text-[11px] text-slate-600 max-w-xs mx-auto font-medium">
            Search for any product in chat or Direct Buy, then click <strong className="text-emerald-700">"🔔 Set Price Alert"</strong> to hold at your target price.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {watches.map(w => {
            const isWatching = w.status === 'WATCHING';
            const isBought = w.status === 'AUTO_BOUGHT' || w.status === 'BOUGHT_ANYWAY';
            const isGaveUp = w.status === 'GAVE_UP';
            const isCancelled = w.status === 'CANCELLED';

            // Calculate price gap percentage
            const targetP = w.target_price_inr;
            const currentP = w.current_price_inr;
            const progressPct = Math.min(100, Math.max(10, Math.round((targetP / Math.max(1, currentP)) * 100)));

            return (
              <div 
                key={w.id} 
                className={`bg-white border rounded-xl p-4 space-y-3 transition shadow-sm ${
                  isBought ? 'border-emerald-500 bg-emerald-50' :
                  isGaveUp ? 'border-slate-300 bg-slate-50 opacity-75' :
                  isCancelled ? 'border-slate-300 bg-slate-50 opacity-60' :
                  'border-slate-300 hover:border-emerald-600'
                }`}
              >
                {/* Watch Card Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-xs text-slate-900">{w.product_name || w.brand_model}</h4>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5 font-semibold">ID: {w.id}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                    isBought ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
                    isGaveUp ? 'bg-amber-100 text-amber-900 border-amber-300' :
                    isCancelled ? 'bg-slate-100 text-slate-700 border-slate-300' :
                    'bg-blue-100 text-blue-900 border-blue-300'
                  }`}>
                    {w.status}
                  </span>
                </div>

                {/* Price Matrix */}
                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg text-center border border-slate-200">
                  <div>
                    <p className="text-[9px] text-slate-600 uppercase font-bold">Target Price</p>
                    <p className="text-xs font-bold text-emerald-700">₹{w.target_price_inr?.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-600 uppercase font-bold">Current Price</p>
                    <p className="text-xs font-bold text-slate-900">₹{w.current_price_inr?.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-600 uppercase font-bold">Lowest Seen</p>
                    <p className="text-xs font-bold text-emerald-800">₹{w.lowest_seen_inr?.toLocaleString('en-IN')}</p>
                  </div>
                </div>

                {/* Target Progress Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-600 font-semibold">
                    <span>Target Progress</span>
                    <span>{progressPct}% of target</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden border border-slate-300">
                    <div 
                      className={`h-full transition-all duration-500 ${isBought ? 'bg-emerald-600' : 'bg-emerald-600'}`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>

                {/* Meta details: Deadline & Action */}
                <div className="flex items-center justify-between text-[10px] text-slate-600 pt-1 border-t border-slate-200 font-medium">
                  <span>⏱️ Deadline: {w.deadline_hours}h ({new Date(w.deadline_at).toLocaleDateString()})</span>
                  <span>Fallback: <strong className="text-slate-900">{w.action_on_expire}</strong></span>
                </div>

                {/* Actions */}
                {isWatching && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleManualCheck(w.id)}
                      disabled={checkingId === w.id}
                      className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg transition flex items-center justify-center gap-1 shadow-sm"
                    >
                      {checkingId === w.id ? 'Polling Market...' : '⚡ Check Price Now'}
                    </button>
                    <button
                      onClick={() => handleCancelWatch(w.id)}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] py-1.5 px-3 rounded-lg border border-slate-300 transition"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {w.razorpay_order_id && (
                  <div className="text-[10px] bg-emerald-50 border border-emerald-300 p-2 rounded-lg text-emerald-900 font-mono font-bold">
                    ✅ Razorpay Order ID: {w.razorpay_order_id}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
