-- Purchase invoice item refactor:
--  + kualitas        (text note, nullable)
--  + refaksi         (kg deduction, nullable)
--  + timbangan_truk  (informational gross weight, nullable)
--  + timbangan_diterima (net weight received = source of truth for quantity)
--  + pph_pct         (per-item PPh %, default 0)
--  + potongan_item   (per-item discount amount, default 0)
--
-- Backfill: existing rows copy `quantity` into `timbangan_diterima`
-- so old invoices remain consistent with the new model.

ALTER TABLE "purchase_invoice_items"
  ADD COLUMN "kualitas"            TEXT,
  ADD COLUMN "refaksi"             DECIMAL(15, 3),
  ADD COLUMN "timbangan_truk"      DECIMAL(15, 3),
  ADD COLUMN "timbangan_diterima"  DECIMAL(15, 3),
  ADD COLUMN "pph_pct"             DECIMAL(5, 2)  NOT NULL DEFAULT 0,
  ADD COLUMN "potongan_item"       DECIMAL(15, 2) NOT NULL DEFAULT 0;

-- Backfill: mirror quantity into timbangan_diterima for existing rows.
-- This preserves stock history consistency and makes old + new data look
-- the same from the API's perspective.
UPDATE "purchase_invoice_items"
SET "timbangan_diterima" = "quantity"
WHERE "timbangan_diterima" IS NULL;
