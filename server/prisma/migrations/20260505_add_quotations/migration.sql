-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Cancelled');

-- CreateTable
CREATE TABLE "quotations" (
    "id" TEXT NOT NULL,
    "quotation_number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "party_id" TEXT NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'Draft',
    "subtotal" DECIMAL(15,2) NOT NULL,
    "tax_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "potongan" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "biaya_lain" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "label_potongan" TEXT,
    "label_biaya" TEXT,
    "grand_total" DECIMAL(15,2) NOT NULL,
    "terms" TEXT,
    "notes" TEXT,
    "reject_reason" TEXT,
    "sales_invoice_id" TEXT,
    "fiscal_year_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "converted_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "expiry_notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_items" (
    "id" TEXT NOT NULL,
    "quotation_id" TEXT NOT NULL,
    "item_type" TEXT NOT NULL DEFAULT 'product',
    "inventory_item_id" TEXT,
    "service_item_id" TEXT,
    "account_id" TEXT,
    "item_name" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Kg',
    "rate" DECIMAL(15,2) NOT NULL,
    "discount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(15,2) NOT NULL,
    "tax_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "pph_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotations_quotation_number_key" ON "quotations"("quotation_number");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_sales_invoice_id_key" ON "quotations"("sales_invoice_id");

-- CreateIndex
CREATE INDEX "quotations_party_id_idx" ON "quotations"("party_id");

-- CreateIndex
CREATE INDEX "quotations_status_idx" ON "quotations"("status");

-- CreateIndex
CREATE INDEX "quotations_date_idx" ON "quotations"("date");

-- CreateIndex
CREATE INDEX "quotations_valid_until_idx" ON "quotations"("valid_until");

-- CreateIndex
CREATE INDEX "quotations_fiscal_year_id_idx" ON "quotations"("fiscal_year_id");

-- CreateIndex
CREATE INDEX "quotations_status_valid_until_idx" ON "quotations"("status", "valid_until");

-- CreateIndex
CREATE INDEX "quotation_items_quotation_id_idx" ON "quotation_items"("quotation_id");

-- CreateIndex
CREATE INDEX "quotation_items_inventory_item_id_idx" ON "quotation_items"("inventory_item_id");

-- CreateIndex
CREATE INDEX "quotation_items_service_item_id_idx" ON "quotation_items"("service_item_id");

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_sales_invoice_id_fkey" FOREIGN KEY ("sales_invoice_id") REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_service_item_id_fkey" FOREIGN KEY ("service_item_id") REFERENCES "service_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
