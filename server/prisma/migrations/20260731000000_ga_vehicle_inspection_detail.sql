-- GA Vehicle Inspection — perluasan inspeksi berkala jadi komprehensif:
-- checklist detail per-kategori (JSON, backward compatible dgn format 12-item lama),
-- foto bukti per kategori, nama inspektor, level BBM, dan jadwal inspeksi berikutnya.
-- Ditulis idempoten untuk loose-SQL runner (docker-app-entrypoint.sh). Additive only.
-- Sort key 20260731000000 > 20260729000001_ga_vehicle_tire_oil.sql.

-- ── Enum: level BBM saat inspeksi ───────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "GaVehicleFuelLevel" AS ENUM ('KOSONG', 'SEPEREMPAT', 'SETENGAH', 'TIGA_PEREMPAT', 'PENUH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Kolom baru di ga_vehicle_inspections (semua nullable → data lama aman) ────
ALTER TABLE "ga_vehicle_inspections" ADD COLUMN IF NOT EXISTS "inspector_name" TEXT;
ALTER TABLE "ga_vehicle_inspections" ADD COLUMN IF NOT EXISTS "inspector_user_id" TEXT;
ALTER TABLE "ga_vehicle_inspections" ADD COLUMN IF NOT EXISTS "fuel_level" "GaVehicleFuelLevel";
ALTER TABLE "ga_vehicle_inspections" ADD COLUMN IF NOT EXISTS "next_due_date" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "ga_vehicle_inspections_next_due_date_idx" ON "ga_vehicle_inspections"("next_due_date");

-- ── CreateTable: ga_vehicle_inspection_photos (1 foto per kategori) ──────────
CREATE TABLE IF NOT EXISTS "ga_vehicle_inspection_photos" (
    "id" TEXT NOT NULL,
    "inspection_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "caption" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ga_vehicle_inspection_photos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ga_vehicle_inspection_photos_inspection_id_idx" ON "ga_vehicle_inspection_photos"("inspection_id");
DO $$ BEGIN
  ALTER TABLE "ga_vehicle_inspection_photos" ADD CONSTRAINT "ga_vehicle_inspection_photos_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "ga_vehicle_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Backfill next_due_date untuk inspeksi lama (default interval 30 hari) ─────
-- Hanya baris yang belum punya nilai; aman diulang.
UPDATE "ga_vehicle_inspections"
SET "next_due_date" = "tanggal" + INTERVAL '30 days'
WHERE "next_due_date" IS NULL;
