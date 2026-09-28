import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchMenu, parseMenuText, searchSources, validatePublicUrl } from './index.mjs';

test('rejects private and malformed sources', async () => {
  for (const url of ['file:///etc/passwd', 'http://127.0.0.1/menu', 'http://localhost/menu', 'https://user:pass@example.com/menu', 'https://192.168.1.1/menu', 'http://[::ffff:127.0.0.1]/menu', 'http://[ff02::1]/menu']) {
    await assert.rejects(validatePublicUrl(url));
  }
  await assert.rejects(validatePublicUrl('https://restaurant.example/menu', async () => [{ address: '10.1.2.3' }]));
  for (const address of ['192.0.2.1', '198.51.100.5', '203.0.113.9', '192.88.99.1']) {
    await assert.rejects(validatePublicUrl(`http://${address}/menu`));
  }
  // 6to4 and Teredo addresses embed an IPv4 address, e.g. 127.0.0.1 or 169.254.169.254.
  for (const address of ['2002:7f00:1::', '2002:a9fe:a9fe::', '2001:0:4136:e378:8000:63bf:3fff:fdd2', '2001::1']) {
    await assert.rejects(validatePublicUrl(`http://[${address}]/menu`));
    await assert.rejects(validatePublicUrl('https://restaurant.example/menu', async () => [{ address }]));
  }
  assert.equal(await validatePublicUrl('http://192.0.78.9/menu'), 'http://192.0.78.9/menu');
  assert.equal(await validatePublicUrl('http://[2001:4860:4860::8888]/menu'), 'http://[2001:4860:4860::8888]/menu');
});

test('priced lines produce source-matched dish evidence; empty text does not', () => {
  const parsed = parseMenuText('# Dinner\n- Garden Salad $14\n- Fish Tacos $20', 'https://example.com/menu');
  assert.equal(parsed.dishes.length, 2);
  assert.equal(parsed.dishes[0].name, 'Garden Salad');
  assert.equal(parsed.evidence[0].quote, '- Garden Salad $14');
  assert.deepEqual(parsed.dishes[0].evidence_ids, [parsed.evidence[0].id]);
  assert.equal(parseMenuText('  ', 'https://example.com').dishes.length, 0);
  const multiline = parseMenuText('- House Focaccia\n\n  **$14**\n\nrosemary, olives, garlic\n\n- Giardiniera\n\n  **$14**\n\ncannellini beans', 'https://example.com');
  assert.equal(multiline.dishes.length, 2);
  assert.equal(multiline.dishes[0].name, 'House Focaccia');
  assert.ok(multiline.evidence[0].quote.includes('rosemary, olives, garlic'));
});

test('provider failure is safe and redirect is blocked', async () => {
  const resolve = async () => [{ address: '93.184.215.14' }];
  const client = { fetchAPI: { create: async () => { throw new Error('secret provider body'); } } };
  await assert.rejects(fetchMenu('https://example.com/menu', { client, resolve }), e => e.code === 'PROVIDER_FAILURE' && !e.message.includes('secret'));
  client.fetchAPI.create = async () => ({ statusCode: 302 });
  await assert.rejects(fetchMenu('https://example.com/menu', { client, resolve }), e => e.code === 'REDIRECT_BLOCKED');
});

test('search is bounded and hides provider failures', async () => {
  await assert.rejects(searchSources('menu', { limit: 6, apiKey: 'test' }), e => e.code === 'INVALID_SEARCH');
  const request = async (_url, options) => {
    assert.equal(JSON.parse(options.body).numResults, 3);
    return { ok: true, json: async () => ({ query: 'menu', results: [
      { id: 'a', title: 'Menu A', url: 'https://example.com/a' },
      { id: 'unsafe', title: 'Unsafe', url: 'https://user:pass@example.com/private' },
      { id: 'b', title: 'Menu B', url: 'https://example.com/b', snippet: 'Observed excerpt' },
      { id: 'c', title: 'Menu C', url: 'https://example.com/c' },
    ] }) };
  };
  const result = await searchSources('menu', { limit: 3, apiKey: 'test', request });
  assert.equal(result.results.length, 2);
  assert.deepEqual(result.results.map(r => r.id), ['a', 'b']);
  assert.equal(result.results[0].snippet, null);
  assert.equal(result.results[1].snippet, 'Observed excerpt');
  await assert.rejects(searchSources('menu', { apiKey: 'test', request: async () => { throw new Error('secret provider body'); } }), e => e.code === 'SEARCH_PROVIDER_FAILURE' && !e.message.includes('secret'));
});
