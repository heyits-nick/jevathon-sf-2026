import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createBackend, handleMessage, openState, recoverPending } from '../src/adapter.mjs';

function incoming(id, sender = 'alice', text = 'See https://example.com/place') {
  const sent = [];
  return {
    sent,
    space: { id: 'conversation', responding: (fn) => fn() },
    message: {
      id, sender: { id: sender }, platform: 'imessage', direction: 'inbound',
      content: { type: 'text', text }, reply: async (body) => { sent.push(body); },
    },
  };
}

test('maps each sender to a durable trip and uses stable message IDs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'photon-test-'));
  const path = join(dir, 'state.sqlite');
  let db = openState(path);
  let creations = 0;
  const calls = [];
  const backend = {
    createTrip: async () => ({ trip_id: `trip-${++creations}`, access_token: `token-${creations}` }),
    sendMessage: async (id, token, body) => {
      calls.push({ id, token, body });
      return { reply: `backend:${id}` };
    },
  };
  try {
    const a = incoming('msg-1');
    await handleMessage(db, a, backend);
    assert.deepEqual(a.sent, ['backend:trip-1']);
    assert.equal(calls[0].body.source_url, 'https://example.com/place');
    assert.match(calls[0].body.client_message_id, /^photon-[a-f0-9]{32}$/);
    await handleMessage(db, a, backend);
    assert.equal(calls.length, 1);
    db.close();
    db = openState(path);
    await handleMessage(db, incoming('msg-2'), backend);
    await handleMessage(db, incoming('msg-3', 'bob'), backend);
    assert.equal(creations, 2);
    assert.equal(calls[1].token, 'token-1');
    assert.equal(calls[2].token, 'token-2');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('keeps failed input and retries with the same backend id', async () => {
  const db = openState(':memory:');
  let attempts = 0;
  const backend = {
    createTrip: async () => ({ trip_id: 'trip', access_token: 'token' }),
    sendMessage: async () => {
      if (++attempts === 1) throw new Error('down');
      return { reply: 'real answer' };
    },
  };
  try {
    const msg = incoming('failed');
    await handleMessage(db, msg, backend);
    assert.match(msg.sent[0], /could not process/);
    await handleMessage(db, msg, backend);
    assert.deepEqual(msg.sent, [msg.sent[0], 'real answer']);
    assert.equal(attempts, 2);
    assert.equal(db.prepare('SELECT sent, text FROM deliveries').get().sent, 1);
  } finally {
    db.close();
  }
});

test('recovers stored failure after restart using the same backend id', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'photon-recovery-'));
  const path = join(dir, 'state.sqlite');
  let db = openState(path);
  const ids = [];
  let attempts = 0;
  const backend = {
    createTrip: async () => ({ trip_id: 'trip', access_token: 'token' }),
    sendMessage: async (_id, _token, body) => {
      ids.push(body.client_message_id);
      if (++attempts === 1) throw new Error('backend unavailable');
      return { reply: 'Recovered answer' };
    },
  };
  const sent = [];
  try {
    await handleMessage(db, incoming('message-to-recover'), backend);
    db.close();
    db = openState(path);
    const result = await recoverPending(db, backend, async id => {
      assert.equal(id, 'conversation');
      return { send: async text => sent.push(text) };
    });
    assert.deepEqual(result, { attempted: 1, completed: 1 });
    assert.deepEqual(sent, ['Recovered answer']);
    assert.equal(ids[0], ids[1]);
    assert.deepEqual(await recoverPending(db, backend, async () => { throw new Error('should not resolve'); }),
      { attempted: 0, completed: 0 });
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('recovery sends a persisted reply without repeating backend research', async () => {
  const db = openState(':memory:');
  let calls = 0;
  const backend = {
    createTrip: async () => ({ trip_id: 'trip', access_token: 'token' }),
    sendMessage: async () => { calls++; return { reply: 'Saved backend reply' }; },
  };
  const msg = incoming('provider-send-failed');
  msg.message.reply = async () => { throw new Error('provider down'); };
  try {
    await assert.rejects(handleMessage(db, msg, backend), /provider down/);
    assert.equal(db.prepare('SELECT sent, reply FROM deliveries').get().reply, 'Saved backend reply');
    const sent = [];
    assert.deepEqual(await recoverPending(db, backend, async () => ({ send: async value => sent.push(value) })),
      { attempted: 1, completed: 1 });
    assert.deepEqual(sent, ['Saved backend reply']);
    assert.equal(calls, 1);
  } finally { db.close(); }
});

test('recovery rotates past 100 repeatedly failing rows and migrates old state', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'photon-old-state-'));
  const path = join(dir, 'state.sqlite');
  let state = openState(path);
  try {
    state.exec('ALTER TABLE deliveries DROP COLUMN recovery_attempts');
    state.close();
    state = openState(path);
    assert.ok(state.prepare('PRAGMA table_info(deliveries)').all().some(column => column.name === 'recovery_attempts'));
    const insert = state.prepare('INSERT INTO deliveries (provider_key, scope, text) VALUES (?, ?, ?)');
    for (let i = 0; i < 101; i++) insert.run(`key-${i}`, JSON.stringify(['imessage', 'space', 'sender']), `text-${i}`);
    const backend = {
      createTrip: async () => ({ trip_id: 'trip', access_token: 'token' }),
      sendMessage: async (_trip, _token, body) => {
        if (body.text === 'text-100') return { reply: 'Recovered final row' };
        throw new Error('still unavailable');
      },
    };
    const sent = [];
    const resolveSpace = async () => ({ send: async value => sent.push(value) });
    assert.deepEqual(await recoverPending(state, backend, resolveSpace), { attempted: 100, completed: 0 });
    assert.deepEqual(await recoverPending(state, backend, resolveSpace).then(({ completed }) => completed), 1);
    assert.ok(sent.includes('Recovered final row'));
  } finally {
    state.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('requires secure backend origin', () => {
  assert.throws(() => createBackend('http://example.com'), /HTTPS/);
  assert.doesNotThrow(() => createBackend('http://localhost:8000'));
});

test('keeps an API path prefix and passes the trip bearer token', async () => {
  const calls = [];
  const backend = createBackend('https://api.example.com/api', async (url, options) => {
    calls.push({ url: String(url), options });
    return { ok: true, json: async () => ({ reply: 'ok' }) };
  });
  await backend.createTrip();
  await backend.sendMessage('trip/one', 'private-token', { client_message_id: 'x', text: 'hi' });
  assert.equal(calls[0].url, 'https://api.example.com/api/trips');
  assert.equal(calls[1].url, 'https://api.example.com/api/trips/trip%2Fone/messages');
  assert.equal(calls[1].options.headers.authorization, 'Bearer private-token');
});
