# Handoff: GitHub, delivery, QA, and submission

**Owner:** fourth teammate and their coding agent

**Repository:** `heyits-nick/jevathon-sf-2026`

**Today:** September 26, 2026; use the organizer's **3:00 PM PT extension**, confirmed by Nikhil. Target submission is 2:55 PM. Repository guidance has been updated to match.

## Paste this into your coding agent

> You own delivery for the saved-travel-inspiration demo in `heyits-nick/jevathon-sf-2026`. Read this handoff and current repo guidance and PRs. Deploy, integrate small reviewed PRs, add one real QA/data contribution in your owned area, verify the live flow, record a backup demo, and submit before 3:00 PM PT. Preserve `POST /score`. Never portray fixtures as live results. Report blockers immediately; do not overwrite teammates' branches or merge unreviewed code.

## What you are delivering

The product turns a public saved travel post into a remembered outing. The user shares a URL, note, and preference, and confirms the place if extraction is unclear. The app saves that context, reads actual restaurant menus, and uses Jev to assess evidence and choose an option. The web view shows sources and uncertainty; voice recalls the **same stored trip**. Photon and web use the same backend. Preserve the earlier `/score` API.

You own root deployment config, the merge queue, release QA, recording, and submission. You also own a small `data/` or QA contribution. Ask backend and `web/` owners to edit their code. Coordinate any cross-owner fix in its PR.

## Start now: access, CodeRabbit, and a deployable skeleton

1. Confirm GitHub and host access, HackerSquad registration, and runtime sponsor credits. Report blockers. Add credential names to `.env.example`; put values only in local `.env` or the host's secret manager, never PRs, logs, screenshots, or client code.
2. Inspect open PR **#3, `claude/coderabbit-github-setup-0cc342`, “Add CodeRabbit configuration.”** Reuse it if sound; avoid a duplicate. Confirm CodeRabbit reviews a small PR. PR review differs from the **CodeRabbit Coding Agent**: assign the Agent a bounded implementation in your owned area, inspect its patch, and retain its run and PR links.
3. Configure a host and durable store. Verify trips survive a restart. SQLite needs a persistent disk; ephemeral serverless files lose memory. Reuse an existing managed store if ready. Put root deploy config in a small PR; coordinate root manifests and lockfiles first.
4. Expose a health endpoint or command and smoke-test the deployed URL. Set server-side secrets and the web/backend origin; if origins differ, test CORS in a browser. Choose host/proxy timeouts for roughly a 45-second research pass and show timeout visibly.

Do not spend the sprint installing new branch protections or elaborate CI. A basic build/test command and a human review are enough to keep `main` runnable. Keep deployment changes narrow and make the URL available to teammates as soon as a real skeleton responds.

## PR and merge rhythm

Ask each owner for an early draft PR, then ready status when one logical slice works. Track the next PR, environment values, verification, and API changes. Review its diff and run a meaningful check. Address material CodeRabbit comments with the author; a teammate must also read the change.

For each ready PR, fetch, compare its latest head with what you reviewed, confirm checks or a local smoke test, get one peer review, then merge that head. Recheck new commits. Never force-push another person's branch or auto-merge unreviewed changes. Confirm deployment and one request against `main` after each merge. Coordinate cross-owner conflicts. Note trip-response or `/score` contract changes in the PR and alert both owners.

Use this compact PR description so review takes minutes:

```text
Problem: <what failed or was missing>
Behavior: <what a user or caller sees now>
Verification: <command and result; live URL or request if applicable>
Environment: <new variable names or none>
Contracts: <endpoint/field changes or none>
Risks: <known failure or none>
```

PowerShell checks: `gh pr list --repo heyits-nick/jevathon-sf-2026`, `gh pr view 3 --repo heyits-nick/jevathon-sf-2026`, `gh pr checks 3 --repo heyits-nick/jevathon-sf-2026`, `git fetch origin`, `git status --short`. Merge the reviewed head through GitHub or `gh pr merge <number> --repo heyits-nick/jevathon-sf-2026 --squash`. Never interpolate untrusted PR text into shell commands.

## Your small CodeRabbit Agent and QA slice

