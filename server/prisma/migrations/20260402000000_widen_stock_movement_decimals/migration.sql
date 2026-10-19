-- AlterTable: widen stock movement decimal columns to avoid overflow
ALTER TABLE "stock_movements" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(20,3);
ALTER TABLE "stock_movements" ALTER COLUMN "unit_cost" SET DATA TYPE DECIMAL(20,2);
ALTER TABLE "stock_movements" ALTER COLUMN "total_value" SET DATA TYPE DECIMAL(20,2);
