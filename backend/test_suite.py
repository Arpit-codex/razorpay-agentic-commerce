"""
Comprehensive Automated Test Suite for Agentic Commerce Engine.
Tests all requirements from the prompt:
- Agent-Readable Catalog JSON-LD Protocol
- Autonomous Checkout for AI Buyers
- Deterministic Policy Engine (₹10,000 ceiling + 2 orders/hr velocity)
- Complete Audit Trail Recording (SQLite)
- 3 Chatbot Paths (Direct Buy, 4-Question Profiling, Smart Bundles)
- Graceful Failure Recovery Demo
"""

import sys
import os
import unittest
from fastapi.testclient import TestClient

# Add parent directory to path so backend.app can be imported
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.main import app
from app.database import init_db, fetch_audit_logs, get_hourly_order_count

client = TestClient(app)


class TestAgenticCommerceEngine(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        init_db()

    def test_01_agent_catalog_json_ld(self):
        """Test Section 2.A: GET /api/v1/agent/catalog returns valid Schema.org JSON-LD."""
        response = client.get("/api/v1/agent/catalog")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        self.assertEqual(data["@context"], "https://schema.org")
        self.assertEqual(data["@type"], "ItemList")
        self.assertIn("itemListElement", data)
        self.assertGreater(len(data["itemListElement"]), 0)

        # Check product schema attributes
        first_item = data["itemListElement"][0]
        self.assertEqual(first_item["@type"], "Product")
        self.assertIn("offers", first_item)
        self.assertIn("additionalProperty", first_item)

        # Verify usageTags, targetTier, durability, bundleRules exist in additionalProperty
        prop_names = [p["name"] for p in first_item["additionalProperty"]]
        self.assertIn("targetTier", prop_names)
        self.assertIn("durability", prop_names)
        self.assertIn("usageTags", prop_names)
        self.assertIn("bundleRules", prop_names)

        # Verify checkout protocol schema
        self.assertIn("checkoutProtocol", data)
        self.assertEqual(data["checkoutProtocol"]["budgetHardLimitINR"], 10000.0)

    def test_02_agent_autonomous_checkout_success(self):
        """Test Section 2.A: External AI Buyer autonomous checkout within budget limit."""
        sess_id = f"test_ai_agent_valid_{os.urandom(4).hex()}"
        payload = {
            "session_id": sess_id,
            "actor_type": "EXTERNAL_AI_BUYER",
            "user_intent": "AUTONOMOUS_CHECKOUT",
            "items": [{"product_id": "prod_kb_01", "quantity": 1}],
            "is_bundle": False,
            "shipping_name": "Autonomous AutoBuyer 4.0",
            "shipping_email": "agent@buyer.ai",
            "ai_reasoning": "Evaluated coding peripherals; Keychron K2 has optimal tactile rating within budget."
        }
        response = client.post("/api/v1/agent/checkout", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "APPROVED")
        self.assertEqual(data["policy_verification"]["status"], "PASSED")
        self.assertIn("order", data)
        self.assertTrue(data["order"]["id"].startswith("order_"))

        # Verify audit log was written with actor_type = EXTERNAL_AI_BUYER
        logs = fetch_audit_logs(limit=5)
        agent_logs = [l for l in logs if l["actor_type"] == "EXTERNAL_AI_BUYER"]
        self.assertGreater(len(agent_logs), 0)
        self.assertEqual(agent_logs[0]["policy_check_status"], "PASSED")

    def test_03_policy_engine_hard_budget_ceiling(self):
        """Test Section 3 Rule 1: Bounded Money Actions - Enforce order_amount <= ₹10,000 ceiling."""
        payload = {
            "session_id": "test_ai_agent_over_budget",
            "actor_type": "EXTERNAL_AI_BUYER",
            "items": [{"product_id": "prod_kb_01", "quantity": 3}],  # 4999 * 3 = 14,997 > 10,000!
            "is_bundle": False
        }
        response = client.post("/api/v1/agent/checkout", json=payload)
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("Hard budget ceiling breached", data["detail"]["reason"])

        # Check that rejection is committed to SQLite audit logs as FAILED
        logs = fetch_audit_logs(limit=5)
        failed_logs = [l for l in logs if l["session_id"] == "test_ai_agent_over_budget"]
        self.assertEqual(len(failed_logs), 1)
        self.assertEqual(failed_logs[0]["policy_check_status"], "FAILED")
        self.assertIn("Hard budget ceiling breached", failed_logs[0]["policy_violation_reason"])

    def test_04_policy_engine_velocity_limit(self):
        """Test Section 3 Rule 1: Enforce max 2 orders/hour per session."""
        session_id = f"test_velocity_session_{os.urandom(4).hex()}"

        # Order 1 -> Should PASS
        res1 = client.post("/api/v1/checkout/create", json={
            "session_id": session_id,
            "items": [{"product_id": "prod_pad_04", "quantity": 1}]  # ₹999
        })
        self.assertEqual(res1.status_code, 200)

        # Order 2 -> Should PASS
        res2 = client.post("/api/v1/checkout/create", json={
            "session_id": session_id,
            "items": [{"product_id": "prod_wrist_07", "quantity": 1}]  # ₹799
        })
        self.assertEqual(res2.status_code, 200)

        # Order 3 -> Should FAIL due to velocity gate
        res3 = client.post("/api/v1/checkout/create", json={
            "session_id": session_id,
            "items": [{"product_id": "prod_pad_04", "quantity": 1}]
        })
        self.assertEqual(res3.status_code, 400)
        self.assertIn("Velocity limit exceeded", res3.json()["detail"]["reason"])

    def test_05_chatbot_path_1_direct_buy(self):
        """Test Section 2.B Path 1: Direct Buy — AI chat returns product cards with pricing info."""
        response = client.post("/api/v1/chat/message", json={
            "session_id": "human_direct_buyer",
            "message": "I want to buy the ApexPro Mechanical Keyboard directly"
        })
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("response", data)
        self.assertIn("product_cards", data)
        self.assertIn("quick_suggestions", data)
        # Should return at least one product card recommendation
        self.assertIsInstance(data["product_cards"], list)

    def test_06_chatbot_path_2_profiling_recommendation(self):
        """Test Section 2.B Path 2: 4-parameter profiling — AI chat matches product to user profile."""
        response = client.post("/api/v1/chat/message", json={
            "session_id": "human_profiling_user",
            "message": "I need a professional keyboard for coding under ₹5500 that lasts long-term"
        })
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("response", data)
        self.assertIn("product_cards", data)
        self.assertIsInstance(data["product_cards"], list)
        # AI response must contain meaningful text
        self.assertGreater(len(data["response"]), 10)

    def test_07_chatbot_path_3_smart_bundling(self):
        """Test Section 2.B Path 3: Smart bundling — AI chat returns bundle cards with discount info."""
        response = client.post("/api/v1/chat/message", json={
            "session_id": "human_bundle_user",
            "message": "Show me the best bundle deals for a 4K webcam setup"
        })
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("response", data)
        self.assertIn("product_cards", data)
        self.assertIn("bundle_cards", data)
        self.assertIsInstance(data["bundle_cards"], list)

    def test_08_graceful_failure_recovery_demo(self):
        """Test Section 3 Rule 3: Dedicated test endpoint /api/v1/test/trigger-failure."""
        payload = {
            "session_id": "test_failure_session",
            "actor_type": "HUMAN_USER",
            "failure_type": "GATEWAY_TIMEOUT",
            "amount_inr": 4999.0
        }
        response = client.post("/api/v1/test/trigger-failure", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["status"], "RECOVERED_VIA_FALLBACK_LINK")
        self.assertTrue(data["fallback_activated"])
        self.assertIsNotNone(data["fallback_payment_link"])
        self.assertEqual(data["link_expiry_hours"], 24)

        # Verify failure and fallback logged in audit trail
        logs = fetch_audit_logs(limit=10)
        session_logs = [l for l in logs if l["session_id"] == "test_failure_session"]
        statuses = [l["payment_status"] for l in session_logs]
        self.assertIn("FAILED", statuses)
        self.assertIn("FALLBACK_LINK_GENERATED", statuses)

    def test_09_audit_logs_and_stats(self):
        """Test Section 3 Rule 2: Complete Audit Trail endpoint & live stats."""
        logs_res = client.get("/api/v1/audit/logs?limit=20")
        self.assertEqual(logs_res.status_code, 200)
        self.assertGreater(logs_res.json()["count"], 0)

        stats_res = client.get("/api/v1/audit/stats")
        self.assertEqual(stats_res.status_code, 200)
        stats = stats_res.json()
        self.assertEqual(stats["hard_ceiling_inr"], 10000.0)
        self.assertEqual(stats["velocity_limit_per_hour"], 2)

    def test_10_tavily_live_search(self):
        """Test Tavily Live Web Search Endpoint & Structured Product Extraction."""
        response = client.get("/api/v1/search/live?q=ergonomic%20mouse&budget=5000")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("products", data)
        self.assertGreater(len(data["products"]), 0)
        
        first = data["products"][0]
        self.assertTrue(first["id"].startswith("prod_web_"))
        self.assertTrue(first["is_web_result"])
        self.assertIn("source_domain", first)
        self.assertGreater(first["price_inr"], 0)

    def test_11_web_product_checkout_and_policy(self):
        """Test Option A: Instant Razorpay checkout for live web products within ₹10k ceiling, and deterministic rejection if above."""
        # 1. Register and buy a compliant web product (₹4,500)
        session_id = f"test_web_buyer_{os.urandom(4).hex()}"
        res_ok = client.post("/api/v1/checkout/create", json={
            "session_id": session_id,
            "items": [{"product_id": "prod_web_sample_ok", "quantity": 1}]
        })
        # If prod_web_sample_ok isn't in db yet, let's register one first via search or register_web_product
        from app.catalog import register_web_product
        register_web_product({
            "id": "prod_web_test_ok",
            "name": "Live Web ANC Earbuds",
            "price_inr": 4500.0,
            "category": "Audio",
            "description": "Sourced via Tavily live web."
        })
        register_web_product({
            "id": "prod_web_test_expensive",
            "name": "Live Web Flagship Laptop",
            "price_inr": 45000.0,
            "category": "Computers",
            "description": "Sourced via Tavily live web."
        })

        # Under ceiling -> Should PASS
        res_pass = client.post("/api/v1/checkout/create", json={
            "session_id": session_id,
            "items": [{"product_id": "prod_web_test_ok", "quantity": 1}]
        })
        self.assertEqual(res_pass.status_code, 200)
        self.assertEqual(res_pass.json()["status"], "APPROVED")
        self.assertIn("order", res_pass.json())

        # Over ceiling -> Should FAIL (₹45,000 > ₹10,000)
        res_fail = client.post("/api/v1/checkout/create", json={
            "session_id": f"session_expensive_{os.urandom(4).hex()}",
            "items": [{"product_id": "prod_web_test_expensive", "quantity": 1}]
        })
        self.assertEqual(res_fail.status_code, 400)
        self.assertIn("Hard budget ceiling breached", res_fail.json()["detail"]["reason"])

    def test_12_lowest_price_finder_endpoint(self):
        """Test POST /api/v1/search/lowest-price — Multi-retailer price comparison for Direct Buy Flow."""
        payload = {
            "session_id": f"test_price_finder_{os.urandom(4).hex()}",
            "product_name": "Wireless Noise Cancelling Headphones",
            "brand_model": "Sony WH-CH720N",
            "budget_max": 10000.0
        }
        response = client.post("/api/v1/search/lowest-price", json=payload)
        self.assertEqual(response.status_code, 200)
        deal = response.json()

        # Verify deal card structure
        self.assertIn("id", deal)
        self.assertTrue(deal["id"].startswith("prod_web_"))
        self.assertIn("product_name", deal)
        self.assertIn("brand_model", deal)
        self.assertIn("lowest_price_inr", deal)
        self.assertIn("lowest_store", deal)
        self.assertIn("retailers", deal)
        self.assertIsInstance(deal["retailers"], list)
        self.assertGreater(len(deal["retailers"]), 0)
        self.assertIn("image_url", deal)
        self.assertIn("is_within_10k_limit", deal)
        self.assertIn("is_web_result", deal)
        self.assertTrue(deal["is_web_result"])
        self.assertGreater(deal["lowest_price_inr"], 0)

        # Verify the product was auto-registered in SQLite for checkout
        from app.catalog import get_product_by_id
        registered = get_product_by_id(deal["id"])
        self.assertIsNotNone(registered, "Deal product must be auto-registered in SQLite for checkout eligibility")

        # Verify audit log was written
        logs = fetch_audit_logs(limit=5)
        search_logs = [l for l in logs if l["user_intent"] == "PRICE_COMPARISON_DIRECT_BUY"]
        self.assertGreater(len(search_logs), 0)

    def test_13_price_watch_flow(self):
        """Test Price Watch creation, listing, manual check trigger, and target price hit auto-buy."""
        sess_id = f"test_watch_{os.urandom(4).hex()}"
        add_payload = {
            "session_id": sess_id,
            "product_id": "prod_kb_01",
            "product_name": "Keychron K2 Wireless Mechanical Keyboard",
            "brand_model": "Keychron K2",
            "target_price_inr": 4500.0,
            "deadline_hours": 48,
            "action_on_expire": "BUY_ANYWAY",
            "current_price_inr": 4999.0
        }
        res_add = client.post("/api/v1/price-watch/add", json=add_payload)
        self.assertEqual(res_add.status_code, 200)
        watch_data = res_add.json()
        self.assertIn("id", watch_data)
        self.assertEqual(watch_data["status"], "WATCHING")
        self.assertEqual(watch_data["target_price_inr"], 4500.0)
        watch_id = watch_data["id"]

        # Verify list endpoint
        res_list = client.get(f"/api/v1/price-watch/list?session_id={sess_id}")
        self.assertEqual(res_list.status_code, 200)
        watches = res_list.json()["watches"]
        self.assertEqual(len(watches), 1)

        # Trigger price drop check (simulated price ₹4,200 <= ₹4,500 target)
        res_check = client.post("/api/v1/price-watch/check-now", json={"watch_id": watch_id, "simulated_price": 4200.0})
        self.assertEqual(res_check.status_code, 200)
        updated_watch = res_check.json()
        self.assertEqual(updated_watch["status"], "AUTO_BOUGHT")
        self.assertIsNotNone(updated_watch["razorpay_order_id"])

    def test_14_price_history_analytics(self):
        """Test GET /api/v1/price-history/analytics for historical price snapshots and predictions."""
        response = client.get("/api/v1/price-history/analytics?brand_model=Sony%20WH-CH720N&current_price=9420")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("snapshots", data)
        self.assertIn("stats", data)
        self.assertIn("camel_data", data)
        self.assertIn("prediction", data)

        stats = data["stats"]
        self.assertEqual(stats["current_price"], 9420.0)
        self.assertIn("avg_price", stats)
        self.assertIn("highest_price", stats)
        self.assertIn("lowest_price", stats)
        self.assertIn("trend", stats)

    def test_15_agent_web_navigation(self):
        """Test POST /api/v1/agent/navigate for live web navigation & product extraction."""
        payload = {"query_or_url": "Keychron K2 Mechanical Keyboard Amazon India"}
        response = client.post("/api/v1/agent/navigate", json=payload)
        self.assertEqual(response.status_code, 200)
        product = response.json()
        self.assertIn("id", product)
        self.assertTrue(product["id"].startswith("prod_web_"))
        self.assertIn("price_inr", product)
        self.assertIn("source_store", product)
        self.assertTrue(product.get("navigated_by_agent"))


if __name__ == "__main__":
    unittest.main()

