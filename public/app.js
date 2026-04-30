// ============================================================
// Invoice Scanner — Frontend
// ============================================================

// ─── Globals ─────────────────────────────────────────────────
let currentUser = null;
let pages = [];                  // [{id, dataUrl, file, type}]
let currentInvoice = null;       // {invoice, products}
let activeTab = 'new';
let historyFilter = { status: '', q: '', supplier: '' };
let categories = [];             // loaded once after login
let suppliers = [];              // loaded once after login
let suggestedGroups = [];        // groups detected by AI after scan
let barcodeReader = null;        // ZXing reader instance
let activeBarcodeProductId = null;

// ─── Helpers ─────────────────────────────────────────────────
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const uuid = () => crypto.randomUUID();
const fmt = (n, cur = '₪') => `${cur}${(Number(n) || 0).toFixed(0)}`;
const currencySymbol = (c) => c === 'USD' ? '$' : c === 'EUR' ? '€' : '₪';

const SVG = {
  camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  sparkle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"/></svg>`,
  spinner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="9" opacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  percent: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`,
  trending: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  receipt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h20l-2 18-8-3-8 3z"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
  barcode: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5v14M7 5v14M12 5v14M17 5v14M21 5v14"/></svg>`,
  pos: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
};

const showLoading = (text) => { $('#loading-text').textContent = text; $('#loading-overlay').classList.remove('hidden'); };
const hideLoading = () => $('#loading-overlay').classList.add('hidden');

let toastTimer;
const toast = (msg, type = '') => {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2400);
};

// ─── Image compression ──────────────────────────────────────
async function compressImage(file, maxDim = 2400, quality = 0.92) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('compress failed'));
        resolve({ blob, dataUrl: canvas.toDataURL('image/jpeg', quality), type: 'image/jpeg' });
      }, 'image/jpeg', quality);
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const blobToBase64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result.split(',')[1]);
  r.onerror = rej;
  r.readAsDataURL(blob);
});

// ─── API client ─────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── Auth flow ──────────────────────────────────────────────
async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json().catch(() => ({}));

    if (data.setup_required) { showSetup(); return; }
    if (!res.ok) { showLogin(); return; }

    currentUser = data;
    showApp();
  } catch {
    showLogin();
  }
}

function showSetup() {
  $('#setup').classList.remove('hidden');
  $('#login').classList.add('hidden');
  $('#app').classList.add('hidden');
}

function showLogin() {
  $('#setup').classList.add('hidden');
  $('#login').classList.remove('hidden');
  $('#app').classList.add('hidden');
}

function showApp() {
  $('#setup').classList.add('hidden');
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#user-greeting').textContent = `שלום, ${currentUser.display_name}`;
  if (currentUser.role === 'admin') $('#categories-btn').classList.remove('hidden');
  if (currentUser.role === 'admin') $('#suppliers-btn')?.classList.remove('hidden');
  loadCategories();
  loadSuppliers();
  renderNewTab();
}

async function loadCategories() {
  try {
    const { categories: cats } = await api('/api/categories');
    categories = cats || [];
  } catch { categories = []; }
}

async function loadSuppliers() {
  try {
    const { suppliers: sups } = await api('/api/suppliers');
    suppliers = sups || [];
    renderSuppliersDatalist();
  } catch { suppliers = []; }
}

function renderSuppliersDatalist() {
  let dl = document.getElementById('suppliers-datalist');
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = 'suppliers-datalist';
    document.body.appendChild(dl);
  }
  dl.innerHTML = suppliers.map(s => `<option value="${escapeAttr(s.name)}"></option>`).join('');
}

$('#setup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const errEl = $('#setup-error');
  const btn = form.querySelector('.btn-primary');
  errEl.classList.add('hidden');
  btn.disabled = true;
  btn.querySelector('.btn-text').classList.add('hidden');
  btn.querySelector('.btn-loader').classList.remove('hidden');
  try {
    currentUser = await api('/api/setup', {
      method: 'POST',
      body: JSON.stringify({
        username: form.username.value.trim(),
        display_name: form.display_name.value.trim(),
        password: form.password.value
      })
    });
    showApp();
    form.reset();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-text').classList.remove('hidden');
    btn.querySelector('.btn-loader').classList.add('hidden');
  }
});

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const username = form.username.value.trim();
  const password = form.password.value;
  const errEl = $('#login-error');
  const btn = form.querySelector('.btn-primary');
  errEl.classList.add('hidden');
  btn.disabled = true;
  btn.querySelector('.btn-text').classList.add('hidden');
  btn.querySelector('.btn-loader').classList.remove('hidden');
  try {
    currentUser = await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    showApp();
    form.reset();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-text').classList.remove('hidden');
    btn.querySelector('.btn-loader').classList.add('hidden');
  }
});

$('#logout-btn').addEventListener('click', async () => {
  if (!confirm('להתנתק?')) return;
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  currentUser = null;
  pages = []; currentInvoice = null;
  showLogin();
});

// ─── Tab switching ──────────────────────────────────────────
$$('.tab').forEach(t => t.addEventListener('click', () => {
  activeTab = t.dataset.tab;
  $$('.tab').forEach(x => x.classList.toggle('active', x === t));
  $$('.tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === `tab-${activeTab}`)
  );
  if (activeTab === 'history') loadHistory();
  if (activeTab === 'new' && !currentInvoice) renderNewTab();
}));

// ─── New invoice — initial state / page upload ──────────────
function renderNewTab() {
  if (currentInvoice) {
    renderInvoiceEditor();
    return;
  }
  const root = $('#new-content');
  if (pages.length === 0) {
    root.innerHTML = `
      <div class="upload-card">
        <div class="upload-icon">${SVG.file}</div>
        <h2>חשבונית חדשה</h2>
        <p>צלם או העלה את החשבונית — Claude יסרוק וימשוך את כל המוצרים ומחירי העלות</p>
        <div class="upload-buttons">
          <button class="btn-camera" id="btn-camera">${SVG.camera}<span>צלם</span></button>
          <button class="btn-upload" id="btn-upload">${SVG.upload}<span>העלה</span></button>
        </div>
      </div>
      <div id="scan-error"></div>
    `;
    $('#btn-camera').onclick = () => $('#camera-input').click();
    $('#btn-upload').onclick = () => $('#file-input').click();
  } else {
    const thumbs = pages.map((p, i) => `
      <div class="page-thumb" data-id="${p.id}">
        <img src="${p.dataUrl}" alt="" />
        <div class="page-num">${i + 1}</div>
        <button class="page-remove" data-remove="${p.id}">${SVG.x}</button>
      </div>
    `).join('');
    root.innerHTML = `
      <div class="pages-section">
        <div class="pages-header">
          <div class="pages-count">
            <span>${pages.length} ${pages.length === 1 ? 'עמוד' : 'עמודים'}</span>
            <span class="badge">מוכן לסריקה</span>
          </div>
          <button class="add-page-btn" id="add-more">${SVG.plus} הוסף עמוד</button>
        </div>
        <div class="pages-grid">${thumbs}</div>
        <button class="scan-btn" id="scan-btn">
          ${SVG.sparkle}
          <span>סרוק עם Claude</span>
        </button>
      </div>
      <div id="scan-error"></div>
    `;
    $('#add-more').onclick = () => $('#file-input').click();
    $('#scan-btn').onclick = scanInvoice;
    $$('[data-remove]').forEach(btn => btn.onclick = () => {
      pages = pages.filter(x => x.id !== btn.dataset.remove);
      renderNewTab();
    });
  }
}

