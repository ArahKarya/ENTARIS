-- 2026-08-02: akun COA khusus pajak & perizinan kendaraan (STNK, KIR, pajak tahunan/5-tahunan).
-- Sebelumnya menumpang 6.7 Beban Pemeliharaan Kendaraan sehingga biaya legalitas
-- tak bisa dipisah dari biaya servis. Idempotent: aman dijalankan berulang.
--
-- CATATAN PENTING: 6.17 = Beban Pajak Penghasilan (PPh) — BUKAN pajak kendaraan.
-- Jangan pernah memakai 6.17 untuk STNK/KIR.

INSERT INTO accounts (
  id, name, "accountNumber", "accountType", "rootType",
  "isGroup", "isActive", balance, currency, description, "parentId",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  'Beban Pajak & Perizinan Kendaraan',
  '6.41',
  'EXPENSE',
  'EXPENSE',
  false,
  true,
  0,
  'IDR',
  'Pajak kendaraan tahunan/5-tahunan, STNK, KIR, dan perizinan kendaraan operasional',
  (SELECT id FROM accounts WHERE "accountNumber" = '6' LIMIT 1),
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "accountNumber" = '6.41');
