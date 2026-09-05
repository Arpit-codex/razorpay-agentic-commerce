# Razorpay Buildathon — Track 01: AI Growth & Agentic Commerce Engine

A dual-capability **Agentic Commerce Engine** that serves both human buyers through an Adaptive In-Site Chatbot and external AI Personal Assistants via a machine-readable Schema.org JSON-LD Catalog API and autonomous checkout protocol — all protected by deterministic safety guardrails and complete audit logging.

---

## 🏗️ Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                    Split-Screen React Frontend                      │
│   Left: Adaptive Chatbot (3 Paths)   Right: Live Audit Trail       │
│   Path 1: Direct Buy (Tier Pricing)  + Policy Engine Metrics       │
│   Path 2: 4-Step Profiling Match     + External AI Simulator       │
│   Path 3: Smart Bundle Cross-Sell    + Failure Recovery Demo       │
└────────────────────────────┬───────────────────────────────────────┘
                             │ HTTP
┌────────────────────────────▼───────────────────────────────────────┐
│                   FastAPI Backend (Port 8000)                       │
│                                                                     │
│  GET  /api/v1/agent/catalog      → Schema.org JSON-LD protocol     │
│  POST /api/v1/agent/checkout     → Autonomous AI Buyer checkout     │
│  POST /api/v1/chat/message       → In-site chatbot engine          │
│  POST /api/v1/checkout/create    → Human checkout (Policy Gate)    │
│  GET  /api/v1/audit/logs         → Immutable audit stream          │
│  GET  /api/v1/audit/stats        → Policy metrics dashboard        │
│  POST /api/v1/test/trigger-failure → Graceful recovery demo        │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │         Deterministic Policy Engine (THE BAR)                │  │
│  │  ✓ Hard Budget Ceiling: ₹10,000 per order (Non-negotiable)  │  │
│  │  ✓ Velocity Limit: Max 2 successful orders per hour/session │  │
│  │  ✓ Inventory Verification before ANY payment API call       │  │
│  │  ✓ LLM NEVER touches Razorpay SDK (Pydantic gate first)     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                          ↓ Only if PASSED ↓                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Razorpay Test Mode Integration                   │  │
│  │  Orders: razorpay.Client.order.create()                      │  │
│  │  Links:  razorpay.Client.payment_link.create()               │  │
│  │  Verify: HMAC-SHA256 signature verification                   │  │
│  │  Sandbox: Built-in simulator when live keys not supplied      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  SQLite: ecommerce_agentic.db                                       │
│  Tables: products (10 seeded items), audit_logs (complete trail)   │
└────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Clone & Configure

```bash
git clone <repo-url>
cd "task 1"
cp .env.example .env
# Optionally add RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET from Test Mode dashboard
```

### 2. Start the Backend (FastAPI)

```bash
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

SQLite database is auto-created and seeded with 10 products on first run.

### 3. Start the Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Open **http://127.0.0.1:5173** in your browser.

---

## 🔑 Razorpay Key Configuration

| Mode | Behavior |
|------|----------|
| No keys set | Built-in test sandbox generates compliant `order_test_*` and `plink_test_*` IDs — **fully demo-able without any account** |
| Test keys set | Calls live Razorpay Test Mode API (`api.razorpay.com`) |

Add to `.env`:
```env
RAZORPAY_KEY_ID=rzp_test_XXXXXXXX
RAZORPAY_KEY_SECRET=your_test_secret
```

---

## 💡 Feature Demo Guide

### In-Site Chatbot — 3 Explicit Human Buyer Paths

| Path | What to do | What you see |
|------|-----------|-------------|
| ⚡ **Path 1: Direct Buy** | Click the blue card | Product card with Standalone vs Bundle Tier Pricing. Click either to launch embedded Razorpay checkout payload |
| 🎯 **Path 2: Tailored Recommendation** | Click the purple card, answer 4 chips: Use Case → Skill Level → Budget → Lifespan | AI weighted-match result with confidence score %, AI reasoning explanation, instant buy + bundle upgrade option |
| 🎁 **Path 3: Smart Bundle** | Click the cyan card | Primary item + synergy add-ons, savings calculation, bundle discount rationale, instant combo checkout |

### Right Panel — Live State Store & Safety Demonstration

| Tab | What to do | What you see |
|-----|-----------|-------------|
| **Audit Stream** | Automatic live polling every 3s | All events: actor badge (HUMAN/AI), policy PASSED/FAILED, timestamp, AI reasoning, expandable JSON payload |
| **AI Assistant Simulator** | Click **Scenario A** (valid) then **Scenario B** (budget breach) | HTTP 200 + APPROVED for valid order; HTTP 400 + policy violation message for ₹14,997 order exceeding ₹10k hard ceiling |
| **Failure Recovery Demo** | Select failure type, click Trigger | Fault injected, clean interception, SQLite failure log committed, Razorpay alternate Payment Link generated with 24hr expiry |

---

## 🤖 External AI Buyer Protocol

Any external AI Personal Buyer Assistant can integrate using:

### Step 1: Read the Agent Catalog
```bash
curl http://localhost:8000/api/v1/agent/catalog
```
Returns full Schema.org JSON-LD with:
- `additionalProperty` → `targetTier`, `durability`, `usageTags`, `bundleRules`
- `checkoutProtocol` → endpoint, method, `budgetHardLimitINR: 10000.0`

### Step 2: Execute Autonomous Checkout
```bash
curl -X POST http://localhost:8000/api/v1/agent/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "ai_buyer_session_001",
    "actor_type": "EXTERNAL_AI_BUYER",
    "items": [{"product_id": "prod_kb_01", "quantity": 1}],
    "ai_reasoning": "Matched via usageTags[coding] + target_tier[professional] + budget[5000]"
  }'
