# Frontend designer handoff: saved places to a trusted meal choice

**Ready-to-paste instruction for your coding agent:** “Work only in `web/` on the user-facing trip and dish-scoring flow described in `docs/handoffs/01-frontend-designer.md`. Read `AGENTS.md`, `README.md`, `docs/roadmap.md`, and the current `docs/architecture.md` first. Keep the existing `POST /score` screen usable, render trip and recommendation state returned by the server, and integrate through the documented API. Use the existing web stack if one has landed. Make small PRs to `main`; do not modify backend, shared contract, or another owner’s files.”

## What you own and why

Own **`web/` only**: the responsive, accessible page that lets a traveler turn saved social posts into a persistent set of places and preferences, research menus, inspect Jev-backed recommendations, and recall the choice by voice. The user's full intent is a journey from “I saved this post” to “where should I eat, and why?” The demo must also retain the current core: a real restaurant menu scored dish by dish through `POST /score`. Build a usable path through both, giving the integrated trip flow prominence as it becomes available. If `web/` is still absent, create the smallest viable app there; if another teammate has started it, extend its stack and conventions. Avoid introducing a framework, component system, or state library for its own sake.

Your page displays server facts. The backend performs extraction, research, Jev decisions, ranking, persistence, and generated reply text. Do not implement a second scorer, rank restaurants in the browser, infer dietary safety, or fabricate a recommendation when the server is slow or uncertain. A candidate's position and `recommended_candidate_ids` come from the server. The UI can keep temporary form state, pending indicators, and a token for the current session.

## API to consume

Treat `docs/architecture.md` as the canonical contract. Coordinate any mismatch with the delivery owner; do not silently invent fields. The existing `POST /score` request is `{restaurant, menu_url, diet}`. Its response already includes restaurant score and confidence, `escalated`, optional `before_escalation`, per-dish `{name, verdict: "yes"|"no"|"unclear", confidence, source, jev_ms}`, timing, and Jev cost. Additive evidence fields may appear. Render `unclear` literally and make low confidence visible; a percentage of fitting dishes is not a safety guarantee.

Trip calls are:

```text
POST /trips
  {destination?: string, preferences?: {diet?: string, budget?: string, notes?: string}}
  -> {trip_id: string, access_token: string}
GET /trips/{id} -> Trip
POST /trips/{id}/messages
  {client_message_id: string, text: string, source_url?: string,
   selected_candidate_id?: string}
  -> {trip: Trip, reply: string}
```

Send `Authorization: Bearer <access_token>` for requests to that trip. Keep the token in session client storage, scoped to its trip ID; never print it, put it in the URL, commit it, or bundle service secrets. The browser cannot recover an inaccessible trip merely from a trip ID. Generate one stable `client_message_id` per submitted action (for example, `crypto.randomUUID()`), and reuse it on retry so a save or selection is not duplicated. Use the returned `Trip` as the authoritative state after each message; `GET` supports reload and refresh. Centralize these calls in a thin service client so UI components do not assemble auth headers independently. Use the configured API base URL already in the app; document any new *public* configuration name through a coordination request to the delivery owner, since this assignment stays in `web/`.

`Trip` contains `id`, nullable `destination`, `preferences` (`diet`, `budget`, `notes` optional), `status` (`saved`, `needs_clarification`, `researching`, `ready`, `failed`), `saves`, `candidates`, `recommended_candidate_ids`, nullable `selected_candidate_id`, nullable `clarification`, `messages`, and `decisions`. A `SavedPost` has `id`, `source_url`, nullable `place_name`, `note`, and `created_at`. A `Candidate` has `id`, `restaurant`, `menu_url`, `score_result` using the existing `/score` response, `evidence`, nullable `recommendation_reason`, and optional `directions_url`. `Evidence` has `id`, `url`, `quote`, `kind` (`menu`, `review`, `diet_site`), and `checked_at`. `Message` has `id`, `role` (`user` or `assistant`), `text`, and `created_at`. `DecisionTrace` has `id`, `stage`, `model`, optional `choice` and `confidence`, `evidence_ids`, `duration_ms`, and `created_at`. Optional and nullable values mean “unavailable”; show a plain missing-state label or omit the detail, never fill in guessed distance, map time, source, or diet safety.

## Screens and interactions

