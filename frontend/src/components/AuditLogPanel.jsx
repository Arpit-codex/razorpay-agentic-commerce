import React, { useState, useEffect } from 'react';
import { 
  Activity, Shield, ShieldAlert, ShieldCheck, Cpu, Clock, Terminal, 
  RefreshCw, CheckCircle2, AlertTriangle, Play, ChevronDown, ChevronRight,
  ExternalLink, Layers, ArrowUpRight, Copy, Check
} from 'lucide-react';
import PriceWatchPanel from './PriceWatchPanel';


const API_BASE = "http://localhost:8000/api/v1";

export default function AuditLogPanel({ sessionId, triggerRefresh }) {
  const [activeTab, setActiveTab] = useState("logs"); // 'logs' | 'ai_simulator' | 'failure_demo'
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState(null);

  // AI Simulator State
  const [aiRunning, setAiRunning] = useState(false);
  const [aiCatalogPreview, setAiCatalogPreview] = useState(null);
  const [aiOrderResult, setAiOrderResult] = useState(null);
  const [simScenario, setSimScenario] = useState("valid_order"); // 'valid_order' | 'breach_order' | 'custom'

  // Failure Demo State
  const [failureType, setFailureType] = useState("GATEWAY_TIMEOUT");
  const [failureRunning, setFailureRunning] = useState(false);
  const [failureRecoveryResult, setFailureRecoveryResult] = useState(null);

  const fetchAuditData = async () => {
    try {
      const [logsRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/audit/logs?limit=40`),
        fetch(`${API_BASE}/audit/stats?session_id=${sessionId}`)
      ]);
      const logsData = await logsRes.json();
      const statsData = await statsRes.json();
      setLogs(logsData.logs || []);
      setStats(statsData);
    } catch (err) {
      console.error("Failed to poll audit data:", err);
    }
  };

  useEffect(() => {
    fetchAuditData();
    const interval = setInterval(fetchAuditData, 3000);
    return () => clearInterval(interval);
  }, [sessionId, triggerRefresh]);

  // Execute External AI Assistant Simulator
  const runAiSimulation = async (scenario) => {
    setAiRunning(true);
    setAiOrderResult(null);

    try {
      // 1. External AI inspects catalog
      const catRes = await fetch(`${API_BASE}/agent/catalog`);
      const catalogData = await catRes.json();
      setAiCatalogPreview(catalogData);

      // 2. External AI executes autonomous checkout
      const isBreach = scenario === "breach_order";
      const payload = {
        session_id: `agent_sim_${sessionId}`,
        actor_type: "EXTERNAL_AI_BUYER",
        user_intent: "AUTONOMOUS_CHECKOUT",
        items: isBreach
          ? [{ product_id: "prod_kb_01", quantity: 3 }] // ₹4,999 * 3 = 14,997 > 10,000!
          : [{ product_id: "prod_kb_01", quantity: 1 }], // ₹4,999 <= 10,000
        is_bundle: false,
        shipping_name: "External Assistant Agent (AutoBuyer-01)",
        shipping_email: "autobuyer@ai-assistant.local",
        ai_reasoning: isBreach
          ? "Autonomous order calculated: 3x Keychron K2 units (₹4,999×3=₹14,997) exceeds the ₹10,000 hard budget ceiling. Policy gate must reject."
          : "Autonomous AI order: Keychron K2 Wireless Mechanical Keyboard selected via JSON-LD usageTags[coding] + targetTier[professional] matching."
      };

      const checkoutRes = await fetch(`${API_BASE}/agent/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const checkoutData = await checkoutRes.json();
      setAiOrderResult({
        status: checkoutRes.status,
        ok: checkoutRes.ok,
        data: checkoutData
      });

      fetchAuditData();
    } catch (err) {
      setAiOrderResult({
        status: 500,
        ok: false,
        data: { error: err.message }
      });
    } finally {
      setAiRunning(false);
    }
  };

  // Run Failure Recovery Demo
  const triggerFailureDemo = async () => {
    setFailureRunning(true);
    setFailureRecoveryResult(null);

    try {
      const res = await fetch(`${API_BASE}/test/trigger-failure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          actor_type: "HUMAN_USER",
          failure_type: failureType,
          amount_inr: 4999.0
        })
      });
      const data = await res.json();
      setFailureRecoveryResult(data);
      fetchAuditData();
    } catch (err) {
      console.error("Failure simulation failed:", err);
    } finally {
      setFailureRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>
      {/* Top Header & Metrics Bar */}
      <div style={{ padding: '16px', borderBottom: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5" style={{ color: '#059669' }} />
            <h3 className="font-bold text-sm tracking-wide" style={{ color: '#0f172a' }}>Live Audit Trail & State Store</h3>
          </div>
          <button
            onClick={fetchAuditData}
            style={{
              padding: '6px 12px', borderRadius: '6px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1',
              color: '#334155', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s'
            }}
          >
            <RefreshCw className="w-3.5 h-3.5 inline mr-1" />
            <span>Refresh</span>
          </button>
        </div>

        {/* Deterministic Policy Engine Metrics Status */}
        {stats && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
              <div className="flex items-center justify-between text-[11px] font-bold" style={{ color: '#334155' }}>
                <span>Spending Cap</span>
                <Shield className="w-3.5 h-3.5" style={{ color: '#1d4ed8' }} />
              </div>
              <div className="text-sm font-bold font-mono mt-0.5" style={{ color: '#0f172a' }}>
                ₹{stats.hard_ceiling_inr?.toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] font-bold" style={{ color: '#047857' }}>Hard Ceiling Enforced</div>
            </div>

            <div style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
              <div className="flex items-center justify-between text-[11px] font-bold" style={{ color: '#334155' }}>
                <span>Session Velocity</span>
                <Clock className="w-3.5 h-3.5" style={{ color: '#b45309' }} />
              </div>
              <div className="text-sm font-bold font-mono mt-0.5" style={{ color: '#0f172a' }}>
                {stats.session_hourly_orders} / {stats.velocity_limit_per_hour}
              </div>
              <div className="text-[10px] font-semibold" style={{ color: '#475569' }}>
                {stats.session_velocity_remaining} orders left this hr
              </div>
            </div>

            <div style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
              <div className="flex items-center justify-between text-[11px] font-bold" style={{ color: '#334155' }}>
                <span>Policy Gates</span>
                <ShieldCheck className="w-3.5 h-3.5" style={{ color: '#047857' }} />
              </div>
              <div className="text-sm font-bold font-mono mt-0.5" style={{ color: '#047857' }}>
                {stats.compliance_rate_pct}% Pass
              </div>
              <div className="text-[10px] font-semibold" style={{ color: '#475569' }}>
                {stats.total_policy_checks_passed} OK · {stats.total_policy_checks_failed} Blocked
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mt-4 pt-2 border-t border-slate-300">
          <button
            onClick={() => setActiveTab("logs")}
            style={{
              padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
              backgroundColor: activeTab === "logs" ? '#1d4ed8' : '#ffffff',
              color: activeTab === "logs" ? '#ffffff' : '#334155',
              border: activeTab === "logs" ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
              boxShadow: activeTab === "logs" ? '0 2px 4px rgba(29,78,216,0.2)' : 'none'
            }}
            className="flex items-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Audit Stream ({logs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("ai_simulator")}
            style={{
              padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
              backgroundColor: activeTab === "ai_simulator" ? '#6d28d9' : '#ffffff',
              color: activeTab === "ai_simulator" ? '#ffffff' : '#334155',
              border: activeTab === "ai_simulator" ? '1px solid #6d28d9' : '1px solid #cbd5e1',
              boxShadow: activeTab === "ai_simulator" ? '0 2px 4px rgba(109,40,217,0.2)' : 'none'
            }}
            className="flex items-center gap-1.5"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>AI Assistant Simulator</span>
          </button>

          <button
            onClick={() => setActiveTab("failure_demo")}
            style={{
              padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
              backgroundColor: activeTab === "failure_demo" ? '#dc2626' : '#ffffff',
              color: activeTab === "failure_demo" ? '#ffffff' : '#334155',
              border: activeTab === "failure_demo" ? '1px solid #dc2626' : '1px solid #cbd5e1',
              boxShadow: activeTab === "failure_demo" ? '0 2px 4px rgba(220,38,38,0.2)' : 'none'
            }}
            className="flex items-center gap-1.5"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Failure Recovery Demo</span>
          </button>
        </div>
      </div>

      {/* Main Tab Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ backgroundColor: '#ffffff' }}>
        {/* TAB 1: LIVE AUDIT LOG STREAM */}
        {activeTab === "logs" && (
          <div className="space-y-2.5">
            {logs.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs font-semibold">
                No audit events recorded yet. Interact with the chat or run the AI Simulator!
              </div>
            ) : (
              logs.map((log) => {
                const isExpanded = expandedLogId === log.id;
                const isPassed = log.policy_check_status === "PASSED";
                const isAgent = log.actor_type === "EXTERNAL_AI_BUYER";

                return (
                  <div
                    key={log.id}
                    style={{
                      borderRadius: '10px',
                      backgroundColor: isPassed ? '#ffffff' : '#fee2e2',
                      border: isPassed ? '1px solid #cbd5e1' : '2px solid #ef4444',
                      boxShadow: isPassed ? '0 1px 3px rgba(0,0,0,0.04)' : '0 3px 10px rgba(239,68,68,0.18)'
                    }}
                    className="transition-all text-xs"
                  >
                    <div
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                      className="p-3 cursor-pointer select-none"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                            isAgent ? 'badge-agent' : 'badge-human'
                          }`}>
                            {log.actor_type}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                            isPassed ? 'badge-passed' : 'badge-failed'
                          }`}>
                            POLICY: {log.policy_check_status}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-600 font-mono font-bold">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </div>
                      </div>

                      <div className="font-bold text-slate-900 flex items-center justify-between">
                        <span style={{ color: isPassed ? '#0f172a' : '#7f1d1d' }}>{log.user_intent}</span>
                        {log.razorpay_order_id && (
                          <span className="text-[10px] font-mono text-blue-700 font-bold">
                            {log.razorpay_order_id}
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] font-medium mt-1 line-clamp-2" style={{ color: isPassed ? '#334155' : '#7f1d1d' }}>
                        {log.ai_reasoning}
                      </p>

                      {log.policy_violation_reason && (
                        <div className="mt-1.5 p-2 rounded bg-red-100 border border-red-400 text-red-950 text-[11px] font-bold flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-red-700" />
                          <span>{log.policy_violation_reason}</span>
                        </div>
                      )}
                    </div>

                    {/* Expandable JSON Payload Drawer */}
                    {isExpanded && (
                      <div className="p-3 bg-slate-50 border-t border-slate-300 rounded-b-xl font-mono text-[11px]">
                        <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-1 font-sans font-bold">
                          Audit Payload & State Store:
                        </div>
                        <pre className="overflow-x-auto text-slate-900 bg-white p-2.5 rounded-lg border border-slate-300 max-h-48 font-mono">
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: EXTERNAL AI ASSISTANT SIMULATOR */}
        {activeTab === "ai_simulator" && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 text-xs text-purple-900">
              <div className="font-bold text-sm text-purple-950 flex items-center gap-2 mb-1">
                <Cpu className="w-4 h-4 text-purple-700" />
                <span>Autonomous Machine-to-Machine Commerce Protocol</span>
              </div>
              <p className="text-slate-700 leading-relaxed font-medium">
                External AI Personal Assistants consume <code className="text-purple-900 font-mono font-bold bg-purple-100 px-1 rounded">GET /api/v1/agent/catalog</code> (JSON-LD format)
                and trigger <code className="text-purple-900 font-mono font-bold bg-purple-100 px-1 rounded">POST /api/v1/agent/checkout</code>.
                All transactions are verified against the deterministic Policy Engine.
              </p>
            </div>

            {/* Test Controls */}
            <div className="p-3 bg-white border border-slate-300 rounded-xl space-y-3 shadow-sm">
              <div className="text-xs font-bold text-slate-900">Select External AI Buyer Scenario:</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => runAiSimulation("valid_order")}
                  disabled={aiRunning}
                  className="p-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-left transition-all cursor-pointer disabled:opacity-50"
                >
                  <div className="font-bold text-emerald-900 text-xs">Scenario A: Normal Order</div>
                  <div className="text-[11px] text-slate-700 font-medium mt-0.5">
                    Order 1x Mechanical Keyboard (₹4,999). Fits well within ₹10k ceiling.
                  </div>
                  <div className="mt-2 text-[10px] text-emerald-800 font-mono font-bold">Expected: PASSED (200 OK)</div>
                </button>

                <button
                  onClick={() => runAiSimulation("breach_order")}
                  disabled={aiRunning}
                  className="p-3 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-300 text-left transition-all cursor-pointer disabled:opacity-50"
                >
                  <div className="font-bold text-rose-900 text-xs">Scenario B: Over-Budget Attack</div>
                  <div className="text-[11px] text-slate-700 font-medium mt-0.5">
                    Order 3x Mechanical Keyboards (₹14,997). Breaches ₹10,000 limit.
                  </div>
                  <div className="mt-2 text-[10px] text-rose-800 font-mono font-bold">Expected: BLOCKED (400)</div>
                </button>
              </div>

              {aiRunning && (
                <div className="p-2.5 bg-purple-50 rounded-lg text-xs text-purple-900 flex items-center gap-2 font-semibold">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-700" />
                  <span>Agent reading Schema.org JSON-LD catalog & calling checkout endpoint...</span>
                </div>
              )}
            </div>

            {/* Simulation Results Drawer */}
            {aiOrderResult && (
              <div className="space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between text-xs font-sans font-bold text-slate-900">
                  <span>API Response Output:</span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    aiOrderResult.ok ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-rose-100 text-rose-900 border border-rose-300'
                  }`}>
                    HTTP {aiOrderResult.status}
                  </span>
                </div>
                <pre className="p-3 bg-slate-50 border border-slate-300 rounded-xl overflow-x-auto text-[11px] text-slate-900 font-mono">
                  {JSON.stringify(aiOrderResult.data, null, 2)}
                </pre>
              </div>
            )}

            {/* JSON-LD Catalog Snippet Preview */}
            {aiCatalogPreview && (
              <div className="space-y-1.5 text-xs">
                <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-blue-700" />
                  <span>Catalog Protocol Schema (@context: "https://schema.org"):</span>
                </div>
                <pre className="p-3 bg-slate-50 border border-slate-300 rounded-xl overflow-x-auto text-[10px] font-mono text-slate-900 max-h-40">
                  {JSON.stringify({
                    "@context": aiCatalogPreview["@context"],
                    "@type": aiCatalogPreview["@type"],
                    "checkoutProtocol": aiCatalogPreview["checkoutProtocol"],
                    "sampleItem": aiCatalogPreview.itemListElement?.[0]
                  }, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: GRACEFUL FAILURE RECOVERY DEMO */}
        {activeTab === "failure_demo" && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900">
              <div className="font-bold text-sm text-rose-950 flex items-center gap-2 mb-1">
                <ShieldAlert className="w-4 h-4 text-rose-700" />
                <span>Rule 3: Graceful Failure Recovery Demo</span>
              </div>
              <p className="text-slate-700 leading-relaxed font-medium">
                Exercises <code className="text-rose-900 font-mono font-bold bg-rose-100 px-1 rounded">POST /api/v1/test/trigger-failure</code>.
                When gateway timeouts, credit card declines, or stock locks occur mid-checkout, the agent
                cleanly intercepts the failure, commits the audit record, and automatically generates an
                alternate Razorpay Payment Link with extended 24-hour expiry without crashing!
              </p>
            </div>

            {/* Failure Injection Selectors */}
            <div className="p-3.5 bg-white border border-slate-300 rounded-xl space-y-3 text-xs shadow-sm">
              <label className="block text-slate-900 font-bold">Simulate Fault Type:</label>
              <select
                value={failureType}
                onChange={(e) => setFailureType(e.target.value)}
                className="w-full p-2 rounded-lg bg-white border border-slate-400 text-slate-900 font-semibold focus:outline-none focus:border-rose-600 text-xs"
              >
                <option value="GATEWAY_TIMEOUT">Gateway Timeout (504 response from acquiring switch)</option>
                <option value="CARD_NETWORK_DECLINE">Card Network Decline (Risk Velocity Trigger)</option>
                <option value="INVENTORY_RACE_CONDITION">Inventory Lock Race Condition (Simultaneous checkout lock)</option>
              </select>

              <button
                onClick={triggerFailureDemo}
                disabled={failureRunning}
                className="w-full py-2.5 px-4 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-lg text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {failureRunning ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Triggering Fault & Executing Recovery...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Trigger Mid-Checkout Failure & Test Recovery</span>
                  </>
                )}
              </button>
            </div>

            {/* Recovery Output Showcase */}
            {failureRecoveryResult && (
              <div className="p-4 rounded-xl bg-white border border-emerald-500 space-y-3 text-xs shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Autonomous Recovery Success!</span>
                  </div>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold">
                    ZERO CRASHES
                  </span>
                </div>

                <div className="space-y-1 text-slate-800 font-medium">
                  <div>
                    <span className="text-slate-600">Caught Exception: </span>
                    <span className="font-mono text-rose-800 font-bold">[{failureRecoveryResult.simulated_error_code}]</span>
                  </div>
                  <div className="text-[11px] text-slate-700 font-medium">
                    {failureRecoveryResult.simulated_error_message}
                  </div>
                </div>

                {/* Alternate Payment Link Result */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-300 space-y-2">
                  <div className="text-slate-900 font-bold flex items-center justify-between">
                    <span>Generated Alternate Razorpay Link:</span>
                    <span className="text-[10px] text-emerald-800 font-mono font-bold">24h Valid</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={failureRecoveryResult.fallback_payment_link}
                      className="flex-1 bg-white border border-slate-300 text-blue-700 font-mono text-[11px] px-2.5 py-1.5 rounded font-bold"
                    />
                    <a
                      href={failureRecoveryResult.fallback_payment_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded flex items-center gap-1 font-bold transition-colors"
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-[11px] text-slate-700 italic font-medium">
                    "{failureRecoveryResult.user_guidance_message}"
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
