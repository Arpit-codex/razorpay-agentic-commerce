"""
Database schema, connection helpers, and seed data for Agentic Commerce Engine.
Uses SQLite with SQLAlchemy for both synchronous and asynchronous operations.
"""

import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel

DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DB_DIR, "..", "ecommerce_agentic.db")


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Initialize the database tables and seed sample products if not already present."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Products table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        price_inr REAL NOT NULL,
        target_tier TEXT NOT NULL, -- 'casual', 'professional', 'both'
        durability TEXT NOT NULL,  -- 'budget-short-term', 'premium-long-term'
        usage_tags TEXT NOT NULL,  -- JSON list of strings e.g. ["coding", "gaming"]
        bundle_rules TEXT NOT NULL,-- JSON object with bundle configurations
        stock INTEGER NOT NULL DEFAULT 50,
        sku TEXT NOT NULL,
        rating REAL DEFAULT 4.8,
        image_url TEXT NOT NULL
    )
    """)

    # 2. Audit logs table (Rule 2: Complete Audit Trail)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        session_id TEXT NOT NULL,
        actor_type TEXT NOT NULL, -- 'HUMAN_USER' or 'EXTERNAL_AI_BUYER'
        user_intent TEXT NOT NULL, -- 'DIRECT_BUY', 'PROFILING_RECOMMENDATION', 'SMART_BUNDLE', 'AUTONOMOUS_CHECKOUT', 'TRIGGER_FAILURE'
        ai_reasoning TEXT NOT NULL,
        policy_check_status TEXT NOT NULL, -- 'PASSED' or 'FAILED'
        policy_violation_reason TEXT,
        razorpay_order_id TEXT,
        payload TEXT NOT NULL, -- JSON serialized string
        payment_status TEXT NOT NULL -- 'CREATED', 'PAID', 'FAILED', 'FALLBACK_LINK_GENERATED'
    )
    """)

    # 3. Price watches table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS price_watches (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        brand_model TEXT NOT NULL,
        target_price_inr REAL NOT NULL,
        deadline_hours INTEGER NOT NULL,
        deadline_at TEXT NOT NULL,
        action_on_expire TEXT NOT NULL,
        status TEXT NOT NULL,
        current_price_inr REAL NOT NULL,
        lowest_seen_inr REAL NOT NULL,
        check_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        triggered_at TEXT,
        razorpay_order_id TEXT
    )
    """)

    # 4. Price history table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        brand_model TEXT NOT NULL,
        price_inr REAL NOT NULL,
        source_store TEXT NOT NULL,
        source_url TEXT,
        timestamp TEXT NOT NULL
    )
    """)

    conn.commit()

    # Seed or refresh authentic core products
    seed_products(cursor)
    conn.commit()

    conn.close()


