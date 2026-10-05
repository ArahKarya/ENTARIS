-- 2026-10-14: Panel chat AIRA tahap 3 — Entaris menyimpan sesi & pesan chat sendiri (per user),
-- engine AIRA dipanggil lewat API kompatibel-OpenAI dan tidak menyimpan state yang diperlukan.
-- Juga: korelasi panggilan MCP per giliran chat (mcp_call_logs.ref) + petunjuk kartu hasil (card).
-- Additive only; aman dijalankan ulang tiap startup (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "chat_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "title_source" TEXT NOT NULL DEFAULT 'auto',
    "status" TEXT NOT NULL DEFAULT 'active',
    "summary" TEXT,
    "summary_up_to_message_id" TEXT,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_opened_at" TIMESTAMP(3),
    "inflight_turn_id" TEXT,
    "inflight_since" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "chat_messages" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "session_id" TEXT NOT NULL,
    "turn_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "parts" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "error" TEXT,
    "model" TEXT,
    "duration_ms" INTEGER,
    "actor_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "chat_attachments" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "file_path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "chat_sessions_user_id_status_last_message_at_idx" ON "chat_sessions"("user_id", "status", "last_message_at" DESC);
CREATE INDEX IF NOT EXISTS "chat_messages_session_id_created_at_idx" ON "chat_messages"("session_id", "created_at");
CREATE INDEX IF NOT EXISTS "chat_messages_session_id_seq_idx" ON "chat_messages"("session_id", "seq");
CREATE INDEX IF NOT EXISTS "chat_messages_turn_id_idx" ON "chat_messages"("turn_id");
CREATE INDEX IF NOT EXISTS "chat_attachments_message_id_idx" ON "chat_attachments"("message_id");

-- Pencarian teks penuh (config 'simple': netral bahasa, cocok untuk Bahasa Indonesia tanpa stemmer).
CREATE INDEX IF NOT EXISTS "chat_messages_content_fts_idx" ON "chat_messages" USING GIN (to_tsvector('simple', "content"));

-- Pencarian substring cepat (ILIKE '%kata%') bila ekstensi pg_trgm tersedia; bila tidak, pencarian
-- tetap jalan (ILIKE tanpa indeks trigram + FTS), hanya lebih lambat pada volume sangat besar.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS "chat_messages_content_trgm_idx" ON "chat_messages" USING GIN ("content" gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm tidak tersedia (%), pencarian chat memakai FTS + ILIKE tanpa indeks trigram', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_sessions_user_id_fkey') THEN
    ALTER TABLE "chat_sessions"
      ADD CONSTRAINT "chat_sessions_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_session_id_fkey') THEN
    ALTER TABLE "chat_messages"
      ADD CONSTRAINT "chat_messages_session_id_fkey"
      FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_attachments_message_id_fkey') THEN
    ALTER TABLE "chat_attachments"
      ADD CONSTRAINT "chat_attachments_message_id_fkey"
      FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Korelasi panggilan MCP per giliran chat + petunjuk kartu hasil.
ALTER TABLE "mcp_call_logs" ADD COLUMN IF NOT EXISTS "ref" TEXT;
ALTER TABLE "mcp_call_logs" ADD COLUMN IF NOT EXISTS "card" JSONB;
CREATE INDEX IF NOT EXISTS "mcp_call_logs_ref_idx" ON "mcp_call_logs"("ref");