// File input handlers
async function handleFiles(files) {
  const list = Array.from(files).filter(f => f.type.startsWith('image/'));
  if (!list.length) return;
  showLoading('דוחס תמונות...');
  try {
    for (const f of list) {
      const { blob, dataUrl, type } = await compressImage(f);
      pages.push({ id: uuid(), dataUrl, blob, type });
    }
    renderNewTab();
  } catch (e) {
    toast('שגיאה בעיבוד התמונה', 'error');
  } finally {
    hideLoading();
  }
}
$('#file-input').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
$('#camera-input').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });

// ─── Scan ───────────────────────────────────────────────────
async function scanInvoice() {
  if (pages.length === 0) return;
  $('#scan-error').innerHTML = '';
  showLoading('Claude סורק את החשבונית...');
  try {
    const payload = [];
    for (const p of pages) {
      const data = await blobToBase64(p.blob);
      payload.push({ media_type: p.type, data });
    }
    const result = await api('/api/scan', {
      method: 'POST',
      body: JSON.stringify({ pages: payload })
    });
    currentInvoice = { invoice: result.invoice, products: result.products };
    suggestedGroups = result.suggested_groups || [];
    pages = [];
    if (suggestedGroups.length > 0) {
      toast(`נמצאו ${result.products.length} מוצרים, ${suggestedGroups.length} קבוצות לאיחוד`, 'success');
    } else {
      toast(`נמצאו ${result.products.length} מוצרים`, 'success');
    }
    renderInvoiceEditor();
  } catch (e) {
    $('#scan-error').innerHTML = `
      <div class="alert-error">${SVG.alert}<span>${e.message}</span></div>
    `;
  } finally {
    hideLoading();
  }
}

