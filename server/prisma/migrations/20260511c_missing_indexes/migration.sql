-- Add indexes the audit flagged as missing. CONCURRENTLY would be safer but
-- can't run inside a Prisma migration transaction; tables here are small
-- enough that a brief lock is fine.

CREATE INDEX IF NOT EXISTS "inventory_items_is_active_idx" ON "inventory_items" ("is_active");
CREATE INDEX IF NOT EXISTS "inventory_items_account_id_idx" ON "inventory_items" ("account_id");
CREATE INDEX IF NOT EXISTS "production_run_items_item_id_idx" ON "production_run_items" ("item_id");
CREATE INDEX IF NOT EXISTS "stock_opname_items_movement_id_idx" ON "stock_opname_items" ("movement_id");
