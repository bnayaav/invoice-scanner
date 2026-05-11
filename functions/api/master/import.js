// functions/api/master/import.js
// Receives a batch of products from the master Excel file and inserts/updates
// them in the master_products table. Frontend calls this in batches of ~500.

import { json, error, requireUser } from '../../_utils.js';

const MAX_BATCH = 500;

function isValidBarcode(raw) {
  if (raw === null || raw === undefined) return false;
  const cleaned = String(raw).replace(/\D/g, '');
  return cleaned.length >= 8 && cleaned.length <= 13;
}

function normalizeBarcode(raw) {
  return String(raw).replace(/\D/g, '');
}

export async function onRequestPost({ request, env }) {
  const session = await requireUser({ request, env });
  if (!session) return error('לא מחובר', 401);
  if (session.role !== 'admin') return error('רק מנהל יכול לייבא מוצרים', 403);

  let body;
  try { body = await request.json(); } catch { return error('שגיאת קלט', 400); }

  const products = Array.isArray(body?.products) ? body.products : null;
  if (!products) return error('חסר שדה products', 400);
  if (products.length === 0) return error('רשימת מוצרים ריקה', 400);
  if (products.length > MAX_BATCH) return error(`מקסימום ${MAX_BATCH} מוצרים ב-batch`, 400);

  const now = Math.floor(Date.now() / 1000);

  if (body.replace_all === true) {
    await env.DB.prepare(`DELETE FROM master_products`).run();
  }

  // Filter to valid barcodes only — skip rows with non-barcode values
  // (phone numbers, names, 0, etc).
  const valid = [];
  let skipped = 0;
  for (const p of products) {
    if (!isValidBarcode(p.barcode)) { skipped++; continue; }
    if (!p.name || !String(p.name).trim()) { skipped++; continue; }
    valid.push({
      barcode: normalizeBarcode(p.barcode),
      product_code: p.product_code ? String(p.product_code).trim() : null,
      name: String(p.name).trim(),
      customer_price: Number(p.customer_price) || 0,
      cost_price: Number(p.cost_price) || 0,
      stock: parseInt(p.stock) || 0,
      manufacturer: p.manufacturer ? String(p.manufacturer).trim() : null,
      series: p.series ? String(p.series).trim() : null,
      extra_info: p.extra_info ? String(p.extra_info).trim() : null,
    });
  }

  if (valid.length === 0) {
    return json({ inserted: 0, skipped, message: 'אין שורות תקינות ב-batch' });
  }

  const stmts = valid.map(p =>
    env.DB.prepare(
      `INSERT OR REPLACE INTO master_products
         (barcode, product_code, name, customer_price, cost_price, stock,
          manufacturer, series, extra_info, imported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      p.barcode, p.product_code, p.name,
      p.customer_price, p.cost_price, p.stock,
      p.manufacturer, p.series, p.extra_info,
      now
    )
  );

  await env.DB.batch(stmts);

  await env.DB.prepare(
    `INSERT OR REPLACE INTO master_meta (key, value, updated_at) VALUES (?, ?, ?)`
  ).bind('last_import', String(now), now).run();

  return json({ inserted: valid.length, skipped });
}
