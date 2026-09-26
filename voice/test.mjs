import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './server.mjs';
import { mountVoice } from './voice-client.mjs';

test('composer mount has no nested form and voice buttons never submit', () => {
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: tagName => ({
    tagName: tagName.toUpperCase(), children: [],
    setAttribute() {}, append(...children) { this.children.push(...children); }
  }) };
  const container = { children: [], replaceChildren(...children) { this.children = children; } };
  try {
    const unmount = mountVoice(container, { tripId: 'trip1', accessToken: 'valid-token', showTextFallback: false });
    assert.equal(container.children.some(child => child.tagName === 'FORM'), false);
    assert.deepEqual(container.children.filter(child => child.tagName === 'BUTTON').map(child => child.type), ['button', 'button']);
    unmount();
    assert.equal(container.children.length, 0);
    mountVoice(container, { tripId: 'trip1', accessToken: 'valid-token' });
    assert.equal(container.children.some(child => child.tagName === 'FORM'), true);
  } finally { globalThis.document = originalDocument; }
});

test('voice bridge rechecks trip auth and forwards only approved replies', async () => {
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/trips/trip1')) {
      if (options.headers.Authorization !== 'Bearer valid-token') return Response.json({}, { status: 403 });
      return Response.json({ id: 'trip1', destination: 'New York', status: 'saved', preferences: {}, saves: [] });
    }
    if (url.endsWith('/trips/trip1/messages')) {
      assert.deepEqual(JSON.parse(options.body), { client_message_id: 'msg1', text: 'Recall my lunch idea' });
      return Response.json({ trip: { id: 'trip1' }, reply: 'The backend-approved reply.' });
    }
    if (url.includes('get-signed-url')) return Response.json({ signed_url: 'wss://api.elevenlabs.io/v1/convai/conversation?token=fake' });
    throw new Error('Unexpected URL');
  };
  const server = createServer({ apiBase: 'https://backend.test', apiKey: 'private-key', agentId: 'agent-test', fetchImpl: fakeFetch });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}/trips/trip1`;
  const request = (path, token, body) => fetch(`${base}/${path}`, { method: path === 'context' ? 'GET' : 'POST',
    headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) });
  try {
    assert.equal((await request('session')).status, 401);
    assert.equal((await request('context', 'wrong-token')).status, 403);
    const context = await (await request('context', 'valid-token')).json();
    assert.equal(context.destination, 'New York');
    assert.equal(context.candidate_count, 0);
    assert.equal((await request('message', 'valid-token', { trip_id: 'other', client_message_id: 'msg1', text: 'Hello' })).status, 400);
    const msg = await (await request('message', 'valid-token', { trip_id: 'trip1', client_message_id: 'msg1', text: 'Recall my lunch idea' })).json();
    assert.equal(msg.reply, 'The backend-approved reply.');
    assert.equal((await request('session', 'valid-token')).status, 200);
    assert.equal(calls.filter(call => call.url.includes('get-signed-url')).length, 1);
    assert.equal(calls.filter(call => call.url.endsWith('/messages')).length, 1);
  } finally { server.close(); }
});

test('upstream failure has no generated fallback', async () => {
  const server = createServer({ apiBase: 'https://backend.test', fetchImpl: async () => { throw new Error('offline'); } });
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const result = await fetch(`http://127.0.0.1:${server.address().port}/trips/trip1/context`, { headers: { Authorization: 'Bearer valid-token' } });
    assert.equal(result.status, 502);
    assert.equal((await result.json()).error.code, 'UPSTREAM_UNAVAILABLE');
  } finally { server.close(); }
});

test('voice bridge never forwards trip tokens to unsafe API bases', async () => {
  for (const apiBase of ['http://remote.example', 'http://user:pass@127.0.0.1:8000',
    'https://backend.test/?debug=1', 'https://backend.test/#fragment', 'file:///tmp/backend']) {
    let calls = 0;
    const server = createServer({ apiBase, fetchImpl: async () => { calls++; throw new Error('must not forward'); } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const result = await fetch(`http://127.0.0.1:${server.address().port}/trips/trip1/context`,
        { headers: { Authorization: 'Bearer valid-token' } });
      assert.equal(result.status, 503, apiBase);
      assert.equal(calls, 0, apiBase);
    } finally { server.close(); }
  }
});

test('voice stop failures remain retryable and stale disconnects cannot change a new session', async () => {
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  globalThis.document = { createElement: tagName => ({
    tagName: tagName.toUpperCase(), children: [],
    setAttribute() {}, append(...children) { this.children.push(...children); }
  }) };
  globalThis.fetch = async () => Response.json({ signed_url: 'wss://api.elevenlabs.io/test' });
  const container = { children: [], replaceChildren(...children) { this.children = children; } };
  const callbacks = [];
  let rejectStop = true;
  const loadConversation = async () => ({ Conversation: { startSession: async options => {
    callbacks.push(options);
    options.onConnect();
    return { endSession: async () => { if (rejectStop) throw new Error('disconnect failed'); } };
  } } });
  try {
    const dispose = mountVoice(container, { tripId: 'trip1', accessToken: 'valid-token', showTextFallback: false }, loadConversation);
    const [start, stop, status] = container.children;
    await start.onclick();
    globalThis.fetch = async () => Response.json(null);
    assert.deepEqual(await callbacks[0].clientTools.getTripContext({ trip_id: 'trip1' }),
      { error: 'Trip service unavailable. Do not answer from memory.' });
    globalThis.fetch = async () => { throw new Error('private network detail'); };
    assert.deepEqual(await callbacks[0].clientTools.getTripContext({ trip_id: 'trip1' }),
      { error: 'Trip service unavailable. Do not answer from memory.' });
    await stop.onclick();
    assert.equal(start.disabled, true);
    assert.equal(stop.disabled, false);
    assert.match(status.textContent, /Try Stop again/);
    rejectStop = false;
    await stop.onclick();
    assert.equal(start.disabled, false);
    assert.equal(stop.disabled, true);
    globalThis.fetch = async () => Response.json({ signed_url: 'wss://api.elevenlabs.io/test' });
    await start.onclick();
    assert.equal(status.textContent, 'Voice connected');
    callbacks[0].onDisconnect();
    assert.equal(status.textContent, 'Voice connected');
    assert.equal(start.disabled, true);
    assert.equal(stop.disabled, false);
    dispose();
    callbacks[1].onDisconnect();
    assert.equal(container.children.length, 0);
  } finally {
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  }
});
