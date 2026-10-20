-- 2026-10-21: Proforma Invoice. Dokumen tagihan awal (mis. DP) dari Quotation / Sales Order,
-- dikonversi ke Sales Invoice (Draft). TIDAK ada efek stok, GL, atau piutang.
-- Additive only; aman dijalankan ulang tiap startup (IF NOT EXISTS / DO-block).

DO $$ BEGIN
  CREATE TYPE "ProformaStatus" AS ENUM ('Draft','Sent','Converted','Cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "proforma_invoices" (
    "id" TEXT NOT NULL,
    "proforma_number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "party_id" TEXT NOT NULL,
    "customer_ref_no" TEXT,
    "status" "ProformaStatus" NOT NULL DEFAULT 'Draft',
    "quotation_id" TEXT,
    "sales_order_id" TEXT,
    "sales_invoice_id" TEXT,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "tax_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "potongan" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "biaya_lain" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "label_potongan" TEXT,
    "label_biaya" TEXT,
    "grand_total" DECIMAL(15,2) NOT NULL,
    "requested_amount" DECIMAL(15,2),
    "terms" TEXT,
    "notes" TEXT,
    "fiscal_year_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "converted_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "proforma_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "proforma_invoice_items" (
    "id" TEXT NOT NULL,
    "proforma_id" TEXT NOT NULL,
    "item_type" TEXT NOT NULL DEFAULT 'product',
    "inventory_item_id" TEXT,
    "service_item_id" TEXT,
    "account_id" TEXT,
    "item_name" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Kg',
    "rate" DECIMAL(15,2) NOT NULL,
    "discount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(15,2) NOT NULL,
    "tax_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "pph_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "proforma_invoice_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "proforma_invoice_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "proforma_invoices_proforma_number_key" ON "proforma_invoices"("proforma_number");
CREATE UNIQUE INDEX IF NOT EXISTS "proforma_invoices_sales_invoice_id_key" ON "proforma_invoices"("sales_invoice_id");
CREATE INDEX IF NOT EXISTS "proforma_invoices_party_id_idx" ON "proforma_invoices"("party_id");
CREATE INDEX IF NOT EXISTS "proforma_invoices_status_idx" ON "proforma_invoices"("status");
CREATE INDEX IF NOT EXISTS "proforma_invoices_date_idx" ON "proforma_invoices"("date");
CREATE INDEX IF NOT EXISTS "proforma_invoices_quotation_id_idx" ON "proforma_invoices"("quotation_id");
CREATE INDEX IF NOT EXISTS "proforma_invoices_sales_order_id_idx" ON "proforma_invoices"("sales_order_id");
CREATE INDEX IF NOT EXISTS "proforma_invoices_fiscal_year_id_idx" ON "proforma_invoices"("fiscal_year_id");
CREATE INDEX IF NOT EXISTS "proforma_invoice_items_proforma_id_idx" ON "proforma_invoice_items"("proforma_id");
CREATE INDEX IF NOT EXISTS "proforma_invoice_items_inventory_item_id_idx" ON "proforma_invoice_items"("inventory_item_id");
CREATE INDEX IF NOT EXISTS "proforma_invoice_items_service_item_id_idx" ON "proforma_invoice_items"("service_item_id");
CREATE INDEX IF NOT EXISTS "payments_proforma_invoice_id_idx" ON "payments"("proforma_invoice_id");

DO $$ BEGIN
  ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_sales_invoice_id_fkey" FOREIGN KEY ("sales_invoice_id") REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "proforma_invoice_items" ADD CONSTRAINT "proforma_invoice_items_proforma_id_fkey" FOREIGN KEY ("proforma_id") REFERENCES "proforma_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "proforma_invoice_items" ADD CONSTRAINT "proforma_invoice_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "proforma_invoice_items" ADD CONSTRAINT "proforma_invoice_items_service_item_id_fkey" FOREIGN KEY ("service_item_id") REFERENCES "service_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "proforma_invoice_items" ADD CONSTRAINT "proforma_invoice_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_proforma_invoice_id_fkey" FOREIGN KEY ("proforma_invoice_id") REFERENCES "proforma_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
