"""Deterministic preference-candidate extraction from free text.

Per AGENTS.md: extraction models/code may propose candidate facts; Jev is
the one that judges whether an ambiguous message really asserts them. This
module only proposes candidates — it never decides a trip's preferences are
updated. Any regex/counting happens here, in code, not as a Jev question
(Jev does no arithmetic or counting, per this repo's Jev usage guidance).
"""

import re

_DIET_KEYWORDS: dict[str, tuple[str, ...]] = {
    "vegan": ("vegan",),
    "vegetarian": ("vegetarian",),
    "pescatarian": ("pescatarian", "pescetarian"),
    "gluten-free": ("gluten-free", "gluten free", "celiac", "coeliac"),
    "halal": ("halal",),
    "kosher": ("kosher",),
    "dairy-free": ("dairy-free", "dairy free", "lactose intolerant", "lactose-free"),
    "nut-free": ("nut-free", "nut free", "nut allergy"),
}

_BUDGET_TIER_KEYWORDS: dict[str, tuple[str, ...]] = {
    "budget": ("cheap", "budget", "inexpensive", "affordable"),
    "moderate": ("moderate", "mid-range", "midrange"),
    "upscale": ("upscale", "fancy", "expensive", "high-end", "splurge"),
}

_AMOUNT_RE = re.compile(r"\$\s?(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s?(?:dollars|bucks)\b", re.IGNORECASE)
_UNDER_RE = re.compile(r"\b(under|below|less than|max(?:imum)?)\b", re.IGNORECASE)


def extract_diet_candidate(text: str) -> str | None:
    lowered = text.lower()
    for diet, keywords in _DIET_KEYWORDS.items():
        if any(keyword in lowered for keyword in keywords):
            return diet
    return None


def extract_budget_candidate(text: str) -> str | None:
    lowered = text.lower()
    amount_match = _AMOUNT_RE.search(lowered)
    if amount_match:
        amount = amount_match.group(1) or amount_match.group(2)
        prefix = "under $" if _UNDER_RE.search(lowered) else "$"
        return f"{prefix}{amount}"
    for tier, keywords in _BUDGET_TIER_KEYWORDS.items():
        if any(keyword in lowered for keyword in keywords):
            return tier
    return None


def extract_candidates(text: str) -> dict[str, str]:
    candidates: dict[str, str] = {}
    diet = extract_diet_candidate(text)
    if diet:
        candidates["diet"] = diet
    budget = extract_budget_candidate(text)
    if budget:
        candidates["budget"] = budget
    return candidates
