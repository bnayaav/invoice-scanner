// functions/api/scan.js
// Receives base64 invoice images, calls Claude vision API, parses products,
// stores everything in D1, and returns the new invoice id + extracted data.

import { json, error, uuid, requireUser } from '../_utils.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_PAGES = 10;

const SYSTEM_PROMPT = `אתה עוזר לחנות בישראל לסרוק חשבוניות ספק ולחלץ את רשימת המוצרים. אתה מחזיר JSON תקין בלבד, ללא markdown, ללא טקסט נוסף לפני או אחרי.`;

const buildUserPrompt = (pageCount) => `סרוק את החשבונית ${pageCount > 1 ? `(${pageCount} עמודים)` : ''} והחזר JSON בפורמט הבא:

{
  "supplier": "שם הספק",
  "invoice_number": "מספר חשבונית",
  "date": "DD/MM/YYYY",
  "currency": "ILS" | "USD" | "EUR",
  "products": [
    { "name": "שם מוצר", "model": "דגם/מק״ט או null", "quantity": <int>, "cost_price": <number> }
  ]
}

כללים:
- מחיר עלות תמיד ליחידה (אם רשום סך, חלק בכמות)
- אל תכלול מע״מ אם רשום בנפרד
- אל תכלול שורות של הנחות / סכום ביניים / מע״מ / משלוח / סך הכל
- שמור עברית בעברית, אנגלית באנגלית
- אם אין מספר חשבונית או תאריך — החזר null
- בדוק כל מספר פעמיים`;

export async function onRequestPost({ request, env }) {
  const session = await requireUser({ request, env });
  if (!session) return error('לא מחובר', 401);
  if (!env.ANTHROPIC_API_KEY) return error('שרת לא הוגדר נכון (חסר API key)', 500);

  let body;
  try { body = await request.json(); } catch { return error('שגיאת קלט', 400); }

  const pages = Array.isArray(body?.pages) ? body.pages : null;
  if (!pages || pages.length === 0) return error('לא נשלחו תמונות', 400);
  if (pages.length > MAX_PAGES) return error(`מקסימום ${MAX_PAGES} עמודים`, 400);

  // Validate each page
  const content = [];
  for (const p of pages) {
    if (!p?.media_type || !p?.data) return error('פורמט תמונה לא תקין', 400);
    if (!ALLOWED_TYPES.includes(p.media_type)) return error(`סוג קובץ לא נתמך: ${p.media_type}`, 400);
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: p.media_type, data: p.data }
    });
  }
  content.push({ type: 'text', text: buildUserPrompt(pages.length) });

  // Call Claude API
  let aiResp;
  try {
    aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }]
      })
    });
  } catch (e) {
    return error(`שגיאת תקשורת עם Claude: ${e.message}`, 502);
  }

  if (!aiResp.ok) {
    const txt = await aiResp.text();
    return error(`Claude החזיר שגיאה (${aiResp.status}): ${txt.slice(0, 200)}`, 502);
  }

  const aiData = await aiResp.json();
  const textBlock = (aiData.content || []).find(b => b.type === 'text');
  if (!textBlock) return error('לא התקבל תוכן מ-Claude', 502);

  // Parse JSON from response
  let raw = textBlock.text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1) raw = raw.slice(start, end + 1);

  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { return error('Claude החזיר JSON לא תקין', 502); }

  const productsArr = Array.isArray(parsed.products) ? parsed.products : [];

  // Insert invoice
  const invoiceId = uuid();
  const now = Math.floor(Date.now() / 1000);
  let totalCost = 0;

  await env.DB.prepare(
    `INSERT INTO invoices
       (id, supplier, invoice_number, invoice_date, currency, status,
        product_count, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`
  ).bind(
    invoiceId,
    parsed.supplier || null,
    parsed.invoice_number || null,
    parsed.date || null,
    parsed.currency || 'ILS',
    productsArr.length,
    session.uid,
    now, now
  ).run();

  // Insert products in batch
  const productInserts = productsArr.map((p, idx) => {
    const cost = Number(p.cost_price) || 0;
    const qty = Math.max(1, parseInt(p.quantity) || 1);
    totalCost += cost * qty;
    return env.DB.prepare(
      `INSERT INTO products (id, invoice_id, name, model, quantity, cost_price, customer_price, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
    ).bind(uuid(), invoiceId, p.name || '', p.model || null, qty, cost, idx);
  });

  if (productInserts.length > 0) {
    await env.DB.batch(productInserts);
    await env.DB.prepare(`UPDATE invoices SET total_cost = ? WHERE id = ?`)
      .bind(totalCost, invoiceId).run();
  }

  // Return the new invoice with products
  const invoice = await env.DB.prepare(`SELECT * FROM invoices WHERE id = ?`)
    .bind(invoiceId).first();
  const { results: products } = await env.DB
    .prepare(`SELECT * FROM products WHERE invoice_id = ? ORDER BY sort_order ASC`)
    .bind(invoiceId).all();

  return json({ invoice, products });
}
