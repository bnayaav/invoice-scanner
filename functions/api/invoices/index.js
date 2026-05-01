// functions/api/invoices/index.js
// GET — list invoices (with search/filter)

import { json, error, requireUser } from '../../_utils.js';

export async function onRequestGet({ request, env }) {
  const session = await requireUser({ request, env });
  if (!session) return error('לא מחובר', 401);

  const url = new URL(request.url);
  const status = url.searchParams.get('status');     // draft | ready | imported | archived
  const search = (url.searchParams.get('q') || '').trim();
  const limit  = Math.min(parseInt(url.searchParams.get('limit')) || 50, 200);
  const offset = parseInt(url.searchParams.get('offset')) || 0;

  let sql = `
    SELECT i.*, u.display_name AS creator_name
    FROM invoices i
    LEFT JOIN users u ON u.id = i.created_by
    WHERE 1=1
  `;
  const binds = [];

  if (status) { sql += ` AND i.status = ?`; binds.push(status); }

  if (search) {
    // Search across supplier, invoice number, AND product names within
    sql += ` AND (
      i.supplier LIKE ? OR
      i.invoice_number LIKE ? OR
      i.id IN (SELECT invoice_id FROM products WHERE name LIKE ? OR model LIKE ?)
    )`;
    const like = `%${search}%`;
    binds.push(like, like, like, like);
  }

  sql += ` ORDER BY i.created_at DESC LIMIT ? OFFSET ?`;
  binds.push(limit, offset);

  const { results } = await env.DB.prepare(sql).bind(...binds).all();

  // Add cost change summary for imported invoices
  const importedIds = results.filter(r => r.status === 'imported').map(r => r.id);
  const costChanges = {};
  if (importedIds.length > 0) {
    const placeholders = importedIds.map(() => '?').join(',');
    const { results: changes } = await env.DB.prepare(
      `SELECT invoice_id,
              SUM(CASE WHEN previous_cost IS NOT NULL AND previous_cost > 0 AND ABS(cost_price - previous_cost) > 0.01 THEN 1 ELSE 0 END) AS changed_count,
              SUM(CASE WHEN previous_cost IS NOT NULL AND previous_cost > 0 AND cost_price > previous_cost + 0.01 THEN 1 ELSE 0 END) AS up_count,
              SUM(CASE WHEN previous_cost IS NOT NULL AND previous_cost > 0 AND cost_price < previous_cost - 0.01 THEN 1 ELSE 0 END) AS down_count
       FROM products
       WHERE invoice_id IN (${placeholders})
       GROUP BY invoice_id`
    ).bind(...importedIds).all();
    for (const c of changes) {
      costChanges[c.invoice_id] = {
        changed_count: c.changed_count || 0,
        up_count: c.up_count || 0,
        down_count: c.down_count || 0,
      };
    }
  }
  for (const inv of results) {
    if (costChanges[inv.id]) {
      inv.cost_changes = costChanges[inv.id];
    }
  }

  return json({ invoices: results, limit, offset });
}
