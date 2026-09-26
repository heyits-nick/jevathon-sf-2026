# AI backend implementation handoff

## Outcome, authority, and ownership

Build the decision and memory backend for this journey: save social travel inspiration, remember a confirmed place and preferences, retrieve real menu evidence, receive a personal Jev recommendation, and recall that same saved choice through chat or voice. Preserve the existing menu scorer as the first working slice.

The organizers extended the September 26, 2026 deadline to **3:00 PM PT**, as confirmed by Nikhil. The current README, roadmap, and architecture reflect this product scope and deadline. Sponsor credits are available for all sponsors; availability does not justify adding infrastructure. Use the agreed existing stack and one API server. At handoff preparation, the repository contains planning documents, so verify the selected runtime with delivery before scaffolding competing stacks.

Own `backend/scoring/`: HTTP routes, durable storage integration, contracts, Jev calls, orchestration, evidence references, and error handling. The user owns `backend/menu_fetch/`, `photon/`, and `voice/`; request adapter changes through contracts. Delivery handles shared configuration, data, merges, and QA. Supply delivery with exact setup commands and environment variable names for README and `.env.example`; never commit secret values. Do not edit another owner's implementation folder.

## Build order and deliverables

Use `codex/backend-<slice>` branches and small PRs. Never push directly to `main`, force-push, or absorb unrelated changes. Include shared contract additions and any incompatibility in each PR description, and reconcile them with `docs/architecture.md` before integration.

1. **PR 1: genuine `/score`, core working by 2:15 PM.** Deliver fetcher integration, extracted dishes with provenance, validated Jev diet verdicts, deterministic aggregation, real timing, visible failures, and one actual restaurant scored end to end. Preserve the original response fields.
2. **PR 2: trips and routing, integrated core by 2:15 PM.** Deliver authenticated trip creation/read/messages, durable saves, confirmed preferences, clarification, Jev action routing, research, restaurant selection, and message idempotency. Demonstrate URL-plus-note input becoming a grounded recommendation.
3. **PR 3: recall and decision/error visibility, also complete by 2:35 PM.** Deliver retrieval of saved memories, Jev memory selection, grounded replies for the voice adapter, structured traces, and recovery behavior. Prioritize this over optional integrations.

Freeze features at **2:40 PM**. Resolve integration defects and prepare an actual-service backup demonstration; submit by **2:55 PM**, leaving five minutes before the **3:00 PM** deadline. If time runs short, retain the working scorer and an honest clarification path; never replace missing services with canned success.

## Canonical HTTP contract

Keep `POST /score` accepting `{restaurant, menu_url, diet}`. Preserve its response: `restaurant`, `diet`, `score`, `confidence`, `escalated`, `before_escalation`, `dishes`, `timing_ms`, and `jev_cost_usd`. Each dish retains `name`, `verdict`, `confidence`, `source`, and `jev_ms`. Additive dish `id` and `evidence_ids`, plus top-level `evidence`, `decisions`, and `warnings`, are allowed. Do not rename fields or silently alter their meaning.

New routes:

```text
POST /trips
  {destination?:string, preferences?:{diet?:string,budget?:string,notes?:string}}
  -> {trip_id,access_token}
GET /trips/{id} -> Trip
POST /trips/{id}/messages
  {client_message_id,text,source_url?:string,selected_candidate_id?:string}
  -> {trip:Trip,reply:string}
```

Canonical shared types:

```text
Trip {
  id, destination:string|null,
  preferences:{diet?:string,budget?:string,notes?:string},
  status:'saved'|'needs_clarification'|'researching'|'ready'|'failed',
  saves:SavedPost[], candidates:Candidate[], recommended_candidate_ids:string[],
  selected_candidate_id:string|null, clarification:string|null,
  messages:Message[], decisions:DecisionTrace[]
}
SavedPost {id,source_url,place_name:string|null,note,created_at}
Candidate {id,restaurant,menu_url,score_result:ScoreResponse,evidence:Evidence[],
  recommendation_reason:string|null,directions_url?:string}
Evidence {id,url,quote,kind:'menu'|'review'|'diet_site',checked_at}
Message {id,role:'user'|'assistant',text,created_at}
DecisionTrace {id,stage,model,choice?:string,confidence?:number,
  evidence_ids:string[],duration_ms,created_at}
```

