-- Retur Penjualan (Sales Return / Credit Note).
-- Dokumen retur yang me-refer ke satu SalesInvoice. Submit memposting JE
-- kontra-revenue (4.3 Retur Penjualan) + opsional stok masuk balik & balik HPP.
-- Lihat services/salesReturnSubmit.ts. Plain-scalar FK (created_by,
-- customer_deposit_id, inventory/warehouse/account/stock_movement) sengaja
-- tanpa relation Prisma supaya tak menambah back-relation di banyak model.

CREATE TABLE IF NOT EXISTS sales_returns (
  id                    text NOT NULL,
  return_number         text NOT NULL,
  date                  timestamp without time zone NOT NULL,
  party_id              text NOT NULL,
  sales_invoice_id      text NOT NULL,
  status                text NOT NULL DEFAULT 'Submitted',
  subtotal              numeric(15,2) NOT NULL,
  tax_amount            numeric(15,2) NOT NULL DEFAULT 0,
  total_return          numeric(15,2) NOT NULL,
  ar_reduced_amount     numeric(15,2) NOT NULL DEFAULT 0,
  credit_created_amount numeric(15,2) NOT NULL DEFAULT 0,
  customer_deposit_id   text,
  reason                text,
  notes                 text,
  fiscal_year_id        text NOT NULL,
  created_by            text NOT NULL,
  submitted_at          timestamp without time zone,
  cancelled_at          timestamp without time zone,
  created_at            timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sales_returns_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_returns_return_number_key ON sales_returns(return_number);
CREATE INDEX IF NOT EXISTS sales_returns_party_id_idx ON sales_returns(party_id);
CREATE INDEX IF NOT EXISTS sales_returns_sales_invoice_id_idx ON sales_returns(sales_invoice_id);
CREATE INDEX IF NOT EXISTS sales_returns_status_idx ON sales_returns(status);
CREATE INDEX IF NOT EXISTS sales_returns_date_idx ON sales_returns(date);

DO $$ BEGIN
  ALTER TABLE sales_returns ADD CONSTRAINT sales_returns_party_id_fkey
    FOREIGN KEY (party_id) REFERENCES parties(id) ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE sales_returns ADD CONSTRAINT sales_returns_sales_invoice_id_fkey
    FOREIGN KEY (sales_invoice_id) REFERENCES sales_invoices(id) ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS sales_return_items (
  id                    text NOT NULL,
  sales_return_id       text NOT NULL,
  sales_invoice_item_id text NOT NULL,
  inventory_item_id     text,
  warehouse_id          text,
  account_id            text NOT NULL,
  item_name             text NOT NULL,
  quantity              numeric(15,3) NOT NULL,
  unit                  text NOT NULL,
  rate                  numeric(15,2) NOT NULL,
  discount              numeric(5,2) NOT NULL DEFAULT 0,
  amount                numeric(15,2) NOT NULL,
  tax_pct               numeric(5,2) NOT NULL DEFAULT 0,
  restock               boolean NOT NULL DEFAULT true,
  unit_cost_loaded      numeric(20,4),
  stock_movement_id     text,
  CONSTRAINT sales_return_items_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS sales_return_items_sales_return_id_idx ON sales_return_items(sales_return_id);
CREATE INDEX IF NOT EXISTS sales_return_items_sales_invoice_item_id_idx ON sales_return_items(sales_invoice_item_id);

DO $$ BEGIN
  ALTER TABLE sales_return_items ADD CONSTRAINT sales_return_items_sales_return_id_fkey
    FOREIGN KEY (sales_return_id) REFERENCES sales_returns(id) ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE sales_return_items ADD CONSTRAINT sales_return_items_sales_invoice_item_id_fkey
    FOREIGN KEY (sales_invoice_item_id) REFERENCES sales_invoice_items(id) ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
