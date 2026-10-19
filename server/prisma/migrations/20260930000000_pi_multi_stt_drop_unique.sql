-- 2026-09-30: 1 Invoice Pembelian (PI) boleh menagih >1 STT sekaligus.
-- Sebelumnya goods_receipts.invoice_id UNIQUE -> hanya 1 STT per PI,
-- menyebabkan error "Unique constraint failed on the fields: (invoice_id)"
-- saat modal PI di-multi-pilih STT (fitur baru 2026-09-30 commit 4abb380).
-- Drop unique constraint + index turunannya; kolom & FK tetap ada.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'goods_receipts_invoice_id_key'
  ) THEN
    ALTER TABLE goods_receipts DROP CONSTRAINT goods_receipts_invoice_id_key;
  END IF;
END $$;

-- Index non-unique biasa supaya lookup by invoice_id tetap cepat
-- (dipakai routes/goodsReceipts.ts status=Invoiced filter & cancel flow).
CREATE INDEX IF NOT EXISTS goods_receipts_invoice_id_idx ON goods_receipts (invoice_id);
