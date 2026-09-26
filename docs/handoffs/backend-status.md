# Backend status and full merge log (continuity handoff)

Written so a fresh session — human or agent — can pick up the backend work cold if
the current one runs out of context. Read `AGENTS.md`, `README.md`,
`docs/roadmap.md`, `docs/architecture.md`, and `docs/integration-runbook.md`
first; this file is a snapshot on top of those, not a replacement for them.

**Deadline:** 3:00 PM PT, Sept 26 2026 hard stop; team target submission 2:55 PM.
Check `docs/roadmap.md` for current checkpoints — they don't repeat here since
they move faster than this file will be updated.

## Everything merged to `main` so far (chronological)

| PR | What | Owner/area |
|---|---|---|
| #1 | README, AGENTS.md, event reference, roadmap, architecture (initial docs) | docs |
| #2 | Clarified scoring/escalation/API contract in architecture docs | docs |
| #3 | CodeRabbit GitHub app configuration | delivery |
| #4 | Individual per-role handoffs + Jev decision ownership doc | docs |
| #5 | Ignore personal Claude Code settings | delivery |
| #7 | `data/cases/*.json` (13 hand-labeled diet cases) + `data/validate.py` + `CODING_AGENT_TASK.md` (brief for CodeRabbit's Coding Agent to build a `/score` safety-check script) | data/QA |
| #8 | Event reference: Cognition credits link | docs |
| #9 | `web/`: trip flow — create, save posts, clarification, polling refresh, idempotent retry | web |
| #10 | `backend/menu_fetch/`: Browserbase menu evidence adapter | menu_fetch (Nikhil) |
| #11 | `web/`: server-ranked recommendation cards, evidence, selection, decision trace display | web |
| #12 | `photon/`: **the real Photon adapter** — Spectrum persistent `app.messages` loop, sender→trip SQLite mapping, idempotent relay | photon (Nikhil) |
| #13 | `voice/`: authenticated ElevenLabs bridge (`getTripContext`, `handleTripMessage`) | voice (Nikhil) |
| #14 | `backend/menu_fetch/`: source validation refinement, deterministic provider tests | menu_fetch |
| #15 | `photon/`: retry rotation + explicit presenter onboarding (`setup-test-thread.mjs`) | photon (Nikhil) |
| #16 | `web/`: CodeRabbit follow-ups — stale trip responses, polling fix, `$0` cost display | web |
| #17 | `docs/integration-runbook.md` + root `.env.example` + README setup notes — how to actually run every component together | delivery |
| #18 | `backend/scoring/`: **the trip API** (this session's work — see below) | backend/scoring |

Everything above is real, merged, working code — not planning docs. If you're
picking this up cold: `git log --oneline main` to see if anything landed after
this snapshot before you build on top of it.

## What exists and runs right now, per component

