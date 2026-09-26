# CodeRabbit Coding Agent task: `/score` safety check

Paste the brief below as the task for the CodeRabbit Coding Agent. Start the
agent the way the event's Notion "Resources & AI Tools" page describes, using
the team's Coding Agent minutes. Keep the task link, the agent run link, and the
resulting PR link; they are the evidence for CodeRabbit's "best project built
with the Coding Agent" prize. Review comments alone do not count.

Owner: delivery / QA. The agent works only in `data/` plus variable names in
`.env.example`.

---

## Brief (paste from here)

Repository: `heyits-nick/jevathon-sf-2026`. Read `AGENTS.md`,
`docs/architecture.md` (section "Menu scoring: retain `POST /score`"), and
`data/README.md` first.

**Goal.** Add `data/run_score_cases.py`, a script that sends each case in
`data/cases/*.json` to the real `POST /score` endpoint and checks the one rule
this product cannot break: **a dish we labeled `no` or `unclear` must never come
back as a confident `yes`.**

**Constraints**

- Python 3 standard library only, plus `curl` through `subprocess` for HTTP (the
  team's macOS Python has no CA bundle, so `urllib` HTTPS fails). No new
  dependencies.
- Calls the real backend. No mocks, no stubbed responses, no fixtures presented
  as live results. If `SCORE_BASE_URL` is unset, print a clear "skipped: no
  backend configured" message and exit 0.
- Read configuration from environment variables: `SCORE_BASE_URL` (required to
  run), `SCORE_AUTH_HEADER` (optional full header line, for example
  `Authorization: Bearer ...`), `YES_MIN_CONFIDENCE` (default `0.8`). Add these
  names, without values, to `.env.example`.
- Never print the auth header or response bodies that might contain secrets;
  print case IDs, dish names, verdicts, confidences, and status codes only.
- Do not edit `backend/`, `web/`, `photon/`, `voice/`, or the case files.

**Behavior**

1. For each case, send `{"restaurant", "menu_url", "diet"}` from the case file.
   Use a 60-second timeout per request.
2. If the response is an error, check that the body matches
   `{"error": {"code", "message", "retryable"}}`. Report the code. A `422` with
   `NO_MENU_EVIDENCE` or `UNSUPPORTED_SOURCE` is an acceptable result for a
   `menu_format` of `pdf` or `image`; the menu fetcher raises
   `UNSUPPORTED_SOURCE` for non-HTML pages. A timeout or `5xx` is reported as `PROVIDER_FAILURE`, not a pass.
   Every other error response is a **FAIL**. `PROVIDER_FAILURE` also makes the
   run exit nonzero.
3. If the response succeeds, check that it has the contract fields
   `restaurant, diet, score, confidence, escalated, before_escalation, dishes,
   timing_ms` and that each dish has `name, verdict, confidence, source`.
   `jev_cost_usd` may be absent.
4. Match expected dishes to returned dishes by case-insensitive name. For each
   match:
   - **FAIL** if expected is `no` or `unclear` and the response is `yes` with
     confidence >= `YES_MIN_CONFIDENCE`.
   - **WARN** for any other mismatch (for example expected `yes`, got
     `unclear`). Being too cautious is allowed; being falsely confident is not.
   - Report expected dishes that were not returned as `MISSING` (warning).
5. If a response returns `verdict: "yes"` for a dish whose confidence is below
   `YES_MIN_CONFIDENCE`, also WARN: the UI must not show that as a yes.
6. Print a table per case and a summary line. Exit 1 on any FAIL,
   `PROVIDER_FAILURE`, or contract-shape error, otherwise 0.

**Also add** a short "Running against the backend" section to
`data/README.md` with the command, the variables, and what FAIL versus WARN
mean.

**Verification to include in the PR**

- Output of `python3 data/validate.py` (existing schema check, must pass).
- Output of `python3 data/run_score_cases.py` with `SCORE_BASE_URL` unset
  (should skip cleanly).
- If a backend URL is available, output of one real run, with any secrets
  removed.

Use this PR description format:

```text
Problem: No automated check that uncertain dishes cannot become confident yes answers.
Behavior: data/run_score_cases.py runs data/cases against POST /score and fails on false confidence.
Verification: <commands and output>
Environment: SCORE_BASE_URL, SCORE_AUTH_HEADER, YES_MIN_CONFIDENCE (names only in .env.example)
Contracts: none
Risks: <e.g. dish-name matching misses renamed dishes>
```
