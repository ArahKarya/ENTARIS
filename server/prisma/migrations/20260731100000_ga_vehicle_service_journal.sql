-- Integrasi biaya service kendaraan EAM -> jurnal ERP
-- Idempotent (dijalankan tiap startup via docker-app-entrypoint.sh)

ALTER TABLE ga_vehicle_service_logs ADD COLUMN IF NOT EXISTS journal_entry_id TEXT;
ALTER TABLE ga_vehicle_service_logs ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE ga_vehicle_service_logs ADD COLUMN IF NOT EXISTS credit_account_id TEXT;
ALTER TABLE ga_vehicle_service_logs ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'EAM';
ALTER TABLE ga_vehicle_service_logs ADD COLUMN IF NOT EXISTS external_ref TEXT;

DO $body$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ga_vehicle_service_logs_journal_entry_id_fkey'
  ) THEN
    ALTER TABLE ga_vehicle_service_logs
      ADD CONSTRAINT ga_vehicle_service_logs_journal_entry_id_fkey
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ga_vehicle_service_logs_account_id_fkey'
  ) THEN
    ALTER TABLE ga_vehicle_service_logs
      ADD CONSTRAINT ga_vehicle_service_logs_account_id_fkey
      FOREIGN KEY (account_id) REFERENCES accounts(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ga_vehicle_service_logs_credit_account_id_fkey'
  ) THEN
    ALTER TABLE ga_vehicle_service_logs
      ADD CONSTRAINT ga_vehicle_service_logs_credit_account_id_fkey
      FOREIGN KEY (credit_account_id) REFERENCES accounts(id);
  END IF;
END
$body$;

-- 1 service log = maksimal 1 jurnal (cegah double-post)
CREATE UNIQUE INDEX IF NOT EXISTS ga_vehicle_service_logs_journal_entry_id_key
  ON ga_vehicle_service_logs(journal_entry_id) WHERE journal_entry_id IS NOT NULL;

-- Penanda data impor historis supaya tidak diimpor ganda
CREATE UNIQUE INDEX IF NOT EXISTS ga_vehicle_service_logs_external_ref_key
  ON ga_vehicle_service_logs(external_ref) WHERE external_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS ga_vehicle_service_logs_source_idx
  ON ga_vehicle_service_logs(source);
