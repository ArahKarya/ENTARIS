-- GA Material Request (MR) — rantai pengadaan sparepart internal EAM (OPSI A).
-- Di-tulis idempoten untuk loose-SQL runner (docker-app-entrypoint.sh menjalankan
-- setiap startup via `prisma db execute`). Additive only: enum baru, 2 tabel baru,
-- 1 kolom nullable di ga_work_orders. Aman untuk DB produksi existing — tidak
-- drop/alter kolom lama; semua kolom baru nullable atau punya DEFAULT.
-- Sort key 20260701 > 20260609_add_ga_modules.sql → ga_* base tables sudah ada.

-- ── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "GaMaterialRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'FULFILLED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GaProcurementStatus" AS ENUM ('REQUESTED', 'QUOTED', 'ORDERED', 'RECEIVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── AlterTable: ga_work_orders.component ────────────────────────────────────
ALTER TABLE "ga_work_orders" ADD COLUMN IF NOT EXISTS "component" TEXT;

-- ── CreateTable: ga_material_requests ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ga_material_requests" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "GaMaterialRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "work_order_id" TEXT,
    "asset_id" TEXT,
    "machine_target" TEXT,
    "notes" TEXT,
    "requested_by_id" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_by_id" TEXT,
    "rejected_at" TIMESTAMP(3),
    "reject_reason" TEXT,
    "purchase_order_id" TEXT,
    "gl_account_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ga_material_requests_pkey" PRIMARY KEY ("id")
);

-- ── CreateTable: ga_material_request_items ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "ga_material_request_items" (
    "id" TEXT NOT NULL,
    "material_request_id" TEXT NOT NULL,
    "inventory_item_id" TEXT,
    "item_name" TEXT NOT NULL,
    "sku" TEXT,
    "uom" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "vendor_name" TEXT,
    "unit_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "po_number" TEXT,
    "procurement_status" "GaProcurementStatus" NOT NULL DEFAULT 'REQUESTED',
    "received_qty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "received_at" TIMESTAMP(3),
    "received_into_location_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ga_material_request_items_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "ga_material_requests_code_key" ON "ga_material_requests"("code");
CREATE INDEX IF NOT EXISTS "ga_material_requests_status_idx" ON "ga_material_requests"("status");
CREATE INDEX IF NOT EXISTS "ga_material_requests_work_order_id_idx" ON "ga_material_requests"("work_order_id");
CREATE INDEX IF NOT EXISTS "ga_material_requests_asset_id_idx" ON "ga_material_requests"("asset_id");
CREATE INDEX IF NOT EXISTS "ga_material_request_items_material_request_id_idx" ON "ga_material_request_items"("material_request_id");
CREATE INDEX IF NOT EXISTS "ga_material_request_items_inventory_item_id_idx" ON "ga_material_request_items"("inventory_item_id");

-- ── Foreign keys (idempoten via DO-block) ───────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "ga_material_requests" ADD CONSTRAINT "ga_material_requests_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "ga_work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_material_requests" ADD CONSTRAINT "ga_material_requests_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "ga_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_material_request_items" ADD CONSTRAINT "ga_material_request_items_material_request_id_fkey" FOREIGN KEY ("material_request_id") REFERENCES "ga_material_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_material_request_items" ADD CONSTRAINT "ga_material_request_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "ga_inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ga_material_request_items" ADD CONSTRAINT "ga_material_request_items_received_into_location_id_fkey" FOREIGN KEY ("received_into_location_id") REFERENCES "ga_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
