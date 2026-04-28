# 📄 Invoice Scanner

PWA לסריקת חשבוניות ספק עם Claude AI, עריכת מחירי לקוח, וייבוא לקופה דרך סקריפט במחשב.

**Stack:** Cloudflare Pages + Pages Functions + D1 + Anthropic API · Hebrew RTL · Mobile-first

---

## ✨ מה יש

- 📷 צילום או העלאת חשבוניות (כולל מרובות עמודים)
- 🤖 סריקה עם Claude Sonnet 4.5 — מזהה ספק, מס׳ חשבונית, מוצרים, מחירי עלות
- 💰 שדה מחיר לקוח לכל מוצר עם חישוב רווח אוטומטי
- ⚡ "החל אחוז רווח על כולם" — markup bulk בלחיצה
- 📚 היסטוריית חשבוניות מלאה עם חיפוש (גם בתוך שמות מוצרים)
- 👥 כניסה למספר עובדים — כל חשבונית מתויגת ביוצר שלה
- 🔄 סקריפט פייתון במחשב מושך חשבוניות שמסומנות "מוכן" ומייבא לקופה

---

## 🏗️ ארכיטקטורה

```
  📱 PWA (Pages)              🟧 Functions               💾 D1
  ─────────────              ─────────────              ─────────────
   Login screen   ──────►    /api/login                users
   Camera/Upload  ──────►    /api/scan      ──────►    invoices
   Editor         ──────►    /api/invoices             products
   History        ──────►    /api/invoices?q=...
                                  │
                                  ▼
                             🤖 Anthropic API
                             (Claude Sonnet 4.5)

  🖥️ Desktop sync (Python)
  ─────────────────────────
   sync.py --watch  ──────►  /api/sync/pending  (X-Sync-Key)
                             /api/sync/complete
                             ↓
                       writes JSON+CSV to ./data
                       (or your custom POS hook)
```

---

## 🚀 הקמה ופריסה

### 1. שיבוט והתקנה

```bash
git clone <your-repo>
cd invoice-scanner
npm install
```

### 2. יצירת מסד הנתונים ב-D1

```bash
# יצירת ה-DB ב-Cloudflare (הפלט יכלול database_id)
npx wrangler d1 create invoice-scanner-db
```

הדבק את ה-`database_id` שקיבלת לתוך `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "invoice-scanner-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

הרץ את הסכמה:

```bash
npm run db:init
```

### 3. יצירת משתמש מנהל

```bash
# שלב 1 — צור hash לסיסמה
node scripts/hash-password.mjs "your-strong-password"
# פלט יראה משהו כמו:  WJxYz...:200000:aBc123...

# שלב 2 — ערוך את seed.sql, החלף PASTE_HASH_HERE בערך שקיבלת
# שלב 3 — הרץ
npm run db:seed
```

להוספת עובדים נוספים אחר כך:

```bash
# בנה SQL ידנית או הרץ דרך הקונסול:
npx wrangler d1 execute invoice-scanner-db --remote --command \
  "INSERT INTO users (id, username, display_name, password_hash, role) VALUES ('usr_yoni','yoni','יוני','HASH_FROM_SCRIPT','employee')"
```

### 4. הגדרת secrets

```bash
# Anthropic API key — תקבל מ-console.anthropic.com
npx wrangler pages secret put ANTHROPIC_API_KEY --project-name invoice-scanner

# מפתח לחתימה על cookies (תייצר עם openssl rand -hex 32)
npx wrangler pages secret put SESSION_SECRET --project-name invoice-scanner

# מפתח שהסקריפט במחשב משתמש בו (תייצר עם openssl rand -hex 32)
npx wrangler pages secret put SYNC_API_KEY --project-name invoice-scanner
```

### 5. פריסה

```bash
npm run deploy
```

ה-Pages יחבר את עצמו ל-D1 דרך ה-binding בקובץ `wrangler.toml`.

---

## 💻 פיתוח לוקאלי

```bash
# init local DB
npm run db:init-local

# הגדר .dev.vars לסודות לוקאליים
cat > .dev.vars <<EOF
ANTHROPIC_API_KEY=sk-ant-...
SESSION_SECRET=local-dev-secret-32chars-minimum
SYNC_API_KEY=local-sync-key
EOF

