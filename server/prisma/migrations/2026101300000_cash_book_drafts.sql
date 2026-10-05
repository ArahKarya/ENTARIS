-- 2026-10-13: Draft Buku Kas (dari nota / halaman buku kas). Draft tidak berefek ke GL
-- sampai diposting; posting membuat satu jurnal seimbang per baris. Pola keterangan->akun
-- dipelajari dari koreksi manusia (cash_book_learned_maps).
-- Additive only; aman dijalankan ulang tiap startup (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "cash_book_drafts" (
    "id" TEXT NOT NULL,
    "draft_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "title" TEXT NOT NULL,
    "entry_date" TIMESTAMP(3) NOT NULL,
    "cash_account_id" TEXT NOT NULL,
    "opening_balance" DECIMAL(20,2),
    "closing_balance" DECIMAL(20,2),
    "source" TEXT NOT NULL DEFAULT 'manual',
    "source_ref" TEXT,
    "source_note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_via" TEXT,
    "posted_at" TIMESTAMP(3),
    "posted_by_id" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_book_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cash_book_draft_rows" (
    "id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "row_date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "direction" TEXT NOT NULL,
    "txn_type" TEXT NOT NULL,
    "account_id" TEXT,
    "account_code" TEXT,
    "account_label" TEXT,
    "confidence" DECIMAL(4,3) NOT NULL DEFAULT 0,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "skip" BOOLEAN NOT NULL DEFAULT false,
    "user_edited" BOOLEAN NOT NULL DEFAULT false,
    "journal_entry_id" TEXT,
    "posted_at" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "cash_book_draft_rows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cash_book_learned_maps" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "txn_type" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "updated_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_book_learned_maps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cash_book_drafts_draft_number_key" ON "cash_book_drafts"("draft_number");
CREATE INDEX IF NOT EXISTS "cash_book_drafts_status_entry_date_idx" ON "cash_book_drafts"("status", "entry_date");
CREATE INDEX IF NOT EXISTS "cash_book_drafts_created_by_id_idx" ON "cash_book_drafts"("created_by_id");
CREATE UNIQUE INDEX IF NOT EXISTS "cash_book_draft_rows_draft_id_idx_key" ON "cash_book_draft_rows"("draft_id", "idx");
CREATE INDEX IF NOT EXISTS "cash_book_draft_rows_journal_entry_id_idx" ON "cash_book_draft_rows"("journal_entry_id");
CREATE INDEX IF NOT EXISTS "cash_book_draft_rows_row_date_amount_idx" ON "cash_book_draft_rows"("row_date", "amount");
CREATE UNIQUE INDEX IF NOT EXISTS "cash_book_learned_maps_pattern_txn_type_key" ON "cash_book_learned_maps"("pattern", "txn_type");
CREATE INDEX IF NOT EXISTS "cash_book_learned_maps_account_id_idx" ON "cash_book_learned_maps"("account_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_book_draft_rows_draft_id_fkey') THEN
    ALTER TABLE "cash_book_draft_rows"
      ADD CONSTRAINT "cash_book_draft_rows_draft_id_fkey"
      FOREIGN KEY ("draft_id") REFERENCES "cash_book_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
