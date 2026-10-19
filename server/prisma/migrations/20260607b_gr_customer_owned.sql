-- STT barang titipan pelanggan (jasa repros/maklon): flag guardrail.
-- Efek: nilai GL dipaksa 0 saat submit, STT disembunyikan dari picker
-- Invoice Pembelian, averageCost item tidak disentuh. Lihat goodsReceiptSubmit.ts.
ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS is_customer_owned boolean NOT NULL DEFAULT false;
