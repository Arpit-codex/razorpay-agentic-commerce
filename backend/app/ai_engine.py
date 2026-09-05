"""
Resilient AI Commerce Engine with Tavily Live Web Search + Gemini Intelligence.
Combines store catalog recommendations with real-time web market intelligence
for live Indian e-commerce pricing, product specs, and Razorpay checkout.
"""

import os
import json
import re
import concurrent.futures
from typing import Any, Dict, List, Optional

from google import genai
from google.genai import types

from .catalog import get_all_products_raw, get_product_by_id, calculate_bundle_pricing, register_web_product
from .search_engine import search_real_products

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Prioritized Gemini model
PRIMARY_MODEL = "models/gemini-2.5-flash"

# In-memory session history
_session_histories: Dict[str, List[Dict[str, Any]]] = {}

# Thread pool for non-blocking API calls with hard timeout
_executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)

# Common brand names and search triggers that indicate live market intent
LIVE_SEARCH_BRANDS = {
    "sony", "keychron", "apple", "logitech", "bose", "sennheiser",
    "razer", "dell", "lenovo", "asus", "boat", "hyperx", "corsair",
    "jbl", "anker", "samsung", "hp", "lg", "steelseries", "rode",
    "shure", "audio-technica", "benq", "zebronics"
}

SEARCH_KEYWORDS = {
    "search", "tavily", "real", "market", "online", "live", "find",
    "price of", "amazon", "flipkart", "croma", "latest", "2026",
    "check", "google", "web", "compare", "external"
}


def _build_catalog_context() -> str:
    """Build a compact catalog string to embed in the system prompt."""
    products = get_all_products_raw()
    lines = []
    for p in products:
        bundle = p.get("bundle_rules", {})
        comp_ids = bundle.get("complementary_product_ids", [])
        bundle_str = f", bundle_ids={comp_ids}, bundle_name='{bundle.get('bundle_name','')}'" if comp_ids else ""
        lines.append(
            f"- id: {p['id']} | name: '{p['name']}' | price: ₹{p['price_inr']} | "
            f"tier: {p['target_tier']} | category: {p['category']} | tags: {p['usage_tags']} | "
            f"stock: {p['stock']} | rating: {p['rating']}{bundle_str}"
        )
    return "\n".join(lines)


def _get_bundle_details(primary_id: str) -> Optional[Dict[str, Any]]:
    """Fetch bundle details for a product."""
    p = get_product_by_id(primary_id)
    if not p:
        return None
    comp_ids = p.get("bundle_rules", {}).get("complementary_product_ids", [])
    if not comp_ids:
        return None
    try:
        info = calculate_bundle_pricing(primary_id, comp_ids)
        return {
            "primary_product_id": primary_id,
            "primary_product_name": p["name"],
            "bundle_name": p["bundle_rules"].get("bundle_name", "Curated Bundle Deal"),
            "addon_product_ids": comp_ids,
            "addon_products": [
                {"id": a["id"], "name": a["name"], "price_inr": a["price_inr"]}
                for a in info["addon_products"]
            ],
            "standalone_total_inr": info["standalone_total_inr"],
            "bundle_price_inr": info["discounted_bundle_price_inr"],
            "savings_inr": info["total_savings_inr"],
            "discount_pct": info["bundle_discount_pct"],
            "bundle_pitch": info["bundle_pitch"],
            "is_within_10k_limit": info["discounted_bundle_price_inr"] <= 10000.0
        }
    except Exception:
        return None


SYSTEM_PROMPT = """You are ShopBot, an expert AI shopping advisor for an agentic commerce store.
You have access to our Store Catalog AND Live Web Market Search data from Tavily.

STORE CATALOG:
{catalog}

{web_section}

RULES:
1. If live web search results are provided, cite real market pricing in INR and key specifications found online.
2. Recommend 1 or 2 best products matching the user's need and budget.
3. Keep the conversational message concise, professional, warm, and highlight key specs.
4. Note that any order under ₹10,000 can be checked out directly via Razorpay, while orders above ₹10,000 breach our safety policy limit.
5. ALWAYS output valid JSON with this exact structure:
{{
  "message": "Friendly professional advice explaining why this is chosen with live market pricing context.",
  "recommend_product_ids": ["prod_001"],
  "suggest_bundle_for_ids": ["prod_001"],
  "quick_suggestions": ["Show bundle savings", "Compare with alternatives", "Under ₹5,000", "Buy now with Razorpay"]
}}
"""