IDs, URLs, timestamps, names, notes, and message text are strings. `ScoreResponse` is the compatible `/score` response. Failure envelope: `{error:{code,message,retryable},trip_id?}`. Use the canonical HTTP statuses and error codes in `docs/architecture.md`, including `NO_MENU_EVIDENCE` for empty extraction. Avoid exposing provider secrets or raw internal exceptions.

Return an opaque access token at creation; authorize subsequent trip reads and mutations on the server, using bearer authorization. Store a token hash, keep tokens out of URLs and logs, and require adapters to retain the token securely. Validate that submitted candidate IDs belong to the authorized trip. Protect `/score` with the application's server/session authorization too. Accept source-only messages or selection-only events with empty text; otherwise require text or a source URL. Clarify missing diet before producing dietary recommendations. Use ISO 8601 UTC timestamps; text-only saves may have an empty `source_url`.

## Jev owns every semantic decision

Generative models may extract candidate facts from supplied content and restate grounded outcomes after Jev decides. They must not resolve ambiguity, infer accepted preferences, choose tools, recommend restaurants, choose memories, or authorize actions. Jev produces typed decisions; it does not write prose, browse, or persist records.

Implement these dependent stages sequentially:

1. **Intent:** classify the current message using recent turns, destination, confirmed preferences, and pending clarification. Include unknown/clarify options.
2. **Place resolution:** choose among extracted place candidates or request clarification. Supply candidate IDs, source excerpts, destination, and alternatives. An extractor's first candidate is never automatically accepted.
3. **Preference interpretation:** evaluate extracted preference candidates, identify ambiguity, and request user confirmation before persisting an inferred diet, budget, or note. Explicit structured preferences supplied when creating a trip are already user input. Code records the confirmation; Jev interprets its meaning when ambiguous.
4. **Next action and research:** choose clarify, fetch menu, inspect additional evidence, recommend, or stop within the executor's available actions. Supply existing evidence, unresolved questions, earlier actions, and remaining limits.
5. **Dish suitability:** return `yes`, `no`, or `unclear` for each dish, with confidence and evidence references. Include diet, ingredients, preparation uncertainty, menu excerpts, and conflicting sources.
6. **Personal fit and restaurant selection:** use ordered score criteria for fit, then choose eligible candidate IDs using confirmed preferences and actual scored menus. Separate numerical menu coverage from Jev's personal fit judgment. If evidence is insufficient or no candidate qualifies, clarify or return that outcome.
7. **Recall:** select a saved memory ID from a scoped retrieval set, or clarify when multiple memories match. Include saved note, place, source URL, relevant messages, confirmed preferences, prior recommendation, and evidence timestamps. Resolve the chosen ID against stored records before responding.
8. **Response action:** decide respond, clarify, or propose a reservation. A reservation proposal is text only; booking remains outside scope. Code requires explicit human authorization for consequential actions and provides no booking execution path here.

User-selected candidate IDs are explicit choices, subject to ownership validation. Keep the user's choice selected even if Jev reports poor or unknown suitability; show that assessment without overriding their choice. Keep stages explicit enough that traces reveal why a recommendation or clarification occurred.

## Jev request and validation

Confirm exact supported types against the authenticated Jev console docs before implementation. The known real endpoint is `POST https://api.typesafe.ai/v1/systemone`, with bearer authentication and JSON:

```json
{
  "state": "Grounded context, evidence IDs, candidates, and current question",
  "model": "jev-latest",
  "questions": {
    "stage": {
      "type": "choice",
      "instructions": "Choose one listed outcome from the supplied evidence.",
      "criteria": {
        "clarify": "Information is insufficient to choose safely.",
        "respond": "Supplied evidence supports a grounded response."
      }
    }
  }
}
```