# הרץ
npm run dev
```

---

## 🖥️ הקמת הסקריפט במחשב

```bash
cd desktop-sync
cp .env.example .env
# ערוך .env — הכנס את API_BASE ו-SYNC_API_KEY שיצרת מקודם
pip install -r requirements.txt

# ריצה חד-פעמית
python sync.py

# מצב watch — בודק כל 30 שניות
python sync.py --watch
```

ברירת המחדל היא לשמור JSON + CSV של כל חשבונית מאושרת לתיקייה `./data`. אם תרצה להזריק ישירות לקופה, ערוך את הפונקציה `process_invoice()` ב-`sync.py` — יש שם הוק מוכן עם הערות.

### הרצה אוטומטית ברקע (Windows)

```batch
@echo off
cd /d C:\path\to\desktop-sync
python sync.py --watch
```

שמור כקובץ `.bat` והוסף ל-Task Scheduler עם trigger "At log on".

---

## 📡 API Reference

### Auth (cookie-based)
| Method | Path | Body |
|---|---|---|
| `POST` | `/api/login` | `{username, password}` |
| `POST` | `/api/logout` | — |
| `GET`  | `/api/me` | — |

### Invoices (cookie auth)
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/scan` | `{pages:[{media_type, data}]}` — שולח לCloud Claude, יוצר חשבונית |
| `GET`  | `/api/invoices?q=&status=` | רשימה עם חיפוש |
| `GET`  | `/api/invoices/:id` | חשבונית בודדת + מוצרים |
| `PUT`  | `/api/invoices/:id` | עדכון. שלח `{status:'ready'}` כדי לסמן כמוכן לייבוא |
| `DELETE` | `/api/invoices/:id` | מחיקה (לא של חשבוניות שיובאו) |

### Sync (header auth: `X-Sync-Key`)
| Method | Path | Description |
|---|---|---|
| `GET`  | `/api/sync/pending` | חשבוניות במצב `ready` |
| `POST` | `/api/sync/complete` | `{invoice_id, script_id?}` — מסמן כיובא |

---

## 🔐 מודל אבטחה

- **סיסמאות:** PBKDF2-SHA256 עם 200K איטרציות (Web Crypto API נטיב ב-Workers).
- **Sessions:** HMAC-SHA256 על JSON payload, נשמר ב-cookie `HttpOnly Secure SameSite=Lax`. תוקף 30 יום.
- **Sync API key:** מועבר בכותרת `X-Sync-Key`, מושווה ב-constant-time.
- **תמונות:** לא נשמרות בשרת אחרי הסריקה — נשלחות ל-Anthropic, התוצאה נכנסת ל-DB.

---

## 🗂️ מבנה הפרויקט

```
invoice-scanner/
├── functions/
│   ├── _utils.js                 # auth, hashing, JSON helpers
│   └── api/
│       ├── login.js              # POST
│       ├── logout.js             # POST
│       ├── me.js                 # GET
│       ├── scan.js               # POST — Claude vision
│       ├── invoices/
│       │   ├── index.js          # GET (list/search)
│       │   └── [id].js           # GET, PUT, DELETE
│       └── sync/
│           ├── pending.js        # GET (sync key)
│           └── complete.js       # POST (sync key)
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── manifest.json
├── desktop-sync/
│   ├── sync.py
│   ├── requirements.txt
│   └── .env.example
├── scripts/
│   └── hash-password.mjs
├── schema.sql
├── seed.sql
├── wrangler.toml
└── package.json
```

---

## 🛠️ שינויים נפוצים

**להחליף את המודל של Claude:** `functions/api/scan.js` שורה עם `model: 'claude-sonnet-4-5'`.

**לשנות את ה-prompt לסריקה:** באותו קובץ, ב-`buildUserPrompt()`.

**להוסיף שדות לחשבונית/מוצר:** עדכן `schema.sql`, `functions/api/invoices/[id].js` (PUT), ו-`renderInvoiceEditor()` ב-`app.js`.

**לשמור תמונות לארכיון:** הוסף R2 binding ל-`wrangler.toml` ושמור את התמונות ב-`scan.js` לפני קריאת Anthropic.

---

## 📝 רישיון

Private — for ComPhone use.