// ─── Invoice editor ─────────────────────────────────────────
function renderInvoiceEditor() {
  const inv = currentInvoice.invoice;
  const products = currentInvoice.products;
  const cur = currencySymbol(inv.currency);
  const filledCount = products.filter(p => Number(p.customer_price) > 0).length;
  const isReadOnly = inv.status === 'imported';

  // בנה מפת product_id → group_index לסימון מוצרים בקבוצה
  const productToGroup = {};
  suggestedGroups.forEach((g, gi) => {
    g.product_ids.forEach(pid => { productToGroup[pid] = gi; });
  });
  // איזה מוצרים הם הראשונים בקבוצה (כדי להציג כרטיס פעם אחת לפני)
  const firstInGroup = {};
  suggestedGroups.forEach((g, gi) => {
    if (g.product_ids[0]) firstInGroup[g.product_ids[0]] = gi;
  });

  let productCardsList = [];
  products.forEach((p, idx) => {
    const groupIdx = productToGroup[p.id];
    const isFirstInGroup = firstInGroup[p.id] !== undefined;

    // אם זה המוצר הראשון בקבוצה — הוסף כרטיס קבוצה לפניו
    if (isFirstInGroup) {
      const g = suggestedGroups[groupIdx];
      const memberProducts = products.filter(prod => g.product_ids.includes(prod.id));
      const totalQty = memberProducts.reduce((s, prod) => s + (Number(prod.quantity) || 1), 0);
      const totalCost = memberProducts.reduce((s, prod) => s + (Number(prod.cost_price) || 0) * (Number(prod.quantity) || 1), 0);
      const avgCost = totalQty > 0 ? totalCost / totalQty : 0;

      productCardsList.push(`
        <div class="group-suggestion" data-gid="${groupIdx}">
          <div class="group-suggestion-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            <div class="group-suggestion-text">
              <strong>AI זיהה אותו מוצר</strong>
              <span>${escapeHtml(g.reason || 'מוצרים דומים')} · ${memberProducts.length} שורות → כמות ${totalQty} · עלות ${cur}${avgCost.toFixed(2)}</span>
            </div>
          </div>
          ${isReadOnly ? '' : `
          <div class="group-suggestion-actions">
            <button class="btn-merge" data-merge-group="${groupIdx}">אחד</button>
            <button class="btn-keep-separate" data-dismiss-group="${groupIdx}">השאר נפרד</button>
          </div>
          `}
        </div>
      `);
    }
    const cost = Number(p.cost_price) || 0;
    const cust = Number(p.customer_price) || 0;
    const hasPrice = cust > 0;
    const markup = (cost > 0 && cust > 0) ? (((cust - cost) / cost) * 100).toFixed(0) : null;
    const profit = cust - cost;
    const isPositive = profit >= 0;
    const inGroup = productToGroup[p.id] !== undefined;

    // אם המוצר מדולג — תצוגה מצומצמת
    if (p.skip_import && !isReadOnly) {
      productCardsList.push(`
        <div class="product-card-skipped" data-pid="${p.id}">
          <div class="skipped-num">${idx + 1}</div>
          <div class="skipped-info">
            <span class="skipped-icon">⊘</span>
            <span class="skipped-name">${escapeHtml(p.name || 'ללא שם')}</span>
          </div>
          <button class="btn-unskip" data-unskip="${p.id}">החזר לייבוא</button>
        </div>
      `);
      return;
    }

    const cardHtml = `
      <div class="product-card ${hasPrice ? 'has-price' : ''} ${p.error_message ? 'has-error' : ''} ${p.is_new ? 'is-new' : 'is-existing'} ${inGroup ? 'in-group' : ''} ${p.print_only ? 'is-print-only' : ''}" data-pid="${p.id}">
        ${p.error_message ? `
          <div class="product-error-banner">
            ${SVG.alert}
            <span>${escapeHtml(p.error_message)}</span>
          </div>
        ` : ''}

        ${isReadOnly ? '' : `
        <div class="product-status-row">
          <button class="status-toggle ${p.is_new ? '' : 'active'}" data-set-new="${p.id}" data-value="0">
            <span class="status-dot existing"></span>קיים
          </button>
          <button class="status-toggle ${p.is_new ? 'active' : ''}" data-set-new="${p.id}" data-value="1">
            <span class="status-dot new"></span>חדש
          </button>
          <button class="status-toggle print-toggle ${p.print_labels === 0 ? '' : 'active'}" data-toggle-print="${p.id}" title="${p.print_labels === 0 ? 'לא מדפיסים' : 'מדפיסים מדבקה'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            ${p.print_labels === 0 ? 'ללא הדפסה' : 'מדבקה'}
          </button>
          <button class="status-toggle skip-toggle" data-skip="${p.id}" title="דלג על מוצר זה">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">
              <circle cx="12" cy="12" r="10"/>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
            דלג
          </button>
          <button class="status-toggle print-only-toggle ${p.print_only ? 'active' : ''}" data-toggle-print-only="${p.id}" title="${p.print_only ? 'הדפסה בלבד פעיל' : 'הדפס מדבקות בלי לעדכן'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            רק מדבקה
          </button>
        </div>
        `}

        <div class="product-row1">
          <div class="product-num">${idx + 1}</div>
          <div class="product-fields">
            <input class="product-name" data-field="name" value="${escapeAttr(p.name || '')}" placeholder="שם המוצר" ${isReadOnly ? 'readonly' : ''} />
          </div>
          ${isReadOnly ? '' : `<button class="product-remove" data-remove="${p.id}">${SVG.trash}</button>`}
        </div>
        <div class="product-grid">
          <div>
            <label>כמות</label>
            <input type="number" class="qty" data-field="quantity" value="${p.quantity || 1}" min="1" ${isReadOnly ? 'readonly' : ''} />
          </div>
          <div>
            <label>עלות</label>
            <div class="input-wrap">
              <input type="number" step="0.01" class="has-currency" data-field="cost_price" value="${cost || ''}" ${isReadOnly ? 'readonly' : ''} />
              <span class="currency-symbol">${cur}</span>
            </div>
          </div>
          <div>
            <label class="price-label">ללקוח</label>
            <div class="input-wrap">
              <input type="number" step="0.01" class="customer-price has-currency ${hasPrice ? 'filled' : ''}" data-field="customer_price" value="${cust || ''}" placeholder="0" ${isReadOnly ? 'readonly' : ''} />
              <span class="currency-symbol amber">${cur}</span>
            </div>
          </div>
        </div>
        ${markup !== null ? `
          <div class="product-markup">
            <span class="label">רווח</span>
            <span class="value ${isPositive ? 'positive' : 'negative'}">
              ${SVG.trending}
              ${markup}% · ${cur}${profit.toFixed(2)}
            </span>
          </div>
        ` : ''}

        ${(isReadOnly && p.previous_cost !== null && p.previous_cost !== undefined && Math.abs(p.previous_cost - cost) > 0.01) ? (() => {
          const diff = cost - p.previous_cost;
          const pct = p.previous_cost > 0 ? ((diff / p.previous_cost) * 100).toFixed(0) : 0;
          const isUp = diff > 0;
          return `
            <div class="cost-change-badge ${isUp ? 'up' : 'down'}">
              <span class="cost-change-icon">${isUp ? '📈' : '📉'}</span>
              <span class="cost-change-text">
                <strong>עלות ${isUp ? 'עלתה' : 'ירדה'} ב-${Math.abs(pct)}%</strong>
                <span>${cur}${p.previous_cost.toFixed(2)} → ${cur}${cost.toFixed(2)}</span>
              </span>
            </div>
          `;
        })() : ''}

        <div class="product-barcode-row">
          <div>
            <label>ברקוד</label>
            <input data-field="barcode" value="${escapeAttr(p.barcode || '')}" placeholder="ברקוד מוצר" ${isReadOnly ? 'readonly' : ''} />
          </div>
          ${isReadOnly ? '' : `<button class="scan-barcode-btn" data-scan="${p.id}" title="סרוק ברקוד">${SVG.barcode}</button>`}
        </div>

        <div class="product-cat-row">
          <div>
            <label>מחלקה</label>
            <select data-field="category" ${isReadOnly ? 'disabled' : ''}>
              <option value="">— בחר מחלקה —</option>
              ${categories.map(c => `
                <option value="${escapeAttr(c.name)}" ${p.category === c.name ? 'selected' : ''}>${escapeHtml(c.name)}</option>
              `).join('')}
            </select>
          </div>
          <div>
            <label>ספק</label>
            <input list="suppliers-datalist" data-field="supplier_name" value="${escapeAttr(p.supplier_name || inv.supplier || '')}" placeholder="בחר או הקלד..." ${isReadOnly ? 'readonly' : ''} />
          </div>
        </div>
      </div>
    `;
    productCardsList.push(cardHtml);
  });
  const productCards = productCardsList.join('');

  const totalCost = products.reduce((s, p) => s + (Number(p.cost_price) || 0) * (Number(p.quantity) || 1), 0);
  const totalRevenue = products.reduce((s, p) => s + (Number(p.customer_price) || 0) * (Number(p.quantity) || 1), 0);
  const totalProfit = totalRevenue - totalCost;

  $('#new-content').innerHTML = `
    <div style="display:flex; gap:8px; align-items:center; margin-bottom:14px;">
      <button class="icon-btn" id="back-to-upload">${SVG.back}</button>
      <span style="font-size:12px; color:var(--muted);">
        ${isReadOnly ? 'מצב צפייה (יובא)' : 'עריכת חשבונית'}
        ${inv.status === 'ready' ? ' · מוכן לייבוא' : ''}
      </span>
    </div>

    <div class="invoice-meta">
      <div class="invoice-meta-label">חשבונית</div>
      <input list="suppliers-datalist" class="invoice-meta-input title" data-meta="supplier" value="${escapeAttr(inv.supplier || '')}" placeholder="שם הספק" ${isReadOnly ? 'readonly' : ''} />
      <div class="invoice-meta-grid">
        <div>
          <div class="invoice-meta-label">מס׳ חשבונית</div>
          <input class="invoice-meta-input" data-meta="invoice_number" value="${escapeAttr(inv.invoice_number || '')}" ${isReadOnly ? 'readonly' : ''} />
        </div>
        <div>
          <div class="invoice-meta-label">תאריך</div>
          <input class="invoice-meta-input" data-meta="invoice_date" value="${escapeAttr(inv.invoice_date || '')}" ${isReadOnly ? 'readonly' : ''} />
        </div>
      </div>
    </div>

    ${isReadOnly ? '' : `
    <div class="bulk-card">
      <div class="bulk-card-label">${SVG.percent}<span>החל אחוז רווח על כולם</span></div>
      <div class="bulk-row">
        <input type="number" id="bulk-markup" placeholder="לדוגמה 25" />
        <button id="bulk-apply">החל</button>
      </div>
    </div>

    <div class="bulk-card">
      <div class="bulk-card-label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px;"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        <span>סמן את כל המוצרים</span>
      </div>
      <div class="bulk-row">
        <button id="mark-all-existing" class="bulk-mark-btn">
          <span class="status-dot existing"></span> הכל קיימים
        </button>
        <button id="mark-all-new" class="bulk-mark-btn">
          <span class="status-dot new"></span> הכל חדשים
        </button>
      </div>
    </div>
    `}

    <div class="products-header">
      <h3>מוצרים <span>· ${products.length}</span></h3>
      <span class="meta-text">${filledCount} / ${products.length} עם מחיר</span>
    </div>
    <div class="products-list" id="products-list">${productCards}</div>
    ${isReadOnly ? '' : `<button class="add-product-btn" id="add-product">${SVG.plus}<span>הוסף מוצר ידנית</span></button>`}

    <div class="summary-bar">
      <div class="summary-card">
        <div class="summary-stats">
          <div class="summary-stat"><div class="label">עלות</div><div class="value">${cur}${totalCost.toFixed(0)}</div></div>
          <div class="summary-divider"></div>
          <div class="summary-stat"><div class="label">מכירה</div><div class="value">${cur}${totalRevenue.toFixed(0)}</div></div>
          <div class="summary-divider"></div>
          <div class="summary-stat"><div class="label">רווח</div><div class="value ${totalProfit >= 0 ? 'positive' : 'negative'}">${cur}${totalProfit.toFixed(0)}</div></div>
        </div>
        <div class="summary-actions">
          ${isReadOnly ? `
            <button class="btn-summary secondary" id="back-list">חזור</button>
          ` : (inv.status === 'ready' ? `
            <button class="btn-summary secondary" id="save-draft">שמור</button>
            <button class="btn-summary primary" id="back-list">${SVG.check} סגור</button>
          ` : `
            <button class="btn-summary secondary" id="save-draft">שמור</button>
            <button class="btn-summary primary" id="mark-ready">${SVG.send} מוכן</button>
          `)}
        </div>
      </div>
    </div>
  `;

  // Wire up
  $('#back-to-upload').onclick = async () => {
    if (!isReadOnly && hasUnsavedEdits()) {
      if (!confirm('לחזור בלי לשמור?')) return;
    }
    currentInvoice = null;
    suggestedGroups = [];
    pages = [];
    renderNewTab();
  };

  if (!isReadOnly) {
    // Field updates
    $$('[data-meta]').forEach(input => {
      input.oninput = () => { currentInvoice.invoice[input.dataset.meta] = input.value; };
    });
    $$('.product-card').forEach(card => {
      const pid = card.dataset.pid;
      card.querySelectorAll('[data-field]').forEach(input => {
        const evt = (input.tagName === 'SELECT') ? 'onchange' : 'oninput';
        input[evt] = () => updateProductField(pid, input.dataset.field, input.value);
      });
      const rm = card.querySelector('[data-remove]');
      if (rm) rm.onclick = () => removeProduct(pid);
      const scanBtn = card.querySelector('[data-scan]');
      if (scanBtn) scanBtn.onclick = () => openBarcodeScanner(pid);
      // Status toggle (new/existing)
      card.querySelectorAll('[data-set-new]').forEach(btn => {
        btn.onclick = () => {
          updateProductField(pid, 'is_new', btn.dataset.value === '1' ? 1 : 0);
          renderInvoiceEditor();
        };
      });
      // Print labels toggle
      const printBtn = card.querySelector('[data-toggle-print]');
      if (printBtn) {
        printBtn.onclick = () => {
          const p = currentInvoice.products.find(x => x.id === pid);
          const newVal = p.print_labels === 0 ? 1 : 0;
          updateProductField(pid, 'print_labels', newVal);
          renderInvoiceEditor();
        };
      }
      // Skip toggle
      const skipBtn = card.querySelector('[data-skip]');
      if (skipBtn) {
        skipBtn.onclick = () => {
          updateProductField(pid, 'skip_import', 1);
          renderInvoiceEditor();
          toast('המוצר ידולג בייבוא', 'success');
        };
      }
      const unskipBtn = card.querySelector('[data-unskip]');
      if (unskipBtn) {
        unskipBtn.onclick = () => {
          updateProductField(pid, 'skip_import', 0);
          renderInvoiceEditor();
        };
      }
      // Print-only toggle
      const printOnlyBtn = card.querySelector('[data-toggle-print-only]');
      if (printOnlyBtn) {
        printOnlyBtn.onclick = () => {
          const p = currentInvoice.products.find(x => x.id === pid);
          updateProductField(pid, 'print_only', p.print_only ? 0 : 1);
          renderInvoiceEditor();
        };
      }
    });

    // Wire up "החזר לייבוא" buttons on skipped (compact) cards
    $$('.product-card-skipped [data-unskip]').forEach(btn => {
      btn.onclick = () => {
        updateProductField(btn.dataset.unskip, 'skip_import', 0);
        renderInvoiceEditor();
      };
    });
    $('#add-product').onclick = addProduct;
    $('#bulk-apply').onclick = applyBulkMarkup;

    // Bulk status mark buttons
    if ($('#mark-all-existing')) {
      $('#mark-all-existing').onclick = () => {
        currentInvoice.products.forEach(p => p.is_new = 0);
        dirty = true;
        renderInvoiceEditor();
        toast('כל המוצרים סומנו כקיימים', 'success');
      };
    }
    if ($('#mark-all-new')) {
      $('#mark-all-new').onclick = () => {
        currentInvoice.products.forEach(p => p.is_new = 1);
        dirty = true;
        renderInvoiceEditor();
        toast('כל המוצרים סומנו כחדשים', 'success');
      };
    }

    // Group merge / dismiss buttons
    $$('[data-merge-group]').forEach(btn => {
      btn.onclick = () => mergeGroup(parseInt(btn.dataset.mergeGroup));
    });
    $$('[data-dismiss-group]').forEach(btn => {
      btn.onclick = () => dismissGroup(parseInt(btn.dataset.dismissGroup));
    });

    $('#save-draft').onclick = () => saveInvoice('draft');
    if ($('#mark-ready')) $('#mark-ready').onclick = () => saveInvoice('ready');
  }

  if ($('#back-list')) $('#back-list').onclick = () => {
    currentInvoice = null;
    activeTab = 'history';
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'history'));
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-history'));
    loadHistory();
  };
}

