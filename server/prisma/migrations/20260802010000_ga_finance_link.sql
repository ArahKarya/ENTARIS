-- GA Finance linkage: pajak/STNK/KIR + service log + material request -> jurnal / faktur pembelian
-- Idempotent loose SQL (auto-applied by docker-app-entrypoint.sh)

-- 1+2) Status PAID untuk pajak kendaraan & material request
-- NB: ALTER TYPE ADD VALUE tidak boleh di dalam DO-block/transaksi -> pakai IF NOT EXISTS top-level
ALTER TYPE "GaVehicleTaxStatus" ADD VALUE IF NOT EXISTS 'PAID';
ALTER TYPE "GaMaterialRequestStatus" ADD VALUE IF NOT EXISTS 'PAID';

-- 3) Kolom keuangan di ga_vehicle_taxes
ALTER TABLE ga_vehicle_taxes ADD COLUMN IF NOT EXISTS journal_entry_id text;
ALTER TABLE ga_vehicle_taxes ADD COLUMN IF NOT EXISTS purchase_invoice_id text;
ALTER TABLE ga_vehicle_taxes ADD COLUMN IF NOT EXISTS account_id text;
ALTER TABLE ga_vehicle_taxes ADD COLUMN IF NOT EXISTS credit_account_id text;
ALTER TABLE ga_vehicle_taxes ADD COLUMN IF NOT EXISTS paid_by_id text;
ALTER TABLE ga_vehicle_taxes ADD COLUMN IF NOT EXISTS paid_amount numeric(14,2);

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ga_vehicle_taxes_journal_entry_id_fkey') THEN
    ALTER TABLE ga_vehicle_taxes ADD CONSTRAINT ga_vehicle_taxes_journal_entry_id_fkey
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ga_vehicle_taxes_purchase_invoice_id_fkey') THEN
    ALTER TABLE ga_vehicle_taxes ADD CONSTRAINT ga_vehicle_taxes_purchase_invoice_id_fkey
      FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ga_vehicle_taxes_account_id_fkey') THEN
    ALTER TABLE ga_vehicle_taxes ADD CONSTRAINT ga_vehicle_taxes_account_id_fkey
      FOREIGN KEY (account_id) REFERENCES accounts(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ga_vehicle_taxes_credit_account_id_fkey') THEN
    ALTER TABLE ga_vehicle_taxes ADD CONSTRAINT ga_vehicle_taxes_credit_account_id_fkey
      FOREIGN KEY (credit_account_id) REFERENCES accounts(id);
  END IF;
END
$body$;

CREATE UNIQUE INDEX IF NOT EXISTS ga_vehicle_taxes_journal_entry_id_key
  ON ga_vehicle_taxes (journal_entry_id) WHERE journal_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ga_vehicle_taxes_purchase_invoice_id_idx
  ON ga_vehicle_taxes (purchase_invoice_id);

-- 4) Kolom faktur di ga_vehicle_service_logs (journal_entry_id/account_id sudah ada)
ALTER TABLE ga_vehicle_service_logs ADD COLUMN IF NOT EXISTS purchase_invoice_id text;
DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ga_vehicle_service_logs_purchase_invoice_id_fkey') THEN
    ALTER TABLE ga_vehicle_service_logs ADD CONSTRAINT ga_vehicle_service_logs_purchase_invoice_id_fkey
      FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id);
  END IF;
END
$body$;
CREATE INDEX IF NOT EXISTS ga_vehicle_service_logs_purchase_invoice_id_idx
  ON ga_vehicle_service_logs (purchase_invoice_id);

-- 5) Kolom keuangan di ga_material_requests (gl_account_id & purchase_order_id sudah ada)
ALTER TABLE ga_material_requests ADD COLUMN IF NOT EXISTS journal_entry_id text;
ALTER TABLE ga_material_requests ADD COLUMN IF NOT EXISTS purchase_invoice_id text;
ALTER TABLE ga_material_requests ADD COLUMN IF NOT EXISTS credit_account_id text;
ALTER TABLE ga_material_requests ADD COLUMN IF NOT EXISTS paid_by_id text;
ALTER TABLE ga_material_requests ADD COLUMN IF NOT EXISTS paid_at timestamp(3) without time zone;
ALTER TABLE ga_material_requests ADD COLUMN IF NOT EXISTS paid_amount numeric(14,2);

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ga_material_requests_journal_entry_id_fkey') THEN
    ALTER TABLE ga_material_requests ADD CONSTRAINT ga_material_requests_journal_entry_id_fkey
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ga_material_requests_purchase_invoice_id_fkey') THEN
    ALTER TABLE ga_material_requests ADD CONSTRAINT ga_material_requests_purchase_invoice_id_fkey
      FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ga_material_requests_gl_account_id_fkey') THEN
    ALTER TABLE ga_material_requests ADD CONSTRAINT ga_material_requests_gl_account_id_fkey
      FOREIGN KEY (gl_account_id) REFERENCES accounts(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ga_material_requests_credit_account_id_fkey') THEN
    ALTER TABLE ga_material_requests ADD CONSTRAINT ga_material_requests_credit_account_id_fkey
      FOREIGN KEY (credit_account_id) REFERENCES accounts(id);
  END IF;
END
$body$;

CREATE UNIQUE INDEX IF NOT EXISTS ga_material_requests_journal_entry_id_key
  ON ga_material_requests (journal_entry_id) WHERE journal_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ga_material_requests_purchase_invoice_id_idx
  ON ga_material_requests (purchase_invoice_id);

-- 6) Modul RBAC ga_finance (akuntan). Idempotent: hanya insert kalau belum ada.
INSERT INTO role_permissions (id, role_id, module, can_view, can_edit)
SELECT gen_random_uuid()::text, r.id, 'ga_finance', true, true
FROM roles r
WHERE r.name IN ('Akuntan / Keuangan', 'Admin', 'Director')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.module = 'ga_finance'
  );

-- Akuntan dapat view-only ke ga_vehicle (supaya bisa lihat konteks aset)
INSERT INTO role_permissions (id, role_id, module, can_view, can_edit)
SELECT gen_random_uuid()::text, r.id, 'ga_vehicle', true, false
FROM roles r
WHERE r.name = 'Akuntan / Keuangan'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.module = 'ga_vehicle'
  );