def _should_trigger_web_search(msg_lower: str) -> bool:
    """Determine if a user message should query Tavily live search."""
    # Check for specific real-world brands
    words = set(re.findall(r'\b[a-z0-9-]+\b', msg_lower))
    if any(b in words for b in LIVE_SEARCH_BRANDS):
        return True

    # Check for search/market intent
    if any(k in msg_lower for k in SEARCH_KEYWORDS):
        return True

    # If query is asking for something outside standard store items (e.g. tablet, monitor, mousepad)
    extended_terms = ["headphone", "keyboard", "mouse", "webcam", "mic", "monitor", "stand", "chair", "earphone", "dock"]
    if any(t in msg_lower for t in extended_terms) and any(w in msg_lower for w in ["best", "buy", "price", "under", "cheap", "cost"]):
        return True

    return False


def _extract_budget(msg_lower: str) -> Optional[float]:
    """Extract budget number from user message."""
    numbers = re.findall(r'(?:₹|rs\.?|inr|budget)?\s*(\d{3,6})', msg_lower)
    if numbers:
        try:
            return float(numbers[-1])
        except ValueError:
            pass
    return None


def _semantic_fallback(user_message: str, budget: Optional[float] = None) -> Dict[str, Any]:
    """
    Ultra-reliable local semantic matcher for store catalog.
    Executes if Gemini API is unavailable or times out (> 4.5s).
    """
    msg_lower = user_message.lower()
    products = get_all_products_raw()

    scored_products = []
    for p in products:
        score = 0
        name = p["name"].lower()
        desc = p["description"].lower()
        tags = [t.lower() for t in p.get("usage_tags", [])]
        category = p["category"].lower()

        # Keyword matching
        for word in msg_lower.split():
            if len(word) < 3:
                continue
            if word in name:
                score += 15
            if word in category:
                score += 8
            if any(word in t for t in tags):
                score += 5
            if word in desc:
                score += 1

        # Direct category boosters
        if any(term in msg_lower for term in ["headphone", "headphones", "earphone", "audio", "headset"]):
            if "headphone" in name:
                score += 25
            elif p["category"] == "Audio":
                score += 10

        if any(term in msg_lower for term in ["keyboard", "keyboards", "typing"]):
            if "keyboard" in name:
                score += 25

        # Budget suitability
        if budget:
            if p["price_inr"] <= budget:
                score += 4
            else:
                score -= 8

        scored_products.append((score, p))

    scored_products.sort(key=lambda x: x[0], reverse=True)
    top_matches = [p for s, p in scored_products if s > 0][:2]

    if not top_matches:
        top_matches = [products[0]]

    primary = top_matches[0]
    rec_ids = [p["id"] for p in top_matches]
    bundle_ids = [primary["id"]] if primary.get("bundle_rules", {}).get("complementary_product_ids") else []

    reply = (
        f"Based on your requirements, I recommend our verified **{primary['name']}** (₹{primary['price_inr']:,}). "
        f"{primary['description']} It holds a {primary['rating']}★ rating and is ready for immediate dispatch."
    )
    if budget and primary['price_inr'] <= budget:
        reply += f" At ₹{primary['price_inr']:,}, it sits comfortably within your ₹{int(budget):,} budget."

    return {
        "message": reply,
        "recommend_product_ids": rec_ids,
        "suggest_bundle_for_ids": bundle_ids,
        "quick_suggestions": ["View bundle deal", "Check specs & durability", "Compare options", "Instant Razorpay Checkout"]
    }


def _call_gemini_worker(
    user_message: str,
    history: List[Dict[str, Any]],
    web_ctx_str: str = ""
) -> Optional[Dict[str, Any]]:
    """Worker function executed inside thread pool to call Gemini."""
    if not GEMINI_API_KEY:
        return None
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        catalog_ctx = _build_catalog_context()
        prompt = SYSTEM_PROMPT.format(catalog=catalog_ctx, web_section=web_ctx_str)

        contents = []
        for msg in history[-6:]:
            contents.append(types.Content(role=msg["role"], parts=[types.Part(text=msg["text"])]))
        contents.append(types.Content(role="user", parts=[types.Part(text=user_message)]))

        response = client.models.generate_content(
            model=PRIMARY_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=prompt,
                temperature=0.3,
                max_output_tokens=600,
            )
        )
        if response and response.text:
            return _parse_ai_response(response.text.strip())
    except Exception:
        return None
    return None


