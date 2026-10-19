-- ─── Add Warehouse + InventoryStock + StockTransfer + warehouseId fields ─

-- Extend StockMovementType enum
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'TransferOut';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'TransferIn';

-- Warehouse master
CREATE TABLE "warehouses" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "location" TEXT,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");
CREATE INDEX "warehouses_is_active_idx" ON "warehouses"("is_active");

-- Per (item, warehouse) stock balance
CREATE TABLE "inventory_stocks" (
  "id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "warehouse_id" TEXT NOT NULL,
  "current_stock" DECIMAL(20,3) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_stocks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_stocks_item_id_warehouse_id_key" ON "inventory_stocks"("item_id", "warehouse_id");
CREATE INDEX "inventory_stocks_item_id_idx" ON "inventory_stocks"("item_id");
CREATE INDEX "inventory_stocks_warehouse_id_idx" ON "inventory_stocks"("warehouse_id");

ALTER TABLE "inventory_stocks" ADD CONSTRAINT "inventory_stocks_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_stocks" ADD CONSTRAINT "inventory_stocks_warehouse_id_fkey"
  FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Stock transfer (between warehouses; no GL impact)
CREATE TABLE "stock_transfers" (
  "id" TEXT NOT NULL,
  "transfer_number" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "from_warehouse_id" TEXT NOT NULL,
  "to_warehouse_id" TEXT NOT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'Draft',
  "notes" TEXT,
  "fiscal_year_id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "submitted_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stock_transfers_transfer_number_key" ON "stock_transfers"("transfer_number");
CREATE INDEX "stock_transfers_date_idx" ON "stock_transfers"("date");
CREATE INDEX "stock_transfers_status_idx" ON "stock_transfers"("status");
CREATE INDEX "stock_transfers_from_warehouse_id_idx" ON "stock_transfers"("from_warehouse_id");
CREATE INDEX "stock_transfers_to_warehouse_id_idx" ON "stock_transfers"("to_warehouse_id");
CREATE INDEX "stock_transfers_fiscal_year_id_idx" ON "stock_transfers"("fiscal_year_id");

ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_warehouse_id_fkey"
  FOREIGN KEY ("from_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_warehouse_id_fkey"
  FOREIGN KEY ("to_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_fiscal_year_id_fkey"
  FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "stock_transfer_items" (
  "id" TEXT NOT NULL,
  "transfer_id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "quantity" DECIMAL(20,3) NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stock_transfer_items_transfer_id_idx" ON "stock_transfer_items"("transfer_id");
CREATE INDEX "stock_transfer_items_item_id_idx" ON "stock_transfer_items"("item_id");

ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_id_fkey"
  FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- warehouseId (nullable, FK) on transaction line tables
ALTER TABLE "stock_movements" ADD COLUMN "warehouse_id" TEXT;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_fkey"
  FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "stock_movements_warehouse_id_idx" ON "stock_movements"("warehouse_id");

ALTER TABLE "sales_invoice_items" ADD COLUMN "warehouse_id" TEXT;
ALTER TABLE "sales_invoice_items" ADD CONSTRAINT "sales_invoice_items_warehouse_id_fkey"
  FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "sales_invoice_items_warehouse_id_idx" ON "sales_invoice_items"("warehouse_id");

ALTER TABLE "purchase_invoice_items" ADD COLUMN "warehouse_id" TEXT;
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_warehouse_id_fkey"
  FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "purchase_invoice_items_warehouse_id_idx" ON "purchase_invoice_items"("warehouse_id");

ALTER TABLE "production_run_items" ADD COLUMN "warehouse_id" TEXT;
ALTER TABLE "production_run_items" ADD CONSTRAINT "production_run_items_warehouse_id_fkey"
  FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "production_run_items_warehouse_id_idx" ON "production_run_items"("warehouse_id");

ALTER TABLE "stock_opname_items" ADD COLUMN "warehouse_id" TEXT;
ALTER TABLE "stock_opname_items" ADD CONSTRAINT "stock_opname_items_warehouse_id_fkey"
  FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "stock_opname_items_warehouse_id_idx" ON "stock_opname_items"("warehouse_id");