Choice criteria are an option-to-definition object; score criteria use an ordered array. Validate `answers.<question>.choice` and `confidence`, allowed options, finite numeric ranges, and referenced IDs. Capture measured duration and actual model metadata. Never treat an invalid or missing answer as a default recommendation. Provider failure means a visible unavailable/uncertain outcome, with retryability where appropriate. No heuristic recommendation fallback.

## Evidence, escalation, and execution limits

Obtain menu text through the user's fetcher adapter. Agree an interface returning source URL, retrieval time, text/excerpts, and failures; escalation must return equally attributable review or diet-site evidence. Preserve primary menu excerpts and conflicts. Reviews may add context but cannot automatically improve confidence or override contrary ingredient evidence.

Implement Jev's research decision. Thresholds can describe uncertainty in Jev's state; they are not the semantic research router. Deterministic code still enforces validated inputs, arithmetic, authorization, maximum calls, maximum candidates/dishes, at most three candidate menus, one additional evidence pass, bounded retries, hard cost limits, and roughly 45 seconds of research within the actual host's request deadline. Validate URL schemes, public-network destinations, and redirects before invoking the fetcher. Define explicit limits before invoking providers. Exhaustion produces a visible unresolved result, not another loop. Independent dish calls may use bounded concurrency; dependent research and rescoring stages must await prior results.

Preserve aggregation: score is qualifying `yes` dishes divided by all scored dishes, using the agreed confidence floor; confidence is mean dish confidence. Empty extraction is a failure, not a zero or perfect score. `before_escalation` preserves initial aggregates and is null without escalation. Re-score uncertain dishes against the combined evidence, recording unchanged or reduced confidence honestly.

Measure timings. Record cost only when supported by actual provider accounting or verified pricing and usage; never reuse illustrative figures. Omit `jev_cost_usd` when unavailable, as specified by the canonical contract; consumers must render it as unavailable, never as free.

## Persistence and bounded messages

Choose durable storage that fits the actual deployment: SQLite requires a persistent volume; ephemeral hosting requires a durable external store. Do not claim in-memory maps or temporary local files persist. Keep trip access, saves, confirmed preferences, pending proposals, messages, evidence, recommendations, and traces consistent through transactional writes.

Enforce uniqueness on `(trip_id, client_message_id)`. Persist the accepted request and its completed response so retries return the same outcome without duplicate saves or repeated paid calls. Reject reuse with changed content; handle overlapping in-flight requests explicitly. Await work within the request budget and update status honestly. Do not launch pretend background jobs inside ephemeral functions; use an explicit retryable failure if bounded execution cannot finish.

## Acceptance and opening prompt

Prove one real `/score` and one real save→clarify/confirm→research→recommend→recall journey. Use a known public source URL plus the user's note; inaccessible social content triggers clarification, never arbitrary scraping. Verify reload persistence, cross-trip token denial, duplicate-message replay, ambiguous places/preferences/memories, empty menus, conflicting evidence, Jev failure, and deadline exhaustion. Confirm recall uses stored IDs and current uncertainty. Synthetic fixtures are for labeled tests only; record real demo evidence separately.

Hand over route contracts, startup commands, migrations/storage setup, required environment names, measured run evidence, remaining limitations, and PR links. Give adapters a callable backend and exact auth/error examples.

**Agent opening prompt:** “Read AGENTS.md, README.md, docs/roadmap.md, docs/architecture.md, and this handoff. Apply the 3 PM deadline and ownership overrides here. Work only in backend/scoring/ on codex/backend-<slice>. Confirm runtime, durable store, fetcher contract, and Jev console schema. First deliver a compatible real POST /score, then authenticated trips and Jev routing, then grounded recall. Enforce bounded execution and visible uncertainty. Submit small reviewable PRs with contract notes, verification evidence, and setup/config instructions for delivery.”
