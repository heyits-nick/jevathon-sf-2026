# Current build handoffs

The organizer extended the deadline to **3:00 PM Pacific**, as reported by Nikhil. Submit by **2:55 PM**. Sponsor credits are available.

The detailed, individual instructions now live in [docs/handoffs/](docs/handoffs/README.md):

- [Designer / frontend](docs/handoffs/01-frontend-designer.md)
- [AI / backend](docs/handoffs/02-ai-backend.md)
- [GitHub / CodeRabbit / delivery](docs/handoffs/03-github-delivery.md)
- [Nikhil / integrations](docs/handoffs/04-nikhil-integrations.md)

Each document is intended to be handed directly to that teammate and their AI agent.

[docs/architecture.md](docs/architecture.md) is the shared API contract. It preserves the existing menu scorer and adds saved trips, messaging, and recall. [docs/roadmap.md](docs/roadmap.md) contains current checkpoints.

All AI semantic decisions must be made by Jev. Other models may extract candidate facts or express an already-decided answer; code enforces validation, permissions, hard limits, storage, and arithmetic. This is a build specification, not evidence of an implemented application.

The earlier 2:30 schedule and earlier draft trip endpoints are superseded. Use the canonical contract and regular small pull requests.
