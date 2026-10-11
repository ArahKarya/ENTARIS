import type { Prisma } from '@prisma/client';
import { BusinessError } from '../utils/errors';

type Tx = Prisma.TransactionClient;

/** Quotation an SO may point to: same customer and Accepted. */
export async function assertQuotationLinkable(tx: Tx, quotationId: string, partyId: string): Promise<void> {
  const q = await tx.quotation.findUnique({
    where: { id: quotationId },
    select: { quotationNumber: true, partyId: true, status: true },
  });
  if (!q) throw new BusinessError('Penawaran tidak ditemukan.');
  if (q.partyId !== partyId) throw new BusinessError(`Penawaran ${q.quotationNumber} milik customer lain.`);
  if (q.status !== 'Accepted') {
    throw new BusinessError(`Penawaran ${q.quotationNumber} belum diterima customer (status ${q.status}).`);
  }
}

/**
 * quotationId to store on SO edit: an omitted field keeps the current link,
 * a changed id is validated, null clears it.
 */
export async function resolveSalesOrderQuotationId(
  tx: Tx,
  requested: string | null | undefined,
  current: string | null,
  partyId: string,
): Promise<string | null> {
  if (requested === undefined) return current;
  if (!requested) return null;
  if (requested !== current) {
    await assertQuotationLinkable(tx, requested, partyId);
    return requested;
  }
  // Same link kept: only the customer must still match.
  const q = await tx.quotation.findUnique({ where: { id: requested }, select: { quotationNumber: true, partyId: true } });
  if (q && q.partyId !== partyId) throw new BusinessError(`Penawaran ${q.quotationNumber} milik customer lain.`);
  return requested;
}

/** SO a temporary delivery note may point to: same customer and (for a new link) not cancelled. */
export async function assertSalesOrderLinkable(
  tx: Tx,
  salesOrderId: string,
  partyId: string,
  { keptLink = false }: { keptLink?: boolean } = {},
): Promise<void> {
  const so = await tx.salesOrder.findUnique({
    where: { id: salesOrderId },
    select: { soNumber: true, partyId: true, status: true },
  });
  if (!so) throw new BusinessError('Pesanan penjualan tidak ditemukan.');
  if (so.partyId !== partyId) throw new BusinessError(`Pesanan ${so.soNumber} milik customer lain.`);
  // A link kept on edit is not blocked by later SO status changes.
  if (!keptLink && so.status === 'Cancelled') throw new BusinessError(`Pesanan ${so.soNumber} sudah dibatalkan.`);
}
