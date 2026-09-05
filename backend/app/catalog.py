"""
Catalog module for Agentic Commerce Engine.
Generates Schema.org compliant JSON-LD catalog for external AI buyer assistants
and provides querying and bundling evaluation functions.
"""

import json
import sqlite3
from typing import Any, Dict, List, Optional
from .database import get_db_connection, upsert_web_product


def get_all_products_raw() -> List[Dict[str, Any]]:
    """Fetch all product records from SQLite."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM products")
    rows = cursor.fetchall()
    conn.close()

    products = []
    for r in rows:
        products.append({
            "id": r["id"],
            "name": r["name"],
            "category": r["category"],
            "description": r["description"],
            "price_inr": r["price_inr"],
            "target_tier": r["target_tier"],
            "durability": r["durability"],
            "usage_tags": json.loads(r["usage_tags"]),
            "bundle_rules": json.loads(r["bundle_rules"]),
            "stock": r["stock"],
            "sku": r["sku"],
            "rating": r["rating"],
            "image_url": r["image_url"],
        })
    return products


def get_product_by_id(product_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a single product by ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM products WHERE id = ?", (product_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None

    return {
        "id": row["id"],
        "name": row["name"],
        "category": row["category"],
        "description": row["description"],
        "price_inr": row["price_inr"],
        "target_tier": row["target_tier"],
        "durability": row["durability"],
        "usage_tags": json.loads(row["usage_tags"]),
        "bundle_rules": json.loads(row["bundle_rules"]),
        "stock": row["stock"],
        "sku": row["sku"],
        "rating": row["rating"],
        "image_url": row["image_url"],
    }


def get_json_ld_catalog(base_url: str = "http://localhost:8000") -> Dict[str, Any]:
    """
    Format catalog in strict Schema.org JSON-LD protocol for External AI Buyers.
    Exposes usage tags, target tiers, durability, standalone & bundle pricing.
    """
    products = get_all_products_raw()
    item_elements = []

    for index, p in enumerate(products, start=1):
        bundle_rules = p["bundle_rules"]
        complementary_ids = bundle_rules.get("complementary_product_ids", [])
        
        item_data = {
            "@type": "Product",
            "position": index,
            "identifier": p["id"],
            "sku": p["sku"],
            "name": p["name"],
            "category": p["category"],
            "description": p["description"],
            "image": p["image_url"],
            "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": p["rating"],
                "bestRating": "5.0",
                "reviewCount": 128
            },
            "offers": {
                "@type": "Offer",
                "price": p["price_inr"],
                "priceCurrency": "INR",
                "availability": "https://schema.org/InStock" if p["stock"] > 0 else "https://schema.org/OutOfStock",
                "inventoryLevel": {
                    "@type": "QuantitativeValue",
                    "value": p["stock"]
                },
                "priceSpecification": {
                    "@type": "UnitPriceSpecification",
                    "price": p["price_inr"],
                    "priceCurrency": "INR",
                    "name": "Standalone Price"
                }
            },
            "additionalProperty": [
                {
                    "@type": "PropertyValue",
                    "name": "targetTier",
                    "value": p["target_tier"],
                    "description": "Target user experience level (casual vs. professional)"
                },
                {
                    "@type": "PropertyValue",
                    "name": "durability",
                    "value": p["durability"],
                    "description": "Durability and lifespan preference (budget-short-term vs. premium-long-term)"
                },
                {
                    "@type": "PropertyValue",
                    "name": "usageTags",
                    "value": p["usage_tags"],
                    "description": "Key application and environment tags for vector and heuristic matching"
                },
                {
                    "@type": "PropertyValue",
                    "name": "bundleRules",
                    "value": {
                        "bundleName": bundle_rules.get("bundle_name", "Standard Bundle"),
                        "complementaryProductIds": complementary_ids,
                        "bundleDiscountPct": bundle_rules.get("bundle_discount_pct", 0),
                        "rationale": bundle_rules.get("bundle_pitch", ""),
                        "tierPricing": bundle_rules.get("tier_pricing", {})
                    }
                }
            ],
            "isRelatedTo": [
                {
                    "@type": "Product",
                    "identifier": comp_id
                } for comp_id in complementary_ids
            ]
        }
        item_elements.append(item_data)

    return {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "Razorpay Agentic Commerce Merchant Catalog",
        "description": "Real-time, agent-readable e-commerce product catalog with dynamic bundling, tier pricing, and autonomous checkout protocols.",
        "url": f"{base_url}/api/v1/agent/catalog",
        "numberOfItems": len(item_elements),
        "itemListElement": item_elements,
        "agenticCommerceProtocols": {
            "acp": {
                "name": "Agentic Commerce Protocol (OpenAI / Stripe)",
                "status": "ACTIVE",
                "endpoint": f"{base_url}/api/v1/agent/checkout",
                "method": "POST"
            },
            "npci_uap": {
                "name": "NPCI Unified Agent Protocol (UPI Circle & Reserve Pay)",
                "status": "ACTIVE",
                "endpoint": f"{base_url}/api/v1/agent/uap-checkout",
                "primitives": ["UPI_CIRCLE_DELEGATION", "RESERVE_PAY_BOUNDED_POOL"],
                "currency": "INR"
            },
            "google_ap2": {
                "name": "Google Agent Payments Protocol (AP2 / FIDO Alliance)",
                "status": "ACTIVE",
                "endpoint": f"{base_url}/api/v1/agent/ap2-checkout",
                "mandateFormat": "CRYPTOGRAPHICALLY_SIGNED_MANDATE"
            },
            "x402": {
                "name": "x402 HTTP Payment Required",
                "status": "ACTIVE",
                "challengeHeader": "PAYMENT-REQUIRED"
            }
        },
        "checkoutProtocol": {
            "endpoint": f"{base_url}/api/v1/agent/checkout",
            "method": "POST",
            "contentType": "application/json",
            "supportedCurrencies": ["INR"],
            "budgetHardLimitINR": 10000.0,
            "velocityLimit": "2 orders per hour per session"
        }
    }


def calculate_bundle_pricing(primary_id: str, addon_ids: List[str]) -> Dict[str, Any]:
    """Calculate discounted bundle price and rationale."""
    primary = get_product_by_id(primary_id)
    if not primary:
        raise ValueError(f"Primary product '{primary_id}' not found.")

    addons = []
    total_standalone = primary["price_inr"]
    bundle_discount_pct = primary["bundle_rules"].get("bundle_discount_pct", 10)

    for aid in addon_ids:
        addon = get_product_by_id(aid)
        if addon:
            addons.append(addon)
            total_standalone += addon["price_inr"]

    # Calculate discount
    discount_multiplier = (100.0 - bundle_discount_pct) / 100.0
    bundle_price = round(total_standalone * discount_multiplier, 2)
    savings = round(total_standalone - bundle_price, 2)

    return {
        "primary_product": primary,
        "addon_products": addons,
        "standalone_total_inr": total_standalone,
        "bundle_discount_pct": bundle_discount_pct,
        "discounted_bundle_price_inr": bundle_price,
        "total_savings_inr": savings,
        "bundle_pitch": primary["bundle_rules"].get("bundle_pitch", "Save with complementary equipment combo.")
    }


def register_web_product(product_data: Dict[str, Any]) -> Dict[str, Any]:
    """Dynamically register a live web-discovered product for checkout."""
    upsert_web_product(product_data)
    stored = get_product_by_id(product_data["id"])
    return stored if stored else product_data
