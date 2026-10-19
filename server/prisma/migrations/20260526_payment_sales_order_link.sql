-- Link pembayaran (khususnya CustomerDeposit/uang muka) ke Sales Order,
-- supaya dari layar SO bisa lihat DP yang sudah diterima untuk pesanan itu.
-- Optional FK — pembayaran lain (Receive/Pay biasa) tetap salesOrderId NULL.

ALTER TABLE "payments"
  ADD COLUMN "sales_order_id" TEXT REFERENCES "sales_orders"("id");

CREATE INDEX "payments_sales_order_id_idx" ON "payments"("sales_order_id");
