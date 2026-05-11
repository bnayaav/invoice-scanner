// functions/api/master/stats.js
// Returns metadata about the master products table.

import { json, error, requireUser } from '../../_utils.js';

export async function onRequestGet({ request, env }) {
  const session = await requireUser({ request, env });
  if (!session) return error('לא מחובר', 401);

  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM master_products`
  ).first();

  const metaRow = await env.DB.prepare(
    `SELECT value, updated_at FROM master_meta WHERE key = 'last_import'`
  ).first();

  const { results: samples } = await env.DB.prepare(
    `SELECT barcode, name, customer_price, cost_price
     FROM master_products
     ORDER BY imported_at DESC
     LIMIT 5`
  ).all();

  return json({
    total: countRow?.cnt || 0,
    last_import: metaRow?.updated_at || null,
    samples: samples || [],
  });
}
