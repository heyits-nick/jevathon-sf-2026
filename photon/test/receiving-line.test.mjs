import assert from 'node:assert/strict';
import test from 'node:test';
import { receivingLine } from '../src/receiving-line.mjs';

const options = { projectId: 'project', projectSecret: 'secret', recipient: '+15551234567' };
const user = { type: 'shared', phoneNumber: options.recipient, assignedPhoneNumber: '+16282647754' };

test('read-only lookup returns assigned line without writing', async () => {
  const methods = [];
  const line = await receivingLine({ ...options, fetcher: async (_, init) => {
    methods.push(init.method ?? 'GET');
    return { ok: true, json: async () => ({ succeed: true, data: { users: [user] } }) };
  } });
  assert.equal(line, user.assignedPhoneNumber);
  assert.deepEqual(methods, ['GET']);
});

test('registration is explicit and followed by a fresh lookup', async () => {
  const methods = [];
  let registered = false;
  const fetcher = async (_, init) => {
    methods.push(init.method ?? 'GET');
    if (init.method === 'POST') {
      assert.deepEqual(JSON.parse(init.body), { type: 'shared', phoneNumber: options.recipient });
      registered = true;
      return { ok: true };
    }
    return { ok: true, json: async () => ({ succeed: true, data: { users: registered ? [user] : [] } }) };
  };
  assert.equal(await receivingLine({ ...options, fetcher }), null);
  assert.deepEqual(methods, ['GET']);
  methods.length = 0;
  assert.equal(await receivingLine({ ...options, register: true, fetcher }), user.assignedPhoneNumber);
  assert.deepEqual(methods, ['GET', 'POST', 'GET']);
});
