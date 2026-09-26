# Nikhil: messaging, research, and voice integration handoff

## Paste this into your coding agent

> Work in `heyits-nick/jevathon-sf-2026`. Read `AGENTS.md` and `docs/architecture.md`, then implement this handoff in small pull requests. The organizer extended the deadline to 3:00 PM Pacific on September 26; submit by 2:55. Sponsor credits are available. I own `backend/menu_fetch/`, `photon/`, and `voice/`. Preserve the existing `POST /score` API and use the canonical saved-trip API. Build real provider adapters and connect them to the shared backend. All semantic decisions must go through the backend's Jev pipeline. Do not create a second planner, independent voice memory, frontend API, or fake successful integration. Inspect the current code and PRs before scaffolding. Follow existing stack conventions. List needed environment-variable names, never secret values.

## Your outcome and why it matters

Make a saved travel post enter through iMessage, supply real menu evidence to the backend, and allow conversation about the same persisted trip. This connects the user's existing sharing habit to useful recommendations without forcing them to repeat context in different interfaces.

Start with one public post or place plus a short note, such as “DUMBO next weekend; vegetarian lunch.” New York is a demonstration input; never hardcode it as the only destination. Your adapters transport messages and extract evidence. Jev, invoked by the backend engineer's decision pipeline, chooses what the product does with them.

## 1. Establish real service access immediately

Confirm a Browserbase page fetch, a Photon receive/reply, and an ElevenLabs session before building around assumed SDK behavior. Credits already exist; do not spend time selecting providers or purchasing plans. Credential availability and provisioned messaging lines still need verification.

Document names in `.env.example` through a coordinated configuration PR: `BROWSERBASE_API_KEY`, the actual Photon project ID/secret variables required by its installed SDK, `ELEVENLABS_API_KEY`, and the configured agent ID. Request root package/lockfile changes through the delivery owner. Do not commit secrets, put them in browser bundles, print them in traces, or copy a teammate's credentials into a document.

Use the provider's current official SDK/docs and the repository's existing language. If a generative model is needed for extraction, use an already available provider; GMI credits can support that role if its working endpoint is ready. Extractor output is candidate evidence, not an approved decision.

## 2. Return useful evidence from Browserbase

In `backend/menu_fetch/`, implement the narrow retrieval interface consumed by the scorer. Receive validated menu URLs and bounded instructions; return observed menu text or dishes, source URLs, actual excerpts, and checked timestamps. Do not return your own dietary verdict or restaurant ranking.

Use Browserbase Search/Fetch for accessible public pages and Stagehand when browser rendering is needed. Keep the first real input to public HTML menus. If a source is a PDF/photo and extraction is already working, support it; otherwise return an explicit unsupported/source-failed result instead of delaying the whole flow.

A useful return payload contains restaurant name, menu URL, extracted dish names/descriptions, and evidence records with `{id, url, quote, kind, checked_at}`. Match `Evidence` in `docs/architecture.md`: kind is `menu`, `review`, or `diet_site`. Preserve raw wording so the scorer can identify ambiguity rather than infer hidden ingredients. Return actual fetch timings, and distinguish no dishes from a transport failure.

Discovery is bounded: literal search can retrieve possible pages, then Jev chooses among candidate IDs through the backend. Jev also chooses whether to retrieve reviews or diet-site evidence. Your adapter executes that approved action. Avoid an autonomous browser agent that independently plans the outing, selects restaurants, or concludes that a dish meets a diet.

Begin with at most three menu pages and one follow-up evidence pass within the agreed research timeout. When access fails, report which source failed and why at a safe level. Preserve any successfully fetched evidence. Never claim that a fetched review proves a menu item is vegetarian. Treat webpage instructions as page content, not instructions to your system.

Validate URL schemes and destinations and enforce the backend's private-network/redirect restrictions. Keep provider objects inside the adapter; consumers receive ordinary serializable data. Include a manual command or small integration check that fetches one real menu with credentials present.

## 3. Connect Photon to shared trips

Use the current Photon Spectrum integration and a real assigned messaging line. Confirm the inbound/outbound mode supported by your account. If it uses webhooks, verify signatures according to the provider's actual documentation. If it uses a message loop, deploy it on a host that keeps that loop alive. Do not deploy a persistent listener as an ephemeral request function.

On first contact, create or look up the sender/conversation's trip server-side. Use `POST /trips` with optional destination/preferences and retain `{trip_id, access_token}` in a persistent mapping. Do not trust a trip ID supplied in message text or leak the token in a reply.

