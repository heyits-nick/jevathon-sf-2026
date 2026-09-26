# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Devin, CodeRabbit
Coding Agent, Cursor, Windsurf, and others) working in this repository.

## Context

This is a one-day hackathon project. Hacking ends at **2:30 PM PT on
2026-09-26**. Working code beats polish. Read [README.md](README.md) for the
idea and [docs/roadmap.md](docs/roadmap.md) for current priorities before
starting work.

## Rules

1. **Scope.** Build only what the task asks for. Work on the highest open
   priority in `docs/roadmap.md` (P0 before P1 before P2). Do not start P2 or
   out-of-scope items (transit routing, Instagram scraping, restaurant booking).
2. **Stay in your folder.** Each person owns a folder (see the layout table in
   README.md). Do not edit another owner's folder without being asked.
3. **No secrets in git.** API keys go in `.env`, which is git-ignored. Add new
   variable names (never values) to `.env.example`.
4. **No fake behavior.** Judges penalize hard-coded responses and mocked flows.
   Every result shown in the demo must come from a real call. Sample data is
   fine for UI development only and must be clearly labeled as sample data.
5. **Handle failure visibly.** When Jev returns `unclear` or low confidence,
   escalate or show it as uncertain. Never round uncertainty up to a yes.
6. **Small commits and PRs.** One logical change per PR so CodeRabbit can
   review it quickly. Keep `main` runnable.
7. **Keep the interfaces stable.** The API contract in
   [docs/architecture.md](docs/architecture.md) is shared by the backend and the
   web page. Change it only with a note in the PR description.

## Jev usage

Jev (TypeSafe AI) returns typed values with confidence scores, not free text.
Use it for decisions (classify, score, route). Use a generative LLM only where
text must be written, such as a summary line, and only after Jev has decided.
Check the Jev console docs for the exact question format before writing code
against it.

## Definition of done for a task

- It runs end to end against real services.
- `README.md` setup section says how to run it.
- New environment variables are listed in `.env.example`.
