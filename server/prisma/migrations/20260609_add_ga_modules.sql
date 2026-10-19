-- General Affairs (GA) modules — tabel ga_* + enum Ga* (idempoten).
-- Di-generate dari prisma migrate diff, dijadikan idempoten utk loose-SQL runner.

DO $$ BEGIN
  CREATE TYPE "GaAssetStatus" AS ENUM ('ACTIVE', 'IN_REPAIR', 'RETIRED', 'LOST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaAssetCondition" AS ENUM ('GOOD', 'FAIR', 'POOR', 'BROKEN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaDocumentStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaInventoryType" AS ENUM ('SPAREPART', 'CONSUMABLE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaMovementType" AS ENUM ('IN', 'OUT', 'TRANSFER', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaWorkOrderType" AS ENUM ('PREVENTIVE', 'CORRECTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaWorkOrderStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'CLOSED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaWorkOrderPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaWorkOrderPhotoType" AS ENUM ('BEFORE', 'AFTER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaVehicleFuelType" AS ENUM ('BENSIN', 'SOLAR', 'PERTAMAX', 'PERTALITE', 'DEX', 'LPG', 'LISTRIK', 'HYBRID', 'LAINNYA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaVehicleServiceType" AS ENUM ('OLI', 'TUNE_UP', 'SERVIS_BERKALA', 'PERBAIKAN', 'GANTI_BAN', 'ELEKTRIKAL', 'AC', 'LAINNYA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaVehicleServiceRequestStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaBuildingType" AS ENUM ('KANTOR', 'GUDANG', 'PABRIK', 'RUMAH', 'MESS', 'RUKO', 'LAINNYA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaBuildingOwnership" AS ENUM ('MILIK_SENDIRI', 'SEWA_MASUK', 'SEWA_KELUAR', 'PINJAM_PAKAI');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaLandCertificateType" AS ENUM ('HM', 'HGB', 'HGU', 'HP_AKTA', 'GIRIK', 'BELUM_SERTIFIKAT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaBuildingRentalArah" AS ENUM ('SEWA_MASUK', 'SEWA_KELUAR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaBuildingRentalPeriode" AS ENUM ('BULANAN', 'TAHUNAN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaBuildingRentalStatus" AS ENUM ('AKTIF', 'BERAKHIR', 'DIBATALKAN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaWeighingUnit" AS ENUM ('KG', 'GRAM', 'TON', 'LBS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaCalibrationResult" AS ENUM ('PASS', 'FAIL', 'CONDITIONAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaCalibrationMode" AS ENUM ('ON_SITE', 'SHIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "ga_branches" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ga_branches_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_cost_centers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ga_cost_centers_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_asset_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "custom_fields_schema" JSONB,
    "maintenance_checklist_schema" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ga_asset_categories_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_assets" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "cost_center_id" TEXT,
    "pic_user_id" TEXT,
    "serial_number" TEXT,
    "acquisition_date" TIMESTAMP(3),
    "acquisition_cost" DECIMAL(18,2),
    "status" "GaAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "condition" "GaAssetCondition" NOT NULL DEFAULT 'GOOD',
    "location" TEXT,
    "notes" TEXT,
    "custom_fields" JSONB,
    "maintenance_checklist_override" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ga_assets_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_asset_photos" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "caption" TEXT,
    "order_idx" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ga_asset_photos_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_asset_qrs" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "qr_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ga_asset_qrs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_document_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "custom_fields_schema" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ga_document_types_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_documents" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type_id" TEXT NOT NULL,
    "asset_id" TEXT,
    "issued_by" TEXT,
    "issued_number" TEXT,
    "effective_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3),
    "status" "GaDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "custom_fields" JSONB,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ga_documents_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_document_versions" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version_no" INTEGER NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ga_document_versions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_inventory_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "GaInventoryType" NOT NULL,

    CONSTRAINT "ga_inventory_categories_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_locations" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,

    CONSTRAINT "ga_locations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_inventory_items" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "uom" TEXT NOT NULL,
    "min_stock" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ga_inventory_items_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_stock_by_location" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ga_stock_by_location_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_inventory_movements" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "type" "GaMovementType" NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "from_location_id" TEXT,
    "to_location_id" TEXT,
    "reference_no" TEXT,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ga_inventory_movements_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_maintenance_schedules" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "interval_days" INTEGER,
    "interval_hours" INTEGER,
    "interval_km" INTEGER,
    "last_done_at_km" INTEGER,
    "next_due_at_km" INTEGER,
    "next_due_at" TIMESTAMP(3) NOT NULL,
    "last_done_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ga_maintenance_schedules_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_work_orders" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "type" "GaWorkOrderType" NOT NULL,
    "status" "GaWorkOrderStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "GaWorkOrderPriority" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reported_by_id" TEXT,
    "reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_to_id" TEXT,
    "assigned_at" TIMESTAMP(3),
    "assigned_by_id" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "completed_by_id" TEXT,
    "resolution" TEXT,
    "was_late" BOOLEAN NOT NULL DEFAULT false,
    "closed_at" TIMESTAMP(3),
    "closed_by_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" TEXT,
    "cancel_reason" TEXT,
    "schedule_id" TEXT,
    "due_at" TIMESTAMP(3),
    "labor_hours" DECIMAL(6,2),
    "labor_cost" DECIMAL(14,2),
    "external_vendor" TEXT,
    "external_cost" DECIMAL(14,2),
    "checklist" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ga_work_orders_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_work_order_photos" (
    "id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "type" "GaWorkOrderPhotoType" NOT NULL,
    "caption" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ga_work_order_photos_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_work_order_parts" (
    "id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "from_location_id" TEXT,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit_cost" DECIMAL(14,2) NOT NULL,
    "inventory_movement_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ga_work_order_parts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_vehicle_data" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "no_plat" TEXT,
    "brand" TEXT,
    "tipe" TEXT,
    "tahun_produksi" INTEGER,
    "no_mesin" TEXT,
    "no_rangka" TEXT,
    "jenis_bbm" "GaVehicleFuelType",
    "kapasitas_tangki" DECIMAL(8,2),
    "warna" TEXT,
    "odometer_saat_beli" INTEGER,
    "odometer_terakhir" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ga_vehicle_data_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_vehicle_service_logs" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "odometer" INTEGER,
    "jenis_service" "GaVehicleServiceType" NOT NULL,
    "deskripsi" TEXT NOT NULL,
    "bengkel" TEXT,
    "biaya" DECIMAL(14,2),
    "work_order_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ga_vehicle_service_logs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_vehicle_service_requests" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "jenis_service" "GaVehicleServiceType" NOT NULL,
    "odometer" INTEGER,
    "deskripsi" TEXT NOT NULL,
    "urgensi" "GaWorkOrderPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "GaVehicleServiceRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "work_order_id" TEXT,
    "service_log_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ga_vehicle_service_requests_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_building_data" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "jenis" "GaBuildingType" NOT NULL,
    "ownership" "GaBuildingOwnership" NOT NULL DEFAULT 'MILIK_SENDIRI',
    "luas_tanah" DECIMAL(12,2),
    "luas_bangunan" DECIMAL(12,2),
    "jumlah_lantai" INTEGER,
    "tahun_bangun" INTEGER,
    "tahun_renovasi" INTEGER,
    "alamat_lengkap" TEXT,
    "kelurahan" TEXT,
    "kecamatan" TEXT,
    "kota" TEXT,
    "provinsi" TEXT,
    "kode_pos" TEXT,
    "certificate_type" "GaLandCertificateType",
    "certificate_number" TEXT,
    "njop_tanah" DECIMAL(16,2),
    "njop_bangunan" DECIMAL(16,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ga_building_data_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_building_rentals" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "arah" "GaBuildingRentalArah" NOT NULL,
    "pihak" TEXT NOT NULL,
    "kontak" TEXT,
    "nilai_sewa" DECIMAL(16,2) NOT NULL,
    "periode" "GaBuildingRentalPeriode" NOT NULL,
    "tanggal_mulai" TIMESTAMP(3) NOT NULL,
    "tanggal_akhir" TIMESTAMP(3) NOT NULL,
    "status" "GaBuildingRentalStatus" NOT NULL DEFAULT 'AKTIF',
    "document_id" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ga_building_rentals_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_equipment_data" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "max_capacity" DECIMAL(12,3),
    "unit" "GaWeighingUnit",
    "accuracy" DECIMAL(10,4),
    "class_label" TEXT,
    "default_calibrator" TEXT,
    "interval_months" INTEGER NOT NULL DEFAULT 12,
    "last_calibrated_at" TIMESTAMP(3),
    "next_calibration_due" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ga_equipment_data_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ga_calibration_logs" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "lembaga" TEXT NOT NULL,
    "no_sertifikat" TEXT NOT NULL,
    "mode" "GaCalibrationMode" NOT NULL DEFAULT 'ON_SITE',
    "biaya" DECIMAL(14,2),
    "hasil" "GaCalibrationResult" NOT NULL,
    "deviasi" TEXT,
    "range_tested" TEXT,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "document_id" TEXT,
    "work_order_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ga_calibration_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ga_branches_code_key" ON "ga_branches"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_cost_centers_code_key" ON "ga_cost_centers"("code");
CREATE INDEX IF NOT EXISTS "ga_cost_centers_branch_id_idx" ON "ga_cost_centers"("branch_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_asset_categories_code_key" ON "ga_asset_categories"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_assets_code_key" ON "ga_assets"("code");
CREATE INDEX IF NOT EXISTS "ga_assets_category_id_idx" ON "ga_assets"("category_id");
CREATE INDEX IF NOT EXISTS "ga_assets_branch_id_idx" ON "ga_assets"("branch_id");
CREATE INDEX IF NOT EXISTS "ga_assets_pic_user_id_idx" ON "ga_assets"("pic_user_id");
CREATE INDEX IF NOT EXISTS "ga_assets_status_idx" ON "ga_assets"("status");
CREATE INDEX IF NOT EXISTS "ga_asset_photos_asset_id_idx" ON "ga_asset_photos"("asset_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_asset_qrs_asset_id_key" ON "ga_asset_qrs"("asset_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_asset_qrs_qr_code_key" ON "ga_asset_qrs"("qr_code");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_document_types_code_key" ON "ga_document_types"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_documents_code_key" ON "ga_documents"("code");
CREATE INDEX IF NOT EXISTS "ga_documents_type_id_idx" ON "ga_documents"("type_id");
CREATE INDEX IF NOT EXISTS "ga_documents_asset_id_idx" ON "ga_documents"("asset_id");
CREATE INDEX IF NOT EXISTS "ga_documents_expiry_date_idx" ON "ga_documents"("expiry_date");
CREATE INDEX IF NOT EXISTS "ga_documents_status_idx" ON "ga_documents"("status");
CREATE INDEX IF NOT EXISTS "ga_document_versions_document_id_idx" ON "ga_document_versions"("document_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_document_versions_document_id_version_no_key" ON "ga_document_versions"("document_id", "version_no");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_inventory_categories_code_key" ON "ga_inventory_categories"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_locations_code_key" ON "ga_locations"("code");
CREATE INDEX IF NOT EXISTS "ga_locations_branch_id_idx" ON "ga_locations"("branch_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_inventory_items_sku_key" ON "ga_inventory_items"("sku");
CREATE INDEX IF NOT EXISTS "ga_inventory_items_category_id_idx" ON "ga_inventory_items"("category_id");
CREATE INDEX IF NOT EXISTS "ga_stock_by_location_item_id_idx" ON "ga_stock_by_location"("item_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_stock_by_location_item_id_location_id_key" ON "ga_stock_by_location"("item_id", "location_id");
CREATE INDEX IF NOT EXISTS "ga_inventory_movements_item_id_idx" ON "ga_inventory_movements"("item_id");
CREATE INDEX IF NOT EXISTS "ga_inventory_movements_created_at_idx" ON "ga_inventory_movements"("created_at");
CREATE INDEX IF NOT EXISTS "ga_maintenance_schedules_asset_id_idx" ON "ga_maintenance_schedules"("asset_id");
CREATE INDEX IF NOT EXISTS "ga_maintenance_schedules_next_due_at_is_active_idx" ON "ga_maintenance_schedules"("next_due_at", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_work_orders_code_key" ON "ga_work_orders"("code");
CREATE INDEX IF NOT EXISTS "ga_work_orders_asset_id_idx" ON "ga_work_orders"("asset_id");
CREATE INDEX IF NOT EXISTS "ga_work_orders_status_idx" ON "ga_work_orders"("status");
CREATE INDEX IF NOT EXISTS "ga_work_orders_assigned_to_id_idx" ON "ga_work_orders"("assigned_to_id");
CREATE INDEX IF NOT EXISTS "ga_work_orders_schedule_id_idx" ON "ga_work_orders"("schedule_id");
CREATE INDEX IF NOT EXISTS "ga_work_orders_due_at_idx" ON "ga_work_orders"("due_at");
CREATE INDEX IF NOT EXISTS "ga_work_order_photos_work_order_id_idx" ON "ga_work_order_photos"("work_order_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_work_order_parts_inventory_movement_id_key" ON "ga_work_order_parts"("inventory_movement_id");
CREATE INDEX IF NOT EXISTS "ga_work_order_parts_work_order_id_idx" ON "ga_work_order_parts"("work_order_id");
CREATE INDEX IF NOT EXISTS "ga_work_order_parts_inventory_item_id_idx" ON "ga_work_order_parts"("inventory_item_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_vehicle_data_asset_id_key" ON "ga_vehicle_data"("asset_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_vehicle_data_no_plat_key" ON "ga_vehicle_data"("no_plat");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_vehicle_service_logs_work_order_id_key" ON "ga_vehicle_service_logs"("work_order_id");
CREATE INDEX IF NOT EXISTS "ga_vehicle_service_logs_asset_id_tanggal_idx" ON "ga_vehicle_service_logs"("asset_id", "tanggal");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_vehicle_service_requests_work_order_id_key" ON "ga_vehicle_service_requests"("work_order_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_vehicle_service_requests_service_log_id_key" ON "ga_vehicle_service_requests"("service_log_id");
CREATE INDEX IF NOT EXISTS "ga_vehicle_service_requests_asset_id_idx" ON "ga_vehicle_service_requests"("asset_id");
CREATE INDEX IF NOT EXISTS "ga_vehicle_service_requests_status_idx" ON "ga_vehicle_service_requests"("status");
CREATE INDEX IF NOT EXISTS "ga_vehicle_service_requests_requested_by_id_idx" ON "ga_vehicle_service_requests"("requested_by_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_building_data_asset_id_key" ON "ga_building_data"("asset_id");
CREATE INDEX IF NOT EXISTS "ga_building_data_jenis_idx" ON "ga_building_data"("jenis");
CREATE INDEX IF NOT EXISTS "ga_building_data_ownership_idx" ON "ga_building_data"("ownership");
CREATE INDEX IF NOT EXISTS "ga_building_rentals_asset_id_status_idx" ON "ga_building_rentals"("asset_id", "status");
CREATE INDEX IF NOT EXISTS "ga_building_rentals_tanggal_akhir_idx" ON "ga_building_rentals"("tanggal_akhir");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_equipment_data_asset_id_key" ON "ga_equipment_data"("asset_id");
CREATE INDEX IF NOT EXISTS "ga_equipment_data_next_calibration_due_idx" ON "ga_equipment_data"("next_calibration_due");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_calibration_logs_document_id_key" ON "ga_calibration_logs"("document_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ga_calibration_logs_work_order_id_key" ON "ga_calibration_logs"("work_order_id");
CREATE INDEX IF NOT EXISTS "ga_calibration_logs_asset_id_tanggal_idx" ON "ga_calibration_logs"("asset_id", "tanggal");
CREATE INDEX IF NOT EXISTS "ga_calibration_logs_valid_until_idx" ON "ga_calibration_logs"("valid_until");
DO $$ BEGIN
  ALTER TABLE "ga_cost_centers" ADD CONSTRAINT "ga_cost_centers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "ga_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_assets" ADD CONSTRAINT "ga_assets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "ga_asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_assets" ADD CONSTRAINT "ga_assets_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "ga_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_assets" ADD CONSTRAINT "ga_assets_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "ga_cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_asset_photos" ADD CONSTRAINT "ga_asset_photos_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "ga_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_asset_qrs" ADD CONSTRAINT "ga_asset_qrs_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "ga_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_documents" ADD CONSTRAINT "ga_documents_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "ga_document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_documents" ADD CONSTRAINT "ga_documents_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "ga_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_document_versions" ADD CONSTRAINT "ga_document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "ga_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_locations" ADD CONSTRAINT "ga_locations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "ga_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_inventory_items" ADD CONSTRAINT "ga_inventory_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "ga_inventory_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_stock_by_location" ADD CONSTRAINT "ga_stock_by_location_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "ga_inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_stock_by_location" ADD CONSTRAINT "ga_stock_by_location_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "ga_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_inventory_movements" ADD CONSTRAINT "ga_inventory_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "ga_inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_inventory_movements" ADD CONSTRAINT "ga_inventory_movements_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "ga_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_inventory_movements" ADD CONSTRAINT "ga_inventory_movements_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "ga_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_maintenance_schedules" ADD CONSTRAINT "ga_maintenance_schedules_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "ga_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_work_orders" ADD CONSTRAINT "ga_work_orders_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "ga_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_work_orders" ADD CONSTRAINT "ga_work_orders_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "ga_maintenance_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_work_order_photos" ADD CONSTRAINT "ga_work_order_photos_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "ga_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_work_order_parts" ADD CONSTRAINT "ga_work_order_parts_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "ga_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_work_order_parts" ADD CONSTRAINT "ga_work_order_parts_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "ga_inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_work_order_parts" ADD CONSTRAINT "ga_work_order_parts_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "ga_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_work_order_parts" ADD CONSTRAINT "ga_work_order_parts_inventory_movement_id_fkey" FOREIGN KEY ("inventory_movement_id") REFERENCES "ga_inventory_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_vehicle_data" ADD CONSTRAINT "ga_vehicle_data_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "ga_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_vehicle_service_logs" ADD CONSTRAINT "ga_vehicle_service_logs_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "ga_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_vehicle_service_logs" ADD CONSTRAINT "ga_vehicle_service_logs_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "ga_work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_vehicle_service_requests" ADD CONSTRAINT "ga_vehicle_service_requests_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "ga_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_vehicle_service_requests" ADD CONSTRAINT "ga_vehicle_service_requests_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "ga_work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_vehicle_service_requests" ADD CONSTRAINT "ga_vehicle_service_requests_service_log_id_fkey" FOREIGN KEY ("service_log_id") REFERENCES "ga_vehicle_service_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_building_data" ADD CONSTRAINT "ga_building_data_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "ga_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_building_rentals" ADD CONSTRAINT "ga_building_rentals_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "ga_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_building_rentals" ADD CONSTRAINT "ga_building_rentals_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "ga_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_equipment_data" ADD CONSTRAINT "ga_equipment_data_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "ga_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_calibration_logs" ADD CONSTRAINT "ga_calibration_logs_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "ga_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_calibration_logs" ADD CONSTRAINT "ga_calibration_logs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "ga_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_calibration_logs" ADD CONSTRAINT "ga_calibration_logs_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "ga_work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
