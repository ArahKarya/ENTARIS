-- CreateEnum
CREATE TYPE "StockOpnameStatus" AS ENUM ('Draft', 'Submitted', 'Cancelled');

-- CreateTable
CREATE TABLE "stock_opnames" (
    "id" TEXT NOT NULL,
    "opname_number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "StockOpnameStatus" NOT NULL DEFAULT 'Draft',
    "notes" TEXT,
    "fiscal_year_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_opnames_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_opname_items" (
    "id" TEXT NOT NULL,
    "stock_opname_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "system_stock" DECIMAL(15,3) NOT NULL,
    "actual_stock" DECIMAL(15,3) NOT NULL,
    "difference" DECIMAL(15,3) NOT NULL,
    "unit_cost" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_value" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "movement_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_opname_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_opnames_opname_number_key" ON "stock_opnames"("opname_number");
CREATE INDEX "stock_opnames_date_idx" ON "stock_opnames"("date");
CREATE INDEX "stock_opnames_status_idx" ON "stock_opnames"("status");
CREATE INDEX "stock_opnames_fiscal_year_id_idx" ON "stock_opnames"("fiscal_year_id");
CREATE INDEX "stock_opname_items_stock_opname_id_idx" ON "stock_opname_items"("stock_opname_id");
CREATE INDEX "stock_opname_items_item_id_idx" ON "stock_opname_items"("item_id");

-- AddForeignKey
ALTER TABLE "stock_opnames" ADD CONSTRAINT "stock_opnames_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_opnames" ADD CONSTRAINT "stock_opnames_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_opname_items" ADD CONSTRAINT "stock_opname_items_stock_opname_id_fkey" FOREIGN KEY ("stock_opname_id") REFERENCES "stock_opnames"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_opname_items" ADD CONSTRAINT "stock_opname_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
