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
      <div className="p-4 text-slate-400 text-xs animate-pulse">
        Loading active Price Watch agent state...
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 text-white">
      {/* Panel Top Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
            <span>🔔</span> Active AI Price Watches ({watches.length})
          </h3>
          <p className="text-[11px] text-slate-400">Autonomous holds, deadline tracking & auto-buy</p>
        </div>
        <button 
          onClick={fetchWatches}
          className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-700 transition"
        >
          🔄 Refresh
        </button>
      </div>

      {watches.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-6 text-center text-slate-400 space-y-2">
          <span className="text-3xl block">🏷️</span>
          <p className="font-semibold text-xs text-slate-300">No active price watches</p>
          <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
            Search for any product in chat or Direct Buy, then click <strong className="text-emerald-400">"🔔 Set Price Alert"</strong> to hold at your target price.
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
                className={`bg-slate-900 border rounded-xl p-4 space-y-3 transition ${
                  isBought ? 'border-emerald-500/50 bg-emerald-950/10' :
                  isGaveUp ? 'border-slate-800 bg-slate-950/40 opacity-75' :
                  isCancelled ? 'border-slate-800 bg-slate-950/30 opacity-60' :
                  'border-slate-800 hover:border-emerald-500/30'
                }`}
              >
                {/* Watch Card Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-xs text-slate-200">{w.product_name || w.brand_model}</h4>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {w.id}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                    isBought ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                    isGaveUp ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                    isCancelled ? 'bg-slate-800 text-slate-400 border-slate-700' :
                    'bg-blue-500/20 text-blue-300 border-blue-500/40'
                  }`}>
                    {w.status}
                  </span>
                </div>

                {/* Price Matrix */}
                <div className="grid grid-cols-3 gap-2 bg-slate-950/60 p-2.5 rounded-lg text-center border border-slate-800/60">
                  <div>
                    <p className="text-[9px] text-slate-400 uppercase font-medium">Target Price</p>
                    <p className="text-xs font-bold text-emerald-400">₹{w.target_price_inr?.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-400 uppercase font-medium">Current Price</p>
                    <p className="text-xs font-bold text-slate-200">₹{w.current_price_inr?.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-400 uppercase font-medium">Lowest Seen</p>
                    <p className="text-xs font-bold text-emerald-300">₹{w.lowest_seen_inr?.toLocaleString('en-IN')}</p>
                  </div>
                </div>

                {/* Target Progress Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Target Progress</span>
                    <span>{progressPct}% of target</span>
                  </div>
                  <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                    <div 
                      className={`h-full transition-all duration-500 ${isBought ? 'bg-emerald-400' : 'bg-gradient-to-r from-teal-500 to-emerald-400'}`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>

                {/* Meta details: Deadline & Action */}
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/60">
                  <span>⏱️ Deadline: {w.deadline_hours}h ({new Date(w.deadline_at).toLocaleDateString()})</span>
                  <span>Fallback: <strong className="text-slate-300">{w.action_on_expire}</strong></span>
                </div>

                {/* Actions */}
                {isWatching && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleManualCheck(w.id)}
                      disabled={checkingId === w.id}
                      className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-semibold py-1.5 px-3 rounded-lg transition flex items-center justify-center gap-1"
                    >
                      {checkingId === w.id ? 'Polling Market...' : '⚡ Check Price Now'}
                    </button>
                    <button
                      onClick={() => handleCancelWatch(w.id)}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[11px] py-1.5 px-3 rounded-lg border border-slate-700 transition"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {w.razorpay_order_id && (
                  <div className="text-[10px] bg-emerald-950/40 border border-emerald-500/30 p-2 rounded-lg text-emerald-300 font-mono">
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
