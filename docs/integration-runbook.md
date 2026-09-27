# Run Nikhil's provider adapters

Use Node 25. Credentials belong in ignored root `.env`; `.env.example` contains names only. `API_BASE_URL` must be the real backend base URL serving the canonical trip API. Credits do not substitute for a running backend.

## Shared backend and frontend

The teammate's backend is Python/FastAPI under `backend/scoring/`. Start it from that directory with `uv sync`, then `uv run uvicorn backend_scoring.main:app --host 127.0.0.1 --port 8000 --env-file ../../.env`. Loading the root environment makes the configured Jev key available when the scoring slice lands. Point provider `API_BASE_URL` and frontend `BACKEND_API_URL` at `http://127.0.0.1:8000`; the frontend variable belongs in its ignored `web/.env.local` or server environment. Start the frontend with `npm ci --prefix web` and `npm run dev --prefix web`.

The backend now researches a shared link inside `POST /trips/{id}/messages`: it reads the post's public caption through the menu bridge, Jev picks the place, Browserbase Search finds nearby menus, Jev selects sources, up to three menus are fetched and scored per dish by Jev, and Jev picks the recommendation. Text messages after that are routed by Jev to recall or alternative answers built from the stored research. The menu bridge must be running before the backend receives a link. The step-by-step demo sequence is in the README section "Reproducible demo: shared link → researched recommendation".

Research runs inside the request (budget `RESEARCH_BUDGET_SECONDS`, default 45, inside Photon's 55 s and voice's 50 s waits). A backend crash mid-run can leave a trip in `researching`; share the link again with a new message to retry. A reply to a place clarification does not restart research yet; share the link again instead.

Jev readiness was verified with the documented read-only models endpoint on September 26. The evaluation endpoint is `POST https://api.typesafe.ai/v1/systemone`, with bearer auth and `{state, model: "jev-latest", questions}`. Use a Choice question with explicit `yes`, `no`, and `unclear` criteria for dietary verdicts. Noul has no confidence field, and Score is a rubric index. Put the question and evidence boundaries in instructions, not just the question-map key. See the [official API reference](https://docs.typesafe.ai/api).

## Menu evidence: usable immediately

```powershell
node --test backend/menu_fetch/index.test.mjs
node --env-file=.env backend/menu_fetch/cli.mjs serve
```

The default endpoint is `POST http://127.0.0.1:8101/fetch-menu`, accepting `{menu_url,restaurant,kind?}`. It returns `{restaurant?,menu_url,raw_text,dishes,evidence,timing_ms}`. A Node backend can import `fetchMenu` directly from `backend/menu_fetch/index.mjs`; other backends use the HTTP bridge. Set `MENU_FETCH_TOKEN` and send `Authorization: Bearer <token>` when exposing it beyond localhost. Do not expose an unauthenticated public fetch proxy.

The adapter fetches public HTML through Browserbase and conservatively segments dishes while preserving raw menu text and exact source excerpts. It makes no dietary judgments. The backend uses Jev for those decisions. Detailed errors, scope, and source limitations are in [the menu README](../backend/menu_fetch/README.md).

## Photon: requires the shared trip backend

```powershell
npm ci --prefix photon
npm test --prefix photon
node --env-file=.env photon/src/index.mjs
```

This is a persistent message-loop process, not an ephemeral serverless handler. Configure `PHOTON_PROJECT_ID`, `PHOTON_PROJECT_SECRET`, and `API_BASE_URL`. Store `PHOTON_STATE_PATH` on a persistent private disk in deployment; it contains trip access tokens and message state.

Once the listener is connected, the presenter sends a message to the assigned iMessage address. The adapter creates/reuses the sender's trip and passes the message to the backend's Jev pipeline. Confirm the actual reply and a duplicate-delivery test. The provider credentials check alone is not proof of delivery. See [the Photon README](../photon/README.md) for retry guarantees and runtime requirements.

## ElevenLabs: same trip, same backend

```powershell
node --test voice/test.mjs
node --env-file=.env voice/configure-agent.mjs --update-existing
node --env-file=.env voice/server.mjs
```

Configure `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, and `API_BASE_URL`. The explicit setup flag permits configuration of the specific existing agent identified in `.env`; preserve an unrelated agent by using a dedicated project agent instead.

Open `http://127.0.0.1:8788/` and enter an existing trip ID and its bearer token locally. Tokens must not appear in URLs. Start the microphone with the button. The text fallback calls the same backend when voice is unavailable.

For the Next frontend, mount the module as described in [the voice README](../voice/README.md), with the same trip ID/token held by the web app and an `onTrip` callback to refresh the UI. Set `VOICE_ALLOWED_ORIGIN` to the exact frontend origin. In production use HTTPS and preferably proxy the voice bridge behind the app origin. Do not expose the ElevenLabs API key to the browser.

## Final integration check

1. Backend answers authorized `GET /trips/{id}` and `POST /trips/{id}/messages`; `POST /score` remains compatible.
2. A shared post link on a trip with a diet reaches `ready` with candidates, one recommended candidate ID, and a decision trace per Jev call; `GET /trips/{id}` returns the same after a web refresh. Real menu research returns original source evidence and the backend's actual Jev decisions.
3. A presenter-initiated iMessage saves input and receives the backend reply.
4. Web and voice are paired to that same stored trip; no separate recommendation memory.
5. Voice recalls the saved context through the backend; refresh/restart preserves the trip.
6. Invalid authorization, provider failure, and uncertain menu evidence remain visible and do not turn into fabricated success.

The focused automated checks use labeled fake provider/backend responses. A live provider credential check and an end-to-end demonstration are separate checks. Record only the latter as a working product flow.
