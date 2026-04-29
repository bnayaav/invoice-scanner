// functions/api/suppliers.js
// GET    — list suppliers (any logged-in user)
// POST   — add supplier (admin only)
// DELETE — remove supplier by id (admin only) — ?id=...

import { json, error, requireUser, uuid } from '../_utils.js';

export async function onRequestGet({ request, env }) {
  const session = await requireUser({ request, env });
  if (!session) return error('לא מחובר', 401);

  const { results } = await env.DB
    .prepare(`SELECT * FROM suppliers WHERE active = 1 ORDER BY name ASC`)
    .all();
  return json({ suppliers: results });
}

export async function onRequestPost({ request, env }) {
  const session = await requireUser({ request, env });
  if (!session) return error('לא מחובר', 401);
  if (session.role !== 'admin') return error('רק מנהל יכול להוסיף ספקים', 403);

  let body;
  try { body = await request.json(); } catch { return error('שגיאת קלט', 400); }

  const name = (body?.name || '').trim();
  if (!name) return error('שם ספק חובה', 400);

  const code = (body?.code || '').trim() || null;
  const phone = (body?.phone || '').trim() || null;
  const address = (body?.address || '').trim() || null;
  const id = uuid();

  try {
    await env.DB.prepare(
      `INSERT INTO suppliers (id, code, name, phone, address) VALUES (?, ?, ?, ?, ?)`
    ).bind(id, code, name, phone, address).run();
  } catch (e) {
    if (String(e).includes('UNIQUE')) return error('ספק כבר קיים', 409);
    throw e;
  }

  return json({ id, code, name, phone, address });
}

export async function onRequestDelete({ request, env }) {
  const session = await requireUser({ request, env });
  if (!session) return error('לא מחובר', 401);
  if (session.role !== 'admin') return error('רק מנהל יכול למחוק ספקים', 403);

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return error('id חובה', 400);

  // Soft delete — keep history intact
  await env.DB.prepare(`UPDATE suppliers SET active = 0 WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
