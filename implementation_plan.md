# 100% Real-Data Platform & Dual Entry Engine (Direct Buy Lowest Price Finder & Guided Recommendation)

Transform the Agentic Commerce Engine into a production-grade, 100% authentic platform. Eliminates every trace of fake/demo data, fixes mismatched product images, implements a real multi-retailer price comparison engine, upgrades the internal catalog to authentic brand items (Sony, Keychron, Logitech, Audio-Technica), and introduces a dual-entry experience before chat starts.

---

## User Review Required

> [!IMPORTANT]
> **Dual Entry Architecture (Before Chatting)**:
> 1. **Option 1 — Direct Buy (Lowest Price Finder)**:
>    - User inputs:
>      - **Product Name** (e.g., `Wireless Noise Cancelling Headphones`)
>      - **Company / Model** (e.g., `Sony WH-CH720N`)
>      - **Target Price Range / Budget** (e.g., `₹7,000 - ₹10,000`)
>    - Tavily executes a targeted multi-retailer search across Indian e-commerce sites (Amazon India, Flipkart, Croma, Reliance Digital).
>    - Calculates and displays which website offers the **absolute lowest price**.
>    - Renders a multi-store price breakdown table/card, highlighting savings, verified seller domain, and 1-click Razorpay Checkout (if under ₹10k ceiling).
> 2. **Option 2 — Guided Smart Recommendation**:
>    - User gives a rough idea (e.g., "I need a quiet desk setup for coding and calls in a busy room").
>    - ShopBot prompts 3 targeted interactive questions (Use case, Key feature preference, Budget range) with quick-select pills + custom input.
>    - Synthesizes answers and searches live web + authentic catalog to recommend the top 2 matching products with live market pricing, specs, and a complementary bundle.

> [!WARNING]
> **Eliminating "Fake" Visuals & Artifacts**:
> - **Product Images**: Fix the hardcoded Apple Watch thumbnail bug. Tavily `include_images=True` will extract real product images from Amazon, Flipkart, and Croma CDNs, backed by category-specific high-resolution fallbacks.
> - **Article/Blog Filter**: Prevents news blogs (e.g., Livemint, NDTV, Digit) from masquerading as product cards. Enforces clean e-commerce domain parsing.
> - **Internal Catalog Real Brands**: Replaces synthetic names (`ApexPro`, `VisionClear`) with real products (`Keychron K2`, `Logitech C920 Pro`, `Sony WH-CH720N`, `Logitech MX Master 3S`).

---

## Proposed Changes

### Component 1: Multi-Retailer Price Comparison & Live Search Engine

#### [MODIFY] [search_engine.py](file:///d:/Work%20Hub/task%201/backend/app/search_engine.py)
- **`find_lowest_price_deal(product_name: str, brand_model: str, budget_max: float = None) -> Dict`**:
  - Executes focused e-commerce queries targeting major Indian retailers: Amazon.in, Flipkart, Croma, Reliance Digital.
  - Extracts per-store pricing, product images from CDN results, and stock status.
  - Computes the minimum price among verified retailers and flags the winner (`lowest_price_store`).
  - Returns:
    ```python
    {
        "product_name": "Sony WH-CH720N Wireless ANC Headphones",
        "brand_model": "Sony WH-CH720N",
        "lowest_price": 8731.0,
        "lowest_store": "Flipkart",
        "retailers": [
            {"store": "Flipkart", "price": 8731.0, "url": "...", "is_lowest": True},
            {"store": "Amazon.in", "price": 8990.0, "url": "...", "is_lowest": False},
            {"store": "Croma", "price": 9490.0, "url": "...", "is_lowest": False}
        ],
        "image_url": "https://rukmini1.flixcart.com/...", # real product image
        "specs_summary": "Active Noise Cancellation, 35hr battery, multipoint...",
        "is_within_10k_limit": True
    }
    ```
- **Real Image Handling**: Enable `include_images=True` in Tavily requests. Extract high-quality retailer CDN images (`m.media-amazon.com`, `rukmini1.flixcart.com`, `media-ik.croma.com`). Provide real product-class Unsplash photography if CDN image is missing.
- **Blog & News Filtering**: Filter out non-retailer domains (news articles, listicles) when building product cards.

---

### Component 2: 100% Real Product Seed Catalog & Database

