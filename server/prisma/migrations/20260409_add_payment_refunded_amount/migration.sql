-- Add refunded_amount column to payments for customer/vendor deposit refund tracking
ALTER TABLE "payments" ADD COLUMN "refunded_amount" DECIMAL(15,2) NOT NULL DEFAULT 0;
