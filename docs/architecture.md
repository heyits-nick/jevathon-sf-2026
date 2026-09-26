# Architecture

Default design. Update it when the implementation changes.

## Components

| Component | Folder | Responsibility |
|---|---|---|
| Menu fetcher | `backend/menu_fetch/` | Browserbase session opens the menu URL, returns raw menu text; for escalation, fetches review text |
| Scorer | `backend/scoring/` | Splits menu into dishes, asks Jev one typed question per dish, aggregates, decides whether to escalate |
| API | `backend/scoring/` | HTTP endpoint the web page and Photon call |
| Web | `web/` | Input form, results page, demo screen |
| Chat | `photon/` | iMessage in, calls API, formats reply |

## Jev question (per dish)

Proposed shape; confirm against the Jev console docs.

- Input: dish name, dish description, restaurant name, diet
- Output: `verdict` in `yes | no | unclear`, `confidence` 0–1

## Aggregation and escalation

- Restaurant score: share of dishes with `verdict = yes` above a confidence
  threshold, plus a count of `unclear`.
- Escalate when the share of `unclear` dishes or the average confidence crosses
  a threshold. Escalation fetches reviews and diet-site text, and Jev re-scores
  only the uncertain dishes with that extra context.
- Thresholds live in one config file so they can be tuned during the demo prep.

## API contract (draft)

`POST /score`

```json
{ "restaurant": "Name", "menu_url": "https://...", "diet": "vegan" }
```

Response:

```json
{
  "restaurant": "Name",
  "diet": "vegan",
  "score": 0.72,
  "escalated": true,
  "dishes": [
    { "name": "Tofu bowl", "verdict": "yes", "confidence": 0.94, "source": "menu" },
    { "name": "Pad thai", "verdict": "unclear", "confidence": 0.41, "source": "menu+reviews" }
  ],
  "timing_ms": { "fetch": 4200, "jev_total": 380 }
}
```

## Trade-offs

- Jev for every per-dish decision (fast, cheap); a generative LLM only for
  optional summary text.
- Escalation only when uncertain, so the common case stays fast and cheap.
- HTML menus only today; PDF and photo menus are a P2 via LlamaParse.
