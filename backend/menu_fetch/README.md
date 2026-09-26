# Menu evidence adapter

Node 25 ESM, with no package install. Set `BROWSERBASE_API_KEY` server-side.

```js
import { fetchMenu } from './backend/menu_fetch/index.mjs';
const result = await fetchMenu('https://restaurant.example/menu', { restaurant: 'Restaurant' });
```

Result: `{restaurant?, menu_url, raw_text, dishes:[{name,description,evidence_ids}], evidence:[{id,url,quote,kind,checked_at}], timing_ms}`. Dishes are only segmented from visibly priced lines. Pass `raw_text` to the scorer when this conservative parser finds none. No dietary decision is made here. A missing/empty page raises `NO_MENU_EVIDENCE`; a provider outage raises `PROVIDER_FAILURE` without returning its raw error.

Run `node --env-file=../../.env cli.mjs 'https://www.lullanyc.com/menu/all-day/' Lulla --smoke` to print only counts and timing. Remove `--smoke` for the full JSON. `npm test` runs offline checks.

Optional local HTTP bridge: `node --env-file=../../.env cli.mjs serve`, then `POST http://127.0.0.1:8101/fetch-menu` with JSON `{ "menu_url": "https://...", "restaurant": "..." }`. Set `MENU_FETCH_PORT` to change port. Set `MENU_FETCH_HOST` and `MENU_FETCH_TOKEN` for nonlocal access; the bearer token is required there. The shared backend should call the module directly when running in Node.

Browserbase uses [Fetch API markdown mode](https://www.browserbase.com/blog/fetch-api) through its [documented endpoint and API-key header](https://github.com/browserbase/skills/blob/main/skills/fetch/REFERENCE.md), with redirects disabled by the documented `allowRedirects` option. Browser rendering/PDF support is outside this narrow public HTML path.
