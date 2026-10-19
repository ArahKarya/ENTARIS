-- Add per-item tax percentage column to sales and purchase invoice items
ALTER TABLE "sales_invoice_items" ADD COLUMN "tax_pct" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "purchase_invoice_items" ADD COLUMN "tax_pct" DECIMAL(5,2) NOT NULL DEFAULT 0;
