import { json, error, requireUser } from '../_utils.js';

export async function onRequestGet({ request, env }) {
  // First-run check: if no users exist, signal the frontend to show setup screen
  const count = await env.DB.prepare('SELECT COUNT(*) AS c FROM users').first();
  if (!count || count.c === 0) return json({ setup_required: true });

  const session = await requireUser({ request, env });
  if (!session) return error('לא מחובר', 401);
  return json({ id: session.uid, display_name: session.name, role: session.role });
}