function escapeAttr(s) {
  return String(s ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

let dirty = false;
function hasUnsavedEdits() { return dirty; }

function updateProductField(pid, field, value) {
  const p = currentInvoice.products.find(x => x.id === pid);
  if (!p) return;
  if (['quantity'].includes(field)) {
    p[field] = parseInt(value) || 1;
  } else if (['cost_price', 'customer_price'].includes(field)) {
    p[field] = parseFloat(value) || 0;
  } else {
    p[field] = value;
  }
  dirty = true;

  // Live update of UI for price-related fields
  if (field === 'customer_price' || field === 'cost_price') {
    refreshSummary();
    refreshProductCard(pid);
  }
}

function refreshSummary() {
  const products = currentInvoice.products;
  const cur = currencySymbol(currentInvoice.invoice.currency);
  const totalCost = products.reduce((s, p) => s + (Number(p.cost_price) || 0) * (Number(p.quantity) || 1), 0);
  const totalRevenue = products.reduce((s, p) => s + (Number(p.customer_price) || 0) * (Number(p.quantity) || 1), 0);
  const totalProfit = totalRevenue - totalCost;
  const stats = $$('.summary-stat .value');
  if (stats.length === 3) {
    stats[0].textContent = `${cur}${totalCost.toFixed(0)}`;
    stats[1].textContent = `${cur}${totalRevenue.toFixed(0)}`;
    stats[2].textContent = `${cur}${totalProfit.toFixed(0)}`;
    stats[2].classList.toggle('positive', totalProfit >= 0);
    stats[2].classList.toggle('negative', totalProfit < 0);
  }
  const filledCount = products.filter(p => Number(p.customer_price) > 0).length;
  const meta = $('.products-header .meta-text');
  if (meta) meta.textContent = `${filledCount} / ${products.length} עם מחיר`;
}

function refreshProductCard(pid) {
  const card = document.querySelector(`.product-card[data-pid="${pid}"]`);
  if (!card) return;
  const p = currentInvoice.products.find(x => x.id === pid);
  const cur = currencySymbol(currentInvoice.invoice.currency);
  const cost = Number(p.cost_price) || 0;
  const cust = Number(p.customer_price) || 0;
  const hasPrice = cust > 0;
  card.classList.toggle('has-price', hasPrice);
  const custInput = card.querySelector('.customer-price');
  if (custInput) custInput.classList.toggle('filled', hasPrice);

  // Update markup section
  let markupEl = card.querySelector('.product-markup');
  if (cost > 0 && cust > 0) {
    const markup = (((cust - cost) / cost) * 100).toFixed(0);
    const profit = cust - cost;
    const isPositive = profit >= 0;
    const html = `
      <span class="label">רווח</span>
      <span class="value ${isPositive ? 'positive' : 'negative'}">
        ${SVG.trending}
        ${markup}% · ${cur}${profit.toFixed(2)}
      </span>
    `;
    if (markupEl) {
      markupEl.innerHTML = html;
    } else {
      const div = document.createElement('div');
      div.className = 'product-markup';
      div.innerHTML = html;
      card.appendChild(div);
    }
  } else if (markupEl) {
    markupEl.remove();
  }
}

function removeProduct(pid) {
  currentInvoice.products = currentInvoice.products.filter(x => x.id !== pid);
  dirty = true;
  renderInvoiceEditor();
}

function addProduct() {
  currentInvoice.products.push({
    id: uuid(),
    name: '', model: '', quantity: 1, cost_price: 0, customer_price: 0,
    barcode: '', category: '', supplier_name: currentInvoice.invoice.supplier || '',
    is_new: 0, print_labels: 1, skip_import: 0, print_only: 0
  });
  dirty = true;
  renderInvoiceEditor();
}

function applyBulkMarkup() {
  const pct = parseFloat($('#bulk-markup').value);
  if (isNaN(pct)) return;
  currentInvoice.products.forEach(p => {
    p.customer_price = Math.round((Number(p.cost_price) || 0) * (1 + pct / 100));
  });
  dirty = true;
  renderInvoiceEditor();
  toast('עודכנו מחירים לכל המוצרים', 'success');
}

function dismissGroup(groupIdx) {
  suggestedGroups.splice(groupIdx, 1);
  renderInvoiceEditor();
}

async function mergeGroup(groupIdx) {
  const g = suggestedGroups[groupIdx];
  if (!g) return;

  const memberProducts = currentInvoice.products.filter(p => g.product_ids.includes(p.id));
  if (memberProducts.length < 2) {
    suggestedGroups.splice(groupIdx, 1);
    renderInvoiceEditor();
    return;
  }

  // הצעת שם משותף — השם של המוצר הראשון
  const defaultName = memberProducts[0].name || '';
  const newName = prompt('שם המוצר המאוחד:', defaultName);
  if (newName === null) return; // ביטול
  if (!newName.trim()) {
    toast('שם לא יכול להיות ריק', 'error');
    return;
  }

  // חישוב כמות ועלות מאוחדים
  const totalQty = memberProducts.reduce((s, p) => s + (Number(p.quantity) || 1), 0);
  const totalCost = memberProducts.reduce((s, p) => s + (Number(p.cost_price) || 0) * (Number(p.quantity) || 1), 0);
  const avgCost = totalQty > 0 ? totalCost / totalQty : 0;

  // המוצר המאוחד יחליף את הראשון, השאר יוסרו
  const first = memberProducts[0];
  first.name = newName.trim();
  first.quantity = totalQty;
  first.cost_price = Math.round(avgCost * 100) / 100;
  first.merged_from = JSON.stringify(g.product_ids);
  // ה-customer_price נשאר אם יש, אחרת 0

  // הסרת השאר
  const idsToRemove = g.product_ids.filter(id => id !== first.id);
  currentInvoice.products = currentInvoice.products.filter(p => !idsToRemove.includes(p.id));

  // הסרת הקבוצה
  suggestedGroups.splice(groupIdx, 1);
  dirty = true;
  renderInvoiceEditor();
  toast(`אוחדו ${memberProducts.length} שורות`, 'success');
}

async function saveInvoice(targetStatus) {
  showLoading('שומר...');
  try {
    const inv = currentInvoice.invoice;
    const result = await api(`/api/invoices/${inv.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        supplier: inv.supplier,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        currency: inv.currency,
        status: targetStatus,
        products: currentInvoice.products
      })
    });
    currentInvoice = result;
    dirty = false;
    toast(targetStatus === 'ready' ? 'נשמר וסומן כמוכן לייבוא' : 'נשמר', 'success');
    renderInvoiceEditor();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    hideLoading();
  }
}

// ─── History tab ────────────────────────────────────────────
let historyTimer;
$('#history-search').addEventListener('input', (e) => {
  historyFilter.q = e.target.value.trim();
  clearTimeout(historyTimer);
  historyTimer = setTimeout(loadHistory, 300);
});
$$('.pill').forEach(p => p.addEventListener('click', () => {
  $$('.pill').forEach(x => x.classList.toggle('active', x === p));
  historyFilter.status = p.dataset.status;
  loadHistory();
}));

async function loadHistory() {
  const list = $('#history-list');
  list.innerHTML = '<div class="empty-state"><p>טוען...</p></div>';
  try {
    const params = new URLSearchParams();
    if (historyFilter.status) params.set('status', historyFilter.status);
    if (historyFilter.q) params.set('q', historyFilter.q);
    const { invoices: allInvoices } = await api(`/api/invoices?${params}`);

    // Build supplier list (unique, sorted)
    const supplierSet = new Set();
    allInvoices.forEach(inv => {
      if (inv.supplier && inv.supplier.trim()) supplierSet.add(inv.supplier.trim());
    });
    const supplierList = [...supplierSet].sort((a, b) => a.localeCompare(b, 'he'));

    // Inject supplier dropdown if not yet there
    let supplierFilter = $('#supplier-filter');
    if (!supplierFilter) {
      const filterPills = document.querySelector('#tab-history .filter-pills');
      if (filterPills) {
        const wrap = document.createElement('div');
        wrap.className = 'supplier-filter-wrap';
        wrap.innerHTML = `
          <select id="supplier-filter">
            <option value="">— כל הספקים —</option>
          </select>
        `;
        filterPills.parentNode.insertBefore(wrap, filterPills.nextSibling);
        supplierFilter = $('#supplier-filter');
        supplierFilter.onchange = (e) => {
          historyFilter.supplier = e.target.value;
          loadHistory();
        };
      }
    }

    // Update options if changed
    if (supplierFilter) {
      const currentVal = historyFilter.supplier;
      supplierFilter.innerHTML = `<option value="">— כל הספקים —</option>` +
        supplierList.map(s => `<option value="${escapeAttr(s)}" ${s === currentVal ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
    }

    // Apply supplier filter
    const invoices = historyFilter.supplier
      ? allInvoices.filter(inv => (inv.supplier || '').trim() === historyFilter.supplier)
      : allInvoices;

    if (!invoices.length) {
      list.innerHTML = `
        <div class="empty-state">
          ${SVG.receipt}
          <p>לא נמצאו חשבוניות${historyFilter.q || historyFilter.supplier ? ' תואמות' : ' עדיין'}</p>
        </div>`;
      return;
    }
    list.innerHTML = invoices.map(inv => {
      const cur = currencySymbol(inv.currency);
      const date = new Date(inv.created_at * 1000).toLocaleDateString('he-IL', {
        day: 'numeric', month: 'short', year: 'numeric'
      });
      const profit = (inv.total_revenue || 0) - (inv.total_cost || 0);
      const hasError = inv.error_message;
      const canRun = inv.status === 'ready';
      return `
        <div class="history-card ${hasError ? 'has-error' : ''}" data-id="${inv.id}">
          <div class="history-card-top">
            <div>
              <div class="history-supplier">${escapeHtml(inv.supplier || '— ללא ספק —')}</div>
              <div class="history-invoice-num">${inv.invoice_number ? '#' + escapeHtml(inv.invoice_number) : ''} ${inv.creator_name ? '· ' + escapeHtml(inv.creator_name) : ''}</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="history-status status-${inv.status}">${statusLabel(inv.status)}</span>
              <button class="history-delete-btn" data-del="${inv.id}" data-supplier="${escapeAttr(inv.supplier || '')}">${SVG.trash}</button>
            </div>
          </div>
          ${hasError ? `
            <div class="history-error">
              ${SVG.alert}
              <span>${escapeHtml(inv.error_message)}</span>
            </div>
          ` : ''}
          <div class="history-card-bottom">
            <div class="history-meta">
              <span>${date}</span>
              <span>${inv.product_count} פריטים</span>
            </div>
            <div class="history-totals">
              ${cur}${(inv.total_cost || 0).toFixed(0)}
              ${profit > 0 ? `<span class="green">+${cur}${profit.toFixed(0)}</span>` : ''}
            </div>
          </div>
          ${canRun ? `
            <button class="run-invoice-btn" data-run="${inv.id}" data-supplier="${escapeAttr(inv.supplier || '')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              הרץ עכשיו לקופה
            </button>
          ` : ''}
        </div>
      `;
    }).join('');

    $$('.history-card').forEach(card => {
      card.onclick = (e) => {
        if (e.target.closest('[data-del]') || e.target.closest('[data-run]')) return;
        openInvoice(card.dataset.id);
      };
    });
    $$('[data-del]').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const id = btn.dataset.del;
        const supplier = btn.dataset.supplier || 'ללא ספק';
        if (!confirm(`למחוק את החשבונית של ${supplier}?\nפעולה זו לא ניתנת לביטול.`)) return;
        try {
          await api(`/api/invoices/${id}`, { method: 'DELETE' });
          toast('החשבונית נמחקה', 'success');
          loadHistory();
        } catch (err) {
          toast(err.message, 'error');
        }
      };
    });
    $$('[data-run]').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const id = btn.dataset.run;
        const supplier = btn.dataset.supplier || 'ללא ספק';
        if (!confirm(`להריץ את החשבונית של ${supplier} בקופה?`)) return;
        try {
          const res = await api('/api/jobs/create', {
            method: 'POST',
            body: JSON.stringify({ invoice_id: id })
          });
          showJobMonitor(res.job_id, supplier);
        } catch (err) {
          toast(err.message, 'error');
        }
      };
    });
  } catch (e) {
    list.innerHTML = `<div class="alert-error">${SVG.alert}<span>${e.message}</span></div>`;
  }
}

