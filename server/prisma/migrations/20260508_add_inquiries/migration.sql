-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('Baru', 'Diproses', 'Dikonversi', 'Hilang', 'Ditutup');
CREATE TYPE "InquiryChannel" AS ENUM ('WhatsApp', 'Telepon', 'Email', 'WalkIn', 'Referral', 'Lainnya');

-- CreateTable
CREATE TABLE "inquiries" (
  "id" TEXT NOT NULL,
  "inquiry_number" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "status" "InquiryStatus" NOT NULL DEFAULT 'Baru',
  "channel" "InquiryChannel" NOT NULL DEFAULT 'Lainnya',
  "party_id" TEXT,
  "prospect_name" TEXT NOT NULL,
  "prospect_phone" TEXT,
  "prospect_email" TEXT,
  "items_mode" TEXT NOT NULL DEFAULT 'freetext',
  "items_text" TEXT,
  "notes" TEXT,
  "follow_up_date" TIMESTAMP(3),
  "loss_reason" TEXT,
  "quotation_id" TEXT,
  "converted_at" TIMESTAMP(3),
  "fiscal_year_id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inquiry_items" (
  "id" TEXT NOT NULL,
  "inquiry_id" TEXT NOT NULL,
  "item_name" TEXT NOT NULL,
  "quantity" DECIMAL(15,3),
  "unit" TEXT,
  "estimated_price" DECIMAL(15,2),
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "inquiry_items_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "inquiries_inquiry_number_key" ON "inquiries"("inquiry_number");
CREATE UNIQUE INDEX "inquiries_quotation_id_key" ON "inquiries"("quotation_id");
CREATE INDEX "inquiries_party_id_idx" ON "inquiries"("party_id");
CREATE INDEX "inquiries_status_idx" ON "inquiries"("status");
CREATE INDEX "inquiries_date_idx" ON "inquiries"("date");
CREATE INDEX "inquiries_fiscal_year_id_idx" ON "inquiries"("fiscal_year_id");
CREATE INDEX "inquiry_items_inquiry_id_idx" ON "inquiry_items"("inquiry_id");

-- Foreign keys
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
