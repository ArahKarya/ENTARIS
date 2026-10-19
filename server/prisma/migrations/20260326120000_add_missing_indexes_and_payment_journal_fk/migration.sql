-- Add missing FK indexes for query performance
CREATE INDEX "journal_entry_accounts_journal_entry_id_idx" ON "journal_entry_accounts"("journal_entry_id");
CREATE INDEX "journal_entry_accounts_account_id_idx" ON "journal_entry_accounts"("account_id");
CREATE INDEX "sales_invoice_items_sales_invoice_id_idx" ON "sales_invoice_items"("sales_invoice_id");
CREATE INDEX "purchase_invoice_items_purchase_invoice_id_idx" ON "purchase_invoice_items"("purchase_invoice_id");

-- Add audit trail indexes for query filtering
CREATE INDEX "audit_trail_user_id_idx" ON "audit_trail"("user_id");
CREATE INDEX "audit_trail_entity_type_entity_id_idx" ON "audit_trail"("entity_type", "entity_id");
CREATE INDEX "audit_trail_created_at_idx" ON "audit_trail"("created_at");

-- Add journal_entry_id FK to payments for explicit relationship
ALTER TABLE "payments" ADD COLUMN "journal_entry_id" TEXT;
CREATE UNIQUE INDEX "payments_journal_entry_id_key" ON "payments"("journal_entry_id");
ALTER TABLE "payments" ADD CONSTRAINT "payments_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
