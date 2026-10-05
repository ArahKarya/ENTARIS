-- 2026-10-15: pensiun sisa jalur lama AIRA (engine lama, A3 HMAC, token layanan, whitelist kanal).
-- Idempotent: file .sql lepas dijalankan ulang tiap boot; DROP ... IF EXISTS aman diulang.
-- Data yang dibuang tidak dipakai lagi: whitelist kanal lama, catatan eksekusi A3, token layanan,
-- daftar kanal aktif, dan whitelist modul (kanal kini dikelola engine; jejak panggilan ada di mcp_call_logs).

DROP TABLE IF EXISTS "ai_whitelist";
DROP TABLE IF EXISTS "ai_executed_runs";

ALTER TABLE "ai_settings" DROP COLUMN IF EXISTS "service_token";
ALTER TABLE "ai_settings" DROP COLUMN IF EXISTS "active_channels";
ALTER TABLE "ai_settings" DROP COLUMN IF EXISTS "whitelist_modules";