function statusLabel(s) {
  return ({ draft: 'טיוטה', ready: 'מוכן', imported: 'יובא', archived: 'בארכיון' })[s] || s;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function openInvoice(id) {
  showLoading('טוען חשבונית...');
  try {
    currentInvoice = await api(`/api/invoices/${id}`);
    activeTab = 'new';
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'new'));
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-new'));
    dirty = false;
    renderInvoiceEditor();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    hideLoading();
  }
}

// ─── Barcode scanner ────────────────────────────────────────
async function openBarcodeScanner(productId) {
  activeBarcodeProductId = productId;
  $('#barcode-modal').classList.remove('hidden');
  $('#barcode-status').textContent = 'מבקש גישה למצלמה...';
  updateScanQueueLabel();

  if (!window.ZXing) {
    $('#barcode-status').textContent = 'ספריית סריקה לא נטענה';
    return;
  }

  try {
    barcodeReader = new ZXing.BrowserMultiFormatReader();
    const devices = await barcodeReader.listVideoInputDevices();
    if (!devices.length) {
      $('#barcode-status').textContent = 'לא נמצאה מצלמה';
      return;
    }
    const rear = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[devices.length - 1];

    $('#barcode-status').textContent = 'מכוון את הברקוד למסגרת';
    barcodeReader.decodeFromVideoDevice(rear.deviceId, 'barcode-video', (result, err) => {
      // אם הסורק נסגר באמצע — לא לעבד תוצאות
      if (!barcodeReader || !activeBarcodeProductId) return;

      if (result) {
        const code = result.getText();
        if (code && code !== lastScannedCode) {
          lastScannedCode = code;
          setTimeout(() => { lastScannedCode = null; }, 1500); // prevent re-scan flood

          updateProductField(activeBarcodeProductId, 'barcode', code);
          const card = document.querySelector(`.product-card[data-pid="${activeBarcodeProductId}"]`);
          const input = card?.querySelector('[data-field="barcode"]');
          if (input) input.value = code;
          if (navigator.vibrate) navigator.vibrate(80);

          // Continuous mode: jump to next product without barcode
          const nextPid = findNextEmptyBarcode(activeBarcodeProductId);
          if (nextPid) {
            activeBarcodeProductId = nextPid;
            $('#barcode-status').textContent = `✓ ${code.slice(0, 12)} — סורק את הבא...`;
            updateScanQueueLabel();
            // Briefly highlight which product is next
            const nextCard = document.querySelector(`.product-card[data-pid="${nextPid}"]`);
            if (nextCard) nextCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            // No more empty barcodes — close
            closeBarcodeScanner();
            toast(`ברקוד אחרון נסרק: ${code}`, 'success');
          }
        }
      }
    });
  } catch (e) {
    $('#barcode-status').textContent = 'שגיאה: ' + (e.message || e);
  }
}

