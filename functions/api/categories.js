// functions/api/categories.js
// GET    — list categories (any logged-in user)
// POST   — add category (admin only)
// DELETE — remove category by id (admin only) — ?id=...

import { json, error, requireUser, uuid } from '../_utils.js';

export async function onRequestGet({ request, env }) {
  const session = await requireUser({ request, env });
  if (!session) return error('לא מחובר', 401);

  const { results } = await env.DB
    .prepare(`SELECT * FROM categories ORDER BY sort_order ASC, name ASC`)
    .all();
  return json({ categories: results });
}

export async function onRequestPost({ request, env }) {
  const session = await requireUser({ request, env });
  if (!session) return error('לא מחובר', 401);
  if (session.role !== 'admin') return error('רק מנהל יכול להוסיף מחלקות', 403);

  let body;
  try { body = await request.json(); } catch { return error('שגיאת קלט', 400); }

  const name = (body?.name || '').trim();
  if (!name) return error('שם מחלקה חובה', 400);

  const sort_order = parseInt(body?.sort_order) || 0;
  const id = uuid();

  try {
    await env.DB.prepare(
      `INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)`
    ).bind(id, name, sort_order).run();
  } catch (e) {
    if (String(e).includes('UNIQUE')) return error('מחלקה כבר קיימת', 409);
    throw e;
  }

  return json({ id, name, sort_order });
}

export async function onRequestDelete({ request, env }) {
  const session = await requireUser({ request, env });
  if (!session) return error('לא מחובר', 401);
  if (session.role !== 'admin') return error('רק מנהל יכול למחוק מחלקות', 403);

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return error('id חובה', 400);

  await env.DB.prepare(`DELETE FROM categories WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
