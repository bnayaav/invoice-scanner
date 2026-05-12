// functions/api/master/backup.js
// Exports the entire master_products table as a downloadable JSON file.
// Used by admins to take a snapshot before destructive operations.

import { error, requireUser } from '../../_utils.js';

export async function onRequestGet({ request, env }) {
  const session = await requireUser({ request, env });
  if (!session) return error('לא מחובר', 401);
  if (session.role !== 'admin') return error('רק מנהל יכול לגבות', 403);

  const { results: products } = await env.DB.prepare(
    `SELECT barcode, product_code, name, customer_price, cost_price, stock,
            manufacturer, series, extra_info, imported_at
     FROM master_products
     ORDER BY imported_at DESC`
  ).all();

  const metaRow = await env.DB.prepare(
    `SELECT value, updated_at FROM master_meta WHERE key = 'last_import'`
  ).first();

  const backup = {
    version: 1,
    created_at: Math.floor(Date.now() / 1000),
    last_import: metaRow?.updated_at || null,
    total: products?.length || 0,
    products: products || [],
  };

  const date = new Date().toISOString().slice(0, 10);
  const filename = `master-backup-${date}.json`;

  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
