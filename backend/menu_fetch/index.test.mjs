import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchMenu, parseMenuText, validatePublicUrl } from './index.mjs';

test('rejects private and malformed sources', async () => {
  for (const url of ['file:///etc/passwd', 'http://127.0.0.1/menu', 'http://localhost/menu', 'https://user:pass@example.com/menu', 'https://192.168.1.1/menu', 'http://[::ffff:127.0.0.1]/menu', 'http://[ff02::1]/menu']) {
    await assert.rejects(validatePublicUrl(url));
  }
  await assert.rejects(validatePublicUrl('https://restaurant.example/menu', async () => [{ address: '10.1.2.3' }]));
  for (const address of ['192.0.2.1', '198.51.100.5', '203.0.113.9']) {
    await assert.rejects(validatePublicUrl(`http://${address}/menu`));
  }
  assert.equal(await validatePublicUrl('http://192.0.78.9/menu'), 'http://192.0.78.9/menu');
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
