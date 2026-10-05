-- 2026-10-10: Pensiun modul RBAC ga_finance (alias /api/ga/finance dihapus).
-- Antrian Tagihan EAM kini dijaga izin payment_request (edit).
-- Idempotent; file .sql lepas dijalankan ulang tiap boot, jadi dijaga data_fix_markers.

CREATE TABLE IF NOT EXISTS "data_fix_markers" (
  "key" TEXT PRIMARY KEY,
  "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 1) Untuk DB yang belum pernah menjalankan 2026100900000: grant payment_request
--    edit ke role ber-ga_finance edit SEBELUM baris ga_finance dihapus.
--    Memakai penanda yang sama dengan migrasi tsb, sehingga tidak ganda.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "data_fix_markers" WHERE "key" = 'payment_request_stage3_ga_finance_perm') THEN
    INSERT INTO "role_permissions" ("id", "role_id", "module", "can_view", "can_edit")
    SELECT gen_random_uuid()::text, rp."role_id", 'payment_request', TRUE, TRUE
    FROM "role_permissions" rp
    WHERE rp."module" = 'ga_finance' AND rp."can_edit" = TRUE
    ON CONFLICT ("role_id", "module") DO NOTHING;

    INSERT INTO "data_fix_markers" ("key") VALUES ('payment_request_stage3_ga_finance_perm');
  END IF;
END $$;

-- 2) Hapus baris izin ga_finance sekali saja.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "data_fix_markers" WHERE "key" = 'remove_ga_finance_module') THEN
    DELETE FROM "role_permissions" WHERE "module" = 'ga_finance';
    INSERT INTO "data_fix_markers" ("key") VALUES ('remove_ga_finance_module');
  END IF;
END $$;
