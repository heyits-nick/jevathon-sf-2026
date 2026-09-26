from backend_scoring.preference_extraction import extract_candidates


def test_extracts_diet_and_dollar_budget_with_under():
    assert extract_candidates("Make this vegan and under $25") == {"diet": "vegan", "budget": "under $25"}


def test_extracts_bare_dollar_amount_without_under():
    assert extract_candidates("budget is $40 for two") == {"budget": "$40"}


def test_extracts_budget_tier_keyword():
    assert extract_candidates("something upscale please") == {"budget": "upscale"}


def test_extracts_gluten_free_variants():
    assert extract_candidates("I have celiac disease") == {"diet": "gluten-free"}
    assert extract_candidates("gluten free only") == {"diet": "gluten-free"}


def test_no_candidates_in_unrelated_text():
    assert extract_candidates("what time do you open") == {}


def test_diet_and_budget_together():
    assert extract_candidates("vegetarian, cheap eats please") == {"diet": "vegetarian", "budget": "budget"}
