-- GA Vehicle Tax Request — alur pengajuan & approval pajak/STNK/KIR kendaraan.
-- Pola mengikuti ga_vehicle_service_requests (submit → approve/reject/cancel).
-- Opsi 1: saat APPROVED, sistem membuat record ga_vehicle_taxes berstatus
-- IN_PROCESS dan menautkannya lewat kolom tax_id (1-1, unik).
-- Idempoten untuk loose-SQL runner di docker-app-entrypoint.sh.

DO $$ BEGIN
  CREATE TYPE "GaVehicleTaxRequestStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ga_vehicle_tax_requests" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "type" "GaVehicleTaxType" NOT NULL,
    "period_year" INTEGER NOT NULL,
    "estimated_amount" DECIMAL(14,2),
    "due_date" TIMESTAMP(3) NOT NULL,
    "deskripsi" TEXT,
    "urgensi" "GaWorkOrderPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "GaVehicleTaxRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "tax_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ga_vehicle_tax_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ga_vehicle_tax_requests_tax_id_key" ON "ga_vehicle_tax_requests"("tax_id");
CREATE INDEX IF NOT EXISTS "ga_vehicle_tax_requests_asset_id_idx" ON "ga_vehicle_tax_requests"("asset_id");
CREATE INDEX IF NOT EXISTS "ga_vehicle_tax_requests_status_idx" ON "ga_vehicle_tax_requests"("status");
CREATE INDEX IF NOT EXISTS "ga_vehicle_tax_requests_requested_by_id_idx" ON "ga_vehicle_tax_requests"("requested_by_id");

DO $$ BEGIN
  ALTER TABLE "ga_vehicle_tax_requests"
    ADD CONSTRAINT "ga_vehicle_tax_requests_asset_id_fkey"
    FOREIGN KEY ("asset_id") REFERENCES "ga_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ga_vehicle_tax_requests"
    ADD CONSTRAINT "ga_vehicle_tax_requests_tax_id_fkey"
    FOREIGN KEY ("tax_id") REFERENCES "ga_vehicle_taxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
