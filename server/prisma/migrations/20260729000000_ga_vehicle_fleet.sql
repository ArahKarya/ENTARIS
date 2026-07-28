-- GA Vehicle Fleet Management — pajak (STNK/KIR), asuransi, BBM, inspeksi
-- berkala, dan insiden/kecelakaan per kendaraan. Ditulis idempoten untuk
-- loose-SQL runner (docker-app-entrypoint.sh menjalankan setiap startup via
-- `prisma db execute`). Additive only: 6 enum baru, 5 tabel baru, semua FK ke
-- ga_assets & ga_documents yang sudah ada. Aman untuk DB produksi existing.
-- Sort key 20260729 > 20260701000000_ga_material_request.sql.

-- ── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "GaVehicleTaxType" AS ENUM ('STNK_TAHUNAN', 'STNK_5_TAHUNAN', 'KIR', 'PAJAK_KENDARAAN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaVehicleTaxStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'IN_PROCESS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaVehicleInsuranceType" AS ENUM ('ALL_RISK', 'TLO', 'KECELAKAAN_DIRI', 'LAINNYA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaVehicleInsuranceStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaVehicleInspectionResult" AS ENUM ('BAIK', 'PERLU_PERHATIAN', 'TIDAK_LAYAK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaVehicleIncidentSeverity" AS ENUM ('RINGAN', 'SEDANG', 'BERAT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaVehicleIncidentStatus" AS ENUM ('DILAPORKAN', 'DALAM_PROSES', 'SELESAI', 'KLAIM_ASURANSI');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── CreateTable: ga_vehicle_taxes ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ga_vehicle_taxes" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "type" "GaVehicleTaxType" NOT NULL,
    "period_year" INTEGER NOT NULL,
    "amount" DECIMAL(14,2),
    "paid_at" TIMESTAMP(3),
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" "GaVehicleTaxStatus" NOT NULL DEFAULT 'ACTIVE',
    "document_id" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ga_vehicle_taxes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ga_vehicle_taxes_asset_id_idx" ON "ga_vehicle_taxes"("asset_id");
CREATE INDEX IF NOT EXISTS "ga_vehicle_taxes_due_date_status_idx" ON "ga_vehicle_taxes"("due_date", "status");
DO $$ BEGIN
  ALTER TABLE "ga_vehicle_taxes" ADD CONSTRAINT "ga_vehicle_taxes_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "ga_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_vehicle_taxes" ADD CONSTRAINT "ga_vehicle_taxes_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "ga_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── CreateTable: ga_vehicle_insurances ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ga_vehicle_insurances" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "type" "GaVehicleInsuranceType" NOT NULL,
    "provider" TEXT NOT NULL,
    "policy_number" TEXT,
    "premium" DECIMAL(14,2),
    "coverage_value" DECIMAL(16,2),
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "GaVehicleInsuranceStatus" NOT NULL DEFAULT 'ACTIVE',
    "document_id" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ga_vehicle_insurances_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ga_vehicle_insurances_asset_id_idx" ON "ga_vehicle_insurances"("asset_id");
CREATE INDEX IF NOT EXISTS "ga_vehicle_insurances_end_date_status_idx" ON "ga_vehicle_insurances"("end_date", "status");
DO $$ BEGIN
  ALTER TABLE "ga_vehicle_insurances" ADD CONSTRAINT "ga_vehicle_insurances_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "ga_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_vehicle_insurances" ADD CONSTRAINT "ga_vehicle_insurances_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "ga_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── CreateTable: ga_vehicle_fuel_logs ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ga_vehicle_fuel_logs" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "odometer" INTEGER,
    "liters" DECIMAL(8,2) NOT NULL,
    "price_per_liter" DECIMAL(10,2),
    "total_cost" DECIMAL(14,2) NOT NULL,
    "spbu" TEXT,
    "driver_name" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ga_vehicle_fuel_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ga_vehicle_fuel_logs_asset_id_tanggal_idx" ON "ga_vehicle_fuel_logs"("asset_id", "tanggal");
DO $$ BEGIN
  ALTER TABLE "ga_vehicle_fuel_logs" ADD CONSTRAINT "ga_vehicle_fuel_logs_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "ga_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── CreateTable: ga_vehicle_inspections ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ga_vehicle_inspections" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "odometer" INTEGER,
    "checklist" JSONB NOT NULL,
    "overall_result" "GaVehicleInspectionResult" NOT NULL,
    "notes" TEXT,
    "inspected_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ga_vehicle_inspections_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ga_vehicle_inspections_asset_id_tanggal_idx" ON "ga_vehicle_inspections"("asset_id", "tanggal");
DO $$ BEGIN
  ALTER TABLE "ga_vehicle_inspections" ADD CONSTRAINT "ga_vehicle_inspections_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "ga_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── CreateTable: ga_vehicle_incidents ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ga_vehicle_incidents" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "driver_name" TEXT,
    "description" TEXT NOT NULL,
    "severity" "GaVehicleIncidentSeverity" NOT NULL,
    "status" "GaVehicleIncidentStatus" NOT NULL DEFAULT 'DILAPORKAN',
    "estimated_cost" DECIMAL(14,2),
    "actual_cost" DECIMAL(14,2),
    "insurance_claim_no" TEXT,
    "reported_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ga_vehicle_incidents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ga_vehicle_incidents_asset_id_tanggal_idx" ON "ga_vehicle_incidents"("asset_id", "tanggal");
CREATE INDEX IF NOT EXISTS "ga_vehicle_incidents_status_idx" ON "ga_vehicle_incidents"("status");
DO $$ BEGIN
  ALTER TABLE "ga_vehicle_incidents" ADD CONSTRAINT "ga_vehicle_incidents_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "ga_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Seed: tambah tipe dokumen kendaraan (STNK, Pajak, Asuransi) ke ga_document_types ──
-- Existing hanya ada "INT" (Dokumen Internal). Tambah tipe spesifik kendaraan
-- supaya GaVehicleTax/GaVehicleInsurance bisa dilink ke file scan resmi.
INSERT INTO "ga_document_types" ("id", "code", "name", "category", "is_active")
VALUES
  (gen_random_uuid()::text, 'STNK', 'STNK Kendaraan', 'KENDARAAN', true),
  (gen_random_uuid()::text, 'KIR', 'Buku KIR', 'KENDARAAN', true),
  (gen_random_uuid()::text, 'ASURANSI_KENDARAAN', 'Polis Asuransi Kendaraan', 'KENDARAAN', true),
  (gen_random_uuid()::text, 'SIM_DRIVER', 'SIM Driver/PIC Kendaraan', 'KENDARAAN', true)
ON CONFLICT ("code") DO NOTHING;
