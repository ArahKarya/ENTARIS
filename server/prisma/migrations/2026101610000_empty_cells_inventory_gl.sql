-- 2026-10-16: Fill metadata the UI showed as an empty cell although the data
-- exists elsewhere (inventory + GL). Metadata only: no debit/credit amount or
-- account of any journal or ledger row is changed.
-- Idempotent: ADD COLUMN IF NOT EXISTS and every UPDATE only touches rows whose
-- target is still NULL (or empty), so re-running is a no-op.

-- ---------------------------------------------------------------------------
-- 1. Ledger / journal line descriptions (manual stock movements never wrote
--    one). Fall back to the journal narration.
-- ---------------------------------------------------------------------------
UPDATE "accounting_ledger_entries" l
SET "description" = je."narration"
FROM "journal_entries" je
WHERE l."reference_type" = 'JournalEntry'
  AND l."reference_id" = je."id"
  AND (l."description" IS NULL OR l."description" = '')
  AND je."narration" IS NOT NULL
  AND je."narration" <> '';

-- Journal lines of journals posted by a stock movement.
UPDATE "journal_entry_accounts" ji
SET "description" = je."narration"
FROM "journal_entries" je
JOIN "stock_movements" sm ON sm."journal_entry_id" = je."id"
WHERE ji."journal_entry_id" = je."id"
  AND (ji."description" IS NULL OR ji."description" = '')
  AND je."narration" IS NOT NULL
  AND je."narration" <> '';

-- ---------------------------------------------------------------------------
-- 2. Production run lines: warehouse = the single warehouse the run's stock
--    movements used. Live movements first; a run whose movements are all
--    cancelled falls back to all of them. Runs spanning several warehouses
--    are skipped (not deterministic).
-- ---------------------------------------------------------------------------
UPDATE "production_run_items" pri
SET "warehouse_id" = src.wh
FROM (
  SELECT sm."reference_id" AS run_id, MIN(sm."warehouse_id") AS wh
  FROM "stock_movements" sm
  WHERE sm."reference_type" = 'ProductionRun'
    AND sm."warehouse_id" IS NOT NULL
    AND sm."is_cancelled" = false
  GROUP BY sm."reference_id"
  HAVING COUNT(DISTINCT sm."warehouse_id") = 1
) src
WHERE pri."production_run_id" = src.run_id
  AND pri."warehouse_id" IS NULL;

UPDATE "production_run_items" pri
SET "warehouse_id" = src.wh
FROM (
  SELECT sm."reference_id" AS run_id, MIN(sm."warehouse_id") AS wh
  FROM "stock_movements" sm
  WHERE sm."reference_type" = 'ProductionRun'
    AND sm."warehouse_id" IS NOT NULL
  GROUP BY sm."reference_id"
  HAVING COUNT(DISTINCT sm."warehouse_id") = 1
     AND BOOL_AND(sm."is_cancelled")
) src
WHERE pri."production_run_id" = src.run_id
  AND pri."warehouse_id" IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Stock opname header warehouse.
-- ---------------------------------------------------------------------------
ALTER TABLE "stock_opnames" ADD COLUMN IF NOT EXISTS "warehouse_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_opnames_warehouse_id_fkey'
  ) THEN
    ALTER TABLE "stock_opnames"
      ADD CONSTRAINT "stock_opnames_warehouse_id_fkey"
      FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "stock_opnames_warehouse_id_idx" ON "stock_opnames"("warehouse_id");

-- From the variance movements (single warehouse only).
UPDATE "stock_opnames" so
SET "warehouse_id" = src.wh
FROM (
  SELECT sm."reference_id" AS opname_id, MIN(sm."warehouse_id") AS wh
  FROM "stock_movements" sm
  WHERE sm."reference_type" = 'StockOpname'
    AND sm."warehouse_id" IS NOT NULL
  GROUP BY sm."reference_id"
  HAVING COUNT(DISTINCT sm."warehouse_id") = 1
) src
WHERE so."id" = src.opname_id
  AND so."warehouse_id" IS NULL;

