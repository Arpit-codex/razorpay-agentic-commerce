import React, { useState, useEffect } from 'react';

export default function PriceHistoryChart({ brandModel, productName, currentPrice, onClose }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAnalytics();
  }, [brandModel, currentPrice]);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        brand_model: brandModel || '',
        product_name: productName || '',
        current_price: currentPrice || ''
      });
      const res = await fetch(`http://127.0.0.1:8000/api/v1/price-history/analytics?${query.toString()}`);
      if (!res.ok) throw new Error("Failed to load price history analytics");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 my-3 text-slate-300 animate-pulse">
        <div className="flex items-center justify-between mb-3">
          <div className="h-4 bg-slate-700 rounded w-1/3"></div>
          <div className="h-4 bg-slate-700 rounded w-1/6"></div>
        </div>
        <div className="h-32 bg-slate-800/60 rounded-lg flex items-center justify-center text-xs text-slate-500">
          Loading market price history & Tavily CamelCamelCamel index...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 my-3 text-red-400 text-xs flex justify-between items-center">
        <span>Failed to fetch price history: {error}</span>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-xs">Close</button>
      </div>
    );
  }

  const { stats, camel_data, prediction, snapshots } = data;
  const prices = snapshots.map(s => s.price_inr);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  // SVG dimensions
  const svgWidth = 460;
  const svgHeight = 120;
  const padding = 20;

  // Calculate coordinates for SVG sparkline
  const points = snapshots.map((s, idx) => {
    const x = padding + (idx / Math.max(1, snapshots.length - 1)) * (svgWidth - padding * 2);
    const y = svgHeight - padding - ((s.price_inr - minP) / range) * (svgHeight - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-5 my-4 text-white shadow-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">📈</span>
          <div>
            <h4 className="font-semibold text-sm text-slate-100">{brandModel || productName}</h4>
            <p className="text-[11px] text-slate-400">Price Journey & Tavily CamelCamelCamel Market Analytics</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            stats.trend === 'DECLINING' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
            stats.trend === 'RISING' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' :
            'bg-blue-500/20 text-blue-400 border border-blue-500/40'
          }`}>
            {stats.trend === 'DECLINING' ? '📉 TREND: DECLINING' : stats.trend === 'RISING' ? '📈 TREND: RISING' : '➡️ TREND: STABLE'}
          </span>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 w-6 h-6 rounded-full flex items-center justify-center text-xs transition"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5">
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Current</p>
          <p className="text-sm font-bold text-emerald-400">₹{stats.current_price?.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5">
          <p className="text-[10px] text-slate-400 uppercase font-semibold">30-Day Avg</p>
          <p className="text-sm font-bold text-slate-200">₹{stats.avg_price?.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5">
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Lowest Seen</p>
          <p className="text-sm font-bold text-emerald-300">₹{stats.lowest_price?.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5">
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Highest Seen</p>
          <p className="text-sm font-bold text-rose-400">₹{stats.highest_price?.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* SVG Sparkline Chart */}
      <div className="bg-slate-950/90 border border-slate-800/80 rounded-xl p-3 relative overflow-hidden">
        <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1 px-1">
          <span>30 Days Ago</span>
          <span>Price Timeline (INR)</span>
          <span>Today</span>
        </div>
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-28 overflow-visible">
          {/* Gradient background under line */}
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          
          {/* Fill area */}
          <polygon
            points={`${padding},${svgHeight - padding} ${points} ${svgWidth - padding},${svgHeight - padding}`}
            fill="url(#priceGradient)"
          />

          {/* Grid lines */}
          <line x1={padding} y1={padding} x2={svgWidth - padding} y2={padding} stroke="#334155" strokeDasharray="3 3" opacity="0.4" />
          <line x1={padding} y1={svgHeight / 2} x2={svgWidth - padding} y2={svgHeight / 2} stroke="#334155" strokeDasharray="3 3" opacity="0.4" />
          <line x1={padding} y1={svgHeight - padding} x2={svgWidth - padding} y2={svgHeight - padding} stroke="#334155" strokeDasharray="3 3" opacity="0.4" />

          {/* Trend line */}
          <polyline
            fill="none"
            stroke="#10b981"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />

          {/* Data points */}
          {snapshots.map((s, idx) => {
            const x = padding + (idx / Math.max(1, snapshots.length - 1)) * (svgWidth - padding * 2);
            const y = svgHeight - padding - ((s.price_inr - minP) / range) * (svgHeight - padding * 2);
            return (
              <circle
                key={idx}
                cx={x}
                cy={y}
                r="4"
                className="fill-slate-900 stroke-emerald-400 stroke-2 hover:r-6 transition-all cursor-pointer"
              >
                <title>{`${s.source_store}: ₹${s.price_inr?.toLocaleString('en-IN')} (${new Date(s.timestamp).toLocaleDateString()})`}</title>
              </circle>
            );
          })}
        </svg>
      </div>

      {/* AI Prediction & Camel Insights Card */}
      <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3.5 flex items-start gap-3 text-xs">
        <span className="text-xl mt-0.5">🎯</span>
        <div className="space-y-1 text-slate-300">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-emerald-400">AI Price Prediction:</span>
            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-0.5 rounded font-medium">
              Expected Low ₹{prediction.expected_low?.toLocaleString('en-IN')} ({prediction.confidence} CONFIDENCE)
            </span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">{prediction.reasoning}</p>
          {camel_data.summary && (
            <p className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-800/60 mt-1">
              🌐 {camel_data.summary}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
