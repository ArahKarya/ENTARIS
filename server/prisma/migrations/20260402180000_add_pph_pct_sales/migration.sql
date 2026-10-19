-- Add PPh % per item to sales invoice items
ALTER TABLE "sales_invoice_items" ADD COLUMN "pph_pct" DECIMAL(5,2) NOT NULL DEFAULT 0;
