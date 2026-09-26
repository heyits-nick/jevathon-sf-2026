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
node --env-file=.env photon/src/receiving-line.mjs
node --env-file=.env photon/src/index.mjs
```

Set `PHOTON_TEST_RECIPIENT` in the local `.env` to the presenter's approved
iMessage phone number in international format. The receiving-line command
looks up its assigned Photon number without changing the project or sending
a message. If it says the presenter is not registered, register that approved
number once with:

```powershell
node --env-file=.env photon/src/receiving-line.mjs --register-approved
```

The command prints the assigned receiving number. With the listener running,
the presenter sends a text or link to that number. The adapter creates a
backend trip on first contact and sends each
inbound message to `POST /trips/{trip_id}/messages` with a stable idempotency
ID. The backend reply is sent back in the same iMessage conversation. Only
the backend interprets requests or chooses recommendations. An unreadable
shared post is relayed to the backend for clarification.

Free/Pro shared-pool projects require the presenter's iMessage-linked handle
under **Project → Users**. If the phone number does not match the handle Apple
uses, [Photon's debug line](https://debug.photon.codes) reports the actual
phone or email handle. The CLI currently registers phone numbers only.

Each sender and conversation gets its own token. A duplicate delivery does
not call the backend or send a second reply after a successful send. An
interruption between provider acceptance and the local `sent` update can
still repeat an outbound reply on redelivery; the backend request stays
idempotent. On startup, the adapter retries up to 100 unfinished deliveries
from SQLite, choosing the least retried first. It uses the same backend message ID, then sends their saved reply
through the original conversation. Recovery sends as a conversation message
rather than a threaded reply. Input remains in SQLite after a backend failure. The adapter
does not provide a cross-device trip link until the web session has a safe
pairing mechanism; a bare trip URL would not authorize access.
