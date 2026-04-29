// functions/api/sync/complete.js
// POST — mark an invoice as imported (called by the desktop script)
// Body: { invoice_id, script_id? }

import { json, error, requireSyncKey } from '../../_utils.js';

export async function onRequestPost({ request, env }) {
  if (!requireSyncKey({ request, env }))
    return error('Unauthorized', 401);

  let body;
  try { body = await request.json(); } catch { return error('Bad request', 400); }

  const { invoice_id, script_id } = body || {};
  if (!invoice_id) return error('invoice_id required', 400);

  const inv = await env.DB.prepare(`SELECT id, status FROM invoices WHERE id = ?`)
    .bind(invoice_id).first();
  if (!inv) return error('Invoice not found', 404);
  if (inv.status === 'imported') return json({ ok: true, already: true });
  if (inv.status !== 'ready') return error(`Invoice status is ${inv.status}, not ready`, 409);

  await env.DB.prepare(
    `UPDATE invoices SET status = 'imported', imported_at = unixepoch(),
     imported_by_script = ?, error_message = NULL, failed_at = NULL,
     updated_at = unixepoch() WHERE id = ?`
  ).bind(script_id || 'desktop-sync', invoice_id).run();

  // Clear product error messages
  await env.DB.prepare(`UPDATE products SET error_message = NULL WHERE invoice_id = ?`)
    .bind(invoice_id).run();

  return json({ ok: true });
}
