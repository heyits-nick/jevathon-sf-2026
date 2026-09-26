# Architecture and shared API contract

This is the agreed implementation target, not a claim that code already exists. Keep the existing menu-scoring endpoint compatible. The updated product surrounds it with saved travel inspiration, preference memory, recommendations, and recall. The organizer-extended deadline is **3:00 PM PT**, with submission by **2:55 PM**.

## Ownership and integration

| Area | Responsibility |
| --- | --- |
| `backend/menu_fetch/` | Nikhil: Browserbase retrieval and evidence extraction |
| `backend/scoring/` | AI/backend: Jev decisions, HTTP API, trip persistence, orchestration |
| `web/` | Designer: capture, results, uncertainty, source evidence, voice mounting point |
| `photon/` | Nikhil: inbound/outbound iMessage transport |
| `voice/` | Nikhil: ElevenLabs transport and tool configuration |
| `data/` and root deployment/config | Delivery: labeled QA fixtures, deployment, integration |

Reuse code and frameworks already in progress. There is one authoritative backend and trip store. Adapters must not maintain a second recommendation engine or separate trip memory. The delivery owner coordinates shared package/config changes. No monorepo reorganization is needed to satisfy this contract.

## Jev owns all AI decisions

| Stage | Jev decides | Other components do |
| --- | --- | --- |
| Intent | save, research, recall, update preference, choose option, clarify | Validate request and provide current state |
| Place | Which extracted candidate matches, or request clarification | Extract candidates and their source text |
| Preferences | Interpret proposed preference facts and ambiguity | Preserve explicit human choices; ask before overwriting conflicting preferences |
| Next action | Read menu, seek further evidence, ask user, answer, stop | Execute only a permitted tool with validated arguments |
| Dietary judgment | Per-dish `yes / no / unclear` from supplied evidence | Preserve quotes/URLs and enforce evidence requirements |
| Escalation | Whether more evidence could resolve uncertainty | Enforce tool-call, elapsed-time, cost, and retry limits |
| Recommendation | Preference fit, candidate ranking/selection among eligible IDs | Compute numeric distances/times/budgets when data is available |
| Recall | Which stored post/place/candidate answers the reference | Retrieve a bounded set of possible records |
| Response action | Answer, clarify, or offer a future action | Render grounded wording; require explicit authorization before external commitments |

No general chat model, frontend, voice agent, or browser agent may substitute for these judgments. Extraction models can propose facts and generate wording after the decision. For Browserbase, use explicit pages/extraction operations rather than autonomous travel-planning instructions. Stagehand's page-navigation mechanics do not authorize it to choose restaurants or next product actions.

Code still applies deterministic validation, authorization, idempotency, budgets, and arithmetic. User selections remain the user's choices. Jev must not override them. A failed Jev call produces an honest retriable error or unresolved state; it does not trigger a heuristic recommender.

Persist an actual trace for each decision with model identifier, stage, selected option when applicable, available confidence, evidence references, duration, and timestamp. Do not invent decisions for steps that did not call Jev.

## Menu scoring: retain `POST /score`

Request:

```json
{"restaurant":"Name","menu_url":"https://example.com/menu","diet":"vegetarian"}
```

Retain the existing response fields and meanings:

```json
{
  "restaurant": "Name",
  "diet": "vegetarian",
  "score": 0.5,
  "confidence": 0.68,
  "escalated": true,
  "before_escalation": {"score": 0.5, "confidence": 0.62},
  "dishes": [
    {"name":"Dish A","verdict":"yes","confidence":0.94,"source":"menu","jev_ms":180},
    {"name":"Dish B","verdict":"unclear","confidence":0.42,"source":"menu+reviews","jev_ms":200}
  ],
  "timing_ms": {"fetch":4200,"jev_total":380},
  "jev_cost_usd": 0.002
}
```

This example is a schema fixture, not a real recommendation or measured run.

- `score`: fraction of all dishes marked yes with confidence >= `YES_MIN_CONFIDENCE`; it is menu coverage, not probability of dietary safety.
- `confidence`: mean per-dish confidence; never label it a guarantee.
- Uncertainty metrics and thresholds are inputs to Jev's escalation choice, not a parallel heuristic decision-maker. Hard limits can prevent further execution.
- `escalated`: true only when additional evidence was retrieved and a second evaluation ran. `before_escalation` is otherwise null. Evidence can lower confidence.
- Reviews or diet-site text are secondary context, not proof that an ambiguous dish is safe. Preserve conflicts and unclear verdicts.
- Additive fields: dish `id`/`evidence_ids`, top-level `evidence`/`decisions`/`warnings`. UI tolerates their absence on earlier compatible responses.
- Report measured timing. Omit `jev_cost_usd` if price/usage cannot establish it; never show an invented value or interpret missing cost as free.
- If no menu dishes can be extracted, return `NO_MENU_EVIDENCE` rather than divide by zero or manufacture dishes.
- Protect this endpoint with the app's server/session authorization as well; a public unbounded URL-fetching proxy is not required for the demo.

## Saved-trip endpoints

Use these HTTP paths exactly across the web, Photon, and voice adapters. Backend framework choice does not alter the contract. All timestamps are ISO 8601 UTC.

### Create

`POST /trips`

```json
{"destination":"New York","preferences":{"diet":"vegetarian","budget":"moderate","notes":""}}
```

