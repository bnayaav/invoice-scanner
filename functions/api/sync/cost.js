// functions/api/sync/cost.js
// POST — worker reports the previous cost from POS for a product
// Auth: X-Sync-Key
// Body: { product_id, previous_cost }

import { json, error, requireSyncKey } from '../../_utils.js';

export async function onRequestPost({ request, env }) {
  if (!requireSyncKey({ request, env }))
    return error('Unauthorized', 401);

  let body;
  try { body = await request.json(); } catch { return error('Bad request', 400); }

  const { product_id, previous_cost } = body || {};
  if (!product_id) return error('product_id required', 400);
  if (typeof previous_cost !== 'number') return error('previous_cost must be number', 400);

  await env.DB.prepare(
    `UPDATE products SET previous_cost = ? WHERE id = ?`
  ).bind(previous_cost, product_id).run();

  return json({ ok: true });
}