def seed_products(cursor: sqlite3.Cursor) -> None:
    sample_products = [
        (
            "prod_kb_01",
            "Keychron K2 Wireless Mechanical Keyboard (Hot-Swappable)",
            "Peripherals",
            "Authentic Keychron K2 75% wireless mechanical keyboard with hot-swappable tactile switches, Mac/Windows layout, and premium aluminum frame.",
            4999.0,
            "professional",
            "premium-long-term",
            json.dumps(["coding", "gaming", "home-office"]),
            json.dumps({
                "complementary_product_ids": ["prod_wrist_07", "prod_pad_04"],
                "bundle_discount_pct": 15,
                "bundle_name": "Keychron Pro Developer Battlestation",
                "bundle_pitch": "Pair Keychron K2 with HyperX Ergonomic Wrist Rest & SteelSeries QcK Mat for optimal typing ergonomics.",
                "tier_pricing": {
                    "standalone": 4999.0,
                    "combo_with_wrist_rest": 5299.0,
                    "full_bundle": 5778.0
                }
            }),
            35,
            "SKU-KEYCHRON-K2",
            4.9,
            "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&auto=format&fit=crop&q=80"
        ),
        (
            "prod_cam_02",
            "Logitech C920 Pro Full HD 1080p Webcam",
            "Video & Streaming",
            "Industry-standard Logitech C920 Pro webcam with full HD glass lens, auto light correction, and dual stereo microphones for executive meetings.",
            6499.0,
            "professional",
            "premium-long-term",
            json.dumps(["home-office", "streaming", "content-creation"]),
            json.dumps({
                "complementary_product_ids": ["prod_light_05"],
                "bundle_discount_pct": 12,
                "bundle_name": "Logitech & Elgato Creator Studio",
                "bundle_pitch": "Combine Logitech C920 Pro with Elgato Key Light for studio-grade broadcast illumination.",
                "tier_pricing": {
                    "standalone": 6499.0,
                    "full_bundle": 7038.0
                }
            }),
            22,
            "SKU-LOGI-C920",
            4.8,
            "https://images.unsplash.com/photo-1587826080692-f439cd0b70da?w=600&auto=format&fit=crop&q=80"
        ),
        (
            "prod_mic_03",
            "Audio-Technica AT2020 USB+ Cardioid Condenser Mic",
            "Audio",
            "Legendary Audio-Technica studio condenser capsule with built-in headphone jack, volume control, and pristine 16-bit 44.1/48kHz sound capture.",
            3899.0,
            "professional",
            "premium-long-term",
            json.dumps(["content-creation", "streaming", "coding", "home-office"]),
            json.dumps({
                "complementary_product_ids": ["prod_cam_02", "prod_light_05"],
                "bundle_discount_pct": 15,
                "bundle_name": "Broadcast Pro Audio-Visual Suite",
                "bundle_pitch": "Combine Audio-Technica AT2020 with Logitech C920 & Elgato Light for elite studio presence.",
                "tier_pricing": {
                    "standalone": 3899.0,
                    "full_bundle": 8999.0
                }
            }),
            18,
            "SKU-AT-2020USB",
            4.7,
            "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=600&auto=format&fit=crop&q=80"
        ),
        (
            "prod_pad_04",
            "SteelSeries QcK Heavy XXL Cloth Gaming Desk Mat",
            "Desk Accessories",
            "Micro-woven cloth surface engineered for pinpoint mouse tracking with thick non-slip rubber base (900x400mm).",
            999.0,
            "casual",
            "budget-short-term",
            json.dumps(["home-office", "coding", "gaming"]),
            json.dumps({
                "complementary_product_ids": ["prod_mouse_06"],
                "bundle_discount_pct": 10,
                "bundle_name": "Precision Tracking Duo",
                "bundle_pitch": "Combine SteelSeries QcK Mat with Logitech MX Master 3S for effortless, silent gliding.",
                "tier_pricing": {
                    "standalone": 999.0,
                    "full_bundle": 3148.0
                }
            }),
            120,
            "SKU-STEEL-QCK",
            4.6,
            "https://images.unsplash.com/photo-1629429408209-1f912961dbd8?w=600&auto=format&fit=crop&q=80"
        ),
        (
            "prod_light_05",
            "Elgato Key Light Air Professional Desktop LED Panel",
            "Lighting",
            "Wi-Fi enabled edge-lit studio panel with 1400 lumens, 2900K-7000K multi-layer diffusion, and App/Stream Deck control.",
            1499.0,
            "casual",
            "budget-short-term",
            json.dumps(["streaming", "home-office", "content-creation"]),
            json.dumps({
                "complementary_product_ids": ["prod_cam_02"],
                "bundle_discount_pct": 10,
                "bundle_name": "Executive Zoom Pro Pack",
                "bundle_pitch": "Eliminate harsh shadows and look your best on camera.",
                "tier_pricing": {
                    "standalone": 1499.0,
                    "full_bundle": 7198.0
                }
            }),
            80,
            "SKU-ELGATO-KLA",
            4.5,
            "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=600&auto=format&fit=crop&q=80"
        ),
        (
            "prod_mouse_06",
            "Logitech MX Master 3S Performance Wireless Mouse",
            "Peripherals",
            "The iconic productivity mouse: 8,000 DPI Darkfield glass tracking, MagSpeed electromagnetic scroll, and quiet click switches.",
            2499.0,
            "casual",
            "premium-long-term",
            json.dumps(["home-office", "coding", "ergonomics"]),
            json.dumps({
                "complementary_product_ids": ["prod_pad_04", "prod_kb_01"],
                "bundle_discount_pct": 12,
                "bundle_name": "Master Productivity Trilogy",
                "bundle_pitch": "Pair Logitech MX Master 3S with Keychron K2 & SteelSeries QcK Mat for the ultimate setup.",
                "tier_pricing": {
                    "standalone": 2499.0,
                    "full_bundle": 7477.0
                }
            }),
            50,
            "SKU-LOGI-MX3S",
            4.8,
            "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=600&auto=format&fit=crop&q=80"
        ),
        (
            "prod_wrist_07",
            "HyperX Wrist Rest Cooling Gel Ergonomic Cushion",
            "Ergonomics",
            "Cooling gel-infused memory foam with anti-fray stitching and textured natural rubber grip for prolonged keyboard comfort.",
            799.0,
            "casual",
            "budget-short-term",
            json.dumps(["coding", "home-office", "ergonomics"]),
            json.dumps({
                "complementary_product_ids": ["prod_kb_01"],
                "bundle_discount_pct": 20,
                "bundle_name": "Ergonomic Typing Protection",
                "bundle_pitch": "Complement Keychron K2 with HyperX gel wrist support to prevent RSI fatigue.",
                "tier_pricing": {
                    "standalone": 799.0,
                    "full_bundle": 5298.0
                }
            }),
            90,
            "SKU-HYPERX-WR",
            4.7,
            "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&auto=format&fit=crop&q=80"
        ),
        (
            "prod_headset_08",
            "Sony WH-CH720N Noise Cancelling Wireless Headphones",
            "Audio",
            "Dual Noise Sensor technology with Integrated Processor V1, 35-hour battery, Multipoint connection, and lightweight 192g build.",
            7999.0,
            "professional",
            "premium-long-term",
            json.dumps(["coding", "home-office", "travel", "gaming"]),
            json.dumps({
                "complementary_product_ids": ["prod_mic_03"],
                "bundle_discount_pct": 10,
                "bundle_name": "Sony Deep Focus Audio Station",
                "bundle_pitch": "Block background chatter with Sony ANC while delivering broadcast speech via Audio-Technica mic.",
                "tier_pricing": {
                    "standalone": 7999.0,
                    "full_bundle": 9808.0
                }
            }),
            25,
            "SKU-SONY-CH720N",
            4.9,
            "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80"
        ),
        (
            "prod_hub_09",
            "Anker PowerExpand 8-in-1 USB-C PD Docking Hub",
            "Workspace Hub",
            "Dual 4K HDMI, 85W high-speed pass-through Power Delivery, Gigabit Ethernet, and UHS-I SD/microSD card slots.",
            3299.0,
            "professional",
            "premium-long-term",
            json.dumps(["coding", "home-office", "content-creation"]),
            json.dumps({
                "complementary_product_ids": ["prod_lamp_10"],
                "bundle_discount_pct": 10,
                "bundle_name": "Anker Single-Cable Clean Desk",
                "bundle_pitch": "Turn your laptop into an uncluttered dual-monitor workstation with Anker hub & BenQ light.",
                "tier_pricing": {
                    "standalone": 3299.0,
                    "full_bundle": 4948.0
                }
            }),
            40,
            "SKU-ANKER-HUB8",
            4.7,
            "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80"
        ),
        (
            "prod_lamp_10",
            "BenQ ScreenBar Eye-Care Auto-Dimming Monitor Light",
            "Lighting",
            "Patented optical design illuminates desktop with zero screen reflection. Auto-dimming ambient light sensor with touch controls.",
            2199.0,
            "casual",
            "premium-long-term",
            json.dumps(["coding", "home-office", "gaming"]),
            json.dumps({
                "complementary_product_ids": ["prod_hub_09", "prod_kb_01"],
                "bundle_discount_pct": 10,
                "bundle_name": "BenQ Night Owl Desk Suite",
                "bundle_pitch": "Protect your eyes during late-night development sprints without taking up any desk space.",
                "tier_pricing": {
                    "standalone": 2199.0,
                    "full_bundle": 6478.0
                }
            }),
            65,
            "SKU-BENQ-SBAR",
            4.8,
            "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600&auto=format&fit=crop&q=80"
        )
    ]

    cursor.executemany("""
    INSERT OR REPLACE INTO products (
        id, name, category, description, price_inr, target_tier, durability,
        usage_tags, bundle_rules, stock, sku, rating, image_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, sample_products)


def record_audit_log(
    session_id: str,
    actor_type: str,
    user_intent: str,
    ai_reasoning: str,
    policy_check_status: str,
    payload: Dict[str, Any],
    payment_status: str,
    policy_violation_reason: Optional[str] = None,
    razorpay_order_id: Optional[str] = None,
) -> int:
    """Insert an immutable audit log entry into the SQLite audit_logs table."""
    conn = get_db_connection()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor.execute("""
    INSERT INTO audit_logs (
        timestamp, session_id, actor_type, user_intent, ai_reasoning,
        policy_check_status, policy_violation_reason, razorpay_order_id,
        payload, payment_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        now_iso,
        session_id,
        actor_type,
        user_intent,
        ai_reasoning,
        policy_check_status,
        policy_violation_reason,
        razorpay_order_id,
        json.dumps(payload),
        payment_status
    ))
    conn.commit()
    log_id = cursor.lastrowid
    conn.close()
    return log_id or 0


