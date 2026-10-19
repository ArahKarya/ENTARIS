-- ============================================================================
-- Phase 1 — Production Loaded HPP foundation
--
-- Adds:
--   1. Loaded HPP / cost tracking columns on production_runs
--   2. Batch tracking + NRV columns on production_run_items
--   3. unit_cost_loaded on stock_movements
--   4. New tables: production_cost_standards (master), production_run_costs
--
-- No data backfill required — all new columns are nullable / boolean default.
-- Existing production runs continue to work with computedHpp=NULL.
-- ============================================================================

BEGIN;

-- ─── production_runs: loaded HPP breakdown fields ─────────────────────────────
ALTER TABLE "production_runs"
  ADD COLUMN IF NOT EXISTS "total_material_cost"    DECIMAL(20, 4),
  ADD COLUMN IF NOT EXISTS "total_cost_input_side"  DECIMAL(20, 4),
  ADD COLUMN IF NOT EXISTS "total_cost_output_side" DECIMAL(20, 4),
  ADD COLUMN IF NOT EXISTS "total_byproduct_value"  DECIMAL(20, 4),
  ADD COLUMN IF NOT EXISTS "computed_hpp"           DECIMAL(20, 4),
  ADD COLUMN IF NOT EXISTS "hpp_manual_override"    BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── production_run_items: batch tracking + NRV ────────────────────────────────
ALTER TABLE "production_run_items"
  ADD COLUMN IF NOT EXISTS "source_movement_id" TEXT,
  ADD COLUMN IF NOT EXISTS "batch_unit_cost"    DECIMAL(20, 4),
  ADD COLUMN IF NOT EXISTS "nrv_unit_value"     DECIMAL(20, 4);

ALTER TABLE "production_run_items"
  DROP CONSTRAINT IF EXISTS "production_run_items_source_movement_id_fkey";
ALTER TABLE "production_run_items"
  ADD CONSTRAINT "production_run_items_source_movement_id_fkey"
  FOREIGN KEY ("source_movement_id") REFERENCES "stock_movements"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "production_run_items_source_movement_id_idx"
  ON "production_run_items"("source_movement_id");

-- ─── stock_movements: unit_cost_loaded ─────────────────────────────────────────
ALTER TABLE "stock_movements"
  ADD COLUMN IF NOT EXISTS "unit_cost_loaded" DECIMAL(20, 4);

-- ─── NEW TABLE: production_cost_standards ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "production_cost_standards" (
  "id"              TEXT PRIMARY KEY,
  "name"            TEXT NOT NULL,
  "description"     TEXT,
  "cost_side"       TEXT NOT NULL,  -- 'InputSide' | 'OutputSide'
  "basis"           TEXT NOT NULL,  -- 'InputQty' | 'OutputQty' | 'Fixed'
  "default_rate"    DECIMAL(15, 4) NOT NULL,
  "cost_account_id" TEXT,
  "item_id"         TEXT,
  "is_active"       BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "production_cost_standards_cost_account_id_fkey"
    FOREIGN KEY ("cost_account_id") REFERENCES "accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "production_cost_standards_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "production_cost_standards_is_active_idx"
  ON "production_cost_standards"("is_active");
CREATE INDEX IF NOT EXISTS "production_cost_standards_cost_side_idx"
  ON "production_cost_standards"("cost_side");
CREATE INDEX IF NOT EXISTS "production_cost_standards_item_id_idx"
  ON "production_cost_standards"("item_id");

-- ─── NEW TABLE: production_run_costs ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "production_run_costs" (
  "id"                TEXT PRIMARY KEY,
  "production_run_id" TEXT NOT NULL,
  "standard_id"       TEXT,
  "description"       TEXT NOT NULL,
  "cost_side"         TEXT NOT NULL,  -- 'InputSide' | 'OutputSide'
  "basis"             TEXT NOT NULL,  -- 'InputQty' | 'OutputQty' | 'Fixed'
  "rate"              DECIMAL(15, 4) NOT NULL,
  "qty_basis"         DECIMAL(15, 3) NOT NULL,
  "total_amount"      DECIMAL(20, 4) NOT NULL,
  "cost_account_id"   TEXT,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "production_run_costs_production_run_id_fkey"
    FOREIGN KEY ("production_run_id") REFERENCES "production_runs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "production_run_costs_standard_id_fkey"
    FOREIGN KEY ("standard_id") REFERENCES "production_cost_standards"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "production_run_costs_cost_account_id_fkey"
    FOREIGN KEY ("cost_account_id") REFERENCES "accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "production_run_costs_production_run_id_idx"
  ON "production_run_costs"("production_run_id");
CREATE INDEX IF NOT EXISTS "production_run_costs_standard_id_idx"
  ON "production_run_costs"("standard_id");

COMMIT;
