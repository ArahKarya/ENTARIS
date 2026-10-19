-- Konfigurasi notifikasi Telegram (singleton, diisi via UI Settings).
-- bot_token = secret (write-only dari UI). Lihat services/telegramService.ts.

CREATE TABLE IF NOT EXISTS telegram_config (
  id                     text NOT NULL,
  slug                   text NOT NULL DEFAULT 'default',
  enabled                boolean NOT NULL DEFAULT false,
  bot_token              text,
  chat_id                text,
  notify_approval        boolean NOT NULL DEFAULT true,
  notify_invoice_overdue boolean NOT NULL DEFAULT true,
  notify_low_stock       boolean NOT NULL DEFAULT true,
  updated_by             text,
  created_at             timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT telegram_config_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_config_slug_key ON telegram_config(slug);
