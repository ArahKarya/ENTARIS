-- Add VendorRefund and CustomerRefund enum values to PaymentType
ALTER TYPE "PaymentType" ADD VALUE IF NOT EXISTS 'VendorRefund';
ALTER TYPE "PaymentType" ADD VALUE IF NOT EXISTS 'CustomerRefund';
