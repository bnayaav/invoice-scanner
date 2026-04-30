// functions/api/scan.js
// Receives base64 invoice images, calls Claude vision API, parses products,
// stores everything in D1, and returns the new invoice id + extracted data.

import { json, error, uuid, requireUser } from '../_utils.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_PAGES = 10;

const SYSTEM_PROMPT = `אתה עוזר לחנות בישראל לסרוק חשבוניות ספק ולחלץ את רשימת המוצרים. אתה מחזיר JSON תקין בלבד, ללא markdown, ללא טקסט נוסף לפני או אחרי.`;

const buildUserPrompt = (pageCount, suppliers = [], categories = []) => {
  const suppliersList = suppliers.length
    ? `\nרשימת הספקים הקיימים במערכת — חובה לבחור מהרשימה הזו אם אחד מהם מופיע בחשבונית:\n${suppliers.map(s => `- ${s}`).join('\n')}\n`
    : '';
  const categoriesList = categories.length
    ? `\nרשימת המחלקות הקיימות במערכת — לכל מוצר נסה לבחור את המחלקה המתאימה ביותר מהרשימה:\n${categories.map(c => `- ${c}`).join('\n')}\n`
    : '';

  return `סרוק את החשבונית ${pageCount > 1 ? `(${pageCount} עמודים)` : ''} והחזר JSON בפורמט הבא:

{
  "supplier": "שם הספק (מתוך הרשימה אם מופיע)",
  "invoice_number": "מספר חשבונית",
  "date": "DD/MM/YYYY",
  "currency": "ILS" | "USD" | "EUR",
  "products": [
    { "name": "שם המוצר המדויק כפי שמופיע בחשבונית, מילה במילה, בלי שינויים", "quantity": <int>, "cost_price": <number>, "category": "מחלקה מהרשימה או null", "barcode": "ברקוד אם רשום במפורש בחשבונית, אחרת null" }
  ]
}
${suppliersList}${categoriesList}
כללים:
- **שם המוצר**: העתק אותו **בדיוק** כמו שכתוב בעמודת "תאור" או "שם פריט". מילה במילה, סדר זהה. אל תוסיף מילים, אל תחליף מילים, אל תקצר, אל תפרש. אם כתוב "מטען+כבל TYPE-C לבן מקורי 15W סאני" — תכתוב את זה בדיוק. אל תוסיף סמלים כמו >>> או <<< או נקודות מיותרות.
- מחיר עלות תמיד ליחידה (אם רשום סך, חלק בכמות)
- אל תכלול מע״מ אם רשום בנפרד
- אל תכלול שורות של הנחות / סכום ביניים / מע״מ / משלוח / סך הכל
- שמור עברית בעברית, אנגלית באנגלית
- אם אין מספר חשבונית או תאריך — החזר null
- ספק: אם זיהית ספק בחשבונית שמופיע ברשימה, החזר את השם בדיוק כמו ברשימה. אם לא ברשימה, החזר את השם שראית.
- מחלקה: לכל מוצר, נסה לבחור מחלקה מתאימה מהרשימה. אם לא בטוח, החזר null.
- ברקוד: בחשבונית יש בדרך כלל עמודה ששמה "ברקוד" (בעברית) או "barcode" (באנגלית). אם זו אחת העמודות הנראות בטבלה, חלץ את הברקוד של כל מוצר ושים בשדה barcode. ברקודים אמיתיים הם בדרך כלל 8-13 ספרות. אסור להשתמש בעמודה ששמה "מק״ט" או "קוד פריט" — אלה זיהויים פנימיים, לא ברקוד! אם אין עמודת ברקוד מפורשת בטבלה — החזר null לכל המוצרים.
- בדוק כל מספר פעמיים`;
};

