import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, Bot, Cpu, Sparkles, Activity, Layers, 
  ExternalLink, Terminal, CheckCircle2, Zap
} from 'lucide-react';
import ChatWindow from './components/ChatWindow';
import AuditLogPanel from './components/AuditLogPanel';

const API_BASE = "http://localhost:8000/api/v1";

export default function App() {
  const [sessionId, setSessionId] = useState(() => {
    return "session_" + Math.random().toString(36).substring(2, 10);
  });
  const [backendHealthy, setBackendHealthy] = useState(false);
  const [auditRefreshTick, setAuditRefreshTick] = useState(0);
  const [activeView, setActiveView] = useState("chat"); // 'chat' | 'audit' for mobile / compact screens

  const checkHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) setBackendHealthy(true);
    } catch {
      setBackendHealthy(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleAuditUpdated = () => {
    setAuditRefreshTick(prev => prev + 1);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      width: '100vw',
      backgroundColor: '#060910',
      color: '#f8fafc',
      overflow: 'hidden',
      fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif'
    }}>
      {/* Top Global Navigation Bar */}
      <header style={{
        height: '56px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(8,12,22,0.92)',
        backdropFilter: 'blur(16px)',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        zIndex: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: 'linear-gradient(135deg, #2563eb, #06b6d4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(37,99,235,0.35)'
          }}>
            <Zap size={18} color="white" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 800, fontSize: '13px', letterSpacing: '-0.02em', color: '#ffffff' }}>
                RAZORPAY BUILDATHON
              </span>
              <span style={{
                fontSize: '10px', fontFamily: 'JetBrains Mono, monospace',
                padding: '2px 8px', borderRadius: '4px',
                backgroundColor: 'rgba(37,99,235,0.18)', color: '#93c5fd',
                border: '1px solid rgba(37,99,235,0.35)', fontWeight: 600
              }}>
                TRACK 01: AGENTIC COMMERCE
              </span>
            </div>
            <p style={{ fontSize: '11px', color: '#64748b' }}>
              Dual-Capability Engine · Human Adaptive Chatbot & External AI Agent Protocol
            </p>
          </div>
        </div>

        {/* Global Controls & Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Mobile Tab Switcher */}
          <div style={{
            display: 'flex',
            backgroundColor: 'rgba(30,41,59,0.7)',
            padding: '2px',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.08)'
          }} className="md:hidden">
            <button
              onClick={() => setActiveView("chat")}
              style={{
                padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                border: 'none', cursor: 'pointer',
                backgroundColor: activeView === 'chat' ? '#2563eb' : 'transparent',
                color: activeView === 'chat' ? '#ffffff' : '#94a3b8'
              }}
            >
              ShopBot Chat
            </button>
            <button
              onClick={() => setActiveView("audit")}
              style={{
                padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                border: 'none', cursor: 'pointer',
                backgroundColor: activeView === 'audit' ? '#7c3aed' : 'transparent',
                color: activeView === 'audit' ? '#ffffff' : '#94a3b8'
              }}
            >
              Agent Control Center
            </button>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 10px', borderRadius: '20px',
            backgroundColor: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.08)',
            fontSize: '11px'
          }}>
            <span style={{ color: '#64748b' }}>Session:</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#67e8f9', fontWeight: 600 }}>{sessionId}</span>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 10px', borderRadius: '20px',
            backgroundColor: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.08)',
            fontSize: '11px'
          }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              backgroundColor: backendHealthy ? '#10b981' : '#f43f5e',
              boxShadow: backendHealthy ? '0 0 8px #10b981' : 'none'
            }} />
            <span style={{ color: backendHealthy ? '#34d399' : '#fb7185', fontWeight: 500 }}>
              {backendHealthy ? 'FastAPI Gateway Live' : 'Connecting...'}
            </span>
          </div>

          {/* Catalog Protocol Link */}
          <a
            href="http://localhost:8000/api/v1/agent/catalog"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              fontSize: '11px', color: '#60a5fa', textDecoration: 'none',
              padding: '4px 8px', borderRadius: '6px',
              backgroundColor: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.25)'
            }}
            title="View live Schema.org JSON-LD Catalog"
          >
            <span>JSON-LD Catalog</span>
            <ExternalLink size={11} />
          </a>
        </div>
      </header>

      {/* Main Split-View Workspace */}
      <main style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        position: 'relative'
      }}>
        {/* Left View: Adaptive In-Site Chatbot */}
        <div style={{
          width: '50%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative'
        }}
        className={activeView === 'chat' ? 'w-full md:w-1/2 flex flex-col' : 'hidden md:flex md:w-1/2 flex-col'}
        >
          <ChatWindow
            sessionId={sessionId}
            onAuditUpdated={handleAuditUpdated}
          />
        </div>

        {/* Right View: Live Audit Trail & Policy State Store */}
        <div style={{
          width: '50%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          position: 'relative',
          backgroundColor: '#090d16'
        }}
        className={activeView === 'audit' ? 'w-full md:w-1/2 flex flex-col' : 'hidden md:flex md:w-1/2 flex-col'}
        >
          <AuditLogPanel
            sessionId={sessionId}
            triggerRefresh={auditRefreshTick}
          />
        </div>
      </main>

      {/* Footer System Status Bar */}
      <footer style={{
        height: '28px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        backgroundColor: '#04060a',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '11px',
        fontFamily: 'JetBrains Mono, monospace',
        color: '#64748b',
        flexShrink: 0,
        zIndex: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#34d399' }}>
            <ShieldCheck size={13} />
            <span>Deterministic Policy Gate: ACTIVE</span>
          </span>
          <span style={{ color: '#334155' }}>|</span>
          <span style={{ color: '#94a3b8' }}>Spending Cap: ₹10,000</span>
          <span style={{ color: '#334155' }}>|</span>
          <span style={{ color: '#94a3b8' }}>Session Velocity: Max 2/hr</span>
        </div>
        <div>
          <span>Audit Store: <span style={{ color: '#60a5fa' }}>ecommerce_agentic.db (SQLite)</span></span>
        </div>
      </footer>
    </div>
  );
}
