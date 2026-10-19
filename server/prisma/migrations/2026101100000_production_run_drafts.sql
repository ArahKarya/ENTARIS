-- 2026-10-11: Draft Data Produksi. Input produksi disimpan sebagai draft dulu
-- (tanpa efek stok/GL/HPP/OEE); posting adalah aksi terpisah.
-- Additive only; aman dijalankan ulang tiap startup (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "production_run_drafts" (
    "id" TEXT NOT NULL,
    "draft_number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "warehouse_id" TEXT,
    "summary" JSONB,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "posted_run_id" TEXT,
    "posted_run_number" TEXT,
    "posted_at" TIMESTAMP(3),
    "posted_by_id" TEXT,
    "approval_request_id" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_run_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "production_run_drafts_draft_number_key" ON "production_run_drafts"("draft_number");
CREATE INDEX IF NOT EXISTS "production_run_drafts_status_date_idx" ON "production_run_drafts"("status", "date");
CREATE INDEX IF NOT EXISTS "production_run_drafts_created_by_id_idx" ON "production_run_drafts"("created_by_id");
CREATE INDEX IF NOT EXISTS "production_run_drafts_approval_request_id_idx" ON "production_run_drafts"("approval_request_id");
