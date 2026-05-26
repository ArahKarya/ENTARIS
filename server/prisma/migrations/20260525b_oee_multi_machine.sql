-- B2 OEE multi-mesin: tabel production_run_machines + jendela shift/istirahat di production_runs.
-- Idempotent (IF NOT EXISTS + DO-block FK).

ALTER TABLE "production_runs"
  ADD COLUMN IF NOT EXISTS "planned_start" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "planned_end"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "break_start"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "break_end"     TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "production_run_machines" (
  "id"               TEXT NOT NULL,
  "production_run_id" TEXT NOT NULL,
  "machine_id"       TEXT NOT NULL,
  "start_at"         TIMESTAMP(3),
  "end_at"           TIMESTAMP(3),
  "run_min"          DECIMAL(10,2),
  "downtime_min"     DECIMAL(10,2),
  "allocated_qty"    DECIMAL(15,3),
  "availability_pct" DECIMAL(5,2),
  "performance_pct"  DECIMAL(5,2),
  "quality_pct"      DECIMAL(5,2),
  "oee_pct"          DECIMAL(5,2),
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "production_run_machines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "production_run_machines_production_run_id_idx" ON "production_run_machines"("production_run_id");
CREATE INDEX IF NOT EXISTS "production_run_machines_machine_id_idx" ON "production_run_machines"("machine_id");

DO $$ BEGIN
  ALTER TABLE "production_run_machines"
    ADD CONSTRAINT "production_run_machines_production_run_id_fkey"
    FOREIGN KEY ("production_run_id") REFERENCES "production_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "production_run_machines"
    ADD CONSTRAINT "production_run_machines_machine_id_fkey"
    FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
