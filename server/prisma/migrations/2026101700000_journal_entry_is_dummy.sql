-- Marks journals created by the dummy-data generator so deletion never matches real journals.
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "is_dummy" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "journal_entries_is_dummy_idx" ON "journal_entries" ("is_dummy") WHERE "is_dummy";
