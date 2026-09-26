import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Spectrum } from 'spectrum-ts';
import { imessage } from 'spectrum-ts/providers/imessage';
import { createBackend, handleMessage, openState, recoverPending } from './adapter.mjs';

for (const name of ['PHOTON_PROJECT_ID', 'PHOTON_PROJECT_SECRET', 'API_BASE_URL']) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}

const statePath = resolve(process.env.PHOTON_STATE_PATH ?? fileURLToPath(new URL('../.local/state.sqlite', import.meta.url)));
mkdirSync(dirname(statePath), { recursive: true });
const db = openState(statePath);
const backend = createBackend(process.env.API_BASE_URL);
const app = await Spectrum({
  projectId: process.env.PHOTON_PROJECT_ID,
  projectSecret: process.env.PHOTON_PROJECT_SECRET,
  providers: [imessage.config()],
});

// Process one delivery at a time so a new conversation cannot create two trips.
const recovery = await recoverPending(db, backend, id => imessage(app).space.get(id));
console.log(`Photon message loop connected; recovered ${recovery.completed}/${recovery.attempted} pending deliveries`);
for await (const [space, message] of app.messages) {
  try {
    await space.responding(() => handleMessage(db, { space, message }, backend));
  } catch {
    // Errors may contain provider secrets or trip tokens; keep logs content-free.
    console.error('Photon delivery failed; retry the inbound message');
  }
}