export async function onRequestPost({ request, env }) {
  const session = await requireUser({ request, env });
  if (!session) return error('לא מחובר', 401);
  if (!env.ANTHROPIC_API_KEY) return error('שרת לא הוגדר נכון (חסר API key)', 500);

  let body;
  try { body = await request.json(); } catch { return error('שגיאת קלט', 400); }

  const pages = Array.isArray(body?.pages) ? body.pages : null;
  if (!pages || pages.length === 0) return error('לא נשלחו תמונות', 400);
  if (pages.length > MAX_PAGES) return error(`מקסימום ${MAX_PAGES} עמודים`, 400);

  // Load suppliers + categories so Claude can match against them
  const [suppliersRes, categoriesRes] = await Promise.all([
    env.DB.prepare(`SELECT name FROM suppliers WHERE active = 1 ORDER BY name`).all(),
    env.DB.prepare(`SELECT name FROM categories ORDER BY sort_order, name`).all(),
  ]);
  const supplierNames = (suppliersRes.results || []).map(r => r.name);
  const categoryNames = (categoriesRes.results || []).map(r => r.name);

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
  content.push({ type: 'text', text: buildUserPrompt(pages.length, supplierNames, categoryNames) });

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

  // === שלב 2: זיהוי קבוצות "אותו מוצר בבסיס" ===
  // שולחים ל-Claude את רשימת המוצרים ושואלים אילו מהם הם בעצם אותו מוצר
  // (לדוגמה צבעים שונים של אותו פריט, או שורת בונוס 10+1)
  let groups = [];
  if (productsArr.length >= 2) {
    try {
      const productLines = productsArr.map((p, i) =>
        `${i}: ${p.name || ''}${p.model ? ' / ' + p.model : ''} | qty=${p.quantity} | cost=${p.cost_price}`
      ).join('\n');

      const groupingPrompt = `הנה רשימת מוצרים מחשבונית. זהה אילו מהם הם בעצם **אותו מוצר בבסיס** רק בווריאציות שונות (צבע שונה, או שורת בונוס "10+1" כשהיא מופיעה כשורה נפרדת עם מחיר 0 או מחיר נמוך משמעותית).

מוצרים:
${productLines}

החזר JSON תקין בלבד בפורמט:
{
  "groups": [
    { "indices": [0, 1], "reason": "אותו כבל בצבע שונה" }
  ]
}

כללים:
- כלול בקבוצה רק מוצרים שבאמת זהים בבסיס (אותו פונקציונליות, אותו דגם בסיסי)
- קבוצה חייבת לכלול לפחות 2 מוצרים
- אל תכלול בקבוצות מוצרים שונים אפילו אם השם דומה
- אם אין שום קבוצות — החזר {"groups": []}
- החזר JSON בלבד, ללא markdown ללא טקסט נוסף`;

      const groupResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 1024,
          messages: [{ role: 'user', content: groupingPrompt }]
        })
      });

      if (groupResp.ok) {
        const groupData = await groupResp.json();
        const groupText = (groupData.content || []).find(b => b.type === 'text')?.text || '';
        let cleanGroup = groupText.trim()
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/i, '');
        const gs = cleanGroup.indexOf('{');
        const ge = cleanGroup.lastIndexOf('}');
        if (gs !== -1 && ge !== -1) cleanGroup = cleanGroup.slice(gs, ge + 1);
        try {
          const groupParsed = JSON.parse(cleanGroup);
          if (Array.isArray(groupParsed.groups)) {
            groups = groupParsed.groups.filter(g =>
              Array.isArray(g.indices) && g.indices.length >= 2
            );
          }
        } catch (e) {
          // אם הפענוח נכשל, פשוט ממשיכים בלי קבוצות
        }
      }
    } catch (e) {
      // אם זיהוי הקבוצות נכשל, ממשיכים בלעדיו
    }
  }

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
    // Validate barcode: must be only digits, 8-13 chars (typical barcode format)
    let barcode = null;
    if (p.barcode) {
      const cleaned = String(p.barcode).replace(/[^\d]/g, '');
      if (cleaned.length >= 8 && cleaned.length <= 13) {
        barcode = cleaned;
      }
    }
    return env.DB.prepare(
      `INSERT INTO products (id, invoice_id, name, model, quantity, cost_price, customer_price, sort_order, category, supplier_name, barcode)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
    ).bind(
      uuid(), invoiceId,
      p.name || '', p.model || null,
      qty, cost, idx,
      p.category || null,
      parsed.supplier || null,
      barcode
    );
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

  // המרת ה-groups ל-product IDs (במקום אינדקסים)
  const groupsWithIds = groups.map(g => ({
    product_ids: g.indices.map(i => products[i]?.id).filter(Boolean),
    reason: g.reason || ''
  })).filter(g => g.product_ids.length >= 2);

  return json({ invoice, products, suggested_groups: groupsWithIds });
}
