-- ============================================================================
-- Phase 3b — Cost standard warehouse scoping
--
-- Adds warehouse_id to production_cost_standards so master rates can be
-- bound to a specific warehouse (mis. "biaya listrik mesin poles" hanya
-- muncul di gudang poles). NULL = berlaku semua gudang (default).
-- Mirrors the existing item_id optional scope.
-- ============================================================================

BEGIN;

ALTER TABLE "production_cost_standards"
  ADD COLUMN IF NOT EXISTS "warehouse_id" TEXT;

ALTER TABLE "production_cost_standards"
  DROP CONSTRAINT IF EXISTS "production_cost_standards_warehouse_id_fkey";
ALTER TABLE "production_cost_standards"
  ADD CONSTRAINT "production_cost_standards_warehouse_id_fkey"
  FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "production_cost_standards_warehouse_id_idx"
  ON "production_cost_standards"("warehouse_id");

COMMIT;
