-- ============================================================
-- Invoice Scanner — D1 Schema
-- ============================================================

DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS users;

-- Users (employees / admins)
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,        -- PBKDF2: salt:iterations:hash (base64)
  role          TEXT NOT NULL DEFAULT 'employee',  -- 'admin' | 'employee'
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Invoices
CREATE TABLE invoices (
  id                  TEXT PRIMARY KEY,
  supplier            TEXT,
  invoice_number      TEXT,
  invoice_date        TEXT,                       -- DD/MM/YYYY (free text)
  currency            TEXT NOT NULL DEFAULT 'ILS',
  status              TEXT NOT NULL DEFAULT 'draft',  -- draft | ready | imported | archived
  notes               TEXT,
  total_cost          REAL NOT NULL DEFAULT 0,
  total_revenue       REAL NOT NULL DEFAULT 0,
  product_count       INTEGER NOT NULL DEFAULT 0,
  created_by          TEXT NOT NULL,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  ready_at            INTEGER,
  imported_at         INTEGER,
  imported_by_script  TEXT,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX idx_invoices_status     ON invoices(status);
CREATE INDEX idx_invoices_created_at ON invoices(created_at DESC);
CREATE INDEX idx_invoices_supplier   ON invoices(supplier);
CREATE INDEX idx_invoices_created_by ON invoices(created_by);

-- Products inside an invoice
CREATE TABLE products (
  id              TEXT PRIMARY KEY,
  invoice_id      TEXT NOT NULL,
  name            TEXT NOT NULL,
  model           TEXT,
  quantity        INTEGER NOT NULL DEFAULT 1,
  cost_price      REAL NOT NULL DEFAULT 0,
  customer_price  REAL NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE INDEX idx_products_invoice ON products(invoice_id);
CREATE INDEX idx_products_name    ON products(name);
