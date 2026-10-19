-- CreateTable production_runs
CREATE TABLE "production_runs" (
  "id" TEXT NOT NULL,
  "run_number" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "reference_type" TEXT,
  "reference_id" TEXT,
  "reference_number" TEXT,
  "rendemen_pct" DECIMAL(5,2),
  "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
  "fiscal_year_id" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "production_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable production_run_items
CREATE TABLE "production_run_items" (
  "id" TEXT NOT NULL,
  "production_run_id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "line_type" TEXT NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  "rendemen_pct" DECIMAL(5,2),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "production_run_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "production_runs_run_number_key" ON "production_runs"("run_number");
CREATE INDEX "production_runs_date_idx" ON "production_runs"("date");
CREATE INDEX "production_runs_fiscal_year_id_idx" ON "production_runs"("fiscal_year_id");
CREATE INDEX "production_run_items_production_run_id_idx" ON "production_run_items"("production_run_id");

-- AddForeignKey
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_fiscal_year_id_fkey"
  FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_run_items" ADD CONSTRAINT "production_run_items_production_run_id_fkey"
  FOREIGN KEY ("production_run_id") REFERENCES "production_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_run_items" ADD CONSTRAINT "production_run_items_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
