-- AlterTable: add slug to company_settings
ALTER TABLE "company_settings" ADD COLUMN "slug" TEXT NOT NULL DEFAULT 'default';
CREATE UNIQUE INDEX "company_settings_slug_key" ON "company_settings"("slug");

-- CreateIndex: journal_entries
CREATE INDEX IF NOT EXISTS "journal_entries_date_idx" ON "journal_entries"("date");
CREATE INDEX IF NOT EXISTS "journal_entries_fiscal_year_id_idx" ON "journal_entries"("fiscal_year_id");

-- CreateIndex: payment_allocations
CREATE INDEX IF NOT EXISTS "payment_allocations_payment_id_idx" ON "payment_allocations"("payment_id");
CREATE INDEX IF NOT EXISTS "payment_allocations_invoice_type_invoice_id_idx" ON "payment_allocations"("invoice_type", "invoice_id");