let lastScannedCode = null;

function findNextEmptyBarcode(currentId) {
  const products = currentInvoice?.products || [];
  const currentIdx = products.findIndex(p => p.id === currentId);
  // Look forward from current position, wrap around
  for (let offset = 1; offset <= products.length; offset++) {
    const idx = (currentIdx + offset) % products.length;
    if (idx === currentIdx) break;
    const p = products[idx];
    if (!(p.barcode || '').trim()) return p.id;
  }
  return null;
}

function updateScanQueueLabel() {
  const products = currentInvoice?.products || [];
  const remaining = products.filter(p => !(p.barcode || '').trim()).length;
  const label = document.getElementById('barcode-queue-count');
  if (label) {
    label.textContent = remaining > 0 ? `נותרו ${remaining} מוצרים ללא ברקוד` : 'כל המוצרים סרוקים ✓';
  }
}

function closeBarcodeScanner() {
  try { barcodeReader?.reset(); } catch {}
  barcodeReader = null;
  activeBarcodeProductId = null;
  $('#barcode-modal').classList.add('hidden');
}

$('#barcode-close').addEventListener('click', closeBarcodeScanner);
$('#barcode-manual').addEventListener('click', () => {
  closeBarcodeScanner();
  setTimeout(() => {
    const card = document.querySelector(`.product-card[data-pid="${activeBarcodeProductId}"]`);
    const input = card?.querySelector('[data-field="barcode"]');
    input?.focus();
  }, 100);
});

