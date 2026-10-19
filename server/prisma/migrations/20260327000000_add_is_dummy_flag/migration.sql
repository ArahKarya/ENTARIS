ALTER TABLE "parties" ADD COLUMN "is_dummy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sales_invoices" ADD COLUMN "is_dummy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "purchase_invoices" ADD COLUMN "is_dummy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "inventory_items" ADD COLUMN "is_dummy" BOOLEAN NOT NULL DEFAULT false;
