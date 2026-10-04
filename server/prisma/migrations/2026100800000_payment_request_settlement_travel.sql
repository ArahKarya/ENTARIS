-- 2026-10-08: Pengajuan Pembayaran — stage 2.
--  * Pertanggungjawaban (settlement) uang muka / perjalanan dinas: kolom
--    settlement_* di payment_requests + tabel payment_request_settlement_lines
--    + payment_request_attachments.scope (REQUEST | SETTLEMENT).
--  * Perjalanan dinas: kolom travel_* di payment_requests, category/quantity/
--    unit_amount di payment_request_lines.
-- Additive & nullable (atau punya DEFAULT) — baris stage 1 tidak berubah.
-- Aman dijalankan ulang tiap startup (IF NOT EXISTS / DO-block).

ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "travel_destination" TEXT;
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "travel_start_date" TIMESTAMP(3);
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "travel_end_date" TIMESTAMP(3);
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "travel_participants" TEXT;

ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "settlement_supervisor_id" TEXT;
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "settlement_note" TEXT;
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "settlement_deadline" TIMESTAMP(3);
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "settlement_submitted_at" TIMESTAMP(3);
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "settlement_supervisor_approved_at" TIMESTAMP(3);
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "settlement_last_note" TEXT;
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "settlement_date" TIMESTAMP(3);
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "settlement_realized" DECIMAL(15,2);
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "settlement_cash_account_id" TEXT;
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "settlement_reference" TEXT;

ALTER TABLE "payment_request_lines" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "payment_request_lines" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(12,2);
ALTER TABLE "payment_request_lines" ADD COLUMN IF NOT EXISTS "unit_amount" DECIMAL(15,2);

ALTER TABLE "payment_request_attachments" ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'REQUEST';

CREATE TABLE IF NOT EXISTS "payment_request_settlement_lines" (
    "id" TEXT NOT NULL,
    "payment_request_id" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "expense_date" TIMESTAMP(3),
    "amount" DECIMAL(15,2) NOT NULL,
    "category" TEXT,
    "planned_line_id" TEXT,
    "expense_account_id" TEXT,

    CONSTRAINT "payment_request_settlement_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payment_request_settlement_lines_payment_request_id_idx" ON "payment_request_settlement_lines"("payment_request_id");
CREATE INDEX IF NOT EXISTS "payment_requests_settlement_status_idx" ON "payment_requests"("settlement_status");
CREATE INDEX IF NOT EXISTS "payment_requests_settlement_supervisor_id_idx" ON "payment_requests"("settlement_supervisor_id");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_requests_settlement_journal_id_key" ON "payment_requests"("settlement_journal_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_requests_settlement_journal_id_fkey') THEN
    ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_settlement_journal_id_fkey" FOREIGN KEY ("settlement_journal_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_requests_settlement_supervisor_id_fkey') THEN
    ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_settlement_supervisor_id_fkey" FOREIGN KEY ("settlement_supervisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_requests_settlement_cash_account_id_fkey') THEN
    ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_settlement_cash_account_id_fkey" FOREIGN KEY ("settlement_cash_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_request_settlement_lines_payment_request_id_fkey') THEN
    ALTER TABLE "payment_request_settlement_lines" ADD CONSTRAINT "payment_request_settlement_lines_payment_request_id_fkey" FOREIGN KEY ("payment_request_id") REFERENCES "payment_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_request_settlement_lines_expense_account_id_fkey') THEN
    ALTER TABLE "payment_request_settlement_lines" ADD CONSTRAINT "payment_request_settlement_lines_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