- **`backend/scoring/`** (Python 3.12, FastAPI, SQLModel/SQLite, `uv`) — this
  session's work. `POST /trips`, `GET /trips/{id}`, `POST /trips/{id}/messages`,
  and now `POST /score`. Bearer-token auth (hash stored, not raw), idempotent
  on `(trip_id, client_message_id, role)`, real SQLite persistence (survives
  restart). A message with `source_url` becomes a durable `SavedPost`.
  `/score` calls `backend/menu_fetch` for real menu evidence and Jev
  (`jev_client.py`) for real per-dish dietary verdicts — verified live against
  an actual restaurant (Lulla NYC), not mocked; automated tests fake both
  adapters (`tests/test_score.py`), per this repo's own testing convention of
  separating fast fake-provider unit tests from a manual live check. Trip
  messages still don't call Jev for intent/routing — that's the next backend
  gap (see below). Run: `cd backend/scoring && uv sync && uv run uvicorn
  backend_scoring.main:app --reload --port 8000`. Tests: `uv run pytest -q`
  (16 passing). Needs `TYPESAFE_API_KEY` in `backend/scoring/.env` (git-ignored,
  already configured in this session) and a running `backend/menu_fetch`
  bridge (needs `BROWSERBASE_API_KEY` in root `.env`, also already configured
  in this session — check with whoever picks this up whether it's still
  there, since it's untracked by git by design).
- **`backend/menu_fetch/`** (Node, Browserbase) — real adapter, ready to
  consume. HTTP bridge: `node --env-file=.env backend/menu_fetch/cli.mjs
  serve` → `POST http://127.0.0.1:8101/fetch-menu` with
  `{menu_url, restaurant, kind?}` → `{restaurant?, menu_url, raw_text, dishes,
  evidence, timing_ms}`. No dietary judgment — that's Jev's job, called from
  `backend/scoring`.
- **`photon/`** (Node, Spectrum SDK) — real, merged, more complete than an
  earlier duplicate attempt this session built and discarded (see "Lesson
  learned" below). Persistent message-loop process (not serverless), crash
  recovery, idempotent relay to the trip API. Run: `node --env-file=.env
  photon/src/index.mjs`. Needs `PHOTON_PROJECT_ID`, `PHOTON_PROJECT_SECRET`,
  `API_BASE_URL` pointed at a running `backend/scoring`.
- **`voice/`** (Node, ElevenLabs) — real bridge, `getTripContext` (read-only)
  and `handleTripMessage` (forwards to the same message endpoint Photon uses).
  Demo path has the presenter manually paste trip ID + token locally — the
  "give the phone a safe web link" pairing mechanism is explicitly deferred
  (see Photon's README), not currently blocking anything.
- **`web/`** (Next.js) — trip flow UI (create, save, clarify, poll, retry) plus
  server-ranked recommendation cards, evidence display, decision traces, and
  the original `/score` form. Proxies to `BACKEND_API_URL` via
  `web/src/app/api/backend/[...path]/route.ts`, forwarding only
  `score|trips|trips/{id}|trips/{id}/messages`.
- **`data/`** — 13 hand-labeled diet test cases (`data/cases/*.json`) plus a
  brief (`data/CODING_AGENT_TASK.md`) for CodeRabbit's Coding Agent to build
  `data/run_score_cases.py`: a script that hits real `/score` and fails if any
  dish labeled `no`/`unclear` comes back as a confident `yes`. This is our
  ready-made acceptance test for `/score` once it exists — check whether that
  script has landed before writing your own.

## What is explicitly NOT built yet (the real gap)

`POST /score` (per-dish menu scoring, real Jev verdicts) is now done — see
above. Still missing from `backend/scoring`:

1. **Jev wiring for the trip-message flow** — `POST /trips/{id}/messages`
   still gives honest placeholder replies instead of calling Jev for intent
   classification, place resolution, preference interpretation, next-action
   routing, candidate selection, or recall. `jev_client.py` already has a
   working pattern (batched Choice questions in one call) to extend from.
2. Trip status transitions (`needs_clarification`/`researching`/`ready`/
   `failed`) driven by those real Jev decisions, and real `DecisionTrace`
   records (currently always `[]` in `TripOut`).
3. Evidence escalation in `/score` (re-scoring uncertain dishes against
   reviews/diet-site sources) — `backend/menu_fetch` has no such fetch
   capability yet, so `/score` always returns `escalated: false`. Not
   blocking; just not built.

No blocker on Jev access anymore — a real `TYPESAFE_API_KEY` and
`BROWSERBASE_API_KEY` are both configured locally in this session (see above).

## Jev API details (from `docs/integration-runbook.md`, verified against the live console 2026-09-26)

- Endpoint: `POST https://api.typesafe.ai/v1/systemone`, bearer auth.
- Body: `{state, model: "jev-latest", questions}`.
- Use a **Choice** question type (not Bool) for dietary verdicts — Bool has no
  confidence field, and Score is a rubric index, not what we want for
  `yes`/`no`/`unclear` + confidence. Put evidence boundaries and the exact
  question in `instructions`, not just the question-map key.
- Full reference: https://docs.typesafe.ai/api

## Lesson learned this session: check `main` before building

A background agent was dispatched to build the Photon integration in
parallel, using credentials given directly in chat. While it worked, Nikhil
independently merged his own real Photon adapter (#12, #15) straight to
`main`. The two implementations duplicated each other; ours was discarded
(branch deleted from origin, kept locally on `codex/integrations-photon` for
reference only — not proposed for merge, it's strictly less complete than
what's on `main`). **Always `git fetch origin && git log origin/main
--oneline` and check the target folder before starting parallel work someone
else owns**, especially under hackathon time pressure when multiple people/
agents are moving fast on the same repo.

## Workflow reminders

- `gh` CLI is installed and authenticated in this environment
  (`gh auth status` to confirm) — use `gh pr create` directly, no need to hand
  back a compare-URL.
- Branch per slice: `codex/backend-<slice>`. Never push directly to `main`,
  never force-push a shared branch (force-push is fine on your own unmerged
  branch after a rebase, as done for `codex/backend-trip-core`).
- `photon/`, `voice/`, `backend/menu_fetch/`, `web/` are other owners' folders
  — read them for context, don't edit without being asked.
- Credentials: never commit `.env` files or print secret values in commits/PR
  descriptions/logs. Variable *names* only go in `.env.example`.

## Immediate next step queued when this was written

Wire Jev into `POST /trips/{id}/messages` (intent/routing — see gap #1
above), so trip replies stop being placeholders. A trip-pairing/exchange
endpoint (short-lived, single-use token so Photon/voice can hand out a safe
web link without exposing the raw bearer token) was scoped but
deprioritized — nothing currently blocks on it since voice's demo path
bypasses it by manual trip ID/token entry. Revisit either if there's time.

## Note on checking GitHub while working

This session was asked to check GitHub roughly every 2–3 minutes while
actively working. Being transparent about what that actually means: there is
no real background timer running a check on a clock. What happened instead
was `git fetch origin` + `git log origin/main --oneline` + `gh pr list` at
natural task boundaries (before starting a task, before opening a PR). If you
pick this up and need literal continuous monitoring, that requires an actual
scheduled/background mechanism, not an agent claiming to poll while it's
otherwise idle mid-task.
