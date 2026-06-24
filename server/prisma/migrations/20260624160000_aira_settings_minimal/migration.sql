-- Migration: aira_settings_minimal
-- Reduksi AiSetting jadi config koneksi ERP↔AIRA minimal. SEMUA urusan agentic
-- (model AI, provider, memori, konteks, channels) dihandle AIRA — bukan ERP.
-- Buang kolom provider/base_url/api_key_env/model/channels; tambah
-- agentic_enabled + service_token.

ALTER TABLE "ai_settings" DROP COLUMN IF EXISTS "provider";
ALTER TABLE "ai_settings" DROP COLUMN IF EXISTS "base_url";
ALTER TABLE "ai_settings" DROP COLUMN IF EXISTS "api_key_env";
ALTER TABLE "ai_settings" DROP COLUMN IF EXISTS "model";
ALTER TABLE "ai_settings" DROP COLUMN IF EXISTS "channels";

ALTER TABLE "ai_settings" ADD COLUMN IF NOT EXISTS "agentic_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ai_settings" ADD COLUMN IF NOT EXISTS "service_token" TEXT;