def chat_with_ai(session_id: str, user_message: str) -> Dict[str, Any]:
    """
    Process user shopping message with dual-mode intelligence:
    1. Triggers Tavily real-time web search for live Indian e-commerce data if applicable.
    2. Runs Gemini in thread pool with 3.5s timeout.
    3. If Gemini is unavailable, synthesizes Tavily live market data + catalog into a polished response.
    4. Auto-registers web items into SQLite for instantaneous Razorpay checkout under ₹10,000.
    """
    history = _session_histories.get(session_id, [])
    msg_lower = user_message.lower()
    budget = _extract_budget(msg_lower)

    # 1. Check if Live Web Search is indicated
    web_results_obj = None
    web_products = []
    web_ctx_str = ""

    if _should_trigger_web_search(msg_lower):
        try:
            web_results_obj = search_real_products(user_message, budget_max=budget, max_results=3)
            if web_results_obj and web_results_obj.get("products"):
                web_products = web_results_obj["products"]
                # Register all web products dynamically into SQLite so they can be bought!
                for wp in web_products:
                    register_web_product(wp)

                # Format web context for Gemini
                web_lines = ["LIVE WEB SEARCH RESULTS (TAVILY):"]
                if web_results_obj.get("market_summary"):
                    web_lines.append(f"Market Summary: {web_results_obj['market_summary']}")
                for wp in web_products:
                    web_lines.append(
                        f"- id: {wp['id']} | name: '{wp['name']}' | price: ₹{wp['price_inr']} | "
                        f"source: {wp['source_domain']} | url: {wp['source_url']} | specs: {wp['description']}"
                    )
                web_ctx_str = "\n".join(web_lines)
        except Exception as e:
            print(f"[AI Engine] Live search failed: {e}")

    # 2. Try Gemini with Live Web Context
    parsed = None
    if GEMINI_API_KEY:
        future = _executor.submit(_call_gemini_worker, user_message, history, web_ctx_str)
        try:
            parsed = future.result(timeout=3.5)
        except (concurrent.futures.TimeoutError, Exception):
            parsed = None

    # 3. Deterministic & Live Web Synthesis Fallback
    if not parsed or not parsed.get("message"):
        if web_products:
            # Build live web synthesized advisory
            lead = web_products[0]
            summary_text = web_results_obj.get("market_summary") or ""
            reply = f"I searched the live Indian market using Tavily and found real-time pricing and availability for you."
            if summary_text:
                clean_sum = summary_text.replace("\n", " ").strip()
                if len(clean_sum) > 220:
                    clean_sum = clean_sum[:220].rsplit(".", 1)[0] + "."
                reply += f"\n\n**Market Overview:** {clean_sum}"

            reply += f"\n\n**Top Recommendation:** **{lead['name']}** at **₹{lead['price_inr']:,}** (sourced from {lead['source_domain']}). {lead['description']}"

            if lead["is_within_10k_limit"]:
                reply += f"\n\n✅ *Eligible for Instant Razorpay Checkout (within our ₹10,000 policy limit).* Click below to purchase directly!"
            else:
                reply += f"\n\n⚠️ *Notice: Price exceeds our ₹10,000 single-order policy limit.* Please check within-budget options or external link."

            rec_ids = [wp["id"] for wp in web_products[:2]]
            parsed = {
                "message": reply,
                "recommend_product_ids": rec_ids,
                "suggest_bundle_for_ids": [],
                "quick_suggestions": [
                    "Buy with Razorpay",
                    "Compare on Amazon",
                    "Under ₹5,000 alternatives",
                    "Check warranty & specs"
                ]
            }
        else:
            parsed = _semantic_fallback(user_message, budget=budget)

    message = parsed.get("message", "Here are our recommendations:")
    rec_ids = parsed.get("recommend_product_ids", [])
    bundle_ids = parsed.get("suggest_bundle_for_ids", [])
    suggestions = parsed.get("quick_suggestions", [])

    # Assemble Rich Product Cards (supports both catalog & dynamically registered web items)
    product_cards = []
    seen_card_ids = set()

    # First add any explicitly recommended IDs
    for pid in rec_ids:
        if pid in seen_card_ids:
            continue
        p = get_product_by_id(pid)
        if p:
            seen_card_ids.add(pid)
            bundle_preview = None
            comp_ids = p.get("bundle_rules", {}).get("complementary_product_ids", [])
            if comp_ids:
                try:
                    bi = calculate_bundle_pricing(pid, comp_ids)
                    bundle_preview = {
                        "bundle_name": p["bundle_rules"].get("bundle_name", "Curated Bundle"),
                        "addon_names": [a["name"] for a in bi["addon_products"]],
                        "addon_ids": comp_ids,
                        "standalone_total": bi["standalone_total_inr"],
                        "bundle_price": bi["discounted_bundle_price_inr"],
                        "savings": bi["total_savings_inr"],
                        "discount_pct": bi["bundle_discount_pct"],
                        "pitch": bi["bundle_pitch"]
                    }
                except Exception:
                    pass

            is_web = pid.startswith("prod_web_") or "live-web" in p.get("usage_tags", [])
            # Find original source info if web product
            source_url = None
            source_domain = None
            if is_web and web_products:
                for wp in web_products:
                    if wp["id"] == pid:
                        source_url = wp.get("source_url")
                        source_domain = wp.get("source_domain")
                        break

            product_cards.append({
                "id": p["id"],
                "name": p["name"],
                "category": p["category"],
                "price_inr": p["price_inr"],
                "description": p["description"],
                "target_tier": p["target_tier"],
                "durability": p["durability"],
                "usage_tags": p["usage_tags"],
                "rating": p["rating"],
                "stock": p["stock"],
                "image_url": p["image_url"],
                "is_web_result": is_web,
                "source_url": source_url,
                "source_domain": source_domain,
                "is_within_10k_limit": p["price_inr"] <= 10000.0,
                "bundle_available": bundle_preview is not None,
                "bundle_preview": bundle_preview
            })

    # If web products were found and not all are in cards, add the top web products
    for wp in web_products:
        if wp["id"] not in seen_card_ids and len(product_cards) < 3:
            seen_card_ids.add(wp["id"])
            product_cards.append({
                "id": wp["id"],
                "name": wp["name"],
                "category": wp["category"],
                "price_inr": wp["price_inr"],
                "description": wp["description"],
                "target_tier": wp["target_tier"],
                "durability": wp["durability"],
                "usage_tags": wp["usage_tags"],
                "rating": wp["rating"],
                "stock": wp["stock"],
                "image_url": wp["image_url"],
                "is_web_result": True,
                "source_url": wp.get("source_url"),
                "source_domain": wp.get("source_domain"),
                "is_within_10k_limit": wp["price_inr"] <= 10000.0,
                "bundle_available": False,
                "bundle_preview": None
            })

    # Assemble Smart Bundle Cards
    bundle_cards = []
    for pid in bundle_ids[:1]:
        bd = _get_bundle_details(pid)
        if bd:
            bundle_cards.append(bd)

    if not suggestions:
        suggestions = ["Show bundle deal", "Compare alternatives", "Under ₹5,000", "Instant Razorpay Checkout"]

    # Record in session memory
    history.append({"role": "user", "text": user_message})
    history.append({"role": "model", "text": message})
    _session_histories[session_id] = history[-20:]

    return {
        "response": message,
        "product_cards": product_cards,
        "bundle_cards": bundle_cards,
        "quick_suggestions": suggestions[:4]
    }


def _parse_ai_response(text: str) -> Optional[Dict[str, Any]]:
    """Safely parse AI JSON output."""
    try:
        return json.loads(text)
    except Exception:
        pass

    match = re.search(r'\{[\s\S]*\}', text)
    if match:
        try:
            return json.loads(match.group())
        except Exception:
            pass

    return None


def clear_session(session_id: str) -> None:
    """Clear conversation history for a session."""
    _session_histories.pop(session_id, None)
