// Thin client for the Fullstory Server API v2.
// Used for facts that only the backend knows (billing outcomes) - they can't be
// dropped by ad blockers or faked by the client.
// Docs: https://developer.fullstory.com/server/getting-started/
const BASE = process.env.FS_API_BASE || 'https://api.fullstory.com';
const KEY = process.env.FS_API_KEY;

export const fsServerEnabled = () => Boolean(KEY);

async function call(path, body, idempotencyKey) {
  const headers = {
    Authorization: `Basic ${KEY}`,
    'Content-Type': 'application/json',
  };
  // Re-running a billing cycle must never double-count a conversion.
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  if (!KEY) return { status: 'dry-run', path, body };

  const res = await fetch(BASE + path, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) console.error(`[fs-server] ${path} -> ${res.status} ${text}`);
  return { status: res.status, path, body, response: text ? safeJson(text) : null };
}

const safeJson = (t) => { try { return JSON.parse(t); } catch { return t; } };

// Upsert keyed on uid - the same id the browser passed to FS('setIdentity').
export const upsertUser = (uid, properties) =>
  call('/v2/users', { uid, properties });

// Billing happens offline, so the event is attached to the user, not a session.
export const createEvent = (uid, name, properties, { timestamp, idempotencyKey } = {}) =>
  call(
    '/v2/events',
    { user: { uid }, name, timestamp, properties },
    idempotencyKey,
  );
