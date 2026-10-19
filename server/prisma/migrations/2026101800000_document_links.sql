-- 2026-10-18: Document links (PI -> PO header link, PI line item type).
-- Idempotent: loose .sql files re-run on every boot; every statement is safe to repeat.
-- No GL, stock or amount changes.

-- 1. PI header PO link: backfill from the billed goods receipts (STT) when every linked
--    receipt points to exactly one PO. Receipts come from the header link
--    (goods_receipts.invoice_id) and from per-line links (goods_receipt_item_id).
--    Mixed POs or a receipt without PO stay NULL. Only NULL targets are touched.
WITH pi_receipts AS (
  SELECT gr."invoice_id" AS pi_id, gr."id" AS gr_id, gr."purchase_order_id" AS po_id
  FROM "goods_receipts" gr
  WHERE gr."invoice_id" IS NOT NULL
  UNION
  SELECT pii."purchase_invoice_id", gr."id", gr."purchase_order_id"
  FROM "purchase_invoice_items" pii
  JOIN "goods_receipt_items" gri ON gri."id" = pii."goods_receipt_item_id"
  JOIN "goods_receipts" gr ON gr."id" = gri."goods_receipt_id"
),
single_po AS (
  SELECT pi_id, MIN(po_id) AS po_id
  FROM pi_receipts
  GROUP BY pi_id
  HAVING COUNT(*) FILTER (WHERE po_id IS NULL) = 0
     AND COUNT(DISTINCT po_id) = 1
)
UPDATE "purchase_invoices" pi
SET "purchase_order_id" = s.po_id
FROM single_po s
WHERE pi."id" = s.pi_id
  AND pi."purchase_order_id" IS NULL;

-- 2. PI line type ('product' = goods, 'service' = jasa/biaya). Added nullable so the
--    backfill only fills NULL rows, then defaulted + NOT NULL like sales_invoice_items.
ALTER TABLE "purchase_invoice_items" ADD COLUMN IF NOT EXISTS "item_type" TEXT;

-- 2a. Lines tied to an inventory item or an STT line are goods.
UPDATE "purchase_invoice_items"
SET "item_type" = 'product'
WHERE "item_type" IS NULL
  AND ("inventory_item_id" IS NOT NULL OR "goods_receipt_item_id" IS NOT NULL);

-- 2b. EAM bills posted as PI: vehicle tax and vehicle service are services,
--     material requests (spare parts) are goods.
UPDATE "purchase_invoice_items" pii
SET "item_type" = 'service'
WHERE pii."item_type" IS NULL
  AND pii."inventory_item_id" IS NULL
  AND (
    EXISTS (SELECT 1 FROM "ga_vehicle_taxes" t WHERE t."purchase_invoice_id" = pii."purchase_invoice_id")
    OR EXISTS (SELECT 1 FROM "ga_vehicle_service_logs" l WHERE l."purchase_invoice_id" = pii."purchase_invoice_id")
  );

UPDATE "purchase_invoice_items" pii
SET "item_type" = 'product'
WHERE pii."item_type" IS NULL
  AND EXISTS (SELECT 1 FROM "ga_material_requests" m WHERE m."purchase_invoice_id" = pii."purchase_invoice_id");

-- 2c. Remaining free lines are ambiguous (legacy raw material vs jasa): keep the
--     previous meaning ('product'); the edit form still applies its weight heuristic.
UPDATE "purchase_invoice_items" SET "item_type" = 'product' WHERE "item_type" IS NULL;

ALTER TABLE "purchase_invoice_items" ALTER COLUMN "item_type" SET DEFAULT 'product';
ALTER TABLE "purchase_invoice_items" ALTER COLUMN "item_type" SET NOT NULL;
