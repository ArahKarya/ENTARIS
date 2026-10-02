-- 2026-09-27: akun 5.12 "Biaya Konversi Dibebankan ke Persediaan".
-- Lawan (kredit) biaya konversi tarif estimasi yang dikapitalisasi ke persediaan
-- output produksi (PSAK 14). Sebelumnya menumpang 5.1 HPP Beras ("HPP konversi
-- produksi") sehingga HPP penjualan bercampur biaya produksi. Sisa selisih di luar
-- biaya konversi (mis. NRV produk samping beras titipan BULOG) tetap di 5.1.
-- Idempotent: aman dijalankan berulang.

INSERT INTO accounts (
  id, name, "accountNumber", "accountType", "rootType",
  "isGroup", "isActive", balance, currency, description, "parentId",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  'Biaya Konversi Dibebankan ke Persediaan',
  '5.12',
  'EXPENSE',
  'EXPENSE',
  false,
  true,
  0,
  'IDR',
  'Kontra-beban: biaya konversi produksi (tarif estimasi) yang dikapitalisasi ke persediaan output. Saldo normal KREDIT. Dibandingkan dengan beban produksi riil tiap bulan untuk penyesuaian selisih.',
  (SELECT id FROM accounts WHERE "accountNumber" = '5' LIMIT 1),
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "accountNumber" = '5.12');