```

---

## 🛡️ Safety Guardrails ("The Bar")

### Rule 1: Bounded Money Actions
```python
# policy_engine.py — Deterministic Gate (LLM CANNOT bypass this)
if total_calculated > HARD_BUDGET_CEILING_INR:  # ₹10,000
    raise PolicyRejection("Hard budget ceiling breached")

if hourly_orders >= MAX_ORDERS_PER_HOUR:  # 2/hr per session
    raise PolicyRejection("Velocity limit exceeded")
```

### Rule 2: Complete Audit Trail
Every single event → `audit_logs` SQLite table:
- `actor_type`: `HUMAN_USER` or `EXTERNAL_AI_BUYER`
- `policy_check_status`: `PASSED` or `FAILED`
- `ai_reasoning`: Full explanation of match or policy decision
- `razorpay_order_id`: Linked Razorpay order or payment link
- `payload`: Complete JSON-serialized request + response context

### Rule 3: Graceful Failure Recovery
`POST /api/v1/test/trigger-failure` → Select fault type (Gateway Timeout, Card Decline, Stock Lock):
1. Exception caught without crashing
2. `FAILED` status committed to SQLite
3. Alternate Razorpay Payment Link generated (24hr expiry)
4. Clear user guidance message returned

---

## 📁 Repository Structure

```
/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI routes & lifespan
│   │   ├── database.py          # SQLite schema + 10 seed products + audit helpers
│   │   ├── catalog.py           # Schema.org JSON-LD generator + product queries
│   │   ├── profiling.py         # 4-parameter weighted matching engine
│   │   ├── policy_engine.py     # Deterministic budget & velocity gate (Pydantic v2)
│   │   ├── razorpay_service.py  # Razorpay SDK wrapper + sandbox simulator
│   │   └── failure_handler.py   # Graceful failure + fallback link recovery
│   └── test_suite.py            # 9-test automated validation suite (all PASS)
├── frontend/
│   └── src/
│       ├── App.jsx              # Split-screen main layout
│       └── components/
│           ├── ChatWindow.jsx   # 3-path chatbot with chip UI
│           ├── AuditLogPanel.jsx # Live audit stream + AI simulator + failure demo
│           └── DirectCheckout.jsx # Razorpay Checkout.js embed wrapper
├── .env.example                 # Key configuration template
└── README.md
```

---

## 🧪 Run Automated Tests

```bash
cd backend
python test_suite.py
```

9 tests, all PASS:
1. ✅ JSON-LD Catalog format validation
2. ✅ External AI autonomous checkout (valid → 200 APPROVED)
3. ✅ Policy Engine: Hard budget ceiling rejection (₹14,997 > ₹10,000 → 400)
4. ✅ Policy Engine: Velocity limit (3rd order same session → 400)
5. ✅ Chatbot Path 1: Direct Buy tier pricing
6. ✅ Chatbot Path 2: 4-parameter profiling recommendation
7. ✅ Chatbot Path 3: Smart bundle discount calculation
8. ✅ Graceful failure recovery with alternate payment link
9. ✅ Audit trail completeness (PASSED + FAILED + FALLBACK_LINK)

---

## 📦 Product Catalog (Pre-seeded)

| ID | Product | Price | Target Tier | Durability |
|----|---------|-------|-------------|------------|
| prod_kb_01 | ApexPro Mechanical Keyboard | ₹4,999 | Professional | Long-term |
| prod_cam_02 | VisionClear 4K Webcam | ₹6,499 | Professional | Long-term |
| prod_mic_03 | SoundPod Studio Microphone | ₹3,899 | Professional | Long-term |
| prod_pad_04 | GlideMaster Desk Mat | ₹999 | Casual | Short-term |
| prod_light_05 | AuraGlow Ring Light | ₹1,499 | Casual | Short-term |
| prod_mouse_06 | ErgoLift Vertical Mouse | ₹2,499 | Casual | Long-term |
| prod_wrist_07 | CloudMemory Wrist Rest | ₹799 | Casual | Short-term |
| prod_headset_08 | AeroTone ANC Headphones | ₹7,999 | Professional | Long-term |
| prod_hub_09 | HyperPort USB-C Docking Station | ₹3,299 | Professional | Long-term |
| prod_lamp_10 | ScreenGlow Monitor Light Bar | ₹2,199 | Casual | Long-term |

---

*Built for Razorpay Buildathon Track 01: AI Growth & Agentic Commerce*
