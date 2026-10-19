-- EAM empty cells: backfill "Odometer terakhir" (ga_vehicle_data.odometer_terakhir).
-- Before this fix, service / fuel / oil logs only raised the last odometer when a
-- ga_vehicle_data row already existed, and inspections never did. This fills the gap
-- from the highest reading already stored in those logs.
-- Idempotent: only touches rows whose last odometer is NULL (or that do not exist yet),
-- and never lowers a value. Safe to re-run.

-- 1) Vehicles with odometer readings but no vehicle data row: create the row.
INSERT INTO "ga_vehicle_data" ("id", "asset_id", "odometer_terakhir", "created_at", "updated_at")
SELECT gen_random_uuid()::text, r.asset_id, r.max_odo, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT asset_id, MAX(odometer) AS max_odo
  FROM (
    SELECT asset_id, odometer FROM "ga_vehicle_service_logs" WHERE odometer IS NOT NULL
    UNION ALL
    SELECT asset_id, odometer FROM "ga_vehicle_fuel_logs" WHERE odometer IS NOT NULL
    UNION ALL
    SELECT asset_id, odometer FROM "ga_vehicle_oil_logs" WHERE odometer IS NOT NULL
    UNION ALL
    SELECT asset_id, odometer FROM "ga_vehicle_inspections" WHERE odometer IS NOT NULL
  ) readings
  WHERE odometer >= 0
  GROUP BY asset_id
) r
JOIN "ga_assets" a ON a."id" = r.asset_id
WHERE NOT EXISTS (SELECT 1 FROM "ga_vehicle_data" vd WHERE vd."asset_id" = r.asset_id)
ON CONFLICT ("asset_id") DO NOTHING;

-- 2) Existing vehicle data rows whose last odometer is still NULL.
UPDATE "ga_vehicle_data" vd
SET "odometer_terakhir" = r.max_odo,
    "updated_at" = CURRENT_TIMESTAMP
FROM (
  SELECT asset_id, MAX(odometer) AS max_odo
  FROM (
    SELECT asset_id, odometer FROM "ga_vehicle_service_logs" WHERE odometer IS NOT NULL
    UNION ALL
    SELECT asset_id, odometer FROM "ga_vehicle_fuel_logs" WHERE odometer IS NOT NULL
    UNION ALL
    SELECT asset_id, odometer FROM "ga_vehicle_oil_logs" WHERE odometer IS NOT NULL
    UNION ALL
    SELECT asset_id, odometer FROM "ga_vehicle_inspections" WHERE odometer IS NOT NULL
  ) readings
  WHERE odometer >= 0
  GROUP BY asset_id
) r
WHERE vd."asset_id" = r.asset_id
  AND vd."odometer_terakhir" IS NULL;
