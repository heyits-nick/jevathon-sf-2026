# JEVATHON SF 2026

Team project for the [JEVATHON SF hackathon](https://app.notion.com/p/coderabbit/JEVATHON-Jev-Hackathon-SF-3e796e76cda18143b74af9944bc5cddc)
(Saturday, September 26, 2026, CodeRabbit HQ). Hacking ends at **3:00 PM PT**
following the organizer extension reported by Nikhil. Target submission: 2:55 PM.

## The idea

**Turn saved travel inspiration into plans you actually use.** Share a travel
post or place with the app, preserve its source and your preferences, research
nearby menus, and return a useful recommendation that you can recall later.
The existing menu scorer is the core research component: Jev evaluates actual
menu evidence dish by dish and decides whether further evidence is needed.
Voice and iMessage use the same stored trip as the web page.

- **User:** a traveler or local with a dietary restriction choosing where to eat.
- **Why Jev:** all AI judgments run through Jev: intent, place ambiguity,
  dietary fit, evidence escalation, preference fit, recommendation selection,
  and memory recall. Measure actual latency/cost; do not promise fixed numbers.
- **Interfaces:** web page for the demo; iMessage via Photon for real use.

## How it works

Shared post / place -> saved trip -> real menu evidence -> Jev decision ->
persisted recommendation -> recall through web, iMessage, or voice.

The menu-scoring core remains:

```
restaurant + diet
      │
      ▼
Browserbase ── fetch menu text ──► scorer: split into dishes
                                        │
                                        ▼
                         Jev: fits diet? (yes/no/unclear + confidence)
                                        │
                    Jev: retrieve additional evidence?
                           │ no                 │ yes
                           ▼                    ▼
                        results        Browserbase: reviews / HappyCow
                                                │
                                                ▼
                                     Jev re-scores ──► results
```

Details: [docs/architecture.md](docs/architecture.md).

## Repository layout

| Path | Owner | What |
|---|---|---|
| `backend/menu_fetch/` | Nikhil / integrations | Browserbase / Stagehand menu and review extraction |
| `backend/scoring/` | AI / backend | Jev questions, per-dish scoring, restaurant aggregate, API |
| `web/` | Designer | Results page and demo screen |
| `photon/` | Nikhil / integrations | iMessage transport into the shared backend |
| `voice/` | Nikhil / integrations | ElevenLabs transport into the shared backend |
| `data/` | Delivery / QA | Clearly labeled test cases and source references |
| `docs/` | All | Event info, roadmap, architecture |

Folders are created by whoever writes the first file in them. Stay in your own
folder to avoid merge conflicts.

## Docs

- [Individual handoffs](docs/handoffs/README.md): separate instructions for each teammate and their AI agent
- [docs/event.md](docs/event.md): schedule, judging rubric, prizes, sponsor tools, links
- [docs/roadmap.md](docs/roadmap.md): priorities, checkpoints, what is out of scope
- [docs/architecture.md](docs/architecture.md): components and data flow
- [AGENTS.md](AGENTS.md): rules for AI coding agents working in this repo

## Team workflow

- Small branches, small pull requests, merge fast. No long-lived branches.
- CodeRabbit reviews every PR (install the CodeRabbit GitHub app on this repo).
- Never commit API keys. Put them in `.env` (git-ignored) and document the
  variable names in `.env.example`.

## Setup and demo

Provider adapters use Node 25, with credentials in an ignored root `.env`.
Copy variable names from `.env.example`, then follow the
[integration runbook](docs/integration-runbook.md) for Browserbase, Photon,
and ElevenLabs setup, backend hookup, and live verification.

The trip backend URL goes in `API_BASE_URL`. Provider adapters do not replace
the backend: Jev decisions and persisted trip state remain there.