1. **Start and capture.** Offer destination and dietary, budget, and free-text preference inputs. Create a trip, then accept a social-post URL with an optional note or pasted context. Send it through `POST /trips/{id}/messages` with `source_url` and meaningful `text`. Show saved post cards from `trip.saves`, including source link, server-extracted place name if present, and note. Do not scrape a logged-in social feed in the browser. A user should be able to paste more than one saved link into the same trip.
2. **Preferences and clarification.** Show the current server preferences plainly. To change them, send a natural-language message such as “Make this vegan and under $25”; there is no separate preferences-write endpoint. Let the user answer `trip.clarification` from the same composer when status is `needs_clarification`. Display messages and the server's `reply` in conversation order. Do not claim a preference changed until the returned `Trip` reflects it.
3. **Research and recommendations.** Show `saved`, `researching`, `ready`, and `failed` as distinct states, with a visible refresh or bounded polling while research runs. Render recommended cards in the order of `recommended_candidate_ids`, resolving each ID against `candidates`; show other candidates separately without adding a client ranking. Mark the recommended candidates; show the server's `recommendation_reason` if present. For each candidate, expose the restaurant, menu URL, score and confidence, and per-dish yes/no/unclear badges with their confidence and source. Where evidence exists, show short source quotes, kind, checked time, and clickable original URLs. Show `before_escalation` and final confidence when supplied, so users can see what research changed. A directions link appears only when `directions_url` is provided. Never imply that a source quote proves an allergen is absent.
4. **Selection and recall.** A “choose this place” action posts `selected_candidate_id` with the user's action text and stable message ID. The selected state is confirmed by `trip.selected_candidate_id`. Keep the message composer available for follow-up questions and later recall. Reserve a clear microphone/voice control mounting point for the voice integration owner; agree on a small prop or callback boundary using current `Trip`, send-message action, and returned reply. Do not build voice transcription, speech synthesis, or a separate voice API in this slice.
5. **Existing score path.** Keep a direct restaurant/menu URL/diet form calling real `POST /score`, with an accessible result view. This is the dependable P0 demo path and lets the team demonstrate per-dish Jev scoring even if trip research is still integrating. Trip cards should reuse that result presentation where practical.

Make every send button disable or indicate progress while its request is pending. Show network, authentication, and server failures next to the failed action, with a retry that preserves the same message ID. Keep unsubmitted inputs intact. Label local fixtures **“Sample data — no live call”** and remove or hide them from the judged demo route. Do not silently switch to fixtures after a live failure. Use semantic buttons, labeled fields, visible focus, readable uncertainty colors plus text, and a narrow-screen layout that works on a phone.

## Delivery sequence and checks

Prioritize the live `/score` form and result first, then trip create/save/refresh, then server-ranked cards and selection, then voice mounting support. Coordinate endpoint availability early with the API owner; use documented fixtures only to develop layout until real endpoints are reachable. Run the project's existing build and any relevant checks. Manually verify one real menu score, one trip with two saved links, a clarification response if the server produces one, a returned recommendation with source links, selection persisted after refresh, an `unclear` dish, and a failed request with retry. Report which calls were real and any backend-dependent case you could not exercise. Ask the delivery owner to update shared README setup for any new run step rather than editing outside `web/`.

Target **2:15 PM PT** for the integrated core, **2:35** for voice boundary and final fixes, **2:40** code freeze, **2:50** rehearsal, and **2:55** submission. The corrected deadline is **3:00 PM PT, September 26, 2026**. Sponsor credits are available; the UI still must reflect actual service responses. The current repository guidance uses these same checkpoints.

Use a fresh branch per logical slice, for example:

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c codex/frontend-score
# edit only web/
git add web/
git commit -m "Build live menu scoring page"
git push -u origin codex/frontend-score
gh pr create --base main --fill
```

For the next slice, sync `main` again and create `codex/frontend-trip` or another descriptive `codex/frontend-<slice>` branch. Stage explicit `web/` paths, inspect the diff, and call out any API contract discrepancy in the PR description. Keep each PR reviewable; resolve material CodeRabbit findings and obtain peer review, then let the delivery owner merge. If the bot is unavailable, report that and use the delivery owner's documented peer-review and verification fallback. Do not push directly to `main` or force push. Existing CodeRabbit configuration PR #3 is another teammate's work; avoid touching it.
