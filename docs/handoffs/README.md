# Individual implementation handoffs

Give each teammate the corresponding document. Each starts with instructions they can paste into their AI agent and covers only their own implementation, dependencies, checks, and pull requests.

| Recipient | Handoff |
| --- | --- |
| Designer / frontend | [01-frontend-designer.md](01-frontend-designer.md) |
| AI / backend engineer | [02-ai-backend.md](02-ai-backend.md) |
| Fourth teammate: GitHub, CodeRabbit, delivery | [03-github-delivery.md](03-github-delivery.md) |
| Nikhil: integrations | [04-nikhil-integrations.md](04-nikhil-integrations.md) |

These are implementation instructions, not claims that the application is already built. They incorporate Nikhil's corrections: **3:00 PM Pacific deadline**, sponsor credits available, **Jev owns all AI semantic decisions**, and regular pull requests for shared code.

The [shared contract](../architecture.md) is canonical. Existing `POST /score` consumers remain supported. The [roadmap](../roadmap.md) has current checkpoints. Use a branch per coherent slice, open a PR early, review and merge runnable slices, then start the next slice from updated `main`. No direct pushes to `main`.

Directory ownership replaces guesses about GitHub usernames: Nikhil assigns names to the other three roles. Provider credit availability does not mean credentials or webhooks are already configured; each integration owner verifies an actual call.

All AI judgments use Jev. Parsing, validation, arithmetic, permissions, budgets, storage, and honoring explicit human choices remain ordinary code. Generative models may extract candidate facts or phrase an approved result. They cannot become an alternative planner or recommender when Jev is unavailable.
