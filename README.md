# JEVATHON SF 2026

Team project for the [JEVATHON SF hackathon](https://app.notion.com/p/coderabbit/JEVATHON-Jev-Hackathon-SF-3e796e76cda18143b74af9944bc5cddc)
(Saturday, September 26, 2026, CodeRabbit HQ). Hacking ends at **2:30 PM PT**.

## The idea

**Restaurant menus you can trust for your diet.** Yelp and Google diet tags are
unreliable, and anyone who is vegan, vegetarian, or gluten-free has learned that
the hard way. We pull the restaurant's actual menu, and Jev decides dish by
dish whether it fits your restriction, with a confidence score. When Jev is
unsure, we escalate: pull reviews and diet-specific sites (HappyCow, review
text) and score again.

- **User:** a traveler or local with a dietary restriction choosing where to eat.
- **Why Jev:** each dish is a typed, fast judgment (`yes` / `no` / `unclear` +
  confidence). An LLM per dish is slow and costly; Jev answers in under a second
  for a fraction of a cent, so we can score whole menus live.
- **Interfaces:** web page for the demo; iMessage via Photon for real use.

## How it works

```
restaurant + diet
      │
      ▼
Browserbase ── fetch menu text ──► scorer: split into dishes
                                        │
                                        ▼
                         Jev: fits diet? (yes/no/unclear + confidence)
                                        │
                   many unclear dishes or low confidence?
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
| `backend/menu_fetch/` | Backend A | Browserbase / Stagehand menu and review extraction |
| `backend/scoring/` | Backend B | Jev questions, per-dish scoring, restaurant aggregate, API |
| `web/` | Designer | Results page and demo screen |
| `photon/` | Backend B (P1) | iMessage interface |
| `data/` | David | Test set of restaurants with known answers |
| `docs/` | All | Event info, roadmap, architecture |

Folders are created by whoever writes the first file in them. Stay in your own
folder to avoid merge conflicts.

## Docs

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

To be filled in as components land.