-- Else from the opname lines (single warehouse only).
UPDATE "stock_opnames" so
SET "warehouse_id" = src.wh
FROM (
  SELECT soi."stock_opname_id" AS opname_id, MIN(soi."warehouse_id") AS wh
  FROM "stock_opname_items" soi
  WHERE soi."warehouse_id" IS NOT NULL
  GROUP BY soi."stock_opname_id"
  HAVING COUNT(DISTINCT soi."warehouse_id") = 1
) src
WHERE so."id" = src.opname_id
  AND so."warehouse_id" IS NULL;

-- Lines inherit the header warehouse.
UPDATE "stock_opname_items" soi
SET "warehouse_id" = so."warehouse_id"
FROM "stock_opnames" so
WHERE soi."stock_opname_id" = so."id"
  AND so."warehouse_id" IS NOT NULL
  AND soi."warehouse_id" IS NULL;

-- 4. Opening-balance inventory imports: no backfill. Old import movements
--    cannot be linked to their journal deterministically and never updated
--    inventory_stocks, so setting a warehouse now would desync stock.

-- ---------------------------------------------------------------------------
-- 5. Counter account (akun lawan) of document-generated movements, taken from
--    the journal each document actually posted. Only when that journal has a
--    single account on the counter side.
-- ---------------------------------------------------------------------------

-- Goods receipt (STT): JV-<sttNumber> credits Hutang Belum Tagih.
UPDATE "stock_movements" sm
SET "offset_account_id" = src.account_id
FROM (
  SELECT je."entry_number", MIN(ji."account_id") AS account_id
  FROM "journal_entries" je
  JOIN "journal_entry_accounts" ji ON ji."journal_entry_id" = je."id"
  WHERE ji."credit" > 0
  GROUP BY je."entry_number"
  HAVING COUNT(DISTINCT ji."account_id") = 1
) src
WHERE sm."reference_type" = 'GoodsReceipt'
  AND sm."offset_account_id" IS NULL
  AND sm."total_value" > 0
  AND sm."reference_number" IS NOT NULL
  AND src."entry_number" = 'JV-' || sm."reference_number";

-- Sales return restock: JV-COGS-<returnNumber> credits HPP.
UPDATE "stock_movements" sm
SET "offset_account_id" = src.account_id
FROM (
  SELECT je."entry_number", MIN(ji."account_id") AS account_id
  FROM "journal_entries" je
  JOIN "journal_entry_accounts" ji ON ji."journal_entry_id" = je."id"
  WHERE ji."credit" > 0
  GROUP BY je."entry_number"
  HAVING COUNT(DISTINCT ji."account_id") = 1
) src
WHERE sm."reference_type" = 'SalesReturn'
  AND sm."offset_account_id" IS NULL
  AND sm."total_value" > 0
  AND sm."reference_number" IS NOT NULL
  AND src."entry_number" = 'JV-COGS-' || sm."reference_number";

-- Delivery order: the DO posts no journal; its counter account is the HPP the
-- invoice that picked up the DO line debited (JV-COGS-<invoiceNumber>).
-- Not-yet-invoiced DO lines stay NULL.
UPDATE "stock_movements" sm
SET "offset_account_id" = src.account_id
FROM (
  SELECT doi."stock_movement_id" AS movement_id, MIN(ji."account_id") AS account_id
  FROM "delivery_order_items" doi
  JOIN "sales_invoice_items" sii ON sii."delivery_order_item_id" = doi."id"
  JOIN "sales_invoices" si ON si."id" = sii."sales_invoice_id"
  JOIN "journal_entries" je ON je."entry_number" = 'JV-COGS-' || si."invoice_number"
  JOIN "journal_entry_accounts" ji ON ji."journal_entry_id" = je."id"
  WHERE doi."stock_movement_id" IS NOT NULL
    AND ji."debit" > 0
  GROUP BY doi."stock_movement_id"
  HAVING COUNT(DISTINCT ji."account_id") = 1
) src
WHERE sm."id" = src.movement_id
  AND sm."reference_type" = 'DeliveryOrder'
  AND sm."offset_account_id" IS NULL
  AND sm."total_value" > 0;
