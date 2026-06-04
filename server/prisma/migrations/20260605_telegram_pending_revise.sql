-- State sementara untuk alur "Minta Revisi" via Telegram (2 langkah): saat admin
-- menekan tombol Minta Revisi, simpan request yang sedang ditunggu alasannya.
-- Balasan teks admin berikutnya di chat ini dipakai sebagai alasan revisi.
-- Lihat services/telegramService.ts (pollTelegramUpdates).

CREATE TABLE IF NOT EXISTS telegram_pending_revise (
  chat_id        text PRIMARY KEY,
  request_id     text NOT NULL,
  actor_user_id  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
