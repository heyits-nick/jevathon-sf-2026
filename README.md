# JEVATHON SF 2026

Team project for the [JEVATHON SF hackathon](https://app.notion.com/p/coderabbit/JEVATHON-Jev-Hackathon-SF-3e796e76cda18143b74af9944bc5cddc)
(Saturday, September 26, 2026, CodeRabbit HQ). Hacking ends at **3:00 PM PT**
following the organizer extension reported by Nikhil. Target submission: 2:55 PM.

## The idea

**Turn saved travel inspiration into plans you actually use.** Share a travel
post or place with the app, preserve its source and your preferences, research
nearby menus, and return a useful recommendation that you can recall later.
The existing menu scorer is the core research component: Jev evaluates actual
menu evidence dish by dish and decides whether further evidence is needed.
Voice and iMessage use the same stored trip as the web page.

- **User:** a traveler or local with a dietary restriction choosing where to eat.
- **Why Jev:** all AI judgments run through Jev: intent, place ambiguity,
  dietary fit, evidence escalation, preference fit, recommendation selection,
  and memory recall. Measure actual latency/cost; do not promise fixed numbers.
- **Interfaces:** web page for the demo; iMessage via Photon for real use.

## How it works

Shared post / place -> saved trip -> real menu evidence -> Jev decision ->
persisted recommendation -> recall through web, iMessage, or voice.

The menu-scoring core remains:

```
restaurant + diet
      │
      ▼
Browserbase ── fetch menu text ──► scorer: split into dishes
                                        │
                                        ▼
                         Jev: fits diet? (yes/no/unclear + confidence)
                                        │
                    Jev: retrieve additional evidence?
                           │ no                 │ yes
                           ▼                    ▼
                        results        Browserbase: reviews / HappyCow
                                                │
                                                ▼
                                     Jev re-scores ──► results
```

Details: [docs/architecture.md](docs/architecture.md).

## Repository layout

| Path | Owner | What |
|---|---|---|
| `backend/menu_fetch/` | Nikhil / integrations | Browserbase / Stagehand menu and review extraction |
| `backend/scoring/` | AI / backend | Jev questions, per-dish scoring, restaurant aggregate, API |
| `web/` | Designer | Results page and demo screen |
| `photon/` | Nikhil / integrations | iMessage transport into the shared backend |
| `voice/` | Nikhil / integrations | ElevenLabs transport into the shared backend |
| `data/` | Delivery / QA | Clearly labeled test cases and source references |
| `docs/` | All | Event info, roadmap, architecture |

Folders are created by whoever writes the first file in them. Stay in your own
folder to avoid merge conflicts.

## Docs

- [Individual handoffs](docs/handoffs/README.md): separate instructions for each teammate and their AI agent
- [docs/event.md](docs/event.md): schedule, judging rubric, prizes, sponsor tools, links
- [docs/roadmap.md](docs/roadmap.md): priorities, checkpoints, what is out of scope
- [docs/architecture.md](docs/architecture.md): components and data flow
- [AGENTS.md](AGENTS.md): rules for AI coding agents working in this repo

## Team workflow

- Small branches, small pull requests, merge fast. No long-lived branches.
- CodeRabbit reviews every PR (install the CodeRabbit GitHub app on this repo).
- Never commit API keys. Put them in `.env` (git-ignored) and document the
  variable names in `.env.example`.

## Setup and demo

Provider adapters use Node 25, with credentials in an ignored root `.env`.
Copy variable names from `.env.example`, then follow the
[integration runbook](docs/integration-runbook.md) for Browserbase, Photon,
and ElevenLabs setup, backend hookup, and live verification.

The trip backend URL goes in `API_BASE_URL`. Provider adapters do not replace
the backend: Jev decisions and persisted trip state remain there.
### `backend/scoring` — trip API (Python 3.12, [uv](https://docs.astral.sh/uv/))

```bash
cd backend/scoring
uv sync
uv run uvicorn backend_scoring.main:app --reload --port 8000
uv run pytest -q
```

Serves the canonical contract from `docs/architecture.md` at the root path: `POST /score`,
`POST /trips`, `GET /trips/{id}`, `POST /trips/{id}/messages`. Trips persist to a real SQLite
file (`backend/scoring/data/trips.db`, git-ignored; override the path with `TRIP_DB_PATH`), not
an in-memory map, so state survives a restart.

`/score` calls Jev for real per-dish dietary verdicts and `backend/menu_fetch`'s HTTP bridge for
menu evidence — both must be reachable. Environment (in an ignored `backend/scoring/.env`):
`TYPESAFE_API_KEY` (required), `MENU_FETCH_BASE_URL` (default `http://127.0.0.1:8101`),
`MENU_FETCH_TOKEN` (only if the bridge isn't on localhost), `YES_MIN_CONFIDENCE` (default `0.8`),
`JEV_MODEL` (default `jev-latest`). Evidence escalation (re-scoring uncertain dishes against
reviews/diet-site sources) isn't implemented yet — `backend/menu_fetch` has no such fetch
capability to escalate to, so `/score` always returns `escalated: false`.

Point `web/` at it locally via `web/.env.local`: `BACKEND_API_URL=http://localhost:8000`.

Provider startup and live verification are documented in the integration runbook above.

### Reproducible demo: shared link → researched recommendation

Needs `TYPESAFE_API_KEY` and `BROWSERBASE_API_KEY` in the root `.env`. From the repo root, in two
terminals:

```bash
node --env-file=.env backend/menu_fetch/cli.mjs serve            # Browserbase bridge, :8101
cd backend/scoring && uv run uvicorn backend_scoring.main:app --host 127.0.0.1 --port 8000 --env-file ../../.env
```

Then drive one trip (bash; needs `jq`):

```bash
API=http://127.0.0.1:8000
read TRIP TOKEN < <(curl -s -X POST $API/trips -H 'Content-Type: application/json' \
  -d '{"destination":"New York","preferences":{"diet":"vegetarian"}}' | jq -r '"\(.trip_id) \(.access_token)"')
say() { curl -s -X POST $API/trips/$TRIP/messages -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d "{\"client_message_id\":\"$(python3 -c 'import uuid; print(uuid.uuid4())')\",$1}" | jq -r .reply; }
say '"source_url":"https://www.instagram.com/reel/DdouiWwP1oe/"'   # research runs inside this request (~5–45 s)
curl -s $API/trips/$TRIP -H "Authorization: Bearer $TOKEN" | jq '{status, recommended_candidate_ids, candidates: [.candidates[].restaurant], decisions: (.decisions | length)}'
say '"text":"What did you find for me?"'      # recall from saved research
say '"text":"Is it open late?"'               # research can't answer -> says so
say '"text":"I don'"'"'t like that one"'      # alternative from the same research
```

Expected: status `ready`, the place read from the post caption, up to three nearby menus checked
by Jev, one Jev recommendation, and a decision trace per Jev call. If Jev returns `unclear` for the
place, the trip is `needs_clarification`; if the trip has no diet, it asks for one and resumes
research when you reply with it. If the post page can't be read, it asks which place to research;
a Jev or search failure shows as status `failed`. The save is kept in every case.
To see the same trip in the dashboard, set `BACKEND_API_URL=http://127.0.0.1:8000` in
`web/.env.local`, run `npm ci --prefix web && npm run dev --prefix web`, and resume the trip with
`$TRIP` and `$TOKEN`. For voice, run `node --env-file=.env voice/server.mjs` and follow the voice
section of the runbook. Research tuning: `RESEARCH_BUDGET_SECONDS` (default 45).
