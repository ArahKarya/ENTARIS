-- AlterTable
ALTER TABLE "purchase_invoice_items" ADD COLUMN     "inventory_item_id" TEXT;

-- AlterTable
ALTER TABLE "sales_invoice_items" ADD COLUMN     "inventory_item_id" TEXT;

-- CreateIndex
CREATE INDEX "purchase_invoice_items_inventory_item_id_idx" ON "purchase_invoice_items"("inventory_item_id");

-- CreateIndex
CREATE INDEX "sales_invoice_items_inventory_item_id_idx" ON "sales_invoice_items"("inventory_item_id");

-- AddForeignKey
ALTER TABLE "sales_invoice_items" ADD CONSTRAINT "sales_invoice_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
