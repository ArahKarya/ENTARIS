-- M2-A4: channel aktif + whitelist modul untuk AIRA (sisi ERP).
-- Fail-safe: array kosong = semua aktif / semua modul boleh.
ALTER TABLE "ai_settings" ADD COLUMN IF NOT EXISTS "active_channels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ai_settings" ADD COLUMN IF NOT EXISTS "whitelist_modules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
