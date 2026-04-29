// functions/api/invoices/[id].js
// GET    — fetch invoice + products
// PUT    — update invoice (header fields, status, full products list)
// DELETE — delete invoice + cascade products

import { json, error, requireUser, uuid, recomputeInvoiceTotals } from '../../_utils.js';

export async function onRequestGet({ request, env, params }) {
  const session = await requireUser({ request, env });
  if (!session) return error('לא מחובר', 401);

  const invoice = await env.DB
    .prepare(`SELECT i.*, u.display_name AS creator_name
              FROM invoices i LEFT JOIN users u ON u.id = i.created_by
              WHERE i.id = ?`)
    .bind(params.id).first();
  if (!invoice) return error('חשבונית לא נמצאה', 404);

  const { results: products } = await env.DB
    .prepare(`SELECT * FROM products WHERE invoice_id = ? ORDER BY sort_order ASC`)
    .bind(params.id).all();

  return json({ invoice, products });
}

export async function onRequestPut({ request, env, params }) {
  const session = await requireUser({ request, env });
  if (!session) return error('לא מחובר', 401);

  const invoice = await env.DB.prepare(`SELECT id, status FROM invoices WHERE id = ?`)
    .bind(params.id).first();
  if (!invoice) return error('חשבונית לא נמצאה', 404);
  if (invoice.status === 'imported')
    return error('חשבונית שכבר יובאה לא ניתנת לעריכה', 409);

  let body;
  try { body = await request.json(); } catch { return error('שגיאת קלט', 400); }

  // Update invoice header
  const fields = ['supplier', 'invoice_number', 'invoice_date', 'currency', 'status', 'notes'];
  const sets = [];
  const binds = [];
  for (const f of fields) {
    if (f in body) { sets.push(`${f} = ?`); binds.push(body[f]); }
  }

  if (body.status === 'ready' && invoice.status !== 'ready') {
    sets.push('ready_at = unixepoch()');
  }

  if (sets.length) {
    sets.push('updated_at = unixepoch()');
    binds.push(params.id);
    await env.DB.prepare(`UPDATE invoices SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...binds).run();
  }

  // If products array supplied — replace all products for this invoice
  if (Array.isArray(body.products)) {
    await env.DB.prepare(`DELETE FROM products WHERE invoice_id = ?`)
      .bind(params.id).run();

    const inserts = body.products.map((p, idx) =>
      env.DB.prepare(
        `INSERT INTO products (id, invoice_id, name, model, quantity, cost_price, customer_price, sort_order, barcode, category, supplier_name, is_new, merged_from)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        p.id || uuid(),
        params.id,
        (p.name || '').trim(),
        p.model || null,
        Math.max(1, parseInt(p.quantity) || 1),
        Number(p.cost_price) || 0,
        Number(p.customer_price) || 0,
        idx,
        p.barcode || null,
        p.category || null,
        p.supplier_name || null,
        p.is_new ? 1 : 0,
        p.merged_from || null
      )
    );
    if (inserts.length) await env.DB.batch(inserts);
  }

  await recomputeInvoiceTotals(env.DB, params.id);

  // Return fresh state
  const fresh = await env.DB.prepare(`SELECT * FROM invoices WHERE id = ?`)
    .bind(params.id).first();
  const { results: products } = await env.DB
    .prepare(`SELECT * FROM products WHERE invoice_id = ? ORDER BY sort_order ASC`)
    .bind(params.id).all();

  return json({ invoice: fresh, products });
}

export async function onRequestDelete({ request, env, params }) {
  const session = await requireUser({ request, env });
  if (!session) return error('לא מחובר', 401);

  const invoice = await env.DB.prepare(`SELECT id, status FROM invoices WHERE id = ?`)
    .bind(params.id).first();
  if (!invoice) return error('חשבונית לא נמצאה', 404);
  if (invoice.status === 'imported')
    return error('חשבונית שכבר יובאה לא ניתנת למחיקה', 409);

  await env.DB.prepare(`DELETE FROM invoices WHERE id = ?`).bind(params.id).run();
  return json({ ok: true });
}