// ─── Categories management ──────────────────────────────────
$('#categories-btn').addEventListener('click', () => {
  $('#categories-modal').classList.remove('hidden');
  renderCategoriesList();
});
$('#categories-close').addEventListener('click', () => {
  $('#categories-modal').classList.add('hidden');
});
$('#add-category-btn').addEventListener('click', addCategory);
$('#new-category-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addCategory();
});

function renderCategoriesList() {
  const list = $('#categories-list');
  if (!categories.length) {
    list.innerHTML = '<div class="empty-state"><p>אין מחלקות עדיין</p></div>';
    return;
  }
  list.innerHTML = categories.map(c => `
    <div class="category-item">
      <span>${escapeHtml(c.name)}</span>
      <button data-del="${c.id}">${SVG.trash}</button>
    </div>
  `).join('');
  list.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = async () => {
      if (!confirm(`למחוק את "${categories.find(x => x.id === b.dataset.del)?.name}"?`)) return;
      try {
        await api(`/api/categories?id=${b.dataset.del}`, { method: 'DELETE' });
        await loadCategories();
        renderCategoriesList();
      } catch (e) { toast(e.message, 'error'); }
    };
  });
}

async function addCategory() {
  const name = $('#new-category-name').value.trim();
  if (!name) return;
  try {
    await api('/api/categories', { method: 'POST', body: JSON.stringify({ name }) });
    $('#new-category-name').value = '';
    await loadCategories();
    renderCategoriesList();
    toast('מחלקה נוספה', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Suppliers management ───────────────────────────────────
$('#suppliers-btn')?.addEventListener('click', () => {
  $('#suppliers-modal').classList.remove('hidden');
  $('#suppliers-search').value = '';
  renderSuppliersList();
});
$('#suppliers-close')?.addEventListener('click', () => {
  $('#suppliers-modal').classList.add('hidden');
});
$('#add-supplier-btn')?.addEventListener('click', addSupplier);
$('#new-supplier-name')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addSupplier();
});
$('#suppliers-search')?.addEventListener('input', renderSuppliersList);

function renderSuppliersList() {
  const list = $('#suppliers-list');
  const q = ($('#suppliers-search').value || '').trim().toLowerCase();
  const filtered = q ? suppliers.filter(s => s.name.toLowerCase().includes(q)) : suppliers;

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><p>${q ? 'לא נמצא' : 'אין ספקים עדיין'}</p></div>`;
    return;
  }
  list.innerHTML = filtered.map(s => `
    <div class="category-item">
      <span>${escapeHtml(s.name)}${s.code ? ` <span style="opacity:0.5;font-size:11px">#${escapeHtml(s.code)}</span>` : ''}</span>
      <button data-del="${s.id}">${SVG.trash}</button>
    </div>
  `).join('');
  list.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = async () => {
      const sup = suppliers.find(x => x.id === b.dataset.del);
      if (!confirm(`למחוק את "${sup?.name}"?`)) return;
      try {
        await api(`/api/suppliers?id=${b.dataset.del}`, { method: 'DELETE' });
        await loadSuppliers();
        renderSuppliersList();
      } catch (e) { toast(e.message, 'error'); }
    };
  });
}

async function addSupplier() {
  const name = $('#new-supplier-name').value.trim();
  if (!name) return;
  try {
    await api('/api/suppliers', { method: 'POST', body: JSON.stringify({ name }) });
    $('#new-supplier-name').value = '';
    await loadSuppliers();
    renderSuppliersList();
    toast('ספק נוסף', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Job monitor (live progress) ────────────────────────────
let jobPollInterval = null;

function showJobMonitor(jobId, supplierName) {
  // Create modal
  let modal = document.getElementById('job-monitor-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'job-monitor-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="job-monitor-card">
        <div class="job-monitor-header">
          <h3 id="job-monitor-title">מריץ חשבונית...</h3>
          <button class="icon-btn" id="job-monitor-close" style="display:none;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="job-status-pill" id="job-status-pill">⏳ ממתין למחשב פנוי...</div>
        <div class="job-progress">
          <div class="job-progress-bar"><div class="job-progress-fill" id="job-progress-fill"></div></div>
          <div class="job-progress-text" id="job-progress-text">0 / 0</div>
        </div>
        <div class="job-log" id="job-log"></div>
        <div class="job-monitor-footer">
          <button class="btn-primary" id="job-done-btn" style="display:none;">סגור</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('job-monitor-close').onclick = () => closeJobMonitor();
    document.getElementById('job-done-btn').onclick = () => closeJobMonitor();
  }
  modal.classList.remove('hidden');
  document.getElementById('job-monitor-title').textContent = `מריץ: ${supplierName}`;
  document.getElementById('job-log').innerHTML = '';
  document.getElementById('job-progress-fill').style.width = '0%';
  document.getElementById('job-progress-text').textContent = '0 / 0';
  document.getElementById('job-status-pill').textContent = '⏳ ממתין למחשב פנוי...';
  document.getElementById('job-status-pill').className = 'job-status-pill';
  document.getElementById('job-monitor-close').style.display = 'none';
  document.getElementById('job-done-btn').style.display = 'none';

  // Start polling
  if (jobPollInterval) clearInterval(jobPollInterval);
  pollJobStatus(jobId);
  jobPollInterval = setInterval(() => pollJobStatus(jobId), 1500);
}

async function pollJobStatus(jobId) {
  try {
    const data = await api(`/api/jobs/${jobId}`);
    const pill = document.getElementById('job-status-pill');
    const fill = document.getElementById('job-progress-fill');
    const text = document.getElementById('job-progress-text');
    const logEl = document.getElementById('job-log');
    const closeBtn = document.getElementById('job-monitor-close');
    const doneBtn = document.getElementById('job-done-btn');

    // Update progress bar
    const total = data.total_count || 0;
    const idx = data.current_idx || 0;
    if (total > 0) {
      const pct = Math.min(100, (idx / total) * 100);
      fill.style.width = `${pct}%`;
    }
    text.textContent = `${idx} / ${total}`;

    // Update status pill
    if (data.status === 'pending') {
      pill.textContent = '⏳ ממתין למחשב פנוי...';
      pill.className = 'job-status-pill';
    } else if (data.status === 'running') {
      pill.textContent = `▶ רץ במחשב ${data.worker_id || '?'}`;
      pill.className = 'job-status-pill running';
    } else if (data.status === 'done') {
      pill.textContent = '✓ הושלם בהצלחה';
      pill.className = 'job-status-pill done';
      clearInterval(jobPollInterval);
      jobPollInterval = null;
      closeBtn.style.display = 'flex';
      doneBtn.style.display = 'block';
      loadHistory();
    } else if (data.status === 'failed') {
      pill.textContent = `✗ נכשל: ${data.error_message || 'שגיאה'}`;
      pill.className = 'job-status-pill failed';
      clearInterval(jobPollInterval);
      jobPollInterval = null;
      closeBtn.style.display = 'flex';
      doneBtn.style.display = 'block';
      loadHistory();
    }

    // Update log
    if (Array.isArray(data.log)) {
      logEl.innerHTML = data.log.slice(-200).map(e => `
        <div class="job-log-line">
          <span class="job-log-level ${escapeAttr(e.level || 'INFO')}">${escapeHtml(e.level || 'INFO')}</span>
          <span class="job-log-msg">${escapeHtml(e.msg || '')}</span>
        </div>
      `).join('');
      logEl.scrollTop = logEl.scrollHeight;
    }
  } catch (e) {
    // Ignore transient errors
  }
}

function closeJobMonitor() {
  if (jobPollInterval) clearInterval(jobPollInterval);
  jobPollInterval = null;
  const modal = document.getElementById('job-monitor-modal');
  if (modal) modal.classList.add('hidden');
}

// ─── PWA install prompt ────────────────────────────────────
let deferredInstallPrompt = null;
const INSTALL_DISMISSED_KEY = 'install-banner-dismissed';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function showInstallBanner() {
  if (isStandalone()) return; // already installed
  if (sessionStorage.getItem(INSTALL_DISMISSED_KEY)) return;
  $('#install-banner').classList.remove('hidden');
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showInstallBanner();
});

window.addEventListener('appinstalled', () => {
  $('#install-banner').classList.add('hidden');
  deferredInstallPrompt = null;
  toast('האפליקציה הותקנה בהצלחה', 'success');
});

$('#install-btn')?.addEventListener('click', async () => {
  if (deferredInstallPrompt) {
    // Chrome/Android — native prompt
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      $('#install-banner').classList.add('hidden');
    }
    deferredInstallPrompt = null;
  } else if (isIOS()) {
    // iOS — show manual instructions
    $('#ios-install-modal').classList.remove('hidden');
  } else {
    toast('כדי להתקין: פתח בדפדפן ובחר "התקן אפליקציה" מהתפריט', '');
  }
});

$('#install-dismiss')?.addEventListener('click', () => {
  $('#install-banner').classList.add('hidden');
  sessionStorage.setItem(INSTALL_DISMISSED_KEY, '1');
});

$('#ios-install-close')?.addEventListener('click', () => {
  $('#ios-install-modal').classList.add('hidden');
});

// On iOS — show banner immediately (no beforeinstallprompt support)
if (isIOS() && !isStandalone()) {
  setTimeout(showInstallBanner, 2000);
}

// ─── Boot ───────────────────────────────────────────────────
checkAuth();
