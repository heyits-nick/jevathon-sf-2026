# Photon iMessage adapter

Run with Node 25 on a persistent host. The Spectrum SDK maintains a live
message connection, so this process must stay running. Configure the root
`.env` with `PHOTON_PROJECT_ID`, `PHOTON_PROJECT_SECRET`, and `API_BASE_URL`.
`API_BASE_URL` is the backend origin, optionally with a path prefix such as
`https://example.com/api`. Use a private persistent disk for
`PHOTON_STATE_PATH` if the default `photon/.local/state.sqlite` will not
survive restarts or deployment. The SQLite file holds per-trip access tokens.

From the repository root:

```powershell
npm ci --prefix photon
npm test --prefix photon
node --env-file=.env photon/src/index.mjs
```

The presenter sends a text or link to the Photon project's assigned iMessage
line. The adapter creates a backend trip on first contact and sends each
inbound message to `POST /trips/{trip_id}/messages` with a stable idempotency
ID. The backend reply is sent back in the same iMessage conversation. Only
the backend interprets requests or chooses recommendations. An unreadable
shared post is relayed to the backend for clarification.

Each sender and conversation gets its own token. A duplicate delivery does
not call the backend or send a second reply after a successful send. An
interruption between provider acceptance and the local `sent` update can
still repeat an outbound reply on redelivery; the backend request stays
idempotent. On startup, the adapter retries up to 100 unfinished deliveries
from SQLite, using the same backend message ID, then sends their saved reply
through the original conversation. Recovery sends as a conversation message
rather than a threaded reply. Input remains in SQLite after a backend failure. The adapter
does not provide a cross-device trip link until the web session has a safe
pairing mechanism; a bare trip URL would not authorize access.
