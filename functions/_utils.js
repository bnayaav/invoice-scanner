// functions/_utils.js
// Shared utilities for Cloudflare Pages Functions

// ────────────────────────────────────────────────────────────
//  JSON helpers
// ────────────────────────────────────────────────────────────
export const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });

export const error = (message, status = 400) => json({ error: message }, status);

// ────────────────────────────────────────────────────────────
//  Random IDs (UUID v4-ish)
// ────────────────────────────────────────────────────────────
export function uuid() {
  return crypto.randomUUID();
}

// ────────────────────────────────────────────────────────────
//  Base64 helpers (URL-safe)
// ────────────────────────────────────────────────────────────
const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64urlEncode(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ────────────────────────────────────────────────────────────
//  Password hashing (PBKDF2-SHA-256, 200k iterations)
// ────────────────────────────────────────────────────────────
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LEN = 32;

export async function hashPassword(password, saltOverride) {
  const salt = saltOverride || crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key, PBKDF2_KEY_LEN * 8
  );
  return `${b64urlEncode(salt)}:${PBKDF2_ITERATIONS}:${b64urlEncode(bits)}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [saltB64, iterStr, hashB64] = stored.split(':');
    const salt = b64urlDecode(saltB64);
    const iterations = parseInt(iterStr, 10);
    const expected = b64urlDecode(hashB64);
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
    );
    const bits = new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      key, expected.length * 8
    ));
    if (bits.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
    return diff === 0;
  } catch { return false; }
}

// ────────────────────────────────────────────────────────────
//  Signed session tokens (HMAC-SHA-256 over JSON payload)
//  Format: base64url(payload).base64url(sig)
// ────────────────────────────────────────────────────────────
const SESSION_DAYS = 30;

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

export async function signSession(secret, payload) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400 };
  const bodyJson = JSON.stringify(body);
  const bodyB64 = b64urlEncode(enc.encode(bodyJson));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(bodyB64));
  return `${bodyB64}.${b64urlEncode(sig)}`;
}

export async function verifySession(secret, token) {
  if (!token || !token.includes('.')) return null;
  const [bodyB64, sigB64] = token.split('.');
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC', key, b64urlDecode(sigB64), enc.encode(bodyB64)
  );
  if (!valid) return null;
  try {
    const payload = JSON.parse(dec.decode(b64urlDecode(bodyB64)));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ────────────────────────────────────────────────────────────
//  Cookie helpers
// ────────────────────────────────────────────────────────────
export function getCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setSessionCookie(token) {
  const maxAge = SESSION_DAYS * 86400;
  return `session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export const clearSessionCookie = () =>
  'session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

// ────────────────────────────────────────────────────────────
//  Auth guard for endpoints
// ────────────────────────────────────────────────────────────
export async function requireUser({ request, env }) {
  const token = getCookie(request, 'session');
  if (!token) return null;
  return verifySession(env.SESSION_SECRET, token);
}

export function requireSyncKey({ request, env }) {
  const provided = request.headers.get('X-Sync-Key');
  if (!provided || !env.SYNC_API_KEY) return false;
  if (provided.length !== env.SYNC_API_KEY.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++)
    diff |= provided.charCodeAt(i) ^ env.SYNC_API_KEY.charCodeAt(i);
  return diff === 0;
}

// ────────────────────────────────────────────────────────────
//  Recompute invoice totals
// ────────────────────────────────────────────────────────────
export async function recomputeInvoiceTotals(db, invoiceId) {
  const { results } = await db
    .prepare(`SELECT quantity, cost_price, customer_price FROM products WHERE invoice_id = ?`)
    .bind(invoiceId).all();
  let totalCost = 0, totalRevenue = 0;
  for (const p of results) {
    const q = Number(p.quantity) || 1;
    totalCost    += (Number(p.cost_price)     || 0) * q;
    totalRevenue += (Number(p.customer_price) || 0) * q;
  }
  await db.prepare(
    `UPDATE invoices SET total_cost = ?, total_revenue = ?, product_count = ?, updated_at = unixepoch() WHERE id = ?`
  ).bind(totalCost, totalRevenue, results.length, invoiceId).run();
  return { total_cost: totalCost, total_revenue: totalRevenue, product_count: results.length };
}