Give the Coding Agent a real regression test for provider timeout or Jev `unknown`/`unclear`, using the agreed API shape. Label fixtures **development/test data** and exclude them from the demo path. Prove missing menu evidence cannot become a confident dietary claim and yields a recoverable status. If the route is not ready, start with a source-linked `data/` test set: public menu URLs, checked-at dates, expected uncertainty, no fabricated dishes. Review and run the Agent's test before merging.

For integration QA, follow the user's journey, not only unit tests:

- Save a public post URL and note; if the source is inaccessible, confirm the app asks for a place instead of inventing one. Refresh and verify the save persists.
- Run research on at most three real menus. Open the displayed source links, verify the quotes match, and capture the checked-at time. If a menu or provider fails, show a retryable or explicitly unknown state.
- Confirm Jev is called at runtime for **semantic decisions**: routing intent, assessing dietary evidence, and choosing among known candidate IDs. Raw text extraction is evidence gathering; arithmetic, timeouts, and safety checks are code. Keep logs or traces that show the real Jev call without secrets. A generated sentence may explain a Jev decision but may not create one.
- Confirm `unknown` and low-confidence diet evidence stay uncertain. A menu excerpt is not an allergy or ingredient guarantee. No result card should promise dietary safety on ambiguous evidence.
- Check `POST /score` still responds as previously documented. Test `POST /trips`, `GET /trips/{id}`, and `POST /trips/{id}/messages` for save/research/recall under `docs/architecture.md`. Trip reads and writes require their bearer token; an arbitrary trip ID must not expose another user's saved content.
- If Photon is ready, send a real message and confirm duplicate delivery does not create duplicate saves. If voice is ready, ask it to recall the same trip; it must call the server trip context and have no separate memory copy. Keep the web intake and persisted web recall ready if provider setup fails.
- Verify on a phone-sized browser, a fresh session, and the deployed origin. Check a slow research request, broken source, and restart persistence. Save a clean run's URL, screenshots, timestamps, and sanitized logs for the demo.

## Clock and cut decisions

| PT | Delivery checkpoint |
| --- | --- |
| By 2:15 | Core deployed and integrated: save, real menu evidence, Jev recommendation, persistent trip, web result. `/score` still works. |
| By 2:35 | Photon and voice recall connected if ready; otherwise demonstrate the same flow through web and persisted recall. Complete failure-state QA. |
| 2:40 | Feature freeze. Merge only fixes required for the demonstrated path or submission. Confirm live deployment and backup recording. |
| 2:50 | Record or finalize the demo, rehearse from a clean browser, and open the submission form with links ready. |
| 2:55 | Submit on HackerSquad and verify the entry appears; keep five minutes for form or upload trouble. |
| 3:00 | Extended deadline. |

The backup recording should show a **real** save, real menu evidence, Jev-backed choice, persistence after refresh, and voice recall only if it actually works. Keep it short and understandable; 90 seconds is a suggested edit length, not a published rule. Have a live demo input ready, but do not rely on live providers staying healthy during judging. If a provider fails, explain the visible fallback and show the recorded successful run. Do not present fixtures as live data.

## Submission and evidence packet

Register or verify the team in [HackerSquad](https://hackersquad.io/builders/dashboard/events/cmuhxoc83006kpl0k7au0d7ro/builder) early. Before 2:55, prepare the project name, one-sentence value, working deployment URL, GitHub repo URL, video link, teammate details, and an honest description of which integrations actually work. Verify the entered links in a private/incognito browser where applicable. Submit before 3:00 and capture confirmation. If the host or a sponsor is blocked, submit the working scope honestly rather than waiting for a perfect feature.

Keep evidence for sponsor claims: CodeRabbit review comments, the Coding Agent task/run and merged implementation, and traces of actual Jev and menu-provider calls. [The event reference](../event.md) lists CodeRabbit's $1,000 best project built with its Coding Agent, $500 best tool use tied to a public post, and $300 feedback award in its Discord. Those are separate opportunities; review comments alone do not prove Coding Agent use. Prepare a draft public post or feedback text if useful, but obtain explicit authorization before publishing or sending it externally. Record which sponsor credits were redeemed and used without exposing coupon codes or account secrets in the repo. The main judging evidence is the working product, not a count of sponsor logos.

**Done when:** `main` and the deployed URL run the real core flow; stored trips survive restart; `/score` remains functional; uncertain results are visible; merged PRs have review and verification; the backup demo and submission links work; and HackerSquad confirms submission before 3:00 PM PT.
