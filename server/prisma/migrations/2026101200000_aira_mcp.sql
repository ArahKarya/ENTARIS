-- 2026-10-12: AIRA sebagai MCP server. Token servis MCP, riwayat panggilan, nonce actor
-- assertion, registrasi user AIRA, penanda via pada audit trail; pensiun service token lama.
-- Additive & idempoten (IF NOT EXISTS) — aman dijalankan ulang tiap startup.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "aira_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "aira_tier" TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "aira_jabatan" TEXT;

ALTER TABLE "audit_trail" ADD COLUMN IF NOT EXISTS "via" TEXT;
ALTER TABLE "audit_trail" ADD COLUMN IF NOT EXISTS "via_meta" JSONB;

CREATE TABLE IF NOT EXISTS "mcp_tokens" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "signing_secret_enc" TEXT NOT NULL,
    "default_actor_user_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "last_used_ip" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rate_limit_per_min" INTEGER NOT NULL DEFAULT 120,

    CONSTRAINT "mcp_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_tokens_token_hash_key" ON "mcp_tokens"("token_hash");

CREATE TABLE IF NOT EXISTS "mcp_call_logs" (
    "id" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "channel" TEXT,
    "tool" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "args_hash" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "http_status" INTEGER,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "approval_id" TEXT,
    "error" TEXT,
    "idempotency_key" TEXT,
    "result_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_call_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_call_logs_token_id_idempotency_key_key" ON "mcp_call_logs"("token_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "mcp_call_logs_created_at_idx" ON "mcp_call_logs"("created_at");
CREATE INDEX IF NOT EXISTS "mcp_call_logs_tool_idx" ON "mcp_call_logs"("tool");
CREATE INDEX IF NOT EXISTS "mcp_call_logs_token_id_idx" ON "mcp_call_logs"("token_id");

CREATE TABLE IF NOT EXISTS "mcp_nonces" (
    "token_id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_nonces_pkey" PRIMARY KEY ("token_id", "nonce")
);
CREATE INDEX IF NOT EXISTS "mcp_nonces_expires_at_idx" ON "mcp_nonces"("expires_at");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mcp_call_logs_token_id_fkey') THEN
    ALTER TABLE "mcp_call_logs" ADD CONSTRAINT "mcp_call_logs_token_id_fkey"
      FOREIGN KEY ("token_id") REFERENCES "mcp_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mcp_nonces_token_id_fkey') THEN
    ALTER TABLE "mcp_nonces" ADD CONSTRAINT "mcp_nonces_token_id_fkey"
      FOREIGN KEY ("token_id") REFERENCES "mcp_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Pensiun jalur lama: service token Admin (x-aira-service-token) tidak lagi dipakai.
-- Nilainya dikosongkan; kolomnya sendiri dihapus oleh 2026101500000_aira_legacy_cleanup.sql
-- (dijaga agar aman dijalankan ulang setelah kolom hilang).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'ai_settings' AND column_name = 'service_token') THEN
    UPDATE "ai_settings" SET "service_token" = NULL WHERE "service_token" IS NOT NULL;
  END IF;
END $$;
