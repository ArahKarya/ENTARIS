-- ============================================================================
-- Phase 5 — Universal batch tracking on stock_movements
--
-- Adds source_movement_id to stock_movements so any outbound movement
-- (sales, transfer, stock adjustment, production input) can link to a
-- specific inbound batch. Production input previously stored this on
-- production_run_items only; from now on both surfaces are populated.
--
-- The batches endpoint (Phase 2) will be refactored to use this column
-- as the universal consumption ledger, resolving the per-batch-vs-total
-- stock mismatch warning.
-- ============================================================================

BEGIN;

ALTER TABLE "stock_movements"
  ADD COLUMN IF NOT EXISTS "source_movement_id" TEXT;

ALTER TABLE "stock_movements"
  DROP CONSTRAINT IF EXISTS "stock_movements_source_movement_id_fkey";
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_source_movement_id_fkey"
  FOREIGN KEY ("source_movement_id") REFERENCES "stock_movements"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "stock_movements_source_movement_id_idx"
  ON "stock_movements"("source_movement_id");

-- Sales-invoice-item & transfer-item likewise can carry the batch link so
-- the per-line picker UX maps cleanly back to the table. unit_cost_loaded
-- captures the loaded HPP that flowed via the batch (Phase 6 reports).
ALTER TABLE "sales_invoice_items"
  ADD COLUMN IF NOT EXISTS "source_movement_id" TEXT,
  ADD COLUMN IF NOT EXISTS "unit_cost_loaded"   DECIMAL(20, 4);

ALTER TABLE "sales_invoice_items"
  DROP CONSTRAINT IF EXISTS "sales_invoice_items_source_movement_id_fkey";
ALTER TABLE "sales_invoice_items"
  ADD CONSTRAINT "sales_invoice_items_source_movement_id_fkey"
  FOREIGN KEY ("source_movement_id") REFERENCES "stock_movements"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "sales_invoice_items_source_movement_id_idx"
  ON "sales_invoice_items"("source_movement_id");

ALTER TABLE "stock_transfer_items"
  ADD COLUMN IF NOT EXISTS "source_movement_id" TEXT;

ALTER TABLE "stock_transfer_items"
  DROP CONSTRAINT IF EXISTS "stock_transfer_items_source_movement_id_fkey";
ALTER TABLE "stock_transfer_items"
  ADD CONSTRAINT "stock_transfer_items_source_movement_id_fkey"
  FOREIGN KEY ("source_movement_id") REFERENCES "stock_movements"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "stock_transfer_items_source_movement_id_idx"
  ON "stock_transfer_items"("source_movement_id");

COMMIT;
