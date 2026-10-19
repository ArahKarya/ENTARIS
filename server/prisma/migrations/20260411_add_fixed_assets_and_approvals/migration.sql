-- Fixed Assets (Aset Tetap)
CREATE TABLE "fixed_assets" (
  "id" TEXT NOT NULL,
  "asset_number" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT,
  "acquisition_date" TIMESTAMP(3) NOT NULL,
  "acquisition_cost" DECIMAL(20,2) NOT NULL,
  "useful_life_months" INTEGER NOT NULL,
  "salvage_value" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "depreciation_method" TEXT NOT NULL DEFAULT 'straight_line',
  "accumulated_depreciation" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "book_value" DECIMAL(20,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Active',
  "disposal_date" TIMESTAMP(3),
  "disposal_amount" DECIMAL(20,2),
  "asset_account_id" TEXT NOT NULL,
  "depreciation_account_id" TEXT NOT NULL,
  "accumulated_dep_account_id" TEXT NOT NULL,
  "fiscal_year_id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fixed_assets_asset_number_key" ON "fixed_assets"("asset_number");
CREATE INDEX "fixed_assets_category_idx" ON "fixed_assets"("category");
CREATE INDEX "fixed_assets_status_idx" ON "fixed_assets"("status");

ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_asset_account_id_fkey" FOREIGN KEY ("asset_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_depreciation_account_id_fkey" FOREIGN KEY ("depreciation_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_accumulated_dep_account_id_fkey" FOREIGN KEY ("accumulated_dep_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Depreciation Schedule
CREATE TABLE "depreciation_entries" (
  "id" TEXT NOT NULL,
  "fixed_asset_id" TEXT NOT NULL,
  "period_date" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(20,2) NOT NULL,
  "journal_entry_id" TEXT,
  "is_posted" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "depreciation_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "depreciation_entries_fixed_asset_id_idx" ON "depreciation_entries"("fixed_asset_id");
CREATE INDEX "depreciation_entries_period_date_idx" ON "depreciation_entries"("period_date");

ALTER TABLE "depreciation_entries" ADD CONSTRAINT "depreciation_entries_fixed_asset_id_fkey" FOREIGN KEY ("fixed_asset_id") REFERENCES "fixed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "depreciation_entries" ADD CONSTRAINT "depreciation_entries_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Approval Workflow
CREATE TABLE "approval_rules" (
  "id" TEXT NOT NULL,
  "document_type" TEXT NOT NULL,
  "min_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "required_role" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "approval_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "approval_rules_document_type_idx" ON "approval_rules"("document_type");

CREATE TABLE "approval_requests" (
  "id" TEXT NOT NULL,
  "document_type" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "document_number" TEXT NOT NULL,
  "amount" DECIMAL(20,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Pending',
  "requested_by" TEXT NOT NULL,
  "approved_by" TEXT,
  "rejected_by" TEXT,
  "notes" TEXT,
  "decided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "approval_requests_document_type_id_idx" ON "approval_requests"("document_type", "document_id");
CREATE INDEX "approval_requests_status_idx" ON "approval_requests"("status");
CREATE INDEX "approval_requests_requested_by_idx" ON "approval_requests"("requested_by");

ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
