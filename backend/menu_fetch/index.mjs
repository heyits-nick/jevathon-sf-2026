import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class MenuFetchError extends Error {
  constructor(code, message, retryable = false) {
    super(message);
    this.name = 'MenuFetchError';
    this.code = code;
    this.retryable = retryable;
  }
}

function publicAddress(address) {
  if (address.includes(':')) {
    const a = address.toLowerCase();
    // Reject IPv4-mapped forms, including URL-canonicalized hex forms.
    if (a.includes('ffff:')) return false;
    return /^[23]/.test(a) && !a.startsWith('2001:db8:');
  }
  const [a, b, c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113) || (a === 100 && b >= 64 && b <= 127));
}

export async function validatePublicUrl(value, resolve = lookup) {
  let url;
  try { url = new URL(value); } catch { throw new MenuFetchError('INVALID_URL', 'Enter a valid public menu URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname || (url.port && !['80', '443'].includes(url.port))) {
    throw new MenuFetchError('INVALID_URL', 'Enter a public HTTP or HTTPS menu URL.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.test')) {
    throw new MenuFetchError('PRIVATE_URL', 'Private network URLs are not allowed.');
  }
  let addresses;
  try { addresses = isIP(host) ? [{ address: host }] : await resolve(host, { all: true }); }
  catch { throw new MenuFetchError('DNS_FAILURE', 'The source hostname could not be resolved.', true); }
  if (!addresses.length || addresses.some(({ address }) => !isIP(address) || !publicAddress(address))) {
    throw new MenuFetchError('PRIVATE_URL', 'Private network URLs are not allowed.');
  }
  return url.href;
}

// A candidate is emitted only for a line that visibly carries a price. Jev decides dietary fit.
export function parseMenuText(rawText, url, kind = 'menu', checkedAt = new Date().toISOString()) {
  const raw_text = rawText.trim().slice(0, 40000);
  const lines = [...raw_text.matchAll(/[^\r\n]+/g)].map(match => ({ text: match[0].trim(), start: match.index, end: match.index + match[0].length })).filter(line => line.text);
  const evidence = [];
  const dishes = [];
  const price = /(?:\$\s?\d{1,3}(?:\.\d{2})?|\d{1,3}(?:\.\d{2})?\s?\$)/;
  for (let i = 0; i < lines.length && dishes.length < 50; i++) {
    const line = lines[i].text;
    if (line.length > 200 || line.length < 5 || kind !== 'menu') continue;
    const pricedHere = price.test(line);
    const nextIsPrice = /^\*{0,2}\$\s?\d{1,3}(?:\.\d{2})?\*{0,2}$/.test(lines[i + 1]?.text ?? '');
    if (!pricedHere && !(line.startsWith('- ') || line.startsWith('* ')) || (!pricedHere && !nextIsPrice)) continue;
    const name = line.replace(/^[-*#\s]+/, '').split(price)[0].replace(/[.\-–—\s]+$/, '').trim();
    if (name.length < 3 || name.length > 100 || /^https?:|^\[|^\!/.test(name)) continue;
    const priceIndex = pricedHere ? i : i + 1;
    let endIndex = priceIndex;
    for (let j = priceIndex + 1; j < Math.min(lines.length, priceIndex + 3); j++) {
      if (/^[-*] |^#{1,6} |^\$\s?\d/.test(lines[j].text)) break;
      endIndex = j;
    }
    const quote = raw_text.slice(lines[i].start, lines[endIndex].end).slice(0, 500);
    const id = `e${evidence.length + 1}`;
    evidence.push({ id, url, quote, kind, checked_at: checkedAt });
    dishes.push({ name, description: quote, evidence_ids: [id] });
  }
  // Preserve real text even when no priced dish can be confidently segmented.
  if (!evidence.length && raw_text) evidence.push({ id: 'e1', url, quote: raw_text.slice(0, 1500), kind, checked_at: checkedAt });
  return { raw_text, dishes, evidence };
}

export async function fetchMenu(inputUrl, { restaurant, kind = 'menu', client, resolve = lookup, timeoutMs = 20000 } = {}) {
  if (!['menu', 'review', 'diet_site'].includes(kind)) throw new MenuFetchError('INVALID_KIND', 'Unsupported evidence kind.');
  const menu_url = await validatePublicUrl(inputUrl, resolve);
  if (!client && !process.env.BROWSERBASE_API_KEY) throw new MenuFetchError('NOT_CONFIGURED', 'Browserbase is not configured.', true);
  const started = performance.now();
  try {
    const response = client ? await client.fetchAPI.create(
      { url: menu_url, format: 'markdown', allowRedirects: false },
      { timeout: timeoutMs, maxRetries: 0 },
    ) : await (async () => {
      const apiResponse = await fetch('https://api.browserbase.com/v1/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-BB-API-Key': process.env.BROWSERBASE_API_KEY },
        body: JSON.stringify({ url: menu_url, format: 'markdown', allowRedirects: false }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!apiResponse.ok) throw new Error('Browserbase API request failed');
      return apiResponse.json();
    })();
    if (response.statusCode >= 300 && response.statusCode < 400) throw new MenuFetchError('REDIRECT_BLOCKED', 'The source redirects; use its final public menu URL.');
    if (response.statusCode !== 200) throw new MenuFetchError('SOURCE_FAILED', `The source returned HTTP ${response.statusCode}.`, response.statusCode >= 500);
    if (!/^(text\/|application\/xhtml)/i.test(response.contentType ?? 'text/html') || typeof response.content !== 'string') {
      throw new MenuFetchError('UNSUPPORTED_SOURCE', 'This source is not an HTML menu page.');
    }
    const parsed = parseMenuText(response.content, menu_url, kind);
    if (!parsed.raw_text) throw new MenuFetchError('NO_MENU_EVIDENCE', 'The source had no readable menu text.');
    return { ...(restaurant ? { restaurant } : {}), menu_url, ...parsed, timing_ms: Math.round(performance.now() - started) };
  } catch (error) {
    if (error instanceof MenuFetchError) throw error;
    throw new MenuFetchError('PROVIDER_FAILURE', 'Browserbase could not fetch this source.', true);
  }
}
