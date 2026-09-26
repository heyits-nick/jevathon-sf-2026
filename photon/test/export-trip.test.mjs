import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openState } from '../src/adapter.mjs';
import { exportTrip } from '../src/export-trip.mjs';

test('exports only the authenticated presenter trip to a private file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'photon-export-'));
  const statePath = join(dir, 'state.sqlite');
  const outputPath = join(dir, 'private.json');
  const db = openState(statePath);
  try {
    for (const [sender, id] of [['+15551234567', 'presenter-trip'], ['+15559999999', 'other-trip']]) {
      db.prepare('INSERT INTO conversations VALUES (?, ?, ?)')
        .run(JSON.stringify(['imessage', `space-${id}`, sender]), id, `token-${id}`);
    }
    db.close();
    const checks = [];
    await exportTrip({ statePath, recipient: '+15551234567', outputPath, backend: {
      getTrip: async (id, token) => { checks.push([id, token]); return { id }; },
    } });
    assert.deepEqual(checks, [['presenter-trip', 'token-presenter-trip']]);
    assert.deepEqual(JSON.parse(readFileSync(outputPath, 'utf8')),
      { trip_id: 'presenter-trip', access_token: 'token-presenter-trip' });
  } finally {
    if (db.isOpen) db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