Fields are optional. Response: `{trip_id, access_token}`. The opaque per-trip token is issued by the backend, stored securely as a hash server-side, and passed as `Authorization: Bearer <access_token>` on subsequent trip requests. It is not a sponsor API key. Do not put it in a URL or logs. Bound creation abuse through the deployment's normal controls.

### Read

`GET /trips/{trip_id}` returns `Trip` after token verification.

### Message / user action

`POST /trips/{trip_id}/messages`

```json
{
  "client_message_id": "client-generated-unique-id",
  "text": "Save this for my trip; vegetarian lunch nearby.",
  "source_url": "https://example.com/shared-post"
}
```

Optional `selected_candidate_id` records an explicit human choice of an existing candidate; `text` may be empty for a selection-only event. Otherwise require nonempty text or a source URL. Missing diet must cause clarification before a diet-based recommendation, not a default invented preference.

Response: `{trip: Trip, reply: string}`. This operation is idempotent per trip and client_message_id. Repeated calls do not rerun paid research or create duplicate saves. A conflicting payload with the same ID returns conflict.

Use a bounded request/worker lifecycle supported by the actual host. Persist status before expensive work. A received acknowledgment is not proof of completed research. Never launch an untracked background promise in an ephemeral serverless handler and claim the job is queued. Use the chosen host's supported durable task mechanism only if needed.

### Data shapes

```ts
type TripStatus = "saved" | "needs_clarification" | "researching" | "ready" | "failed";
type Preferences = { diet?: string; budget?: string; notes?: string };
type Evidence = {
  id: string; url: string; quote: string;
  kind: "menu" | "review" | "diet_site"; checked_at: string;
};
type SavedPost = {
  id: string; source_url: string; place_name: string | null;
  note: string; created_at: string;
};
type Candidate = {
  id: string; restaurant: string; menu_url: string;
  score_result: ScoreResponse; // existing /score response above
  evidence: Evidence[]; recommendation_reason: string | null;
  directions_url?: string;
};
type Message = {
  id: string; role: "user" | "assistant"; text: string; created_at: string;
};
type DecisionTrace = {
  id: string; stage: string; model: string; choice?: string;
  confidence?: number; evidence_ids: string[];
  duration_ms: number; created_at: string;
};
type Trip = {
  id: string; destination: string | null; preferences: Preferences;
  status: TripStatus; saves: SavedPost[]; candidates: Candidate[];
  recommended_candidate_ids: string[];
  selected_candidate_id: string | null; clarification: string | null;
  messages: Message[]; decisions: DecisionTrace[];
};
```

Empty arrays are valid. Source URL can be an empty string for a text-only saved place; do not invent a social permalink. Optional values are absent when unavailable. Jev output is validated against actual candidate/evidence IDs. A rationale may restate the selected result and evidence but cannot introduce new claims. A failed phase leaves prior valid saved data available.

Errors use `{error:{code,message,retryable},trip_id?}` with appropriate HTTP status: validation 400, authentication 401, authorization 403, missing record 404, conflicting idempotency key 409, missing evidence 422, provider failure 502/503, timeout 504. Avoid leaking keys, raw provider payloads, or private trip content.

## Provider boundary

Keep provider-specific SDK types inside adapters.

- Menu/review adapter accepts explicit validated URLs and a bounded extraction request. Returns observed text/dishes plus evidence and fetch timings; no dietary verdict or recommendation.
- Backend creates queries/candidate sets, calls Jev for semantic selection, then invokes the adapter. Discovery may use literal search plus Jev selection of returned candidate IDs.
- Photon maps its sender/conversation to the stored trip/token on the server. Provider message ID becomes the idempotency ID. It verifies the actual provider signature and formats the backend reply.
- Voice has `getTripContext` for authorized factual reads and `handleTripMessage` for all new interpretations, recommendations, or actions. Exact arguments are `{trip_id}` and `{trip_id,client_message_id,text}`; authorization comes from the trusted session, never from a caller-chosen identity alone.
- The ElevenLabs agent forwards meaningful requests to `handleTripMessage`, which calls the same message endpoint. It speaks the approved reply rather than independently choosing tools/restaurants or changing preferences.
- Integration owner supplies the voice widget/client module; frontend owner mounts it in `web/`. Coordinate package and mount changes through a small PR.

## Practical limits and durability

Start with at most three candidate menus, one additional evidence pass, finite retries, and roughly 45 seconds of total research within the actual host's request limit. These are execution bounds, not AI decision substitutes. No infinite tool loops. Narrower host limits require smaller work or a supported durable job.

Persist trips and idempotency records on a real database or persistent disk. In-memory maps and ephemeral deployment files do not count as saved memory. Keep secrets server-side; isolate trips. Validate schemes and destinations, block private-network addresses/redirects before fetching, and treat remote page text as untrusted data. Use known public HTML menu sources for the first live run. An inaccessible Reel results in a user-visible clarification.

## Verification and changes

Preserve the existing menu-only flow while the new trip API lands. All contract changes require a PR note and coordinated consumer update; do not silently rename paths/fields. Run a real save/research/recall flow, plus focused checks for missing evidence, Jev outage, duplicate messages, cross-trip access, and persistence after restart/deploy.

Official implementation references: [Jev](https://docs.typesafe.ai/introduction/quickstart), [Browserbase](https://docs.browserbase.com/welcome/quickstarts/stagehand), [Photon](https://photon.codes/blog/introducing-spectrum), [ElevenLabs tools](https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools).
