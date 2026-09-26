# Roadmap

Default plan. Change it as a team; keep this file current so agents follow it.

## P0: core loop (target 1:30 PM)

- [ ] Browserbase fetches a restaurant's menu page and returns dish text
- [ ] Split the menu into dishes (name + description)
- [ ] Jev scores each dish for the chosen diet: `yes` / `no` / `unclear` + confidence
- [ ] Aggregate into a restaurant score
- [ ] API endpoint returns the result (contract in architecture.md)
- [ ] Web page shows per-dish badges and the restaurant score
- [ ] Test set: 5–10 restaurants with known answers in `data/`

## P1: what makes the demo (target 2:00 PM)

- [ ] Escalation: low-confidence restaurant triggers a review / HappyCow fetch and a Jev re-score
- [ ] Confidence meter visibly rising after escalation
- [ ] Latency and cost shown on screen (Jev ms per dish)
- [ ] iMessage via Photon. Cut if not working by 1:45 PM.

## P2: only if P1 is done

- [ ] Instagram input: user pastes post links, we extract restaurant names (no Instagram scraping)
- [ ] PDF or photo menus via LlamaParse

## Out of scope today (roadmap slide only)

- Transit choice (Uber / bus / BART with budget and preferences)
- Restaurant booking
- Instagram feed scraping

## Checkpoints

| Time | Checkpoint |
|---|---|
| 1:30 PM | One real restaurant scored end to end |
| 2:00 PM | Escalation working |
| 2:10 PM | Feature freeze; record a backup demo video |
| 2:20 PM | Submitted on HackerSquad |

## Known risks

- PDF or image menus break extraction. Demo on restaurants with HTML menus.
- Jev question format unverified. Check console docs first.
- Photon setup time unknown. Timebox to 1:45 PM.
