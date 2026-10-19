-- Rename rendemen_pct column to yield_pct in production tables.
-- Part of the global rename rendemen → yield so the app is industry-agnostic.
ALTER TABLE "production_runs" RENAME COLUMN "rendemen_pct" TO "yield_pct";
ALTER TABLE "production_run_items" RENAME COLUMN "rendemen_pct" TO "yield_pct";
