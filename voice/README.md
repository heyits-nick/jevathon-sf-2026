# Jevathon voice adapter

Node 25 and a browser with microphone access are required. This adapter uses the same saved-trip bearer token as the web app; the token is never placed in a URL. The ElevenLabs API key remains on the Node server. Its client tools call the server, which checks the token with the backend for every operation. The agent speaks the backend's approved `reply`.

Environment variable names (put values in the ignored root `.env`): `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `API_BASE_URL`, and optionally `VOICE_PORT` (default 8788), `VOICE_HOST` (default 127.0.0.1), `VOICE_ALLOWED_ORIGIN` (exact web origin when mounted cross-origin). The delivery owner should copy these names to root `.env.example`.

```powershell
node --env-file=../.env configure-agent.mjs
node --env-file=../.env server.mjs
```

Run from `voice/`. On first configuration, copy the printed agent ID to `ELEVENLABS_AGENT_ID` in `.env`. Later runs update that named agent. To update a specifically supplied agent ID whose existing name differs, run `node --env-file=../.env configure-agent.mjs --update-existing`; this preserves its existing name. The script never prints the key. Open `http://localhost:8788/`, enter an existing trip ID and trip token, then click **Start voice**. The text field still works if the microphone or ElevenLabs is unavailable. The backend must implement the canonical `GET /trips/{id}` and `POST /trips/{id}/messages` contract.

For the existing Next.js trip composer, mount with `showTextFallback: false`: its own message field remains the text fallback, and the voice buttons have `type="button"` so they cannot submit the composer. In `web/src/components/trip/trip-app.tsx`, replace the unused external `voiceSlot` prop with `voiceSlot={<VoiceControl tripId={trip.id} onTrip={refresh} />}`. The `VoiceControl` client component should read `loadTripSession()` after mount, require `session.tripId === tripId`, and load `http://localhost:8788/voice-client.mjs` as a module script. On script load, call:

```ts
const dispose = window.JevVoice.mountVoice(container, {
  tripId,
  accessToken: session.token,
  voiceBase: 'http://localhost:8788',
  onTrip,
  showTextFallback: false,
});
```

Call `dispose()` on unmount; keep the token out of URLs. The hook's `refresh` callback updates the visible trip after a voice message. Set `VOICE_ALLOWED_ORIGIN=http://localhost:3000` for the separate Next dev origin, and set voice `API_BASE_URL` and web `BACKEND_API_URL` to the same backend origin. For production, serve the voice route behind the same app origin and HTTPS; the module loads the official `@elevenlabs/client` SDK from esm.sh only after Start is clicked. The standalone demo keeps its own text form when that SDK is unavailable.

The bridge exposes `POST /trips/:id/session`, `GET /trips/:id/context`, and `POST /trips/:id/message` with the same bearer auth. Context exposes factual status/counts, not a separate recommendation engine. The client tool arguments remain `{trip_id}` and `{trip_id,client_message_id,text}`. The browser rejects a model-supplied trip ID different from the active trip; the server verifies it too. No private agent session is created until a user clicks Start.

Focused local check: `node --test test.mjs` uses a fake backend and ElevenLabs response. A live ElevenLabs microphone check still requires credentials, a configured agent, and a working saved-trip backend.
