import { createServer } from 'node:http';
import { fetchMenu, searchSources, MenuFetchError } from './index.mjs';

function errorBody(error) {
  return { error: { code: error instanceof MenuFetchError ? error.code : 'INTERNAL_ERROR', message: error instanceof MenuFetchError ? error.message : 'Menu fetch failed.', retryable: error instanceof MenuFetchError && error.retryable } };
}

async function serve() {
  const host = process.env.MENU_FETCH_HOST || '127.0.0.1';
  const token = process.env.MENU_FETCH_TOKEN;
  if (!['localhost', '127.0.0.1', '::1'].includes(host) && !token) throw new Error('MENU_FETCH_TOKEN is required for a nonlocal host.');
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'POST' || !['/fetch-menu', '/search-sources'].includes(req.url)) { res.writeHead(404); res.end(JSON.stringify(errorBody(new MenuFetchError('NOT_FOUND', 'Route not found.')))); return; }
    if (token && req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401); res.end(JSON.stringify(errorBody(new MenuFetchError('UNAUTHORIZED', 'Missing or invalid token.')))); return; }
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 4096) throw new MenuFetchError('INVALID_REQUEST', 'Request is too large.');
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const result = req.url === '/search-sources'
        ? await searchSources(body.query, { limit: body.limit })
        : await fetchMenu(body.menu_url, { restaurant: body.restaurant, kind: body.kind });
      res.writeHead(200); res.end(JSON.stringify(result));
    } catch (error) {
      const status = error instanceof SyntaxError || ['INVALID_URL', 'INVALID_KIND', 'INVALID_SEARCH', 'PRIVATE_URL', 'INVALID_REQUEST'].includes(error.code) ? 400
        : error.code === 'NO_MENU_EVIDENCE' || error.code === 'UNSUPPORTED_SOURCE' ? 422
        : error.code === 'NOT_CONFIGURED' ? 503
        : ['PROVIDER_FAILURE', 'SEARCH_PROVIDER_FAILURE', 'SOURCE_FAILED'].includes(error.code) ? 502 : 500;
      res.writeHead(status); res.end(JSON.stringify(errorBody(error)));
    }
  });
  server.listen(Number(process.env.MENU_FETCH_PORT || 8101), host, () => console.log(`menu fetch listening on ${host}:${server.address().port}`));
}

if (process.argv[2] === 'serve') await serve();
else {
  const url = process.argv[2];
  if (!url) { console.error('Usage: node cli.mjs <public-menu-url> [restaurant] [--smoke] | serve'); process.exitCode = 2; }
  else try {
    const result = await fetchMenu(url, { restaurant: process.argv[3]?.startsWith('--') ? undefined : process.argv[3] });
    console.log(JSON.stringify(process.argv.includes('--smoke') ? { menu_url: result.menu_url, dishes: result.dishes.length, evidence: result.evidence.length, chars: result.raw_text.length, timing_ms: result.timing_ms } : result));
  } catch (error) { console.error(JSON.stringify(errorBody(error))); process.exitCode = 1; }
}
