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

- Restaurant `score`: share of all dishes with `verdict = yes` and confidence
  at or above `YES_MIN_CONFIDENCE`. This says how much of the menu fits the
  diet, not how sure we are.
- Restaurant `confidence`: mean of the per-dish confidences. This says how sure
  we are.
- Escalate when the share of `unclear` dishes is above `MAX_UNCLEAR_SHARE` or
  restaurant `confidence` is below `MIN_CONFIDENCE`. A low `score` alone never
  triggers escalation. Escalation fetches reviews and diet-site text, and Jev
  re-scores only the uncertain dishes with that extra context.
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
  "score": 0.5,
  "confidence": 0.68,
  "escalated": true,
  "before_escalation": { "score": 0.5, "confidence": 0.62 },
  "dishes": [
    { "name": "Tofu bowl", "verdict": "yes", "confidence": 0.94, "source": "menu", "jev_ms": 180 },
    { "name": "Pad thai", "verdict": "unclear", "confidence": 0.41, "source": "menu+reviews", "jev_ms": 200 }
  ],
  "timing_ms": { "fetch": 4200, "jev_total": 380 },
  "jev_cost_usd": 0.002
}
```

- `score` and `confidence` are final values (after escalation, if any).
- `before_escalation` holds the values from the first pass, for the confidence
  meter. It is `null` when `escalated` is `false`.
- `jev_ms` is the latency of the last Jev call for that dish. `jev_cost_usd` is
  the total Jev cost for the request. Values above are illustrative only.

## Trade-offs

- Jev for every per-dish decision (fast, cheap); a generative LLM only for
  optional summary text.
- Escalation only when uncertain, so the common case stays fast and cheap.
- HTML menus only today; PDF and photo menus are a P2 via LlamaParse.
