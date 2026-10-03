-- 2026-10-03: Lengkapi skema yang ada di schema.prisma tetapi tidak pernah
-- dibuat oleh migrasi mana pun (terdeteksi lewat `prisma migrate diff` terhadap
-- DB yang dibangun murni dari migrasi). Instalasi baru gagal tanpa ini:
--   - parties.is_wapu (e2eb4b3, Mei 2026) → query Party error 500
--     (Pelanggan & Vendor, Faktur Penjualan, Pembayaran).
--   - ai_executed_runs (071856f, Jun 2026) → eksekusi tulis AIRA (A3) gagal.
--   - index sales_orders.fiscal_year_id (@@index di schema).
-- Idempoten (IF NOT EXISTS): aman bila kolom/tabel sudah ditambah manual di
-- deployment lama, dan aman dijalankan ulang setiap startup.

ALTER TABLE parties ADD COLUMN IF NOT EXISTS is_wapu BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS ai_executed_runs (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL,
  tool        TEXT NOT NULL,
  executed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ref         TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_executed_runs_run_id_key ON ai_executed_runs (run_id);

CREATE INDEX IF NOT EXISTS sales_orders_fiscal_year_id_idx ON sales_orders (fiscal_year_id);
