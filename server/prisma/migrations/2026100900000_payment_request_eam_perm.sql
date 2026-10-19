-- 2026-10-09: Pengajuan Pembayaran — stage 3 (Tagihan EAM).
-- Antrian "Tagihan Aset & Umum" (modul RBAC ga_finance) dilebur ke Pengajuan
-- Pembayaran > tab "Tagihan EAM", yang kini dijaga izin payment_request (edit).
-- Backfill SEKALI: role yang punya ga_finance edit mendapat payment_request edit,
-- tanpa menimpa baris payment_request yang sudah ada. Penanda di data_fix_markers
-- mencegah hak yang kemudian dicabut Admin dihidupkan lagi tiap startup
-- (file .sql lepas dijalankan ulang setiap boot).

CREATE TABLE IF NOT EXISTS "data_fix_markers" (
  "key" TEXT PRIMARY KEY,
  "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
