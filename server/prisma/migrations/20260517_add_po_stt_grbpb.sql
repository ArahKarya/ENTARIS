BEGIN;

CREATE TABLE IF NOT EXISTS "purchase_orders" (
  "id" TEXT PRIMARY KEY,
  "po_number" TEXT UNIQUE NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "party_id" TEXT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'Submitted',
  "notes" TEXT NULL,
  "terms" TEXT NULL,
  "expected_delivery_date" TIMESTAMP(3) NULL,
  "total_estimated" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "fiscal_year_id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "submitted_at" TIMESTAMP(3) NULL,
  "cancelled_at" TIMESTAMP(3) NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "purchase_orders_party_id_idx" ON "purchase_orders"("party_id");
CREATE INDEX IF NOT EXISTS "purchase_orders_status_idx" ON "purchase_orders"("status");
CREATE INDEX IF NOT EXISTS "purchase_orders_date_idx" ON "purchase_orders"("date");
CREATE INDEX IF NOT EXISTS "purchase_orders_fiscal_year_id_idx" ON "purchase_orders"("fiscal_year_id");
DO $$ BEGIN ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "purchase_order_items" (
  "id" TEXT PRIMARY KEY,
  "purchase_order_id" TEXT NOT NULL,
  "inventory_item_id" TEXT NULL,
  "item_name" TEXT NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  "unit" TEXT NOT NULL,
  "estimated_rate" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "estimated_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "qty_received" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "description" TEXT NULL
);
CREATE INDEX IF NOT EXISTS "purchase_order_items_purchase_order_id_idx" ON "purchase_order_items"("purchase_order_id");
CREATE INDEX IF NOT EXISTS "purchase_order_items_inventory_item_id_idx" ON "purchase_order_items"("inventory_item_id");
DO $$ BEGIN ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "goods_receipts" (
  "id" TEXT PRIMARY KEY,
  "stt_number" TEXT UNIQUE NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "party_id" TEXT NOT NULL,
  "purchase_order_id" TEXT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'Submitted',
  "notes" TEXT NULL,
  "nomor_mobil" TEXT NULL,
  "driver_name" TEXT NULL,
  "recipient_name" TEXT NULL,
  "invoice_id" TEXT UNIQUE NULL,
  "invoiced_at" TIMESTAMP(3) NULL,
  "is_legacy_backfill" BOOLEAN NOT NULL DEFAULT false,
  "fiscal_year_id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "submitted_at" TIMESTAMP(3) NULL,
  "cancelled_at" TIMESTAMP(3) NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "goods_receipts_party_id_idx" ON "goods_receipts"("party_id");
CREATE INDEX IF NOT EXISTS "goods_receipts_status_idx" ON "goods_receipts"("status");
CREATE INDEX IF NOT EXISTS "goods_receipts_date_idx" ON "goods_receipts"("date");
CREATE INDEX IF NOT EXISTS "goods_receipts_purchase_order_id_idx" ON "goods_receipts"("purchase_order_id");
CREATE INDEX IF NOT EXISTS "goods_receipts_fiscal_year_id_idx" ON "goods_receipts"("fiscal_year_id");
DO $$ BEGIN ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "purchase_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "goods_receipt_items" (
  "id" TEXT PRIMARY KEY,
  "goods_receipt_id" TEXT NOT NULL,
  "inventory_item_id" TEXT NOT NULL,
  "warehouse_id" TEXT NOT NULL,
  "item_name" TEXT NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  "unit" TEXT NOT NULL,
  "locked_unit_cost" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "description" TEXT NULL,
  "purchase_order_item_id" TEXT NULL,
  "stock_movement_id" TEXT UNIQUE NULL
);
CREATE INDEX IF NOT EXISTS "goods_receipt_items_goods_receipt_id_idx" ON "goods_receipt_items"("goods_receipt_id");
CREATE INDEX IF NOT EXISTS "goods_receipt_items_inventory_item_id_idx" ON "goods_receipt_items"("inventory_item_id");
CREATE INDEX IF NOT EXISTS "goods_receipt_items_warehouse_id_idx" ON "goods_receipt_items"("warehouse_id");
CREATE INDEX IF NOT EXISTS "goods_receipt_items_purchase_order_item_id_idx" ON "goods_receipt_items"("purchase_order_item_id");
DO $$ BEGIN ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_purchase_order_item_id_fkey" FOREIGN KEY ("purchase_order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_stock_movement_id_fkey" FOREIGN KEY ("stock_movement_id") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "purchase_order_id" TEXT NULL;
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "is_legacy_stock_flow" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "purchase_invoices_purchase_order_id_idx" ON "purchase_invoices"("purchase_order_id");
DO $$ BEGIN ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "purchase_invoice_items" ADD COLUMN IF NOT EXISTS "goods_receipt_item_id" TEXT NULL;
DO $$ BEGIN ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_goods_receipt_item_id_key" UNIQUE ("goods_receipt_item_id"); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_goods_receipt_item_id_fkey" FOREIGN KEY ("goods_receipt_item_id") REFERENCES "goods_receipt_items"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "nomor_mobil" TEXT NULL;
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "driver_name" TEXT NULL;
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "recipient_name" TEXT NULL;
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "printed_at" TIMESTAMP(3) NULL;

COMMIT;