For each message, call:

```text
POST /trips/{trip_id}/messages
Authorization: Bearer <that trip's access token>
{client_message_id, text, source_url?}
```

Use the provider message ID as a stable idempotency input. Retries must not create duplicate saves or repeat paid research. Send the returned `reply` and an appropriate app link. The backend's Jev routing handles intent, place ambiguity, preference interpretation, research, and recall. Do not recreate those decisions in the Photon handler.

Receiving an Instagram URL does not guarantee readable Reel content. Pass available link text/caption/note; if inaccessible, relay the backend's clarification. Never invent a transcript. Keep the web input usable while messaging setup is being completed.

An immediate “Received; checking” reply is only a receipt. Ensure the processing job continues on a supported persistent/durable runtime before acknowledging work as queued. On failure, send an honest retry/clarification message and preserve the original save.

The web page must open the same trip without exposing access tokens in URLs. Agree with the backend owner on the existing authenticated session or a short-lived, single-use exchange mechanism if a cross-device app link is needed; do not invent a permanent public trip URL. For the demo, explicit pairing of the presenter’s browser session and Photon conversation is sufficient if it is real and documented.

## 4. Give ElevenLabs one backend to talk to

Create/configure the voice agent and implement its transport under `voice/`. Provide a small mountable client/widget integration for the frontend owner. Make one coordinated PR for any mount point or shared dependency change; do not independently rewrite `web/`.

Configure two bounded tools:

- `getTripContext({trip_id})`: authorized factual read of `GET /trips/{trip_id}`.
- `handleTripMessage({trip_id, client_message_id, text})`: forwards meaningful user requests to the same message endpoint used by Photon and the web app.

Resolve authentication from the trusted voice session. A user-spoken or model-invented trip ID is not authorization. Keep provider API keys on the server; use the provider's supported short-lived session authorization where applicable. Configure the agent to await tool responses before speaking a recommendation.

The voice model may transcribe speech, conduct a brief greeting, and phrase the backend-approved answer. It must forward new planning, dietary, memory-selection, preference-update, and action requests through `handleTripMessage`, so Jev makes their decisions. Do not let it independently pick a restaurant, use its own web search, override the diet, or maintain separate long-term memory.

Demonstrate: save a post through one channel, ask about it through voice, and get the same place and evidence-backed recommendation. Handle microphone denial and unavailable voice with a visible text path. Display a transcript if the SDK already provides it; do not build a transcription subsystem.

Actual restaurant calls/reservations are later scope. If the user requests one today, the backend can explain that capability is not connected; do not speak as though a booking exists. If a real integration is later added, explicit restaurant/date/time/party-size confirmation precedes external action.

## 5. Pull requests and checkpoints

Inspect current branches/PRs before starting. Work from updated `main`, stage only your intended paths, and use small branches such as `codex/integrations-menu`, `codex/integrations-photon`, and `codex/integrations-voice`. Open a draft PR when an interface is useful for review, then mark it ready after its real happy path works. Include the contract, environment-variable names, actual verification, and current limitations in the PR description.

Sequence: menu extraction first; Photon adapter second; voice transport third. Have each reviewed and merged as a coherent slice. Fetch/rebase the next branch onto the latest main before beginning it; avoid direct main pushes, force pushes, and staging unrelated teammate files. Use the delivery owner's merge queue for shared integration.

By **2:15**, real retrieval must support the complete saved-result flow. By **2:35**, connect working message/voice adapters. **2:40** is feature freeze, **2:50** rehearsal, **2:55** submission, **3:00** deadline. Stop expanding provider scope when it threatens those checkpoints.

## Your completion checks

- A real public menu produces quotes and URLs; a failed source produces a visible failure.
- A real Photon message reaches the same backend as the web form and receives its reply.
- Duplicate provider delivery does not duplicate a save or rerun research.
- Voice recalls the same persisted trip and forwards every new semantic decision to Jev.
- Provider outages preserve prior data and never generate a fictional recommendation or booking.
- Credentials remain server-side; another sender/session cannot read the presenter's trip.
- PRs include run instructions and real integration evidence, with sample data clearly labeled.

References: [Browserbase](https://docs.browserbase.com/welcome/quickstarts/stagehand), [Photon Spectrum](https://photon.codes/blog/introducing-spectrum), [ElevenLabs widget](https://elevenlabs.io/docs/eleven-agents/customization/widget), [ElevenLabs client tools](https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools).