#### [MODIFY] [database.py](file:///d:/Work%20Hub/task%201/backend/app/database.py)
- Replace all 10 fantasy demo products with authentic, real-world gear:
  1. `prod_kb_01`: **Keychron K2 Wireless Mechanical Keyboard** (₹6,999)
  2. `prod_cam_02`: **Logitech C920 Pro HD Webcam** (₹6,495)
  3. `prod_mic_03`: **Audio-Technica AT2020 USB+ Studio Condenser Mic** (₹8,999)
  4. `prod_pad_04`: **SteelSeries QcK Heavy Cloth Desk Mat** (₹1,499)
  5. `prod_light_05`: **Elgato Key Light Air LED Panel** (₹9,999)
  6. `prod_mouse_06`: **Logitech MX Master 3S Performance Wireless Mouse** (₹8,995)
  7. `prod_wrist_07`: **HyperX Wrist Rest Memory Foam** (₹1,290)
  8. `prod_headset_08`: **Sony WH-CH720N Noise Cancelling Wireless Headphones** (₹8,990)
  9. `prod_hub_09`: **Anker PowerExpand 8-in-1 USB-C Docking Hub** (₹4,999)
  10. `prod_lamp_10`: **BenQ ScreenBar Monitor Reading Light** (₹9,990)
- Real high-resolution product images for each item.
- Real SKU numbers, authentic manufacturer specifications, and complementary bundle pairs.

---

### Component 3: Backend API Endpoints & Guided Profiling Engine

#### [MODIFY] [main.py](file:///d:/Work%20Hub/task%201/backend/app/main.py)
- Add `POST /api/v1/search/lowest-price`:
  - Payload: `{ session_id, product_name, brand_model, budget_max }`
  - Calls `find_lowest_price_deal`, registers web item into SQLite, logs audit trail, returns lowest price comparison card.
- Update `POST /api/v1/chat/message`:
  - Supports guided profiling questions flow (Path 2) with structured follow-ups.

#### [MODIFY] [ai_engine.py](file:///d:/Work%20Hub/task%201/backend/app/ai_engine.py)
- Ingest real image URLs from Tavily search results.
- Clean and normalize titles so no SEO fluff or blog headers leak into product cards.
- Add structured handler for guided recommendation profiling.

---

### Component 4: Frontend UI Redesign — Dual Entry Screen

#### [MODIFY] [ChatWindow.jsx](file:///d:/Work%20Hub/task%201/frontend/src/components/ChatWindow.jsx)
- **Initial Welcome View (Before Chatting)**:
  - Header: **"Choose How You'd Like to Shop"**
  - **Card 1: Direct Buy & Lowest Price Finder**:
    - Product Category / Name field (e.g. `Wireless Headphones`)
    - Company / Brand & Model field (e.g. `Sony WH-CH720N`)
    - Price Range / Budget field (e.g. `₹10,000`)
    - "Find Lowest Price Online" button with animated search state.
  - **Card 2: Guided Recommendation**:
    - "Not sure which model to pick? Tell us what you need and answer 3 quick questions."
    - Text prompt field: "e.g., I need a productive desk setup for programming"
    - "Start Guided Recommendation" button.
- **Price Comparison Deal Card**:
  - Displays actual retailer comparison (Amazon, Flipkart, Croma) with logo/store tags.
  - Highlights `🔥 Lowest Price: Flipkart (₹8,731)` and total savings.
  - Displays true product image from the retailer.
  - "Buy with Razorpay" button for instant checkout under ₹10,000.
- **Interactive Question Stepper (Option 2)**:
  - Interactive chip selector for questions (e.g., Primary Use, Priority Feature, Budget).
  - Generates tailored recommendations based on user selections.

#### [MODIFY] [AuditLogPanel.jsx](file:///d:/Work%20Hub/task%201/frontend/src/components/AuditLogPanel.jsx)
- Update External AI Buyer simulation scenarios to reference the authentic products (`Keychron K2`, `Sony WH-CH720N`).

---

## Verification Plan

### Automated Tests
- Run `backend/test_suite.py` ensuring all 11 existing tests pass.
- Add `test_12_lowest_price_finder()` to test the multi-retailer price comparison endpoint.

### Manual Verification in Browser Subagent
1. Open `http://127.0.0.1:5173/`.
2. Verify the 2 initial cards appear before chatting:
   - **Direct Buy (Lowest Price Finder)**
   - **Guided Recommendation**
3. Test **Option 1 (Direct Buy)**:
   - Enter `Product Name: Noise Cancelling Headphones`, `Company/Model: Sony WH-CH720N`, `Budget: ₹10,000`.
   - Verify multi-retailer search executes, finds lowest price across Amazon/Flipkart/Croma, displays real product image, and allows 1-click Razorpay checkout.
4. Test **Option 2 (Guided Recommendation)**:
   - Enter `I need peripherals for software development`, answer questions, and verify recommendations use real products and real images.
5. Capture browser screenshots for walkthrough artifact.
