-- Sales Order module: komitmen jual sebelum DO + Invoice.
-- SO submit tidak gerakkan stok, tidak post JE. Saat fulfillment, generate DO
-- dari SO. Saat DO submit, sales_order_items.delivered_qty di-update.

CREATE TYPE "SalesOrderStatus" AS ENUM (
  'Draft',
  'Submitted',
  'PartiallyDelivered',
  'FullyDelivered',
  'Cancelled'
);

CREATE TABLE "sales_orders" (
  "id"                  TEXT PRIMARY KEY,
  "so_number"           TEXT NOT NULL UNIQUE,
  "date"                TIMESTAMP(3) NOT NULL,
  "expected_delivery"   TIMESTAMP(3),
  "party_id"            TEXT NOT NULL REFERENCES "parties"("id"),
  "customer_ref_no"     TEXT,
  "quotation_id"        TEXT REFERENCES "quotations"("id"),
  "status"              "SalesOrderStatus" NOT NULL DEFAULT 'Draft',
  "notes"               TEXT,
  "subtotal"            DECIMAL(15,2) NOT NULL,
  "tax_pct"             DECIMAL(5,2) NOT NULL DEFAULT 0,
  "potongan"            DECIMAL(15,2) NOT NULL DEFAULT 0,
  "biaya_lain"          DECIMAL(15,2) NOT NULL DEFAULT 0,
  "grand_total"         DECIMAL(15,2) NOT NULL,
  "fiscal_year_id"      TEXT NOT NULL REFERENCES "fiscal_years"("id"),
  "created_by"          TEXT NOT NULL REFERENCES "users"("id"),
  "submitted_at"        TIMESTAMP(3),
  "cancelled_at"        TIMESTAMP(3),
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL
);
CREATE INDEX "sales_orders_party_id_idx" ON "sales_orders"("party_id");
CREATE INDEX "sales_orders_status_idx"   ON "sales_orders"("status");
CREATE INDEX "sales_orders_date_idx"     ON "sales_orders"("date");
CREATE INDEX "sales_orders_quotation_id_idx" ON "sales_orders"("quotation_id");

CREATE TABLE "sales_order_items" (
  "id"                  TEXT PRIMARY KEY,
  "sales_order_id"      TEXT NOT NULL REFERENCES "sales_orders"("id") ON DELETE CASCADE,
  "inventory_item_id"   TEXT REFERENCES "inventory_items"("id"),
  "item_name"           TEXT NOT NULL,
  "quantity"            DECIMAL(15,3) NOT NULL,
  "unit"                TEXT NOT NULL,
  "rate"                DECIMAL(15,2) NOT NULL,
  "discount"            DECIMAL(5,2) NOT NULL DEFAULT 0,
  "amount"              DECIMAL(15,2) NOT NULL,
  "description"         TEXT,
  "delivered_qty"       DECIMAL(15,3) NOT NULL DEFAULT 0,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "sales_order_items_sales_order_id_idx" ON "sales_order_items"("sales_order_id");
CREATE INDEX "sales_order_items_inventory_item_id_idx" ON "sales_order_items"("inventory_item_id");

-- Link DO ke SO (optional). Multiple DOs bisa dari 1 SO (partial delivery).
ALTER TABLE "delivery_orders"
  ADD COLUMN "sales_order_id" TEXT REFERENCES "sales_orders"("id");
CREATE INDEX "delivery_orders_sales_order_id_idx" ON "delivery_orders"("sales_order_id");

-- Link DO line ke SO line, untuk track partial delivery.
ALTER TABLE "delivery_order_items"
  ADD COLUMN "sales_order_item_id" TEXT REFERENCES "sales_order_items"("id");
CREATE INDEX "delivery_order_items_sales_order_item_id_idx" ON "delivery_order_items"("sales_order_item_id");
