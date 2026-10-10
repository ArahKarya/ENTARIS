-- 2026-10-16: Purchase Invoice "Termin" + party on paid payment request journals.
-- Idempotent: loose .sql files re-run on every boot; every statement is safe to repeat.

-- 1. Payment terms on purchase invoices (the PI edit form already sends `terms`).
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "terms" TEXT;

-- 2. Backfill the vendor party onto journal items of paid VENDOR payment requests, so the
--    Kas & Bank ledger "Pihak" column shows the vendor instead of the narration. The link is
--    exact: payment_requests.journal_entry_id (unique) points at the payment journal. Only
--    rows still missing a party are touched, so re-running is a no-op.
UPDATE "journal_entry_accounts" ji
SET "party_id" = pr."party_id"
FROM "payment_requests" pr
WHERE pr."journal_entry_id" = ji."journal_entry_id"
  AND pr."payee_kind" = 'VENDOR'
  AND pr."party_id" IS NOT NULL
  AND ji."party_id" IS NULL;
