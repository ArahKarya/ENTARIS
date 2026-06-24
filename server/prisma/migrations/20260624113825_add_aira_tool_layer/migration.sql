-- Migration: add_aira_tool_layer
-- AIRA Tool Layer & Tool Router (sisi aplikasi ERP). Hanya CREATE TABLE baru,
-- NOL perubahan tabel ERP existing (NFR1). Aman dijalankan di DB produksi.

-- AiToolConfig — override per-tool dari UI
CREATE TABLE IF NOT EXISTS "ai_tool_configs" (
    "id" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "enabled" BOOLEAN,
    "tier" TEXT,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_tool_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ai_tool_configs_tool_name_key" ON "ai_tool_configs"("tool_name");

-- AiSetting — konfigurasi global AI (API-based, key = referensi env var)
CREATE TABLE IF NOT EXISTS "ai_settings" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT '9router',
    "base_url" TEXT NOT NULL DEFAULT '',
    "api_key_env" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "channels" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("id")
);

-- AiWhitelist — daftar akses terstruktur (channel ↔ user)
CREATE TABLE IF NOT EXISTS "ai_whitelist" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "label" TEXT,
    "role" TEXT DEFAULT 'Viewer',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_whitelist_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ai_whitelist_channel_external_id_key" ON "ai_whitelist"("channel", "external_id");
