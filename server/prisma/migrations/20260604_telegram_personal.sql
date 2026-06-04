-- Notifikasi Telegram japri per-user (auto-link via /start) + master toggle &
-- offset polling getUpdates. Lihat services/telegramService.ts.

ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_link_code text;
CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_link_code_key ON users(telegram_link_code);

ALTER TABLE telegram_config ADD COLUMN IF NOT EXISTS personal_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE telegram_config ADD COLUMN IF NOT EXISTS last_update_id bigint;
