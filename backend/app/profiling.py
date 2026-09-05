"""
Profiling and Tailored Recommendation Engine (Path 2).
Collects 4 parameters:
1. Primary Use Case (e.g. coding, gaming, home-office, streaming)
2. Skill / User Level (casual vs professional)
3. Target Budget (e.g. ₹2,000 - ₹10,000)
4. Lifespan Preference (budget-short-term vs premium-long-term)
Matches against catalog and generates clear reasoning and bundle upgrade suggestions.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from .catalog import get_all_products_raw, get_product_by_id


class ProfilingInput(BaseModel):
    primary_use_case: str = Field(..., description="e.g. 'coding', 'gaming', 'home-office', 'content-creation'")
    user_level: str = Field(..., description="'casual' or 'professional'")
    target_budget: float = Field(..., ge=500.0, le=25000.0, description="Target budget in INR")
    lifespan_pref: str = Field(..., description="'budget-short-term' or 'premium-long-term'")


class TailoredRecommendation(BaseModel):
    recommended_product: Dict[str, Any]
    match_score_pct: int
    matching_factors: List[str]
    ai_reasoning: str
    standalone_price_inr: float
    bundle_upgrade_option: Optional[Dict[str, Any]] = None


def match_tailored_product(profile: ProfilingInput) -> TailoredRecommendation:
    """
    Score catalog products against the 4 profiling parameters and return the top match.
    Weighted scoring algorithm:
    - Target Budget Proximity & Ceiling (35%)
    - Primary Use Case Tag Overlap (30%)
    - User Tier Match (20%)
    - Durability / Lifespan Match (15%)
    """
    all_products = get_all_products_raw()
    scored_products = []

    norm_use_case = profile.primary_use_case.lower().strip()
    norm_user_level = profile.user_level.lower().strip()
    norm_lifespan = profile.lifespan_pref.lower().strip()
    target_budget = float(profile.target_budget)

    for p in all_products:
        score = 0.0
        factors = []

        # 1. Budget scoring (Within budget gets high score; slightly below target gets bonus)
        price = p["price_inr"]
        if price <= target_budget:
            # Score higher the closer it is to target without exceeding
            budget_ratio = price / target_budget
            # Optimal sweet spot is 70% - 98% of budget
            budget_score = 35.0 * (1.0 - 0.5 * abs(1.0 - budget_ratio))
            score += budget_score
            factors.append(f"Comfortably fits target budget of ₹{target_budget:,.0f} (₹{price:,.0f})")
        else:
            # Over budget penalty
            overage = (price - target_budget) / target_budget
            budget_score = max(0.0, 35.0 - overage * 60.0)
            score += budget_score
            if budget_score > 0:
                factors.append(f"Slightly over target budget by ₹{price - target_budget:,.0f}")

        # 2. Use Case Tag Matching (30 points)
        tags = [t.lower() for t in p["usage_tags"]]
        category = p["category"].lower()
        tag_match = False
        if any(norm_use_case in t or t in norm_use_case for t in tags):
            score += 30.0
            tag_match = True
            factors.append(f"Engineered specifically for {norm_use_case}")
        elif norm_use_case in category or category in norm_use_case:
            score += 20.0
            tag_match = True
            factors.append(f"Category alignment with {norm_use_case}")
        else:
            score += 5.0

        # 3. User Level Matching (20 points)
        target_tier = p["target_tier"].lower()
        if target_tier == norm_user_level or target_tier == "both":
            score += 20.0
            factors.append(f"Matched your '{norm_user_level.capitalize()}' workflow tier")
        else:
            score += 8.0

        # 4. Durability / Lifespan Matching (15 points)
        durability = p["durability"].lower()
        if (norm_lifespan in durability) or (durability in norm_lifespan):
            score += 15.0
            factors.append(f"Matches your '{profile.lifespan_pref}' lifespan expectation")
        else:
            score += 5.0

        match_pct = min(99, int(round(score)))
        scored_products.append({
            "product": p,
            "score": score,
            "match_pct": match_pct,
            "factors": factors
        })

    # Sort descending by score
    scored_products.sort(key=lambda x: x["score"], reverse=True)
    best_candidate = scored_products[0]
    best_product = best_candidate["product"]

    # Construct bundle upgrade suggestion if complementary products exist
    bundle_upgrade = None
    bundle_rules = best_product.get("bundle_rules", {})
    comp_ids = bundle_rules.get("complementary_product_ids", [])
    if comp_ids:
        comp_product = get_product_by_id(comp_ids[0])
        if comp_product:
            standalone_sum = best_product["price_inr"] + comp_product["price_inr"]
            discount_pct = bundle_rules.get("bundle_discount_pct", 10)
            combo_price = round(standalone_sum * (1.0 - discount_pct / 100.0), 2)
            bundle_upgrade = {
                "addon_product_id": comp_product["id"],
                "addon_name": comp_product["name"],
                "addon_price": comp_product["price_inr"],
                "combo_price_inr": combo_price,
                "savings_inr": round(standalone_sum - combo_price, 2),
                "pitch": bundle_rules.get("bundle_pitch", "Save with synergy combo.")
            }

    # Construct human-like reasoning synthesis
    reasoning = (
        f"Based on your profile as a {profile.user_level} user focusing on {profile.primary_use_case}, "
        f"we selected the '{best_product['name']}'. At ₹{best_product['price_inr']:,.0f}, it is within your "
        f"₹{profile.target_budget:,.0f} limit while offering {best_product['durability'].replace('-', ' ')} durability. "
        f"Key attributes: {', '.join(best_candidate['factors'][:3])}."
    )

    return TailoredRecommendation(
        recommended_product=best_product,
        match_score_pct=best_candidate["match_pct"],
        matching_factors=best_candidate["factors"],
        ai_reasoning=reasoning,
        standalone_price_inr=best_product["price_inr"],
        bundle_upgrade_option=bundle_upgrade
    )
