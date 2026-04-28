#!/usr/bin/env python3
"""
Invoice Scanner — Desktop Sync
Polls the API for invoices marked 'ready' and processes them locally.

Usage:
    cp .env.example .env       # then edit .env
    pip install -r requirements.txt
    python sync.py             # one-shot
    python sync.py --watch     # poll every POLL_INTERVAL seconds
"""

import os
import sys
import json
import time
import argparse
from pathlib import Path
from datetime import datetime

import requests
from dotenv import load_dotenv

load_dotenv()

API_BASE = os.getenv("API_BASE", "").rstrip("/")
SYNC_KEY = os.getenv("SYNC_API_KEY", "")
DATA_DIR = Path(os.getenv("DATA_DIR", "./data")).resolve()
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "30"))
AUTO_CONFIRM = os.getenv("AUTO_CONFIRM", "false").lower() == "true"
SCRIPT_ID = os.getenv("SCRIPT_ID", "desktop-1")

if not API_BASE or not SYNC_KEY:
    print("ERROR: API_BASE and SYNC_API_KEY must be set in .env")
    sys.exit(1)

DATA_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {"X-Sync-Key": SYNC_KEY, "Content-Type": "application/json"}

# ────────────────────────────────────────────────────────────
#  Custom hook — adapt for your POS (NewOrder etc.)
# ────────────────────────────────────────────────────────────
def process_invoice(invoice: dict) -> bool:
    """
    Customise this for your POS.

    Default behaviour: writes JSON + CSV files to DATA_DIR for manual
    or external processing, and returns True (mark as imported).

    Return True  → invoice gets marked 'imported' in the database.
    Return False → leave invoice as 'ready' (will be picked up next poll).

    `invoice` shape:
    {
      "id": "...", "supplier": "...", "invoice_number": "...",
      "invoice_date": "...", "currency": "ILS",
      "total_cost": ..., "total_revenue": ...,
      "products": [
        { "name": "...", "model": "...", "quantity": 1,
          "cost_price": 0.0, "customer_price": 0.0, "sort_order": 0 }
      ]
    }
    """
    inv_id = invoice["id"]
    safe_num = (invoice.get("invoice_number") or inv_id[:8]).replace("/", "-")
    base = DATA_DIR / f"{datetime.now():%Y%m%d}_{safe_num}"

    # Save JSON
    with open(f"{base}.json", "w", encoding="utf-8") as f:
        json.dump(invoice, f, ensure_ascii=False, indent=2)

    # Save CSV (with BOM for Excel/Hebrew)
    import csv
    with open(f"{base}.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["שם", "דגם", "כמות", "עלות", "מחיר ללקוח"])
        for p in invoice["products"]:
            w.writerow([
                p.get("name", ""),
                p.get("model", "") or "",
                p.get("quantity", 1),
                p.get("cost_price", 0),
                p.get("customer_price", 0),
            ])

    print(f"  ✓ Saved {base.name}.json and .csv")

    # ── HOOK FOR NEWORDER / OTHER POS INTEGRATION ──────────────
    # Example:
    #   from neworder_client import NewOrderClient
    #   client = NewOrderClient(...)
    #   for product in invoice["products"]:
    #       client.add_product(...)
    # If anything fails, return False so the invoice stays 'ready'.
    # ───────────────────────────────────────────────────────────

    return True


# ────────────────────────────────────────────────────────────
#  API helpers
# ────────────────────────────────────────────────────────────
def fetch_pending() -> list:
    r = requests.get(f"{API_BASE}/api/sync/pending", headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json().get("invoices", [])


def mark_imported(invoice_id: str):
    r = requests.post(
        f"{API_BASE}/api/sync/complete",
        headers=HEADERS,
        json={"invoice_id": invoice_id, "script_id": SCRIPT_ID},
        timeout=30,
    )
    r.raise_for_status()


# ────────────────────────────────────────────────────────────
#  Main loop
# ────────────────────────────────────────────────────────────
def run_once() -> int:
    try:
        invoices = fetch_pending()
    except Exception as e:
        print(f"❌ Failed to fetch pending: {e}")
        return 0

    if not invoices:
        return 0

    print(f"\n📥 {len(invoices)} pending invoice(s) at {datetime.now():%H:%M:%S}")

    processed = 0
    for inv in invoices:
        label = f"{inv.get('supplier', '?')} #{inv.get('invoice_number', '?')}"
        print(f"\n→ {label}  ({len(inv.get('products', []))} products, "
              f"{inv.get('currency', 'ILS')} {inv.get('total_cost', 0):.0f})")

        if not AUTO_CONFIRM:
            ans = input("  Import? [Y/n]: ").strip().lower()
            if ans == "n":
                print("  Skipped.")
                continue

        try:
            ok = process_invoice(inv)
            if ok:
                mark_imported(inv["id"])
                print(f"  ✓ Marked as imported")
                processed += 1
            else:
                print("  ⏸  Left as ready (process_invoice returned False)")
        except Exception as e:
            print(f"  ❌ Error: {e}")

    return processed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--watch", action="store_true", help="poll continuously")
    args = parser.parse_args()

    print(f"📡 API: {API_BASE}")
    print(f"📁 Data: {DATA_DIR}")
    print(f"🔄 Mode: {'watch' if args.watch else 'one-shot'}")
    if AUTO_CONFIRM:
        print("⚠️  AUTO_CONFIRM is ON — invoices will be imported without prompting")

    if not args.watch:
        run_once()
        return

    while True:
        try:
            run_once()
        except KeyboardInterrupt:
            print("\n👋 Stopping.")
            return
        except Exception as e:
            print(f"⚠️  Loop error: {e}")
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
