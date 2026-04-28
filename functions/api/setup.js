// functions/api/setup.js
// One-time first-run setup: creates the initial admin user.
// Only works when zero users exist in the DB.

import { json, error, uuid, hashPassword, signSession, setSessionCookie } from '../_utils.js';

export async function onRequestPost({ request, env }) {
  // Guard: only allowed when no users exist yet
  const count = await env.DB.prepare('SELECT COUNT(*) AS c FROM users').first();
  if (count && count.c > 0)
    return error('הקמה כבר בוצעה', 403);

  let body;
  try { body = await request.json(); } catch { return error('שגיאת קלט', 400); }

  const username = (body?.username || '').trim().toLowerCase();
  const display_name = (body?.display_name || '').trim();
  const password = body?.password || '';

  if (!username || !display_name || !password)
    return error('נא למלא את כל השדות', 400);
  if (password.length < 6)
    return error('סיסמה חייבת להיות לפחות 6 תווים', 400);
  if (!/^[a-z0-9_]+$/.test(username))
    return error('שם משתמש: אותיות אנגלית קטנות, ספרות וקו תחתון בלבד', 400);

  const hash = await hashPassword(password);
  const uid = uuid();

  await env.DB.prepare(
    `INSERT INTO users (id, username, display_name, password_hash, role)
     VALUES (?, ?, ?, ?, 'admin')`
  ).bind(uid, username, display_name, hash).run();

  // Auto-login the new admin
  const token = await signSession(env.SESSION_SECRET, {
    uid, name: display_name, role: 'admin'
  });

  return json(
    { id: uid, username, display_name, role: 'admin' },
    200,
    { 'Set-Cookie': setSessionCookie(token) }
  );
}
