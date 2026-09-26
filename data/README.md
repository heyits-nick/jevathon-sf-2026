# Test set

**Development/test data.** These are hand-labeled expected answers for real,
public restaurant menus. Use them to check menu fetching and Jev scoring. Never
show them in the demo as live results.

## Format

One JSON file per restaurant/diet pair in `cases/`, named `<id>.json`. Copy
[template.json](template.json) to start. The first three request fields match
`POST /score` in [docs/architecture.md](../docs/architecture.md), so a case can
be sent to the API as-is.

| Field | Meaning |
|---|---|
| `label` | Keep the development/test data label unchanged |
| `id` | `restaurant-slug-diet`, same as the file name |
| `restaurant`, `menu_url`, `diet` | The `POST /score` request |
| `menu_format` | `html`, `pdf`, or `image`. Prefer `html`; PDF parsing is P2 |
| `checked_at`, `checked_by` | When and by whom the menu was read (ISO 8601 with offset) |
| `case_type` | `clear_pass`, `clear_fail`, or `ambiguous` |
| `expected_dishes` | Several dishes, not the whole menu (see rules) |
| `expected_dishes[].verdict` | `yes`, `no`, or `unclear`, matching the contract |
| `expected_dishes[].evidence` | Short quote copied from the menu |
| `notes` | Anything a tester should know, such as a menu that changes daily |

## Labeling rules

- Copy dish names and evidence exactly from the menu. Never invent or
  paraphrase a dish.
- Use `unclear` whenever the menu does not settle the question, such as a
  "house salad" with no ingredients or a sauce that may contain fish or dairy.
  Do not round `unclear` up to `yes`.
- Label only from the menu page. A dish is `yes` only when the menu text
  supports it (a stated label, or ingredients that clearly fit the diet).
- A menu excerpt is not an allergy or ingredient guarantee; the expected answers
  describe what the menu says, not what is safe to eat.

## Diets

These are the labeling rules used for the expected answers. The backend owns
the diet descriptions sent to Jev; if they differ, raise it in a PR.

| Diet | `yes` requires | Label alone |
|---|---|---|
| `vegan` | No animal products in the listed ingredients, or a vegan label | Enough |
| `vegetarian` | No meat, fish, or seafood (including fish sauce, shrimp paste, meat gravy) | Enough |
| `gluten-free` | A gluten-free label, or listed ingredients that clearly contain no gluten | Enough |
| `celiac` | Gluten-free ingredients **and** a statement about cross-contact: a dedicated gluten-free kitchen, a dedicated fryer, or "celiac-safe" | Not enough; a gluten-free label without cross-contact information is `unclear` |

`celiac` is stricter than `gluten-free`. Compare the paired cases for the same
restaurant (for example, Greens' fried cauliflower is `yes` for gluten-free and
`unclear` for celiac because the fryer is not described).

## Cases

Menus were read between 1:39 and 1:52 PM PT on 2026-09-26 (see each case's `checked_at`). Every quote was checked against
the live page with `validate.py --live`.

| Case | Diet | Type | What it tests |
|---|---|---|---|
| [wildseed-sf-vegan](cases/wildseed-sf-vegan.json) | vegan | clear_pass | 100% plant-based menu with "chicken", "bacon", "sausage" in dish text |
| [greens-sf-vegan](cases/greens-sf-vegan.json) | vegan | ambiguous | PDF menu; "vegan possible" means not vegan as served |
| [wildseed-sf-vegetarian](cases/wildseed-sf-vegetarian.json) | vegetarian | clear_pass | Plant-based "chicken", "sausage", "bacon", and beet "poke" |
| [house-of-prime-rib-vegetarian](cases/house-of-prime-rib-vegetarian.json) | vegetarian | clear_fail | Steakhouse; creamed spinach has bacon; gravy and dressing unstated |
| [fin-thai-sf-vegetarian](cases/fin-thai-sf-vegetarian.json) | vegetarian | ambiguous | Tofu with shrimp paste, "VEGETABLES" dish with fish sauce, unstated curry paste |
| [wildseed-sf-gluten-free](cases/wildseed-sf-gluten-free.json) | gluten-free | ambiguous | No "contains gluten" mark is not the same as gluten-free |
| [greens-sf-gluten-free](cases/greens-sf-gluten-free.json) | gluten-free | ambiguous | PDF; explicit gf labels (even on a fried dish), "gluten free possible", unlabeled pizza |
| [fin-thai-sf-gluten-free](cases/fin-thai-sf-gluten-free.json) | gluten-free | ambiguous | No labels; bread in a dessert, soy sauce, rice noodles with unlisted sauce |
| [house-of-prime-rib-gluten-free](cases/house-of-prime-rib-gluten-free.json) | gluten-free | ambiguous | Yorkshire pudding, gravy, creamed spinach; meat is not automatically gluten-free |
| [kitava-mission-gluten-free](cases/kitava-mission-gluten-free.json) | gluten-free | clear_pass | "100% free of gluten" kitchen; breaded nuggets, ponzu, croutons that are all gluten-free |
| [kitava-mission-celiac](cases/kitava-mission-celiac.json) | celiac | clear_pass | Same dishes; the kitchen-wide statement satisfies the celiac rule |
| [greens-sf-celiac](cases/greens-sf-celiac.json) | celiac | ambiguous | Same dishes as greens-sf-gluten-free; gf labels become unclear without fryer or kitchen information |
| [wildseed-sf-celiac](cases/wildseed-sf-celiac.json) | celiac | ambiguous | Gluten-free crust baked with wheat pizzas; fries near tempura with no fryer statement |

After the menu fetcher works, run each `menu_url` through it and replace any
menu that does not come back as readable text. Menus change; re-run
`validate.py --live` before relying on a case.

## Checking the cases

```bash
python3 data/validate.py          # schema only, offline
python3 data/validate.py --live   # also confirm every quote is still on the menu page
```

`--live` needs `curl`, and `pdftotext` for PDF menus. It checks our labels
against the source; it does not call the app or Jev.

## Next: automated check against `POST /score`

[CODING_AGENT_TASK.md](CODING_AGENT_TASK.md) is a ready-to-paste brief for the
CodeRabbit Coding Agent to build `run_score_cases.py`, which fails if any dish
labeled `no` or `unclear` comes back as a confident `yes`.