def fetch_audit_logs(limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieve recent audit logs in descending chronological order."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, timestamp, session_id, actor_type, user_intent, ai_reasoning,
           policy_check_status, policy_violation_reason, razorpay_order_id,
           payload, payment_status
    FROM audit_logs
    ORDER BY id DESC
    LIMIT ?
    """, (limit,))
    rows = cursor.fetchall()
    conn.close()

    logs = []
    for r in rows:
        payload_data = {}
        try:
            payload_data = json.loads(r["payload"])
        except Exception:
            payload_data = {"raw": r["payload"]}

        logs.append({
            "id": r["id"],
            "timestamp": r["timestamp"],
            "session_id": r["session_id"],
            "actor_type": r["actor_type"],
            "user_intent": r["user_intent"],
            "ai_reasoning": r["ai_reasoning"],
            "policy_check_status": r["policy_check_status"],
            "policy_violation_reason": r["policy_violation_reason"],
            "razorpay_order_id": r["razorpay_order_id"],
            "payload": payload_data,
            "payment_status": r["payment_status"]
        })
    return logs


def get_hourly_order_count(session_id: str) -> int:
    """Count how many successful orders have been created in the last 1 hour for this session."""
    conn = get_db_connection()
    cursor = conn.cursor()
    # Query logs in last hour with policy_check_status = 'PASSED'
    cursor.execute("""
    SELECT COUNT(*) FROM audit_logs
    WHERE session_id = ?
      AND policy_check_status = 'PASSED'
      AND datetime(timestamp) >= datetime('now', '-1 hour')
    """, (session_id,))
    count = cursor.fetchone()[0]
    conn.close()
    return count


def upsert_web_product(product: Dict[str, Any]) -> None:
    """Dynamically save or update a web-discovered product in the SQLite products table."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO products (
        id, name, category, description, price_inr, target_tier,
        durability, usage_tags, bundle_rules, stock, sku, rating, image_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        price_inr = excluded.price_inr,
        description = excluded.description,
        image_url = excluded.image_url
    """, (
        product["id"],
        product["name"],
        product.get("category", "Tech & Workspace"),
        product.get("description", "Live web-verified market item."),
        float(product["price_inr"]),
        product.get("target_tier", "Verified Market Gear"),
        product.get("durability", "Commercial Grade"),
        json.dumps(product.get("usage_tags", ["live-web"])),
        json.dumps(product.get("bundle_rules", {})),
        int(product.get("stock", 10)),
        product.get("sku", f"SKU-{product['id'].upper()}"),
        float(product.get("rating", 4.5)),
        product.get("image_url", "https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=400&q=80")
    ))
    conn.commit()
    conn.close()


def save_price_watch(watch: Dict[str, Any]) -> None:
    """Save a new price watch entry to SQLite."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO price_watches (
        id, session_id, product_id, product_name, brand_model,
        target_price_inr, deadline_hours, deadline_at, action_on_expire,
        status, current_price_inr, lowest_seen_inr, check_count,
        created_at, triggered_at, razorpay_order_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        watch["id"],
        watch["session_id"],
        watch["product_id"],
        watch["product_name"],
        watch["brand_model"],
        float(watch["target_price_inr"]),
        int(watch["deadline_hours"]),
        watch["deadline_at"],
        watch["action_on_expire"],
        watch["status"],
        float(watch["current_price_inr"]),
        float(watch["lowest_seen_inr"]),
        int(watch.get("check_count", 0)),
        watch["created_at"],
        watch.get("triggered_at"),
        watch.get("razorpay_order_id")
    ))
    conn.commit()
    conn.close()


