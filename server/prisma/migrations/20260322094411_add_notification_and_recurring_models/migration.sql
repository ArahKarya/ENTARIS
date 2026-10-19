/*
  Warnings:

  - Added the required column `fiscal_year_id` to the `payments` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "inventory_items" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "fiscal_year_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "production_runs" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "purchase_invoice_items" ADD COLUMN     "discount" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "purchase_invoices" ADD COLUMN     "biaya_lain" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "potongan" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tax_pct" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales_invoice_items" ADD COLUMN     "discount" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN     "biaya_lain" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "label_biaya" TEXT,
ADD COLUMN     "label_potongan" TEXT,
ADD COLUMN     "potongan" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tax_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "terms" TEXT;

-- AlterTable
ALTER TABLE "stock_movements" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "template_type" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "day_of_month" INTEGER,
    "next_run_date" TIMESTAMP(3) NOT NULL,
    "last_run_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "template_data" JSONB NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "recurring_templates_is_active_next_run_date_idx" ON "recurring_templates"("is_active", "next_run_date");

-- CreateIndex
CREATE INDEX "accounting_ledger_entries_account_id_idx" ON "accounting_ledger_entries"("account_id");

-- CreateIndex
CREATE INDEX "accounting_ledger_entries_date_idx" ON "accounting_ledger_entries"("date");

-- CreateIndex
CREATE INDEX "accounting_ledger_entries_fiscal_year_id_idx" ON "accounting_ledger_entries"("fiscal_year_id");

-- CreateIndex
CREATE INDEX "accounting_ledger_entries_reference_id_idx" ON "accounting_ledger_entries"("reference_id");

-- CreateIndex
CREATE INDEX "accounting_ledger_entries_party_id_idx" ON "accounting_ledger_entries"("party_id");

-- CreateIndex
CREATE INDEX "accounts_rootType_idx" ON "accounts"("rootType");

-- CreateIndex
CREATE INDEX "accounts_accountNumber_idx" ON "accounts"("accountNumber");

-- CreateIndex
CREATE INDEX "accounts_parentId_idx" ON "accounts"("parentId");

-- CreateIndex
CREATE INDEX "parties_partyType_idx" ON "parties"("partyType");

-- CreateIndex
CREATE INDEX "payments_party_id_idx" ON "payments"("party_id");

-- CreateIndex
CREATE INDEX "payments_date_idx" ON "payments"("date");

-- CreateIndex
CREATE INDEX "payments_fiscal_year_id_idx" ON "payments"("fiscal_year_id");

-- CreateIndex
CREATE INDEX "purchase_invoices_party_id_idx" ON "purchase_invoices"("party_id");

-- CreateIndex
CREATE INDEX "purchase_invoices_status_idx" ON "purchase_invoices"("status");

-- CreateIndex
CREATE INDEX "purchase_invoices_date_idx" ON "purchase_invoices"("date");

-- CreateIndex
CREATE INDEX "purchase_invoices_fiscal_year_id_idx" ON "purchase_invoices"("fiscal_year_id");

-- CreateIndex
CREATE INDEX "sales_invoices_party_id_idx" ON "sales_invoices"("party_id");

-- CreateIndex
CREATE INDEX "sales_invoices_status_idx" ON "sales_invoices"("status");

-- CreateIndex
CREATE INDEX "sales_invoices_date_idx" ON "sales_invoices"("date");

-- CreateIndex
CREATE INDEX "sales_invoices_fiscal_year_id_idx" ON "sales_invoices"("fiscal_year_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
