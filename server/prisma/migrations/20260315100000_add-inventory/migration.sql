-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('In', 'Out', 'AdjustmentIn', 'AdjustmentOut');

-- CreateTable inventory_items
CREATE TABLE "inventory_items" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "category" TEXT,
  "description" TEXT,
  "current_stock" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "minimum_stock" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "account_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable stock_movements
CREATE TABLE "stock_movements" (
  "id" TEXT NOT NULL,
  "movement_number" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "item_id" TEXT NOT NULL,
  "movement_type" "StockMovementType" NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  "unit_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "total_value" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "reference_type" TEXT,
  "reference_id" TEXT,
  "reference_number" TEXT,
  "offset_account_id" TEXT,
  "journal_entry_id" TEXT,
  "fiscal_year_id" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_code_key" ON "inventory_items"("code");
CREATE UNIQUE INDEX "stock_movements_movement_number_key" ON "stock_movements"("movement_number");
CREATE UNIQUE INDEX "stock_movements_journal_entry_id_key" ON "stock_movements"("journal_entry_id");
CREATE INDEX "stock_movements_item_id_idx" ON "stock_movements"("item_id");
CREATE INDEX "stock_movements_date_idx" ON "stock_movements"("date");
CREATE INDEX "stock_movements_movement_type_idx" ON "stock_movements"("movement_type");
CREATE INDEX "stock_movements_fiscal_year_id_idx" ON "stock_movements"("fiscal_year_id");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_offset_account_id_fkey"
  FOREIGN KEY ("offset_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_journal_entry_id_fkey"
  FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_fiscal_year_id_fkey"
  FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
