-- Add Surat Jalan (DeliveryOrder) — physical delivery document. DO submit
-- decrements stock + creates a stockMovement Out (locked unitCost) but has
-- NO GL impact. Later, sales invoice line can reference deliveryOrderItem to
-- skip stock-out (already done) while still posting COGS using the locked
-- cost. Supports N-DO → 1-invoice aggregate billing.

CREATE TABLE "delivery_orders" (
  "id" TEXT NOT NULL,
  "do_number" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "party_id" TEXT NOT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'Submitted',
  "notes" TEXT,
  "nomor_mobil" TEXT,
  "driver_name" TEXT,
  "recipient_name" TEXT,
  "invoice_id" TEXT,
  "invoiced_at" TIMESTAMP(3),
  "fiscal_year_id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "submitted_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "delivery_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_orders_do_number_key" ON "delivery_orders"("do_number");
CREATE INDEX "delivery_orders_date_idx" ON "delivery_orders"("date");
CREATE INDEX "delivery_orders_party_id_idx" ON "delivery_orders"("party_id");
CREATE INDEX "delivery_orders_status_idx" ON "delivery_orders"("status");
CREATE INDEX "delivery_orders_invoice_id_idx" ON "delivery_orders"("invoice_id");
CREATE INDEX "delivery_orders_fiscal_year_id_idx" ON "delivery_orders"("fiscal_year_id");

ALTER TABLE "delivery_orders"
  ADD CONSTRAINT "delivery_orders_party_id_fkey" FOREIGN KEY ("party_id")
    REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "delivery_orders_invoice_id_fkey" FOREIGN KEY ("invoice_id")
    REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "delivery_orders_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id")
    REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "delivery_orders_created_by_fkey" FOREIGN KEY ("created_by")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "delivery_order_items" (
  "id" TEXT NOT NULL,
  "delivery_order_id" TEXT NOT NULL,
  "inventory_item_id" TEXT,
  "warehouse_id" TEXT,
  "item_name" TEXT NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  "unit" TEXT NOT NULL,
  "description" TEXT,
  "stock_movement_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_order_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "delivery_order_items_delivery_order_id_idx" ON "delivery_order_items"("delivery_order_id");
CREATE INDEX "delivery_order_items_inventory_item_id_idx" ON "delivery_order_items"("inventory_item_id");
CREATE INDEX "delivery_order_items_warehouse_id_idx" ON "delivery_order_items"("warehouse_id");
CREATE UNIQUE INDEX "delivery_order_items_stock_movement_id_key" ON "delivery_order_items"("stock_movement_id");

ALTER TABLE "delivery_order_items"
  ADD CONSTRAINT "delivery_order_items_delivery_order_id_fkey" FOREIGN KEY ("delivery_order_id")
    REFERENCES "delivery_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "delivery_order_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id")
    REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "delivery_order_items_warehouse_id_fkey" FOREIGN KEY ("warehouse_id")
    REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "delivery_order_items_stock_movement_id_fkey" FOREIGN KEY ("stock_movement_id")
    REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Link sales invoice item to the DO item it billed (1:1). Skip stock-out
-- in salesInvoiceSubmit when this is set.
ALTER TABLE "sales_invoice_items"
  ADD COLUMN "delivery_order_item_id" TEXT;

CREATE UNIQUE INDEX "sales_invoice_items_delivery_order_item_id_key"
  ON "sales_invoice_items"("delivery_order_item_id");

ALTER TABLE "sales_invoice_items"
  ADD CONSTRAINT "sales_invoice_items_delivery_order_item_id_fkey"
    FOREIGN KEY ("delivery_order_item_id")
    REFERENCES "delivery_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