def get_price_watches(session_id: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
    """Fetch price watches optionally filtered by session_id or status."""
    conn = get_db_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM price_watches WHERE 1=1"
    params = []
    if session_id:
        query += " AND session_id = ?"
        params.append(session_id)
    if status:
        query += " AND status = ?"
        params.append(status)
    query += " ORDER BY created_at DESC"
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    
    watches = []
    for r in rows:
        watches.append({
            "id": r["id"],
            "session_id": r["session_id"],
            "product_id": r["product_id"],
            "product_name": r["product_name"],
            "brand_model": r["brand_model"],
            "target_price_inr": r["target_price_inr"],
            "deadline_hours": r["deadline_hours"],
            "deadline_at": r["deadline_at"],
            "action_on_expire": r["action_on_expire"],
            "status": r["status"],
            "current_price_inr": r["current_price_inr"],
            "lowest_seen_inr": r["lowest_seen_inr"],
            "check_count": r["check_count"],
            "created_at": r["created_at"],
            "triggered_at": r["triggered_at"],
            "razorpay_order_id": r["razorpay_order_id"]
        })
    return watches


def get_price_watch_by_id(watch_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a single price watch by ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM price_watches WHERE id = ?", (watch_id,))
    r = cursor.fetchone()
    conn.close()
    if not r:
        return None
    return {
        "id": r["id"],
        "session_id": r["session_id"],
        "product_id": r["product_id"],
        "product_name": r["product_name"],
        "brand_model": r["brand_model"],
        "target_price_inr": r["target_price_inr"],
        "deadline_hours": r["deadline_hours"],
        "deadline_at": r["deadline_at"],
        "action_on_expire": r["action_on_expire"],
        "status": r["status"],
        "current_price_inr": r["current_price_inr"],
        "lowest_seen_inr": r["lowest_seen_inr"],
        "check_count": r["check_count"],
        "created_at": r["created_at"],
        "triggered_at": r["triggered_at"],
        "razorpay_order_id": r["razorpay_order_id"]
    }


def update_price_watch(watch_id: str, **kwargs) -> None:
    """Update fields on an existing price watch."""
    if not kwargs:
        return
    conn = get_db_connection()
    cursor = conn.cursor()
    set_clause = ", ".join([f"{k} = ?" for k in kwargs.keys()])
    params = list(kwargs.values()) + [watch_id]
    cursor.execute(f"UPDATE price_watches SET {set_clause} WHERE id = ?", params)
    conn.commit()
    conn.close()


def record_price_snapshot(product_id: str, product_name: str, brand_model: str, price_inr: float, source_store: str, source_url: Optional[str] = None) -> None:
    """Record a price data point into price_history."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO price_history (product_id, product_name, brand_model, price_inr, source_store, source_url, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (product_id, product_name, brand_model, float(price_inr), source_store, source_url or "", datetime.now(timezone.utc).isoformat()))
    conn.commit()
    conn.close()


def get_price_snapshots(brand_model_or_id: str) -> List[Dict[str, Any]]:
    """Retrieve historical price snapshots for a product or brand model."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT * FROM price_history
    WHERE product_id = ? OR brand_model LIKE ? OR product_name LIKE ?
    ORDER BY timestamp ASC
    """, (brand_model_or_id, f"%{brand_model_or_id}%", f"%{brand_model_or_id}%"))
    rows = cursor.fetchall()
    conn.close()
    return [{
        "id": r["id"],
        "product_id": r["product_id"],
        "product_name": r["product_name"],
        "brand_model": r["brand_model"],
        "price_inr": r["price_inr"],
        "source_store": r["source_store"],
        "source_url": r["source_url"],
        "timestamp": r["timestamp"]
    } for r in rows]

