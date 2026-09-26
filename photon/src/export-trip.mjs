import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createBackend } from './adapter.mjs';

const defaultState = fileURLToPath(new URL('../.local/state.sqlite', import.meta.url));
const output = fileURLToPath(new URL('../.local/presenter-trip.json', import.meta.url));

export async function exportTrip({ statePath, recipient, backend, outputPath = output }) {
  if (!/^\+[1-9]\d{7,14}$/.test(recipient || '')) {
    throw new Error('Set PHOTON_TEST_RECIPIENT to the presenter iMessage number.');
  }
  const db = new DatabaseSync(statePath, { readOnly: true });
  let matches;
  try {
    matches = db.prepare('SELECT scope, trip_id, access_token FROM conversations').all()
      .filter(row => {
        try {
          const scope = JSON.parse(row.scope);
          return scope[0] === 'imessage' && scope[2] === recipient;
        } catch { return false; }
      });
  } finally { db.close(); }
  if (matches.length !== 1) throw new Error(`Expected one presenter trip; found ${matches.length}.`);
  const { trip_id, access_token } = matches[0];
  const trip = await backend.getTrip(trip_id, access_token);
  if (trip?.id !== trip_id) throw new Error('Backend did not confirm the presenter trip.');
  mkdirSync(dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify({ trip_id, access_token }), { mode: 0o600, flag: 'wx' });
    renameSync(temporary, outputPath);
  } catch {
    rmSync(temporary, { force: true });
    throw new Error('Could not write private pairing artifact.');
  }
  return outputPath;
}

if (import.meta.main) {
  try {
    if (process.argv.length !== 2) throw new Error('Usage: node --env-file=.env photon/src/export-trip.mjs');
    if (!process.env.API_BASE_URL) throw new Error('Missing API_BASE_URL.');
    const outputPath = await exportTrip({
      statePath: resolve(process.env.PHOTON_STATE_PATH ?? defaultState),
      recipient: process.env.PHOTON_TEST_RECIPIENT?.trim(),
      backend: createBackend(process.env.API_BASE_URL),
    });
    console.log(`Private pairing file: ${outputPath}`);
  } catch (error) {
    console.error(error instanceof Error && /^(Expected one presenter trip|Set PHOTON_|Missing API_BASE_URL|Backend did not confirm|Could not write|Usage:)/.test(error.message)
      ? error.message : 'Presenter trip export failed; check backend connectivity and credentials.');
    process.exitCode = 1;
  }
}
