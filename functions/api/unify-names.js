// functions/api/unify-names.js
// Receives a list of product names and asks Claude for a unified name
// (the common base name, without distinguishing attributes).
// Used by the manual merge feature in the invoice editor.

import { json, error, requireUser } from '../_utils.js';

export async function onRequestPost({ request, env }) {
  const session = await requireUser({ request, env });
  if (!session) return error('לא מחובר', 401);
  if (!env.ANTHROPIC_API_KEY) return error('שרת לא הוגדר נכון (חסר API key)', 500);

  let body;
  try { body = await request.json(); } catch { return error('שגיאת קלט', 400); }

  const names = Array.isArray(body?.names) ? body.names.filter(n => n && String(n).trim()) : null;
  if (!names || names.length < 2) return error('צריך לפחות 2 שמות', 400);
  if (names.length > 20) return error('יותר מדי שמות', 400);

  const prompt = `הנה רשימת שמות מוצרים שהמשתמש בחר לאחד למוצר אחד. הצע שם מאוחד.

שמות:
${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}

החזר JSON תקין בלבד בפורמט:
{ "unified_name": "השם המאוחד" }

═══════════════════════════════════════════════════
**unified_name — חוקים מדויקים**
═══════════════════════════════════════════════════

unified_name חייב להיות **החיתוך המילולי** של השמות — כלומר רק המילים המשותפות לכל הפריטים, ללא האטריבוטים המבדילים (צבע / מידה / גרסה משנית).

**דוגמאות:**
- "אוזניות NEO 123 שחור" + "אוזניות NEO 123 לבן" → "אוזניות NEO 123"
- "Samsung Galaxy A56 256GB" + "גלקסי A56 שחור" → "Samsung Galaxy A56" (משלב את המידע, מעדיף את המלא והמדויק יותר)
- "כבל USB-C 1 מטר אדום" + "כבל USB-C 1 מטר כחול" → "כבל USB-C 1 מטר"

**חוקים:**
1. שמור על השפה הברורה והמלאה ביותר (אם אחד באנגלית מלא ואחד בעברית מקוצר — בחר את המלא)
2. הסר את האטריבוט המבדיל בלבד
3. אל תוסיף מילים חדשות שלא הופיעו באף אחד מהשמות
4. אם השמות שונים מאוד (לא ברור שזה אותו מוצר) — החזר את השם הראשון כמו שהוא

החזר JSON בלבד, ללא markdown ללא טקסט נוסף.`;

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
        model: 'claude-opus-4-7',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }]
      })
    });
  } catch (e) {
    // Fallback: return the first name if AI is unreachable
    return json({ unified_name: names[0] });
  }

  if (!aiResp.ok) {
    return json({ unified_name: names[0] });
  }

  const aiData = await aiResp.json();
  const textBlock = (aiData.content || []).find(b => b.type === 'text');
  if (!textBlock) return json({ unified_name: names[0] });

  let raw = textBlock.text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1) raw = raw.slice(start, end + 1);

  try {
    const parsed = JSON.parse(raw);
    const unified = (parsed?.unified_name || '').trim();
    return json({ unified_name: unified || names[0] });
  } catch {
    return json({ unified_name: names[0] });
  }
}
