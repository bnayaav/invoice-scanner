// functions/api/sync/fail.js
// POST — report invoice or product failure from the desktop script
// Body: { invoice_id, error_message, failed_products?: [{ product_id, error_message }] }

import { json, error, requireSyncKey } from '../../_utils.js';

export async function onRequestPost({ request, env }) {
  if (!requireSyncKey({ request, env }))
    return error('Unauthorized', 401);

  let body;
  try { body = await request.json(); } catch { return error('Bad request', 400); }

  const { invoice_id, error_message, failed_products } = body || {};
  if (!invoice_id) return error('invoice_id required', 400);

  const inv = await env.DB.prepare(`SELECT id, status FROM invoices WHERE id = ?`)
    .bind(invoice_id).first();
  if (!inv) return error('Invoice not found', 404);

  // Mark invoice as failed (back to ready so it can be retried after fix)
  await env.DB.prepare(
    `UPDATE invoices SET status = 'ready', error_message = ?, failed_at = unixepoch(), updated_at = unixepoch() WHERE id = ?`
  ).bind(error_message || 'שגיאה לא ידועה', invoice_id).run();

  // Mark individual failed products if provided
  if (Array.isArray(failed_products) && failed_products.length > 0) {
    const updates = failed_products.map(fp =>
      env.DB.prepare(`UPDATE products SET error_message = ? WHERE id = ? AND invoice_id = ?`)
        .bind(fp.error_message || 'שגיאה', fp.product_id, invoice_id)
    );
    await env.DB.batch(updates);
  }

  return json({ ok: true });
}
