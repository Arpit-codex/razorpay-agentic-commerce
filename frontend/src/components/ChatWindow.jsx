import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Send, Bot, Sparkles, ShoppingCart, Package, Star, 
  RefreshCw, Zap, CheckCircle2, CreditCard, AlertCircle,
  Loader2, ShieldCheck, ChevronRight, X, Tag, Globe, ExternalLink,
  Search, Sliders, ArrowRight, Check, Award, TrendingDown, Store
} from 'lucide-react';
import DirectCheckout from './DirectCheckout';
import PriceWatchModal from './PriceWatchModal';
import PriceHistoryChart from './PriceHistoryChart';


const API_BASE = "http://localhost:8000/api/v1";

const QUICK_DIRECT_PRESETS = [
  { name: "Wireless Headphones", model: "Sony WH-CH720N", budget: 10000 },
  { name: "Mechanical Keyboard", model: "Keychron K2", budget: 7000 },
  { name: "Performance Mouse", model: "Logitech MX Master 3S", budget: 9500 },
  { name: "Streaming Webcam", model: "Logitech C920 Pro", budget: 7000 },
];

export default function ChatWindow({ sessionId, onAuditUpdated }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState('Searching catalog & live web...');
  const [checkoutData, setCheckoutData] = useState(null);
  const [watchModalProduct, setWatchModalProduct] = useState(null);


  // Dual-entry portal state
  const [activeTab, setActiveTab] = useState('direct_buy'); // 'direct_buy' | 'recommendation'
  
  // Option 1: Direct Buy form inputs
  const [dbProductName, setDbProductName] = useState('');
  const [dbBrandModel, setDbBrandModel] = useState('');
  const [dbBudget, setDbBudget] = useState('10000');

  // Option 2: Guided Recommendation inputs
  const [recRoughIdea, setRecRoughIdea] = useState('');
  const [recUseCase, setRecUseCase] = useState('Coding & Dev');
  const [recPriority, setRecPriority] = useState('Active Noise Cancelling');
  const [recBudget, setRecBudget] = useState('Under ₹10,000');

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages, isThinking]);

  // Execute Option 1: Direct Buy Lowest Price Search
  const handleDirectBuySubmit = async (pName, bModel, bBudget) => {
    const p = (pName || dbProductName).trim();
    const m = (bModel || dbBrandModel).trim();
    const b = parseFloat(bBudget || dbBudget) || 10000.0;

    if (!p || !m) return;

    const userMsg = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: `🔍 Direct Buy: Find lowest price online for ${m} ${p} (Budget: ₹${b.toLocaleString('en-IN')})`,
      ts: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setIsThinking(true);
    setThinkingLabel(`Scanning Amazon, Flipkart, Croma & Reliance Digital for ${m}...`);

    try {
      const res = await fetch(`${API_BASE}/search/lowest-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          product_name: p,
          brand_model: m,
          budget_max: b
        })
      });

      const deal = await res.json();
      setIsThinking(false);

      const botMsg = {
        id: `b_${Date.now()}`,
        role: 'bot',
        text: `I searched major Indian e-commerce retailers for **${deal.brand_model}**. Here is the verified multi-store price comparison. The lowest verified price is at **${deal.lowest_store}**!`,
        deal_card: deal,
        product_cards: [],
        bundle_cards: [],
        quick_suggestions: [
          `Buy at ${deal.lowest_store}`,
          "Compare with alternative model",
          "Check warranty details",
          "Under ₹5,000 alternatives"
        ],
        ts: new Date()
      };

      setMessages(prev => [...prev, botMsg]);
      if (onAuditUpdated) onAuditUpdated();
    } catch (err) {
      setIsThinking(false);
      setMessages(prev => [...prev, {
        id: `err_${Date.now()}`,
        role: 'bot',
        text: '⚠️ Search connection failed. Please ensure the backend is active on port 8000.',
        ts: new Date()
      }]);
    }
  };

  // Execute Option 2: Guided Recommendation Submit
  const handleRecommendationSubmit = () => {
    const text = recRoughIdea.trim() || "Quality desk equipment";
    const prompt = `I need a recommendation: "${text}". Primary Use Case: ${recUseCase}. Top Priority Feature: ${recPriority}. Budget Ceiling: ${recBudget}. Please suggest the top matching gear with live pricing and specs.`;
    sendMessage(prompt);
  };

  // Send a regular chat message
  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || isThinking) return;

    const userMsg = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: text.trim(),
      ts: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsThinking(true);
    setThinkingLabel('Searching live web & catalog with Gemini...');

    try {
      const res = await fetch(`${API_BASE}/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: text.trim() })
      });

      const data = await res.json();
      setIsThinking(false);

      const botMsg = {
        id: `b_${Date.now()}`,
        role: 'bot',
        text: data.response || "Sorry, I couldn't process that.",
        product_cards: data.product_cards || [],
        bundle_cards: data.bundle_cards || [],
        quick_suggestions: data.quick_suggestions || [],
        ts: new Date()
      };

      setMessages(prev => [...prev, botMsg]);
      if (onAuditUpdated) onAuditUpdated();
    } catch (err) {
      setIsThinking(false);
      setMessages(prev => [...prev, {
        id: `err_${Date.now()}`,
        role: 'bot',
        text: '⚠️ Connection error. Make sure the backend is running on port 8000.',
        product_cards: [], bundle_cards: [], quick_suggestions: [],
        ts: new Date()
      }]);
    }
  }, [sessionId, isThinking, onAuditUpdated]);

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(inputText);
  };

  const handleReset = async () => {
    await fetch(`${API_BASE}/chat/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    setMessages([]);
    setCheckoutData(null);
    setDbProductName('');
    setDbBrandModel('');
  };

  const initiateCheckout = (items, totalAmount, isBundle, reasoning, intent) => {
    setCheckoutData({ items, totalAmount, isBundle, reasoning, userIntent: intent });
    setTimeout(scrollToBottom, 100);
  };

  const dismissCheckout = () => setCheckoutData(null);

  return (
    <div className="flex flex-col h-full" style={{ background: 'linear-gradient(180deg, #080c14 0%, #0a1120 100%)' }}>
      {/* Chat Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(8,12,20,0.95)',
        backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        zIndex: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '38px', height: '38px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #10b981, #06b6d4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(16,185,129,0.35)'
          }}>
            <Bot size={20} color="white" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 800, color: '#f8fafc', fontSize: '15px' }}>ShopBot AI</span>
              <span style={{
                fontSize: '10px', fontFamily: 'JetBrains Mono, monospace',
                background: 'rgba(16,185,129,0.15)', color: '#34d399',
                border: '1px solid rgba(16,185,129,0.3)', padding: '2px 8px', borderRadius: '20px',
                display: 'flex', alignItems: 'center', gap: '4px'
              }}>
                <Globe size={10} /> Live Indian Web Deals
              </span>
            </div>
            <p style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>
              Multi-Retailer Price Comparison · Lowest Price Guaranteed
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {messages.length > 0 && (
            <button onClick={handleReset} style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              color: '#cbd5e1', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer',
              fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px',
              transition: 'all 0.15s'
            }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            >
              <RefreshCw size={12} />
              New Search / Change Option
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* ============================================================ */}
        {/* DUAL OPTION WELCOME PORTAL (Appears before chatting starts)  */}
        {/* ============================================================ */}
        {messages.length === 0 && (
          <div style={{ maxWidth: '680px', margin: '0 auto', width: '100%', padding: '8px 0 20px', animation: 'fadeSlideIn 0.3s ease-out' }}>
            
            {/* Hero Title */}
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                color: '#34d399', padding: '4px 14px', borderRadius: '20px',
                fontSize: '11px', fontWeight: 700, marginBottom: '10px'
              }}>
                <Zap size={12} fill="#34d399" />
                Select Shopping Mode
              </div>
              <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#f8fafc', marginBottom: '6px' }}>
                How would you like to shop today?
              </h2>
              <p style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '440px', margin: '0 auto', lineHeight: 1.5 }}>
                Choose whether you know the exact product or need an intelligent personalized recommendation.
              </p>
            </div>

            {/* Mode Selector Tabs */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px'
            }}>
              <button
                onClick={() => setActiveTab('direct_buy')}
                style={{
                  padding: '12px 14px', borderRadius: '12px', cursor: 'pointer', textAlign: 'left',
                  background: activeTab === 'direct_buy' 
                    ? 'linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(6,182,212,0.12) 100%)' 
                    : 'rgba(30,41,59,0.4)',
                  border: activeTab === 'direct_buy' ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.08)',
                  transition: 'all 0.2s', position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{
                    width: '24px', height: '24px', borderRadius: '6px',
                    background: activeTab === 'direct_buy' ? '#10b981' : 'rgba(255,255,255,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
                    fontSize: '12px', fontWeight: 800
                  }}>1</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: activeTab === 'direct_buy' ? '#34d399' : '#f1f5f9' }}>
                    Option 1: Direct Buy
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0, lineHeight: 1.4 }}>
                  Check lowest price online across Amazon, Flipkart & Croma.
                </p>
              </button>

              <button
                onClick={() => setActiveTab('recommendation')}
                style={{
                  padding: '12px 14px', borderRadius: '12px', cursor: 'pointer', textAlign: 'left',
                  background: activeTab === 'recommendation' 
                    ? 'linear-gradient(135deg, rgba(59,130,246,0.18) 0%, rgba(124,58,237,0.12) 100%)' 
                    : 'rgba(30,41,59,0.4)',
                  border: activeTab === 'recommendation' ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{
                    width: '24px', height: '24px', borderRadius: '6px',
                    background: activeTab === 'recommendation' ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
                    fontSize: '12px', fontWeight: 800
                  }}>2</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: activeTab === 'recommendation' ? '#60a5fa' : '#f1f5f9' }}>
                    Option 2: Recommendation
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0, lineHeight: 1.4 }}>
                  Answer 3 quick questions for tailored gear suggestions.
                </p>
              </button>
            </div>

            {/* TAB 1: DIRECT BUY (LOWEST PRICE FINDER) FORM */}
            {activeTab === 'direct_buy' && (
              <div style={{
                background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(16,185,129,0.3)',
                borderRadius: '16px', padding: '20px',
                boxShadow: '0 12px 36px rgba(0,0,0,0.5)', backdropFilter: 'blur(16px)',
                animation: 'fadeSlideIn 0.25s ease-out'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                      🏷️ Direct Buy — Lowest Price Search
                    </h3>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0' }}>
                      Enter your product and model. We compare Amazon, Flipkart, Croma & Reliance Digital in real-time.
                    </p>
                  </div>
                  <span style={{
                    fontSize: '11px', background: 'rgba(16,185,129,0.15)', color: '#34d399',
                    border: '1px solid rgba(16,185,129,0.3)', padding: '3px 10px', borderRadius: '20px',
                    fontWeight: 700
                  }}>
                    Price Comparison
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Field 1: Product Name */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '5px' }}>
                      Product Name / Category:
                    </label>
                    <input
                      type="text"
                      value={dbProductName}
                      onChange={e => setDbProductName(e.target.value)}
                      placeholder="e.g. Wireless Noise Cancelling Headphones, Mechanical Keyboard"
                      style={{
                        width: '100%', background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '10px', padding: '10px 14px', color: '#f8fafc', fontSize: '13px',
                        outline: 'none', boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Field 2: Company / Model */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '5px' }}>
                      Company & Model:
                    </label>
                    <input
                      type="text"
                      value={dbBrandModel}
                      onChange={e => setDbBrandModel(e.target.value)}
                      placeholder="e.g. Sony WH-CH720N, Keychron K2, Logitech MX Master 3S"
                      style={{
                        width: '100%', background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '10px', padding: '10px 14px', color: '#f8fafc', fontSize: '13px',
                        outline: 'none', boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Field 3: Price Range */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1' }}>
                        Maximum Budget (INR):
                      </label>
                      <span style={{ fontSize: '11px', color: '#38bdf8' }}>₹10,000 Safety Cap</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="number"
                        value={dbBudget}
                        onChange={e => setDbBudget(e.target.value)}
                        placeholder="10000"
                        style={{
                          flex: 1, background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: '10px', padding: '10px 14px', color: '#f8fafc', fontSize: '13px',
                          outline: 'none', boxSizing: 'border-box'
                        }}
                      />
                      {[5000, 8000, 10000].map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setDbBudget(String(val))}
                          style={{
                            background: dbBudget === String(val) ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.06)',
                            border: dbBudget === String(val) ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                            color: dbBudget === String(val) ? '#34d399' : '#94a3b8',
                            padding: '9px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
                            fontWeight: 600
                          }}
                        >
                          ₹{val.toLocaleString('en-IN')}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quick Presets */}
                  <div style={{ marginTop: '2px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '6px' }}>
                      Popular Searches:
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {QUICK_DIRECT_PRESETS.map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setDbProductName(preset.name);
                            setDbBrandModel(preset.model);
                            setDbBudget(String(preset.budget));
                            handleDirectBuySubmit(preset.name, preset.model, preset.budget);
                          }}
                          style={{
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                            color: '#cbd5e1', padding: '4px 10px', borderRadius: '16px', fontSize: '11px',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                          }}
                          onMouseOver={e => e.currentTarget.style.background = 'rgba(16,185,129,0.15)'}
                          onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                        >
                          ⚡ {preset.model}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="button"
                    onClick={() => handleDirectBuySubmit()}
                    disabled={!dbProductName.trim() || !dbBrandModel.trim() || isThinking}
                    style={{
                      marginTop: '6px', padding: '12px 18px', borderRadius: '12px', border: 'none',
                      background: (!dbProductName.trim() || !dbBrandModel.trim() || isThinking)
                        ? 'rgba(255,255,255,0.08)'
                        : 'linear-gradient(135deg, #10b981 0%, #0d9488 100%)',
                      color: 'white', fontSize: '14px', fontWeight: 800,
                      cursor: (!dbProductName.trim() || !dbBrandModel.trim() || isThinking) ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      boxShadow: '0 4px 16px rgba(16,185,129,0.3)', transition: 'all 0.2s'
                    }}
                  >
                    {isThinking ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Searching Indian Stores (Amazon, Flipkart, Croma)...</span>
                      </>
                    ) : (
                      <>
                        <Search size={16} />
                        <span>Check Lowest Price Online</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: GUIDED RECOMMENDATION FORM */}
            {activeTab === 'recommendation' && (
              <div style={{
                background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(59,130,246,0.3)',
                borderRadius: '16px', padding: '20px',
                boxShadow: '0 12px 36px rgba(0,0,0,0.5)', backdropFilter: 'blur(16px)',
                animation: 'fadeSlideIn 0.25s ease-out'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                      🎯 Guided Recommendation — Interactive Profiling
                    </h3>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0' }}>
                      Tell us what you need in plain words, select your preferences, and ShopBot will find the perfect gear.
                    </p>
                  </div>
                  <span style={{
                    fontSize: '11px', background: 'rgba(59,130,246,0.15)', color: '#60a5fa',
                    border: '1px solid rgba(59,130,246,0.3)', padding: '3px 10px', borderRadius: '20px',
                    fontWeight: 700
                  }}>
                    AI Profiling
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Step 1: Rough Idea */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '5px' }}>
                      Rough Idea of What You Want:
                    </label>
                    <textarea
                      rows={2}
                      value={recRoughIdea}
                      onChange={e => setRecRoughIdea(e.target.value)}
                      placeholder="e.g. I need comfortable headphones for long coding sessions and crystal clear client calls..."
                      style={{
                        width: '100%', background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '10px', padding: '10px 14px', color: '#f8fafc', fontSize: '13px',
                        outline: 'none', boxSizing: 'border-box', resize: 'none'
                      }}
                    />
                  </div>

                  {/* Question 1: Use Case */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '6px' }}>
                      1. Primary Use Case:
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {[
                        "Coding & Dev Marathons",
                        "Zoom & Client Meetings",
                        "Gaming & High-FPS Audio",
                        "Content Creation & Podcasting"
                      ].map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setRecUseCase(val)}
                          style={{
                            background: recUseCase === val ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.05)',
                            border: recUseCase === val ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)',
                            color: recUseCase === val ? '#93c5fd' : '#cbd5e1',
                            padding: '6px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                            fontWeight: 600
                          }}
                        >
                          {recUseCase === val ? '✓ ' : ''}{val}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Question 2: Top Priority */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '6px' }}>
                      2. Top Priority Feature:
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {[
                        "Active Noise Cancelling",
                        "All-Day Ergonomic Comfort",
                        "Wireless & Multi-Device",
                        "Studio Sound & Voice Clarity"
                      ].map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setRecPriority(val)}
                          style={{
                            background: recPriority === val ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.05)',
                            border: recPriority === val ? '1px solid #8b5cf6' : '1px solid rgba(255,255,255,0.08)',
                            color: recPriority === val ? '#c4b5fd' : '#cbd5e1',
                            padding: '6px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                            fontWeight: 600
                          }}
                        >
                          {recPriority === val ? '✓ ' : ''}{val}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Question 3: Budget */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '6px' }}>
                      3. Maximum Budget Ceiling:
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {[
                        "Under ₹4,000",
                        "Under ₹7,000",
                        "Under ₹10,000 (Safety Limit)"
                      ].map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setRecBudget(val)}
                          style={{
                            background: recBudget === val ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.05)',
                            border: recBudget === val ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.08)',
                            color: recBudget === val ? '#34d399' : '#cbd5e1',
                            padding: '6px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                            fontWeight: 600
                          }}
                        >
                          {recBudget === val ? '✓ ' : ''}{val}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="button"
                    onClick={handleRecommendationSubmit}
                    disabled={isThinking}
                    style={{
                      marginTop: '6px', padding: '12px 18px', borderRadius: '12px', border: 'none',
                      background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
                      color: 'white', fontSize: '14px', fontWeight: 800, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      boxShadow: '0 4px 16px rgba(37,99,235,0.3)', transition: 'all 0.2s'
                    }}
                  >
                    {isThinking ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Finding matching gear...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        <span>Get Tailored Recommendations</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* MESSAGE STREAM (Rendered when chat has started)               */}
        {/* ============================================================ */}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            onSuggestionClick={sendMessage}
            onInitiateCheckout={initiateCheckout}
            onOpenPriceWatch={(prod) => setWatchModalProduct(prod)}
          />
        ))}

        {/* Thinking Indicator */}
        {isThinking && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0,
              background: 'linear-gradient(135deg, #10b981, #06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Bot size={16} color="white" />
            </div>
            <div style={{
              background: 'rgba(30,41,59,0.7)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px', borderTopLeftRadius: '4px', padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: '10px'
            }}>
              <Loader2 size={15} color="#10b981" style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>{thinkingLabel}</span>
            </div>
          </div>
        )}

        {/* Checkout modal pinned at bottom */}
        {checkoutData && (
          <div style={{ position: 'relative' }}>
            <button onClick={dismissCheckout} style={{
              position: 'absolute', top: '-8px', right: '0px', zIndex: 10,
              background: 'rgba(244,63,94,0.2)', border: '1px solid rgba(244,63,94,0.4)',
              color: '#fb7185', borderRadius: '50%', width: '24px', height: '24px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
            }}>
              <X size={12} />
            </button>
            <DirectCheckout
              orderDetails={checkoutData}
              sessionId={sessionId}
              onPaymentSuccess={() => { if (onAuditUpdated) onAuditUpdated(); }}
              onPaymentError={() => { if (onAuditUpdated) onAuditUpdated(); }}
            />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <div style={{
        padding: '14px 16px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(8,12,20,0.95)', backdropFilter: 'blur(20px)'
      }}>
        <form onSubmit={handleSubmit}>
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: '10px',
            background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '14px', padding: '10px 12px 10px 16px',
            transition: 'border-color 0.15s'
          }}
            onFocus={e => e.currentTarget.style.borderColor = 'rgba(16,185,129,0.5)'}
            onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
          >
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={e => { setInputText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(inputText); } }}
              placeholder="Ask anything (e.g. 'Find the cheapest Keychron keyboard' or 'Compare Sony vs Bose ANC')"
              disabled={isThinking}
              rows={1}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: '#f1f5f9', fontSize: '14px', resize: 'none', lineHeight: '1.5',
                fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
                maxHeight: '120px', overflowY: 'auto'
              }}
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isThinking}
              style={{
                width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                background: inputText.trim() && !isThinking
                  ? 'linear-gradient(135deg, #10b981, #0d9488)'
                  : 'rgba(255,255,255,0.06)',
                border: 'none', cursor: inputText.trim() && !isThinking ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
                boxShadow: inputText.trim() && !isThinking ? '0 4px 12px rgba(16,185,129,0.4)' : 'none'
              }}
            >
              {isThinking
                ? <Loader2 size={16} color="#64748b" style={{ animation: 'spin 1s linear infinite' }} />
                : <Send size={16} color={inputText.trim() ? 'white' : '#475569'} />
              }
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', paddingX: '4px' }}>
            <span style={{ fontSize: '11px', color: '#475569' }}>Press Enter to send · Shift+Enter for new line</span>
            <span style={{ fontSize: '11px', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ShieldCheck size={11} color="#10b981" />
              ₹10,000 Safety Cap · Multi-Store Price Verified
            </span>
          </div>
        </form>
      </div>

      {watchModalProduct && (
        <PriceWatchModal
          product={watchModalProduct}
          sessionId={sessionId}
          onClose={() => setWatchModalProduct(null)}
          onWatchCreated={() => {
            if (onAuditUpdated) onAuditUpdated();
          }}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// ---- Individual Message Bubble ----

function MessageBubble({ msg, onSuggestionClick, onInitiateCheckout, onOpenPriceWatch }) {
  const isUser = msg.role === 'user';

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '10px',
      flexDirection: isUser ? 'row-reverse' : 'row',
      animation: 'fadeSlideIn 0.25s ease-out'
    }}>
      {/* Avatar */}
      <div style={{
        width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0,
        background: isUser
          ? 'linear-gradient(135deg, #0ea5e9, #2563eb)'
          : 'linear-gradient(135deg, #10b981, #06b6d4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '13px', fontWeight: 700, color: 'white',
        boxShadow: isUser ? '0 4px 12px rgba(14,165,233,0.3)' : '0 4px 12px rgba(16,185,129,0.3)'
      }}>
        {isUser ? 'U' : <Bot size={16} color="white" />}
      </div>

      <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
        {/* Text bubble */}
        <div style={{
          background: isUser
            ? 'linear-gradient(135deg, #1d4ed8, #1e40af)'
            : 'rgba(30,41,59,0.8)',
          border: isUser ? 'none' : '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          borderTopRightRadius: isUser ? '4px' : '16px',
          borderTopLeftRadius: isUser ? '16px' : '4px',
          padding: '11px 15px',
          color: '#e2e8f0', fontSize: '14px', lineHeight: '1.6',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          backdropFilter: 'blur(10px)'
        }}>
          {formatMessageText(msg.text)}
        </div>

        {/* Option 1: Lowest Price Deal Card */}
        {msg.deal_card && (
          <LowestPriceDealCard
            deal={msg.deal_card}
            onBuyNow={(items, total, isBundle, reasoning) =>
              onInitiateCheckout(items, total, isBundle, reasoning, 'PRICE_COMPARISON_DIRECT_BUY')
            }
            onOpenPriceWatch={onOpenPriceWatch}
          />
        )}

        {/* Product Cards */}
        {msg.product_cards && msg.product_cards.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
            {msg.product_cards.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onBuyNow={(items, total, isBundle, reasoning) =>
                  onInitiateCheckout(items, total, isBundle, reasoning, 'AI_RECOMMENDATION_PURCHASE')
                }
                onOpenPriceWatch={onOpenPriceWatch}
              />
            ))}
          </div>
        )}

        {/* Bundle Cards */}
        {msg.bundle_cards && msg.bundle_cards.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
            {msg.bundle_cards.map(bundle => (
              <BundleCard
                key={bundle.primary_product_id}
                bundle={bundle}
                onBuyBundle={(items, total) =>
                  onInitiateCheckout(items, total, true, bundle.bundle_pitch, 'AI_BUNDLE_PURCHASE')
                }
              />
            ))}
          </div>
        )}

        {/* Quick suggestion chips */}
        {msg.quick_suggestions && msg.quick_suggestions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {msg.quick_suggestions.map((s, i) => (
              <button key={i} onClick={() => onSuggestionClick(s)} style={{
                background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                color: '#6ee7b7', padding: '5px 12px', borderRadius: '20px',
                fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s',
                fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 500
              }}
                onMouseOver={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.25)'; e.currentTarget.style.color = '#a7f3d0'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.1)'; e.currentTarget.style.color = '#6ee7b7'; }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <span style={{ fontSize: '10px', color: '#334155' }}>
          {msg.ts?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

// ---- Option 1: Lowest Price Deal Card Component ----

function LowestPriceDealCard({ deal, onBuyNow, onOpenPriceWatch }) {
  const isCompliant = deal.lowest_price_inr <= 10000.0;
  const [showHistoryChart, setShowHistoryChart] = useState(false);

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(15,23,42,0.95) 100%)',
      border: '1px solid rgba(16,185,129,0.4)', borderRadius: '16px', overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)', width: '100%',
      animation: 'fadeSlideIn 0.3s ease-out'
    }}>
      {/* Top Banner */}
      <div style={{
        background: 'linear-gradient(90deg, rgba(16,185,129,0.25) 0%, rgba(6,182,212,0.15) 100%)',
        borderBottom: '1px solid rgba(16,185,129,0.3)', padding: '8px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 800, color: '#34d399' }}>
          <Award size={15} color="#34d399" />
          LOWEST VERIFIED PRICE IN INDIA
        </div>
        {deal.savings_inr > 0 && (
          <span style={{
            fontSize: '11px', background: 'rgba(16,185,129,0.25)', color: '#34d399',
            padding: '2px 8px', borderRadius: '12px', fontWeight: 700
          }}>
            Save ₹{deal.savings_inr.toLocaleString('en-IN')}
          </span>
        )}
      </div>

      {/* Main Info */}
      <div style={{ display: 'flex', gap: '14px', padding: '14px' }}>
        <img
          src={deal.image_url}
          alt={deal.product_name}
          style={{
            width: '84px', height: '84px', borderRadius: '12px', objectFit: 'cover',
            flexShrink: 0, border: '1px solid rgba(255,255,255,0.12)', background: '#0f172a'
          }}
          onError={e => { e.target.src = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=300&q=80'; }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            fontSize: '10px', background: 'rgba(59,130,246,0.15)', color: '#60a5fa',
            border: '1px solid rgba(59,130,246,0.3)', padding: '2px 8px', borderRadius: '20px',
            fontWeight: 700
          }}>
            {deal.category}
          </span>
          <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#f8fafc', margin: '4px 0 2px', lineHeight: 1.3 }}>
            {deal.brand_model}
          </h4>
          <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.4, margin: '2px 0 6px' }}>
            {deal.specs_summary}
          </p>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '20px', fontWeight: 800, color: '#34d399', fontFamily: 'JetBrains Mono, monospace' }}>
              ₹{deal.lowest_price_inr.toLocaleString('en-IN')}
            </span>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              at <strong style={{ color: '#f8fafc' }}>{deal.lowest_store}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Multi-Store Comparison Table */}
      {deal.retailers && deal.retailers.length > 0 && (
        <div style={{ padding: '0 14px 12px' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
            Multi-Retailer Price Comparison:
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {deal.retailers.map((r, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 10px', borderRadius: '8px',
                  background: r.is_lowest ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.03)',
                  border: r.is_lowest ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.05)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Store size={13} color={r.is_lowest ? '#34d399' : '#94a3b8'} />
                  <span style={{ fontSize: '12px', fontWeight: r.is_lowest ? 700 : 500, color: r.is_lowest ? '#34d399' : '#cbd5e1' }}>
                    {r.store}
                  </span>
                  {r.is_lowest && (
                    <span style={{
                      fontSize: '9px', background: '#10b981', color: 'white',
                      padding: '1px 6px', borderRadius: '10px', fontWeight: 800
                    }}>
                      LOWEST
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: r.is_lowest ? '#34d399' : '#94a3b8' }}>
                    ₹{r.price_inr.toLocaleString('en-IN')}
                  </span>
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#60a5fa', fontSize: '11px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px' }}
                      onClick={e => e.stopPropagation()}
                    >
                      Visit <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inline Price History Sparkline Chart */}
      {showHistoryChart && (
        <div style={{ padding: '0 14px 10px' }}>
          <PriceHistoryChart
            brandModel={deal.brand_model}
            productName={deal.product_name}
            currentPrice={deal.lowest_price_inr}
            onClose={() => setShowHistoryChart(false)}
          />
        </div>
      )}

      {/* Action Bar */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.08)', padding: '12px 14px',
        background: 'rgba(8,12,20,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setShowHistoryChart(!showHistoryChart)}
            style={{
              padding: '7px 11px', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.4)',
              background: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontSize: '11px', fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s'
            }}
          >
            📈 Price History
          </button>
          <button
            onClick={() => onOpenPriceWatch && onOpenPriceWatch(deal)}
            style={{
              padding: '7px 11px', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.4)',
              background: 'rgba(16,185,129,0.15)', color: '#34d399', fontSize: '11px', fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s'
            }}
          >
            🔔 Set Price Alert
          </button>
        </div>

        {isCompliant ? (
          <button
            onClick={() => onBuyNow(
              [{ product_id: deal.id, quantity: 1 }],
              deal.lowest_price_inr,
              false,
              `Direct Buy lowest price deal: ${deal.brand_model} at ${deal.lowest_store}`
            )}
            style={{
              padding: '9px 16px', borderRadius: '10px', border: 'none',
              background: 'linear-gradient(135deg, #10b981 0%, #0d9488 100%)',
              color: 'white', fontSize: '13px', fontWeight: 800, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
              boxShadow: '0 4px 14px rgba(16,185,129,0.4)', transition: 'all 0.15s'
            }}
            onMouseOver={e => e.currentTarget.style.boxShadow = '0 6px 20px rgba(16,185,129,0.6)'}
            onMouseOut={e => e.currentTarget.style.boxShadow = '0 4px 14px rgba(16,185,129,0.4)'}
          >
            <CreditCard size={14} />
            Buy with Razorpay (₹{deal.lowest_price_inr.toLocaleString('en-IN')})
          </button>
        ) : (
          <button
            disabled
            style={{
              padding: '8px 14px', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.4)',
              background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: '12px', fontWeight: 700,
              cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <AlertCircle size={14} />
            Exceeds ₹10,000 Safety Cap
          </button>
        )}
      </div>
    </div>
  );
}

// ---- Product Card Component ----

function ProductCard({ product, onBuyNow, onOpenPriceWatch }) {
  const [showBundle, setShowBundle] = useState(false);
  const [showHistoryChart, setShowHistoryChart] = useState(false);

  const hasBundlePricing = product.bundle_preview && product.bundle_preview.bundle_price;
  const standalonePrice = product.price_inr;
  const bundlePrice = hasBundlePricing ? product.bundle_preview.bundle_price : null;

  return (
    <div style={{
      background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(59,130,246,0.25)',
      borderRadius: '16px', overflow: 'hidden',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      animation: 'fadeSlideIn 0.3s ease-out'
    }}>
      {/* Product Image + Info */}
      <div style={{ display: 'flex', gap: '12px', padding: '14px' }}>
        <img
          src={product.image_url}
          alt={product.name}
          style={{
            width: '76px', height: '76px', borderRadius: '10px', objectFit: 'cover',
            flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)', background: '#0f172a'
          }}
          onError={e => { e.target.src = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=300&q=80'; }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {product.is_web_result && (
              <span style={{
                fontSize: '10px', fontWeight: 700,
                background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(6,182,212,0.2))',
                border: '1px solid rgba(16,185,129,0.5)', color: '#34d399',
                padding: '2px 8px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '4px'
              }}>
                <Globe size={10} color="#34d399" />
                Live Web (Tavily)
              </span>
            )}
            <span style={{
              fontSize: '10px', fontFamily: 'JetBrains Mono, monospace',
              background: 'rgba(59,130,246,0.15)', color: '#60a5fa',
              border: '1px solid rgba(59,130,246,0.3)', padding: '2px 8px', borderRadius: '20px'
            }}>
              {product.category}
            </span>
            <span style={{ fontSize: '11px', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '2px' }}>
              <Star size={10} fill="#fbbf24" />
              {product.rating}
            </span>
            <span style={{
              fontSize: '10px',
              color: product.target_tier === 'professional' ? '#c084fc' : '#34d399',
              fontWeight: 600
            }}>
              {product.target_tier === 'professional' ? 'Pro' : 'Casual'}
            </span>
          </div>
          <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9', margin: '4px 0 2px', lineHeight: 1.3 }}>
            {product.name}
          </h4>
          {product.source_domain && product.source_url && (
            <div style={{ marginBottom: '4px' }}>
              <a
                href={product.source_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '11px', color: '#38bdf8', textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: '4px'
                }}
                onClick={e => e.stopPropagation()}
              >
                Found on {product.source_domain} <ExternalLink size={10} />
              </a>
            </div>
          )}
          <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {product.description}
          </p>
        </div>
      </div>

      {/* Usage Tags */}
      {product.usage_tags && (
        <div style={{ padding: '0 14px 10px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {product.usage_tags.slice(0, 4).map((tag, i) => (
            <span key={i} style={{
              fontSize: '10px', padding: '2px 8px', borderRadius: '20px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px'
            }}>
              <Tag size={8} /> {tag}
            </span>
          ))}
        </div>
      )}

      {/* Inline Price History Sparkline Chart */}
      {showHistoryChart && (
        <div style={{ padding: '0 14px 10px' }}>
          <PriceHistoryChart
            brandModel={product.name}
            productName={product.name}
            currentPrice={standalonePrice}
            onClose={() => setShowHistoryChart(false)}
          />
        </div>
      )}

      {/* Pricing Actions */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.07)', padding: '12px 14px',
        background: 'rgba(8,12,20,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap'
      }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#f8fafc', fontFamily: 'JetBrains Mono, monospace' }}>
            ₹{standalonePrice.toLocaleString('en-IN')}
          </div>
          {hasBundlePricing && (
            <div style={{ fontSize: '11px', color: '#34d399' }}>
              Bundle from ₹{bundlePrice.toLocaleString('en-IN')} (Save ₹{product.bundle_preview.savings?.toLocaleString('en-IN')})
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowHistoryChart(!showHistoryChart)}
            style={{
              padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.4)',
              background: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontSize: '11px', fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px'
            }}
          >
            📈 History
          </button>
          <button
            onClick={() => onOpenPriceWatch && onOpenPriceWatch(product)}
            style={{
              padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.4)',
              background: 'rgba(16,185,129,0.15)', color: '#34d399', fontSize: '11px', fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px'
            }}
          >
            🔔 Alert
          </button>
          {hasBundlePricing && (
            <button
              onClick={() => setShowBundle(prev => !prev)}
              style={{
                padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(6,182,212,0.4)',
                background: 'rgba(6,182,212,0.1)', color: '#22d3ee', fontSize: '11px',
                fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px'
              }}
            >
              <Package size={12} />
              Bundle
            </button>
          )}
          {standalonePrice > 10000.0 ? (
            <button
              disabled
              title="Exceeds ₹10,000 deterministic safety ceiling"
              style={{
                padding: '7px 10px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)',
                background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: '11px', fontWeight: 600,
                cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: '4px'
              }}
            >
              <AlertCircle size={12} color="#f87171" />
              Exceeds ₹10k
            </button>
          ) : (
            <button
              onClick={() => onBuyNow(
                [{ product_id: product.id, quantity: 1 }],
                standalonePrice,
                false,
                `AI recommended ${product.name} — ${product.is_web_result ? 'Live Web Verified' : 'Catalog'} purchase`
              )}
              style={{
                padding: '7px 12px', borderRadius: '8px', border: 'none',
                background: product.is_web_result 
                  ? 'linear-gradient(135deg, #059669, #0d9488)' 
                  : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: 'white', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px'
              }}
            >
              <CreditCard size={12} />
              {product.is_web_result ? 'Buy with Razorpay' : 'Buy Now'}
            </button>
          )}
        </div>
      </div>

      {/* Expandable Bundle Detail */}
      {showBundle && hasBundlePricing && (
        <div style={{
          margin: '0 14px 14px',
          background: 'rgba(6,182,212,0.07)', border: '1px solid rgba(6,182,212,0.25)',
          borderRadius: '12px', padding: '12px',
          animation: 'fadeSlideIn 0.2s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#22d3ee', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Package size={13} />
              {product.bundle_preview.bundle_name}
            </span>
            <span style={{
              background: 'rgba(16,185,129,0.2)', color: '#34d399',
              border: '1px solid rgba(16,185,129,0.3)',
              padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 800
            }}>
              {product.bundle_preview.discount_pct}% OFF
            </span>
          </div>
          <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 8px', lineHeight: 1.4 }}>
            {product.bundle_preview.pitch}
          </p>
          <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px' }}>
            Includes: <span style={{ color: '#cbd5e1' }}>{product.name}</span> + {product.bundle_preview.addon_names.join(', ')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: '11px', color: '#64748b', textDecoration: 'line-through', marginRight: '6px' }}>
                ₹{product.bundle_preview.standalone_total?.toLocaleString('en-IN')}
              </span>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#34d399', fontFamily: 'JetBrains Mono, monospace' }}>
                ₹{product.bundle_preview.bundle_price?.toLocaleString('en-IN')}
              </span>
            </div>
            <button
              onClick={() => {
                const allIds = [product.id, ...(product.bundle_preview.addon_ids || [])];
                onBuyNow(
                  allIds.map(id => ({ product_id: id, quantity: 1 })),
                  product.bundle_preview.bundle_price,
                  true,
                  product.bundle_preview.pitch
                );
              }}
              style={{
                padding: '7px 14px', borderRadius: '9px', border: 'none',
                background: 'linear-gradient(135deg, #0891b2, #0e7490)',
                color: 'white', fontSize: '12px', fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
              }}
            >
              <Zap size={12} fill="white" />
              Buy Bundle
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Bundle Card Component ----

function BundleCard({ bundle, onBuyBundle }) {
  const allItems = [
    { product_id: bundle.primary_product_id, quantity: 1 },
    ...(bundle.addon_product_ids || []).map(id => ({ product_id: id, quantity: 1 }))
  ];

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(6,182,212,0.08) 0%, rgba(15,23,42,0.9) 100%)',
      border: '1px solid rgba(6,182,212,0.35)', borderRadius: '16px', padding: '14px',
      animation: 'fadeSlideIn 0.3s ease-out'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 700, color: '#22d3ee' }}>
          <Package size={15} />
          {bundle.bundle_name || 'Smart Bundle Deal'}
        </div>
        <span style={{
          background: 'rgba(16,185,129,0.2)', color: '#34d399',
          border: '1px solid rgba(16,185,129,0.35)',
          padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800
        }}>
          {bundle.discount_pct}% OFF
        </span>
      </div>

      <div style={{ marginBottom: '10px' }}>
        {[{ id: bundle.primary_product_id, name: bundle.primary_product_name }]
          .concat(bundle.addon_products || [])
          .map((item, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', fontSize: '12px',
              padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
              color: i === 0 ? '#e2e8f0' : '#94a3b8'
            }}>
              <span>{i === 0 ? '⭐' : '+'} {item.name}</span>
              {item.price_inr && <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>₹{item.price_inr?.toLocaleString('en-IN')}</span>}
            </div>
          ))
        }
      </div>

      <p style={{ fontSize: '11px', color: '#475569', fontStyle: 'italic', marginBottom: '12px' }}>
        "{bundle.bundle_pitch}"
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontSize: '12px', color: '#475569', textDecoration: 'line-through', marginRight: '8px' }}>
            ₹{bundle.standalone_total_inr?.toLocaleString('en-IN')}
          </span>
          <span style={{ fontSize: '20px', fontWeight: 800, color: '#34d399', fontFamily: 'JetBrains Mono, monospace' }}>
            ₹{bundle.bundle_price_inr?.toLocaleString('en-IN')}
          </span>
          <span style={{ fontSize: '11px', color: '#34d399', marginLeft: '6px' }}>
            (Save ₹{bundle.savings_inr?.toLocaleString('en-IN')})
          </span>
        </div>
        <button
          onClick={() => onBuyBundle(allItems, bundle.bundle_price_inr)}
          style={{
            padding: '9px 18px', borderRadius: '10px', border: 'none',
            background: 'linear-gradient(135deg, #0891b2, #0e7490)',
            color: 'white', fontSize: '13px', fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
            boxShadow: '0 4px 14px rgba(8,145,178,0.4)', transition: 'all 0.15s'
          }}
          onMouseOver={e => e.currentTarget.style.boxShadow = '0 6px 20px rgba(8,145,178,0.6)'}
          onMouseOut={e => e.currentTarget.style.boxShadow = '0 4px 14px rgba(8,145,178,0.4)'}
        >
          <ShoppingCart size={14} />
          Buy Bundle
        </button>
      </div>
    </div>
  );
}

// ---- Text Formatter ----
function formatMessageText(text) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: '#f1f5f9', fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
