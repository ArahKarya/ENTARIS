-- Per-user UI language (NULL = company default) and the company default.
ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS default_language TEXT NOT NULL DEFAULT 'id';
