import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const demoPath = fileURLToPath(new URL('./demo.html', import.meta.url));
const clientPath = fileURLToPath(new URL('./voice-client.mjs', import.meta.url));
const error = (code, message, retryable = false) => ({ error: { code, message, retryable } });

export function createServer({ apiBase = process.env.API_BASE_URL, apiKey = process.env.ELEVENLABS_API_KEY,
  agentId = process.env.ELEVENLABS_AGENT_ID, allowedOrigin = process.env.VOICE_ALLOWED_ORIGIN,
  fetchImpl = fetch } = {}) {
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigin && origin === allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') return res.writeHead(origin === allowedOrigin ? 204 : 403).end();
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && (path === '/' || path === '/demo.html' || path === '/voice-client.mjs')) {
      const body = await readFile(path === '/voice-client.mjs' ? clientPath : demoPath);
      res.writeHead(200, { 'Content-Type': path === '/voice-client.mjs' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(body);
    }
    const match = /^\/trips\/([A-Za-z0-9_-]{1,128})\/(session|context|message)$/.exec(path);
    if (!match || req.method !== (match[2] === 'context' ? 'GET' : 'POST')) return send(res, 404, error('NOT_FOUND', 'Not found'));
    const [, tripId, action] = match;
    const auth = req.headers.authorization;
    if (!/^Bearer [^\s]{8,}$/.test(auth || '')) return send(res, 401, error('UNAUTHORIZED', 'Trip access token required'));
    if (!apiBase) return send(res, 503, error('NOT_CONFIGURED', 'Trip API is unavailable', true));
    try {
      // Every action rechecks the backend token. The model's trip_id is never an identity source.
      const tripResponse = await fetchImpl(`${apiBase.replace(/\/$/, '')}/trips/${encodeURIComponent(tripId)}`, {
        headers: { Authorization: auth }, signal: AbortSignal.timeout(10000)
      });
      if (!tripResponse.ok) return send(res, tripResponse.status === 401 || tripResponse.status === 403 || tripResponse.status === 404 ? tripResponse.status : 502,
        error('TRIP_UNAVAILABLE', 'Trip could not be accessed', tripResponse.status >= 500));
      const trip = await tripResponse.json();
      if (trip?.id !== tripId) return send(res, 502, error('TRIP_MISMATCH', 'Trip response was invalid'));
      if (action === 'context') return send(res, 200, { trip_id: trip.id, destination: trip.destination,
        status: trip.status, preferences: trip.preferences, clarification: trip.clarification,
        saved_count: trip.saves?.length || 0, candidate_count: trip.candidates?.length || 0 });
      if (action === 'session') {
        if (!apiKey || !agentId) return send(res, 503, error('VOICE_NOT_CONFIGURED', 'Voice is unavailable', true));
        const signed = await fetchImpl(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, {
          headers: { 'xi-api-key': apiKey }, signal: AbortSignal.timeout(10000)
        });
        if (!signed.ok) return send(res, 502, error('VOICE_UNAVAILABLE', 'Voice session could not start', true));
        const { signed_url } = await signed.json();
        if (!/^wss:\/\/api\.elevenlabs\.io\//.test(signed_url || '')) return send(res, 502, error('VOICE_UNAVAILABLE', 'Voice session response was invalid', true));
        return send(res, 200, { signed_url });
      }
      const body = await readJson(req);
      if (!body || body.trip_id !== tripId || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2000 ||
          typeof body.client_message_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.client_message_id)) {
        return send(res, 400, error('INVALID_MESSAGE', 'A valid trip ID, message ID, and text are required'));
      }
      const response = await fetchImpl(`${apiBase.replace(/\/$/, '')}/trips/${encodeURIComponent(tripId)}/messages`, {
        method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_message_id: body.client_message_id, text: body.text }), signal: AbortSignal.timeout(50000)
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) return send(res, response.status >= 400 && response.status < 500 ? response.status : 502,
        result?.error?.code ? result : error('BACKEND_UNAVAILABLE', 'Trip message failed', true));
      if (typeof result?.reply !== 'string' || result.trip?.id !== tripId) return send(res, 502, error('INVALID_BACKEND_REPLY', 'Trip reply was invalid', true));
      return send(res, 200, { reply: result.reply, trip: result.trip });
    } catch (cause) {
      if (cause?.message === 'Request too large') return send(res, 413, error('REQUEST_TOO_LARGE', 'Message exceeds size limit'));
      const timedOut = cause?.name === 'TimeoutError';
      return send(res, timedOut ? 504 : 502, error(timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE', 'Voice or trip service is unavailable', true));
    }
  });
}

function send(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 8192) throw new Error('Request too large');
  }
  try { return JSON.parse(body); } catch { return null; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  createServer().listen(Number(process.env.VOICE_PORT || 8788), process.env.VOICE_HOST || '127.0.0.1', () => console.log(`Voice bridge listening on port ${process.env.VOICE_PORT || 8788}`));
}
