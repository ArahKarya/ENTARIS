-- Auto-backfill COGS untuk sales invoice yang dibuat saat stok minus.
-- Queue diisi saat sales submit dgn allowNegativeStock=true,
-- lalu di-settle FIFO setiap kali ada stok masuk untuk item terkait.

CREATE TABLE "cogs_backfill_queue" (
  "id"                    TEXT PRIMARY KEY,
  "sales_invoice_id"      TEXT NOT NULL,
  "sales_invoice_item_id" TEXT NOT NULL,
  "inventory_item_id"     TEXT NOT NULL,
  "qty_pending"           DECIMAL(15,3) NOT NULL,
  "qty_original"          DECIMAL(15,3) NOT NULL,
  "cost_at_sale"          DECIMAL(20,2) NOT NULL,
  "status"                TEXT NOT NULL DEFAULT 'Pending',
  "fiscal_year_id"        TEXT NOT NULL,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settled_at"            TIMESTAMP(3),
  CONSTRAINT "fk_cogs_q_si"  FOREIGN KEY ("sales_invoice_id")      REFERENCES "sales_invoices"("id")      ON DELETE CASCADE,
  CONSTRAINT "fk_cogs_q_sil" FOREIGN KEY ("sales_invoice_item_id") REFERENCES "sales_invoice_items"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_cogs_q_inv" FOREIGN KEY ("inventory_item_id")     REFERENCES "inventory_items"("id"),
  CONSTRAINT "fk_cogs_q_fy"  FOREIGN KEY ("fiscal_year_id")        REFERENCES "fiscal_years"("id")
);

CREATE INDEX "idx_cogs_q_status"      ON "cogs_backfill_queue"("status");
CREATE INDEX "idx_cogs_q_inv_status"  ON "cogs_backfill_queue"("inventory_item_id", "status");
CREATE INDEX "idx_cogs_q_si"          ON "cogs_backfill_queue"("sales_invoice_id");
CREATE INDEX "idx_cogs_q_created"     ON "cogs_backfill_queue"("created_at");

CREATE TABLE "cogs_backfill_settlements" (
  "id"                TEXT PRIMARY KEY,
  "queue_id"          TEXT NOT NULL,
  "qty_settled"       DECIMAL(15,3) NOT NULL,
  "cost_at_settle"    DECIMAL(20,2) NOT NULL,
  "differential"      DECIMAL(20,2) NOT NULL,
  "journal_entry_id"  TEXT,
  "trigger_source"    TEXT NOT NULL,
  "trigger_ref_id"    TEXT,
  "trigger_ref_no"    TEXT,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_settle_queue" FOREIGN KEY ("queue_id")         REFERENCES "cogs_backfill_queue"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_settle_je"    FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id")
);

CREATE INDEX "idx_settle_queue" ON "cogs_backfill_settlements"("queue_id");
CREATE INDEX "idx_settle_je"    ON "cogs_backfill_settlements"("journal_entry_id");
