# Roadmap

The organizer extended the deadline to **3:00 PM PT on September 26**, as reported by Nikhil. Submit by **2:55 PM**. Sponsor credits are available; verify credentials and actual service access before depending on an integration.

## P0: working saved-post recommendation

- [ ] Preserve the existing `POST /score` contract and real per-dish menu scoring.
- [ ] Browserbase returns menu evidence with source URLs and checked times.
- [ ] Jev owns every AI judgment; code performs validation, arithmetic, and execution.
- [ ] Store a shared travel post/place and explicit dietary preferences durably.
- [ ] Ask for a place when the post cannot be understood; never invent Reel contents.
- [ ] Jev selects among eligible researched candidates and saves the recommendation.
- [ ] Web UI displays sources, uncertainty, and the saved result after refresh.
- [ ] Deploy early and connect the actual shared API across components.

## P1: continuity and richer decisions

- [ ] Jev decides whether uncertainty warrants another evidence lookup, within code-enforced limits.
- [ ] Jev re-evaluates uncertain dishes; confidence may increase or decrease.
- [ ] Photon receives a shared link/message and returns a result from the same backend.
- [ ] ElevenLabs forwards requests through the backend and recalls the same saved trip.
- [ ] Show real Jev decision traces, measured latency, and cost only when known.

## P2: only after the complete flow works

- [ ] PDF/photo menu extraction via LlamaParse if a real demonstration input needs it.
- [ ] Richer multi-post recall and itinerary planning.

## Later

Actual restaurant booking/outbound calls, accommodation booking, automatic Instagram feed import, live navigation, and proactive monitoring. Today's interface must not imply that an unimplemented action or booking succeeded.

## Checkpoints

| Time (PT) | Checkpoint |
| --- | --- |
| First 10 minutes of work | Agree owner paths, contract, credentials, and runnable skeleton |
| 2:15 PM | Integrated live save -> evidence -> Jev -> stored result |
| 2:35 PM | Messaging/voice integrated where working |
| 2:40 PM | Feature freeze; bug fixes and demo validation only |
| 2:50 PM | Successful rehearsal and backup recording |
| 2:55 PM | Submitted on HackerSquad |
| 3:00 PM | Extended deadline |

If a checkpoint has passed, proceed to the next one; do not shift submission. Scope cuts preserve real research, meaningful Jev decisions, and a usable saved result. Follow your individual document in `docs/handoffs/`.
