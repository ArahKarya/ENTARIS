-- 2026-10-06: Purchase Order stage 2 — draft/approval lifecycle, full pricing,
-- payment terms & destination warehouse. Additive only; existing rows stay
-- valid (Submitted = "Dipesan", pricing columns default 0).
-- Idempoten (aman dijalankan ulang tiap startup).

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS subtotal DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS discount_total DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS tax_total DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS other_costs DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS other_costs_label TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS grand_total DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_term_days INTEGER;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS warehouse_id TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_quote_ref TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approval_status TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approval_note TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_warehouse_id_fkey') THEN
    ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_warehouse_id_fkey
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS purchase_orders_warehouse_id_idx ON purchase_orders(warehouse_id);

ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS discount DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS tax_pct DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(15,2) NOT NULL DEFAULT 0;
