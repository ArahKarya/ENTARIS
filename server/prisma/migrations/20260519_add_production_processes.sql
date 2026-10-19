-- ============================================================================
-- Production process traceability
--
-- Adds:
--   1. production_processes — master list of process names (Drying, Huller,
--      Polishing, Packing, etc.). User-managed via /production-processes CRUD.
--   2. production_run_processes — junction many-to-many between a run and the
--      processes it went through. Optional per run; backward-compat for
--      existing runs (no rows = unspecified).
--
-- No cost integration in this iteration — purely traceability.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "production_processes" (
  "id"          TEXT PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "sort_order"  INTEGER NOT NULL DEFAULT 0,
  "is_active"   BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "production_processes_name_key"
  ON "production_processes"("name");
CREATE INDEX IF NOT EXISTS "production_processes_is_active_idx"
  ON "production_processes"("is_active");

CREATE TABLE IF NOT EXISTS "production_run_processes" (
  "id"                TEXT PRIMARY KEY,
  "production_run_id" TEXT NOT NULL,
  "process_id"        TEXT NOT NULL,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "production_run_processes_production_run_id_fkey"
    FOREIGN KEY ("production_run_id") REFERENCES "production_runs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "production_run_processes_process_id_fkey"
    FOREIGN KEY ("process_id") REFERENCES "production_processes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "production_run_processes_run_process_unique"
  ON "production_run_processes"("production_run_id", "process_id");
CREATE INDEX IF NOT EXISTS "production_run_processes_production_run_id_idx"
  ON "production_run_processes"("production_run_id");
CREATE INDEX IF NOT EXISTS "production_run_processes_process_id_idx"
  ON "production_run_processes"("process_id");

COMMIT;
