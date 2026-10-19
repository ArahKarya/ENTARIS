-- EAM: link Aset Tetap (akuntansi) ke master aset EAM (ga_assets). Idempoten.
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS ga_asset_id text;
CREATE UNIQUE INDEX IF NOT EXISTS fixed_assets_ga_asset_id_key ON fixed_assets(ga_asset_id);
DO $$ BEGIN
  ALTER TABLE fixed_assets ADD CONSTRAINT fixed_assets_ga_asset_id_fkey
    FOREIGN KEY (ga_asset_id) REFERENCES ga_assets(id) ON UPDATE CASCADE ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
