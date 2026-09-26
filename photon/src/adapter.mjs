import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

export function openState(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      scope TEXT PRIMARY KEY, trip_id TEXT NOT NULL, access_token TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS deliveries (
      provider_key TEXT PRIMARY KEY, scope TEXT NOT NULL, text TEXT NOT NULL,
      source_url TEXT, reply TEXT, sent INTEGER NOT NULL DEFAULT 0,
      failure_notice_sent INTEGER NOT NULL DEFAULT 0,
      recovery_attempts INTEGER NOT NULL DEFAULT 0
    );
  `);
  if (!db.prepare('PRAGMA table_info(deliveries)').all().some(column => column.name === 'recovery_attempts')) {
    db.exec('ALTER TABLE deliveries ADD COLUMN recovery_attempts INTEGER NOT NULL DEFAULT 0');
  }
  return db;
}

function sourceUrl(text) {
  const candidate = text.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[),.!?]+$/, '');
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    return (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export async function handleMessage(db, { space, message }, backend) {
  if (message.direction !== 'inbound') return;
  const content = message.content;
  if (content.type !== 'text' && content.type !== 'richlink') return;
  const text = content.type === 'text' ? content.text : '';
  const source_url = sourceUrl(content.type === 'richlink' ? content.url : text);
  if (!text.trim() && !source_url) return;
  if (!message.id || !message.sender?.id || !space.id || !message.platform) {
    throw new Error('Photon message lacks a stable identity');
  }

  // Scope the token to both the sender and conversation, including group chats.
  const scope = JSON.stringify([message.platform, space.id, message.sender.id]);
  const providerKey = JSON.stringify([message.platform, space.id, message.id]);
  db.prepare('INSERT OR IGNORE INTO deliveries (provider_key, scope, text, source_url) VALUES (?, ?, ?, ?)')
    .run(providerKey, scope, text, source_url ?? null);
  const delivery = db.prepare('SELECT * FROM deliveries WHERE provider_key = ?').get(providerKey);
  if (delivery.scope !== scope) throw new Error('Photon message ID collision');
  if (delivery.sent) return;
  await finishDelivery(db, delivery, backend, body => message.reply(body));
}

async function finishDelivery(db, delivery, backend, send) {
  const { provider_key: providerKey, scope } = delivery;
  const clientMessageId = `photon-${createHash('sha256').update(providerKey).digest('hex').slice(0, 32)}`;
  let reply = delivery.reply;
  try {
    if (!reply) {
      let trip = db.prepare('SELECT * FROM conversations WHERE scope = ?').get(scope);
      if (!trip) {
        const created = await backend.createTrip();
        if (!created?.trip_id || !created?.access_token) throw new Error('Invalid trip creation response');
        db.prepare('INSERT OR IGNORE INTO conversations (scope, trip_id, access_token) VALUES (?, ?, ?)')
          .run(scope, created.trip_id, created.access_token);
        trip = db.prepare('SELECT * FROM conversations WHERE scope = ?').get(scope);
      }
      const result = await backend.sendMessage(trip.trip_id, trip.access_token, {
        client_message_id: clientMessageId,
        text: delivery.text,
        ...(delivery.source_url ? { source_url: delivery.source_url } : {}),
      });
      if (typeof result?.reply !== 'string' || !result.reply.trim()) {
        throw new Error('Backend did not provide a reply');
      }
      reply = result.reply;
      db.prepare('UPDATE deliveries SET reply = ? WHERE provider_key = ?').run(reply, providerKey);
    }
  } catch {
    // Preserve input for startup recovery; never invent a recommendation.
    if (!delivery.failure_notice_sent) {
      await send('I could not process that right now. Please try sending it again.');
      db.prepare('UPDATE deliveries SET failure_notice_sent = 1 WHERE provider_key = ?').run(providerKey);
    }
    return;
  }

  await send(reply);
  db.prepare('UPDATE deliveries SET sent = 1 WHERE provider_key = ?').run(providerKey);
}

export async function recoverPending(db, backend, resolveSpace, limit = 100) {
  const pending = db.prepare('SELECT * FROM deliveries WHERE sent = 0 ORDER BY recovery_attempts, rowid LIMIT ?').all(limit);
  let completed = 0;
  for (const delivery of pending) {
    db.prepare('UPDATE deliveries SET recovery_attempts = recovery_attempts + 1 WHERE provider_key = ?')
      .run(delivery.provider_key);
    try {
      const [platform, spaceId] = JSON.parse(delivery.scope);
      if (platform !== 'imessage') continue;
      const space = await resolveSpace(spaceId);
      if (!space) continue;
      await finishDelivery(db, delivery, backend, body => space.send(body));
      completed += db.prepare('SELECT sent FROM deliveries WHERE provider_key = ?').get(delivery.provider_key).sent;
    } catch {
      // Keep the record available for another startup; never log private content.
    }
  }
  return { attempted: pending.length, completed };
}

export function createBackend(baseUrl, fetchImpl = fetch) {
  const base = new URL(baseUrl);
  if (base.username || base.password || base.search || base.hash || (base.protocol !== 'https:' &&
      !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))) {
    throw new Error('API_BASE_URL must be HTTPS or local HTTP');
  }
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  async function post(path, body, token) {
    const response = await fetchImpl(new URL(path.replace(/^\//, ''), base), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55000),
    });
    if (!response.ok) throw new Error(`Backend HTTP ${response.status}`);
    return response.json();
  }
  return {
    createTrip: () => post('/trips', {}),
    sendMessage: (tripId, token, body) => post(`/trips/${encodeURIComponent(tripId)}/messages`, body, token),
    async getTrip(tripId, token) {
      const response = await fetchImpl(new URL(`trips/${encodeURIComponent(tripId)}`, base), {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`Backend HTTP ${response.status}`);
      return response.json();
    },
  };
}
