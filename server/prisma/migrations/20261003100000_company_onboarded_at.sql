-- 2026-10-03: Onboarding status disimpan di server (sebelumnya hanya localStorage,
-- sehingga wizard muncul lagi di setiap browser/perangkat baru dan untuk semua user).
-- company_settings.onboarded_at NULL = admin belum menyelesaikan/melewati penyiapan awal.
--
-- Idempoten & sekali jalan: kolom ditambah dan di-backfill dalam satu DO-block yang
-- hanya berjalan bila kolom belum ada. Backfill: tenant yang sudah mengisi nama
-- perusahaan (bukan kosong / bukan placeholder seed) dianggap sudah disiapkan.
-- Karena dijalankan ulang tiap startup (docker-app-entrypoint.sh), backfill TIDAK
-- boleh diulang — kalau tidak, tenant baru yang baru mengisi nama ikut ditandai.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'company_settings'
      AND column_name = 'onboarded_at'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN onboarded_at TIMESTAMP(3);

    UPDATE company_settings
    SET onboarded_at = CURRENT_TIMESTAMP
    WHERE btrim(coalesce(company_name, '')) <> ''
      AND lower(btrim(company_name)) <> 'nama perusahaan anda';
  END IF;
END $$;
