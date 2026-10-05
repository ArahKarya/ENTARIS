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

-- (ai_executed_runs dibuat di sini sebelumnya; dihapus oleh 2026101500000_aira_legacy_cleanup.sql
--  bersama jalur A3 yang sudah pensiun, jadi tidak dibuat ulang di tiap boot.)

CREATE INDEX IF NOT EXISTS sales_orders_fiscal_year_id_idx ON sales_orders (fiscal_year_id);
