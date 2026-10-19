-- AlterTable
ALTER TABLE "sales_invoice_items" ADD COLUMN     "item_type" TEXT NOT NULL DEFAULT 'product',
ADD COLUMN     "service_item_id" TEXT;

-- CreateTable
CREATE TABLE "service_items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Jasa',
    "default_rate" DECIMAL(15,2),
    "account_id" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_dummy" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_items_code_key" ON "service_items"("code");

-- CreateIndex
CREATE INDEX "service_items_account_id_idx" ON "service_items"("account_id");

-- CreateIndex
CREATE INDEX "sales_invoice_items_service_item_id_idx" ON "sales_invoice_items"("service_item_id");

-- AddForeignKey
ALTER TABLE "sales_invoice_items" ADD CONSTRAINT "sales_invoice_items_service_item_id_fkey" FOREIGN KEY ("service_item_id") REFERENCES "service_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_items" ADD CONSTRAINT "service_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
