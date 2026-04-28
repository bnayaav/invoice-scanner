import { json, error, verifyPassword, signSession, setSessionCookie } from '../_utils.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return error('שגיאת קלט', 400); }

  const { username, password } = body || {};
  if (!username || !password) return error('שם משתמש וסיסמה נדרשים', 400);

  const user = await env.DB
    .prepare(`SELECT id, username, display_name, password_hash, role, active FROM users WHERE username = ?`)
    .bind(username.trim().toLowerCase()).first();

  if (!user || !user.active) return error('שם משתמש או סיסמה שגויים', 401);

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return error('שם משתמש או סיסמה שגויים', 401);

  const token = await signSession(env.SESSION_SECRET, {
    uid: user.id, name: user.display_name, role: user.role
  });

  return json(
    { id: user.id, username: user.username, display_name: user.display_name, role: user.role },
    200,
    { 'Set-Cookie': setSessionCookie(token) }
  );
}
