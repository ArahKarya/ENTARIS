-- 2026-10-05: Short-close Purchase Order ("Tutup PO").
-- PO yang ditutup tetap berstatus Submitted, tetapi sisa qty tidak lagi
-- diharapkan diterima dan PO tidak muncul lagi di pemilih PO pada STT.
-- closed_at NULL = PO masih terbuka. Idempoten (aman dijalankan ulang tiap startup).

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP(3);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS close_reason TEXT;
