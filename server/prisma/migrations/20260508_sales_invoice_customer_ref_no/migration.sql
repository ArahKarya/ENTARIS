-- Customer-supplied reference: PO number, quotation number, or any other ID
-- the buyer wants printed on the invoice for their own bookkeeping.
ALTER TABLE "sales_invoices" ADD COLUMN "customer_ref_no" TEXT;
