/**
 * Shared shapes for payment allocation details:
 *  - PAYMENT_ALLOCATION_PAYMENT_SELECT: the payment fields an invoice detail returns per allocation
 *    (account, splits, notes, status), identical for sales and purchase invoices so the
 *    "Rincian Pembayaran" block and the invoice PDF can split cash vs. deductions.
 *  - withAllocationInvoiceNumbers: resolves the polymorphic (invoiceType, invoiceId) pair of each
 *    allocation to its invoice number for the payment detail.
 */
import type { Prisma, PrismaClient } from '@prisma/client';

const ACCOUNT_SELECT = { id: true, accountNumber: true, name: true, rootType: true } as const;

export const PAYMENT_ALLOCATION_PAYMENT_SELECT = {
  id: true,
  paymentNumber: true,
  date: true,
  amount: true,
  referenceNo: true,
  notes: true,
  status: true,
  account: { select: ACCOUNT_SELECT },
  splits: { select: { id: true, amount: true, notes: true, account: { select: ACCOUNT_SELECT } } },
} satisfies Prisma.PaymentSelect;

export interface AllocationRef {
  invoiceType: string;
  invoiceId: string;
}

type InvoiceLookupDb = {
  salesInvoice: Pick<PrismaClient['salesInvoice'], 'findMany'>;
  purchaseInvoice: Pick<PrismaClient['purchaseInvoice'], 'findMany'>;
};

function idsOfType(allocations: readonly AllocationRef[], type: string): string[] {
  return Array.from(new Set(allocations.filter((a) => a.invoiceType === type).map((a) => a.invoiceId)));
}

/** Returns new allocation objects with `invoiceNumber` (null when the invoice no longer exists). */
export async function withAllocationInvoiceNumbers<T extends AllocationRef>(
  db: InvoiceLookupDb,
  allocations: readonly T[],
): Promise<Array<T & { invoiceNumber: string | null }>> {
  const salesIds = idsOfType(allocations, 'SalesInvoice');
  const purchaseIds = idsOfType(allocations, 'PurchaseInvoice');
  const select = { id: true, invoiceNumber: true } as const;
  const [sales, purchases] = await Promise.all([
    salesIds.length ? db.salesInvoice.findMany({ where: { id: { in: salesIds } }, select }) : [],
    purchaseIds.length ? db.purchaseInvoice.findMany({ where: { id: { in: purchaseIds } }, select }) : [],
  ]);
  const numbers = new Map<string, string>([
    ...sales.map((r) => [`SalesInvoice:${r.id}`, r.invoiceNumber] as const),
    ...purchases.map((r) => [`PurchaseInvoice:${r.id}`, r.invoiceNumber] as const),
  ]);
  return allocations.map((a) => ({ ...a, invoiceNumber: numbers.get(`${a.invoiceType}:${a.invoiceId}`) ?? null }));
}
