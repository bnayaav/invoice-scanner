// functions/api/sync/pending.js
// GET — list invoices ready for import (auth: X-Sync-Key header)

import { json, error, requireSyncKey } from '../../_utils.js';

export async function onRequestGet({ request, env }) {
  if (!requireSyncKey({ request, env }))
    return error('Unauthorized', 401);

  const { results: invoices } = await env.DB.prepare(
    `SELECT i.*, u.display_name AS creator_name
     FROM invoices i
     LEFT JOIN users u ON u.id = i.created_by
     WHERE i.status = 'ready'
     ORDER BY i.ready_at ASC`
  ).all();

  // Bring in products for each
  const invoicesWithProducts = [];
  for (const inv of invoices) {
    const { results: products } = await env.DB
      .prepare(`SELECT id, name, model, quantity, cost_price, customer_price, sort_order, barcode, category, supplier_name, is_new
                FROM products WHERE invoice_id = ? ORDER BY sort_order ASC`)
      .bind(inv.id).all();
    invoicesWithProducts.push({ ...inv, products });
  }

  return json({ invoices: invoicesWithProducts, count: invoicesWithProducts.length });
}
