-- Add missing indexes for Payment and JournalEntry
CREATE INDEX IF NOT EXISTS "payments_account_id_idx" ON "payments"("account_id");
CREATE INDEX IF NOT EXISTS "payments_status_idx" ON "payments"("status");
CREATE INDEX IF NOT EXISTS "journal_entries_status_idx" ON "journal_entries"("status");
