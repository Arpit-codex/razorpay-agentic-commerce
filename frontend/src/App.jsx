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
      backgroundColor: '#f8fafc',
      color: '#0f172a',
      overflow: 'hidden',
      fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif'
    }}>
      {/* Top Global Navigation Bar */}
      <header style={{
        height: '56px',
        borderBottom: '1px solid #cbd5e1',
        backgroundColor: '#ffffff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        zIndex: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '6px',
            background: '#1d4ed8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(29,78,216,0.25)'
          }}>
            <Zap size={18} color="white" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 800, fontSize: '13px', letterSpacing: '-0.02em', color: '#0f172a' }}>
                RAZORPAY BUILDATHON
              </span>
              <span style={{
                fontSize: '10px', fontFamily: 'JetBrains Mono, monospace',
                padding: '2px 8px', borderRadius: '4px',
                backgroundColor: '#eff6ff', color: '#1e40af',
                border: '1px solid #bfdbfe', fontWeight: 700
              }}>
                TRACK 01: AGENTIC COMMERCE
              </span>
            </div>
            <p style={{ fontSize: '11px', color: '#475569', fontWeight: 500 }}>
              Dual-Capability Engine · Human Adaptive Chatbot & External AI Agent Protocol
            </p>
          </div>
        </div>

        {/* Global Controls & Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Mobile Tab Switcher */}
          <div style={{
            display: 'flex',
            backgroundColor: '#f1f5f9',
            padding: '2px',
            borderRadius: '6px',
            border: '1px solid #cbd5e1'
          }} className="md:hidden">
            <button
              onClick={() => setActiveView("chat")}
              style={{
                padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
                border: 'none', cursor: 'pointer',
                backgroundColor: activeView === 'chat' ? '#1d4ed8' : 'transparent',
                color: activeView === 'chat' ? '#ffffff' : '#334155'
              }}
            >
              ShopBot Chat
            </button>
            <button
              onClick={() => setActiveView("audit")}
              style={{
                padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
                border: 'none', cursor: 'pointer',
                backgroundColor: activeView === 'audit' ? '#6d28d9' : 'transparent',
                color: activeView === 'audit' ? '#ffffff' : '#334155'
              }}
            >
              Agent Control Center
            </button>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 10px', borderRadius: '20px',
            backgroundColor: '#f8fafc', border: '1px solid #cbd5e1',
            fontSize: '11px'
          }}>
            <span style={{ color: '#475569', fontWeight: 600 }}>Session:</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#1d4ed8', fontWeight: 700 }}>{sessionId}</span>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 10px', borderRadius: '20px',
            backgroundColor: backendHealthy ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${backendHealthy ? '#a7f3d0' : '#fecdd3'}`,
            fontSize: '11px'
          }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              backgroundColor: backendHealthy ? '#059669' : '#dc2626'
            }} />
            <span style={{ color: backendHealthy ? '#047857' : '#b91c1c', fontWeight: 700 }}>
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
              fontSize: '11px', color: '#1d4ed8', textDecoration: 'none',
              padding: '4px 8px', borderRadius: '6px',
              backgroundColor: '#eff6ff', border: '1px solid #bfdbfe',
              fontWeight: 700
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
          position: 'relative',
          backgroundColor: '#f8fafc'
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
          borderLeft: '1px solid #cbd5e1',
          position: 'relative',
          backgroundColor: '#ffffff'
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
        borderTop: '1px solid #cbd5e1',
        backgroundColor: '#ffffff',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '11px',
        fontFamily: 'JetBrains Mono, monospace',
        color: '#334155',
        flexShrink: 0,
        zIndex: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#047857', fontWeight: 700 }}>
            <ShieldCheck size={13} />
            <span>Deterministic Policy Gate: ACTIVE</span>
          </span>
          <span style={{ color: '#cbd5e1' }}>|</span>
          <span style={{ color: '#0f172a', fontWeight: 600 }}>Spending Cap: ₹10,000</span>
          <span style={{ color: '#cbd5e1' }}>|</span>
          <span style={{ color: '#0f172a', fontWeight: 600 }}>Session Velocity: Max 2/hr</span>
        </div>
        <div>
          <span>Audit Store: <span style={{ color: '#1d4ed8', fontWeight: 700 }}>ecommerce_agentic.db (SQLite)</span></span>
        </div>
      </footer>
    </div>
  );
}
