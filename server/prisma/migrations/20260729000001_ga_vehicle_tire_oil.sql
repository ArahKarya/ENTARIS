-- GA Vehicle Tire & Oil Monitoring — tracking nomor seri ban per posisi
-- (penangkal supir nakal) & log ganti oli dengan target odometer berikutnya.
-- Ditulis idempoten untuk loose-SQL runner. Additive only.
-- Sort key 20260729000001 > 20260729000000_ga_vehicle_fleet.sql.

-- ── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "GaVehicleTirePosition" AS ENUM ('DEPAN_KIRI', 'DEPAN_KANAN', 'BELAKANG_KIRI', 'BELAKANG_KANAN', 'BELAKANG_KIRI_DALAM', 'BELAKANG_KIRI_LUAR', 'BELAKANG_KANAN_DALAM', 'BELAKANG_KANAN_LUAR', 'CADANGAN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaVehicleTireStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'SPARE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── CreateTable: ga_vehicle_tires ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ga_vehicle_tires" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "serial_number" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT,
    "size" TEXT,
    "position" "GaVehicleTirePosition" NOT NULL,
    "installed_at" TIMESTAMP(3) NOT NULL,
    "installed_odometer" INTEGER,
    "notes" TEXT,
    "status" "GaVehicleTireStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ga_vehicle_tires_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ga_vehicle_tires_asset_id_position_key" ON "ga_vehicle_tires"("asset_id", "position");
CREATE INDEX IF NOT EXISTS "ga_vehicle_tires_asset_id_idx" ON "ga_vehicle_tires"("asset_id");
CREATE INDEX IF NOT EXISTS "ga_vehicle_tires_serial_number_idx" ON "ga_vehicle_tires"("serial_number");
DO $$ BEGIN
  ALTER TABLE "ga_vehicle_tires" ADD CONSTRAINT "ga_vehicle_tires_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "ga_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── CreateTable: ga_vehicle_oil_logs ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ga_vehicle_oil_logs" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "odometer" INTEGER NOT NULL,
    "next_odometer_due" INTEGER NOT NULL,
    "brand" TEXT NOT NULL,
    "volume" DECIMAL(5,2) NOT NULL,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ga_vehicle_oil_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ga_vehicle_oil_logs_asset_id_tanggal_idx" ON "ga_vehicle_oil_logs"("asset_id", "tanggal");
DO $$ BEGIN
  ALTER TABLE "ga_vehicle_oil_logs" ADD CONSTRAINT "ga_vehicle_oil_logs_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "ga_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
