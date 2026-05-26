-- OEE tracking: master Machine, ProductionDowntime, dan kolom OEE di production_runs.
-- Idempotent: aman dijalankan ulang (IF NOT EXISTS + DO-block utk FK).

-- 1. Master mesin
CREATE TABLE IF NOT EXISTS "machines" (
  "id"                  TEXT NOT NULL,
  "code"                TEXT NOT NULL,
  "name"                TEXT NOT NULL,
  "ideal_rate_per_hour" DECIMAL(15,3),
  "unit"                TEXT NOT NULL DEFAULT 'kg',
  "is_active"           BOOLEAN NOT NULL DEFAULT true,
  "notes"               TEXT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "machines_code_key" ON "machines"("code");
CREATE INDEX IF NOT EXISTS "machines_is_active_idx" ON "machines"("is_active");

-- 2. Downtime per production run
CREATE TABLE IF NOT EXISTS "production_downtimes" (
  "id"                TEXT NOT NULL,
  "production_run_id" TEXT NOT NULL,
  "machine_id"        TEXT,
  "category"          TEXT NOT NULL,
  "reason"            TEXT,
  "duration_min"      DECIMAL(10,2) NOT NULL,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "production_downtimes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "production_downtimes_production_run_id_idx" ON "production_downtimes"("production_run_id");
CREATE INDEX IF NOT EXISTS "production_downtimes_machine_id_idx" ON "production_downtimes"("machine_id");

-- 3. Kolom OEE di production_runs
ALTER TABLE "production_runs"
  ADD COLUMN IF NOT EXISTS "machine_id"       TEXT,
  ADD COLUMN IF NOT EXISTS "shift"            TEXT,
  ADD COLUMN IF NOT EXISTS "shift_lead"       TEXT,
  ADD COLUMN IF NOT EXISTS "manpower_count"   INTEGER,
  ADD COLUMN IF NOT EXISTS "start_at"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "end_at"           TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "good_qty"         DECIMAL(15,3),
  ADD COLUMN IF NOT EXISTS "reject_qty"       DECIMAL(15,3),
  ADD COLUMN IF NOT EXISTS "downtime_min"     DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "availability_pct" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "performance_pct"  DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "quality_pct"      DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "oee_pct"          DECIMAL(5,2);
CREATE INDEX IF NOT EXISTS "production_runs_machine_id_idx" ON "production_runs"("machine_id");

-- 4. Foreign keys (idempotent via DO-block)
DO $$ BEGIN
  ALTER TABLE "production_runs"
    ADD CONSTRAINT "production_runs_machine_id_fkey"
    FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "production_downtimes"
    ADD CONSTRAINT "production_downtimes_production_run_id_fkey"
    FOREIGN KEY ("production_run_id") REFERENCES "production_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "production_downtimes"
    ADD CONSTRAINT "production_downtimes_machine_id_fkey"
    FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
