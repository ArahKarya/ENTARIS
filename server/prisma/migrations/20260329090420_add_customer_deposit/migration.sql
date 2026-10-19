-- AlterEnum
ALTER TYPE "PaymentType" ADD VALUE 'CustomerDeposit';

-- AlterTable
ALTER TABLE "parties" ADD COLUMN     "customer_deposit_balance" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "customer_deposit_applications" (
    "id" TEXT NOT NULL,
    "deposit_payment_id" TEXT NOT NULL,
    "sales_invoice_id" TEXT NOT NULL,
    "applied_amount" DECIMAL(15,2) NOT NULL,
    "journal_entry_id" TEXT,
    "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,

    CONSTRAINT "customer_deposit_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_deposit_applications_journal_entry_id_key" ON "customer_deposit_applications"("journal_entry_id");

-- CreateIndex
CREATE INDEX "customer_deposit_applications_deposit_payment_id_idx" ON "customer_deposit_applications"("deposit_payment_id");

-- CreateIndex
CREATE INDEX "customer_deposit_applications_sales_invoice_id_idx" ON "customer_deposit_applications"("sales_invoice_id");

-- AddForeignKey
ALTER TABLE "customer_deposit_applications" ADD CONSTRAINT "customer_deposit_applications_deposit_payment_id_fkey" FOREIGN KEY ("deposit_payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_deposit_applications" ADD CONSTRAINT "customer_deposit_applications_sales_invoice_id_fkey" FOREIGN KEY ("sales_invoice_id") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_deposit_applications" ADD CONSTRAINT "customer_deposit_applications_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_deposit_applications" ADD CONSTRAINT "customer_deposit_applications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
