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
    <div className="flex flex-col h-full bg-slate-950/80 backdrop-blur-xl text-slate-200">
      {/* Top Header & Metrics Bar */}
      <div className="p-4 border-b border-white/10 bg-slate-900/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
            <h3 className="font-bold text-sm text-white tracking-wide">Live Audit Trail & State Store</h3>
          </div>
          <button
            onClick={fetchAuditData}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-all text-xs flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        {/* Deterministic Policy Engine Metrics Status */}
        {stats && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-lg bg-slate-800/80 border border-white/10">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Spending Cap</span>
                <Shield className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="text-sm font-bold text-white font-mono mt-0.5">
                ₹{stats.hard_ceiling_inr?.toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] text-emerald-400 font-medium">Hard Ceiling Enforced</div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-800/80 border border-white/10">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Session Velocity</span>
                <Clock className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-sm font-bold text-white font-mono mt-0.5">
                {stats.session_hourly_orders} / {stats.velocity_limit_per_hour}
              </div>
              <div className="text-[10px] text-slate-400">
                {stats.session_velocity_remaining} orders left this hr
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-800/80 border border-white/10">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Policy Gates</span>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
                {stats.compliance_rate_pct}% Pass
              </div>
              <div className="text-[10px] text-slate-400">
                {stats.total_policy_checks_passed} OK · {stats.total_policy_checks_failed} Blocked
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mt-4 pt-2 border-t border-white/10">
          <button
            onClick={() => setActiveTab("logs")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
              activeTab === "logs"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Audit Stream ({logs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("ai_simulator")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
              activeTab === "ai_simulator"
                ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>AI Assistant Simulator</span>
          </button>

          <button
            onClick={() => setActiveTab("failure_demo")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
              activeTab === "failure_demo"
                ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Failure Recovery Demo</span>
          </button>
        </div>
      </div>

      {/* Main Tab Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* TAB 1: LIVE AUDIT LOG STREAM */}
        {activeTab === "logs" && (
          <div className="space-y-2.5">
            {logs.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
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
                    className={`rounded-xl border transition-all text-xs ${
                      isPassed
                        ? 'bg-slate-900/80 border-white/10 hover:border-emerald-500/30'
                        : 'bg-rose-950/20 border-rose-500/30 hover:border-rose-500/50'
                    }`}
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
                        <div className="text-[10px] text-slate-500 font-mono">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </div>
                      </div>

                      <div className="font-semibold text-slate-200 flex items-center justify-between">
                        <span>{log.user_intent}</span>
                        {log.razorpay_order_id && (
                          <span className="text-[10px] font-mono text-blue-400">
                            {log.razorpay_order_id}
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                        {log.ai_reasoning}
                      </p>

                      {log.policy_violation_reason && (
                        <div className="mt-1.5 p-1.5 rounded bg-rose-950/60 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{log.policy_violation_reason}</span>
                        </div>
                      )}
                    </div>

                    {/* Expandable JSON Payload Drawer */}
                    {isExpanded && (
                      <div className="p-3 bg-slate-950 border-t border-white/10 rounded-b-xl animate-fade-in font-mono text-[11px]">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-sans font-semibold">
                          Audit Payload & State Store:
                        </div>
                        <pre className="overflow-x-auto text-blue-300/90 bg-slate-900 p-2.5 rounded-lg border border-white/5 max-h-48">
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
            <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/30 text-xs text-purple-200">
              <div className="font-semibold text-sm text-white flex items-center gap-2 mb-1">
                <Cpu className="w-4 h-4 text-purple-400" />
                <span>Autonomous Machine-to-Machine Commerce Protocol</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                External AI Personal Assistants consume <code className="text-purple-300 font-mono">GET /api/v1/agent/catalog</code> (JSON-LD format)
                and trigger <code className="text-purple-300 font-mono">POST /api/v1/agent/checkout</code>.
                All transactions are verified against the deterministic Policy Engine.
              </p>
            </div>

            {/* Test Controls */}
            <div className="p-3 bg-slate-900 border border-white/10 rounded-xl space-y-3">
              <div className="text-xs font-semibold text-white">Select External AI Buyer Scenario:</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => runAiSimulation("valid_order")}
                  disabled={aiRunning}
                  className="p-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 hover:border-emerald-500/40 text-left transition-all cursor-pointer disabled:opacity-50"
                >
                  <div className="font-semibold text-emerald-400 text-xs">Scenario A: Normal Order</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Order 1x Mechanical Keyboard (₹4,999). Fits well within ₹10k ceiling.
                  </div>
                  <div className="mt-2 text-[10px] text-emerald-300 font-mono">Expected: PASSED (200 OK)</div>
                </button>

                <button
                  onClick={() => runAiSimulation("breach_order")}
                  disabled={aiRunning}
                  className="p-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 hover:border-rose-500/40 text-left transition-all cursor-pointer disabled:opacity-50"
                >
                  <div className="font-semibold text-rose-400 text-xs">Scenario B: Over-Budget Attack</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Order 3x Mechanical Keyboards (₹14,997). Breaches ₹10,000 limit.
                  </div>
                  <div className="mt-2 text-[10px] text-rose-300 font-mono">Expected: BLOCKED (400)</div>
                </button>
              </div>

              {aiRunning && (
                <div className="p-2.5 bg-slate-950 rounded-lg text-xs text-purple-300 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
                  <span>Agent reading Schema.org JSON-LD catalog & calling checkout endpoint...</span>
                </div>
              )}
            </div>

            {/* Simulation Results Drawer */}
            {aiOrderResult && (
              <div className="space-y-2 animate-fade-in text-xs font-mono">
                <div className="flex items-center justify-between text-xs font-sans font-semibold text-white">
                  <span>API Response Output:</span>
                  <span className={`px-2 py-0.5 rounded text-[11px] ${
                    aiOrderResult.ok ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                  }`}>
                    HTTP {aiOrderResult.status}
                  </span>
                </div>
                <pre className="p-3 bg-slate-900 border border-white/10 rounded-xl overflow-x-auto text-[11px] text-slate-200">
                  {JSON.stringify(aiOrderResult.data, null, 2)}
                </pre>
              </div>
            )}

            {/* JSON-LD Catalog Snippet Preview */}
            {aiCatalogPreview && (
              <div className="space-y-1.5 text-xs">
                <div className="font-semibold text-slate-300 text-xs flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-blue-400" />
                  <span>Catalog Protocol Schema (@context: "https://schema.org"):</span>
                </div>
                <pre className="p-3 bg-slate-900 border border-white/10 rounded-xl overflow-x-auto text-[10px] font-mono text-cyan-300 max-h-40">
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
            <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/30 text-xs text-rose-200">
              <div className="font-semibold text-sm text-white flex items-center gap-2 mb-1">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Rule 3: Graceful Failure Recovery Demo</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                Exercises <code className="text-rose-300 font-mono">POST /api/v1/test/trigger-failure</code>.
                When gateway timeouts, credit card declines, or stock locks occur mid-checkout, the agent
                cleanly intercepts the failure, commits the audit record, and automatically generates an
                alternate Razorpay Payment Link with extended 24-hour expiry without crashing!
              </p>
            </div>

            {/* Failure Injection Selectors */}
            <div className="p-3.5 bg-slate-900 border border-white/10 rounded-xl space-y-3 text-xs">
              <label className="block text-slate-300 font-semibold">Simulate Fault Type:</label>
              <select
                value={failureType}
                onChange={(e) => setFailureType(e.target.value)}
                className="w-full p-2 rounded-lg bg-slate-800 border border-white/10 text-white focus:outline-none focus:border-rose-500 text-xs"
              >
                <option value="GATEWAY_TIMEOUT">Gateway Timeout (504 response from acquiring switch)</option>
                <option value="CARD_NETWORK_DECLINE">Card Network Decline (Risk Velocity Trigger)</option>
                <option value="INVENTORY_RACE_CONDITION">Inventory Lock Race Condition (Simultaneous checkout lock)</option>
              </select>

              <button
                onClick={triggerFailureDemo}
                disabled={failureRunning}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-semibold rounded-lg text-xs transition-all shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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
              <div className="p-4 rounded-xl bg-slate-900 border border-emerald-500/40 space-y-3 animate-fade-in text-xs">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Autonomous Recovery Success!</span>
                  </div>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                    ZERO CRASHES
                  </span>
                </div>

                <div className="space-y-1 text-slate-300">
                  <div>
                    <span className="text-slate-400">Caught Exception: </span>
                    <span className="font-mono text-rose-300">[{failureRecoveryResult.simulated_error_code}]</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {failureRecoveryResult.simulated_error_message}
                  </div>
                </div>

                {/* Alternate Payment Link Result */}
                <div className="p-3 bg-slate-950 rounded-lg border border-white/10 space-y-2">
                  <div className="text-white font-semibold flex items-center justify-between">
                    <span>Generated Alternate Razorpay Link:</span>
                    <span className="text-[10px] text-emerald-400 font-mono">24h Valid</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={failureRecoveryResult.fallback_payment_link}
                      className="flex-1 bg-slate-900 border border-white/10 text-blue-400 font-mono text-[11px] px-2.5 py-1.5 rounded"
                    />
                    <a
                      href={failureRecoveryResult.fallback_payment_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded flex items-center gap-1 font-medium transition-colors"
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-[11px] text-slate-300 italic">
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
