import { Prisma } from '@prisma/client';

/**
 * Generates a sequential document number using advisory locks to prevent
 * race conditions under concurrent requests.
 *
 * Format: {prefix}-YYYYMM-XXXX  e.g. SI-202603-0001
 *
 * Strategy: MAX(existing number) + 1 within the (prefix, yearMonth) series.
 * NOTE: previously this used COUNT(rows in month) + 1, which desyncs from the
 * actual last-used number whenever documents are deleted or their dates are
 * moved across months — count drops below max, so the next generated number
 * collides with an existing one and the @unique constraint throws P2002
 * ("Data duplikat terdeteksi"). MAX+1 is immune to deletions and backdating.
 */
export async function generateDocumentNumber(
  tx: Prisma.TransactionClient,
  prefix: 'JV' | 'SI' | 'PI' | 'PAY' | 'SM' | 'PR' | 'OB' | 'SO' | 'QO' | 'INQ' | 'ST' | 'DO' | 'STT' | 'PO' | 'PSN' | 'RN' | 'UJ',
  date: Date,
  fiscalYearId: string
): Promise<string> {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const monthStr = String(month + 1).padStart(2, '0');
  const yearMonth = `${year}${monthStr}`;

  // Use a deterministic advisory lock key per (prefix, yearMonth)
  // FNV-1a-like hash to avoid collisions between different prefix+month combos
  const key = `${prefix}-${yearMonth}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // keep as unsigned 32-bit
  }
  const lockKey = hash % 2147483647; // ensure fits in PostgreSQL int4
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

  // Find the highest number already used in this (prefix, yearMonth) series.
  // The series prefix embeds year+month, so no date/fiscalYear filter is needed
  // (and deleted/backdated rows can never cause collisions).
  const seriesPrefix = `${prefix}-${yearMonth}-`;
  const startsWith = { startsWith: seriesPrefix };

  let lastNumber: string | null = null;
  if (prefix === 'SI') {
    const r = await tx.salesInvoice.findFirst({ where: { invoiceNumber: startsWith }, orderBy: { invoiceNumber: 'desc' }, select: { invoiceNumber: true } });
    lastNumber = r?.invoiceNumber ?? null;
  } else if (prefix === 'PI') {
    const r = await tx.purchaseInvoice.findFirst({ where: { invoiceNumber: startsWith }, orderBy: { invoiceNumber: 'desc' }, select: { invoiceNumber: true } });
    lastNumber = r?.invoiceNumber ?? null;
  } else if (prefix === 'PAY') {
    const r = await tx.payment.findFirst({ where: { paymentNumber: startsWith }, orderBy: { paymentNumber: 'desc' }, select: { paymentNumber: true } });
    lastNumber = r?.paymentNumber ?? null;
  } else if (prefix === 'SM') {
    const r = await tx.stockMovement.findFirst({ where: { movementNumber: startsWith }, orderBy: { movementNumber: 'desc' }, select: { movementNumber: true } });
    lastNumber = r?.movementNumber ?? null;
  } else if (prefix === 'PR') {
    const r = await tx.productionRun.findFirst({ where: { runNumber: startsWith }, orderBy: { runNumber: 'desc' }, select: { runNumber: true } });
    lastNumber = r?.runNumber ?? null;
  } else if (prefix === 'SO') {
    const r = await tx.stockOpname.findFirst({ where: { opnameNumber: startsWith }, orderBy: { opnameNumber: 'desc' }, select: { opnameNumber: true } });
    lastNumber = r?.opnameNumber ?? null;
  } else if (prefix === 'QO') {
    const r = await tx.quotation.findFirst({ where: { quotationNumber: startsWith }, orderBy: { quotationNumber: 'desc' }, select: { quotationNumber: true } });
    lastNumber = r?.quotationNumber ?? null;
  } else if (prefix === 'INQ') {
    const r = await tx.inquiry.findFirst({ where: { inquiryNumber: startsWith }, orderBy: { inquiryNumber: 'desc' }, select: { inquiryNumber: true } });
    lastNumber = r?.inquiryNumber ?? null;
  } else if (prefix === 'ST') {
    const r = await tx.stockTransfer.findFirst({ where: { transferNumber: startsWith }, orderBy: { transferNumber: 'desc' }, select: { transferNumber: true } });
    lastNumber = r?.transferNumber ?? null;
  } else if (prefix === 'DO') {
    const r = await tx.deliveryOrder.findFirst({ where: { doNumber: startsWith }, orderBy: { doNumber: 'desc' }, select: { doNumber: true } });
    lastNumber = r?.doNumber ?? null;
  } else if (prefix === 'STT') {
    const r = await tx.goodsReceipt.findFirst({ where: { sttNumber: startsWith }, orderBy: { sttNumber: 'desc' }, select: { sttNumber: true } });
    lastNumber = r?.sttNumber ?? null;
  } else if (prefix === 'PO') {
    const r = await tx.purchaseOrder.findFirst({ where: { poNumber: startsWith }, orderBy: { poNumber: 'desc' }, select: { poNumber: true } });
    lastNumber = r?.poNumber ?? null;
  } else if (prefix === 'PSN') {
    const r = await tx.salesOrder.findFirst({ where: { soNumber: startsWith }, orderBy: { soNumber: 'desc' }, select: { soNumber: true } });
    lastNumber = r?.soNumber ?? null;
  } else if (prefix === 'RN') {
    const r = await tx.salesReturn.findFirst({ where: { returnNumber: startsWith }, orderBy: { returnNumber: 'desc' }, select: { returnNumber: true } });
    lastNumber = r?.returnNumber ?? null;
  } else if (prefix === 'UJ') {
    const r = await tx.projectGuarantee.findFirst({ where: { guaranteeNumber: startsWith }, orderBy: { guaranteeNumber: 'desc' }, select: { guaranteeNumber: true } });
    lastNumber = r?.guaranteeNumber ?? null;
  } else {
    // JV, OB and any other journal-backed prefixes share journalEntry
    const r = await tx.journalEntry.findFirst({ where: { entryNumber: startsWith }, orderBy: { entryNumber: 'desc' }, select: { entryNumber: true } });
    lastNumber = r?.entryNumber ?? null;
  }

  // Parse the numeric suffix of the last used number; 0 when series is empty.
  // parseInt is resilient to a longer suffix (e.g. 5 digits once past 9999).
  let lastSeq = 0;
  if (lastNumber) {
    const suffix = lastNumber.slice(seriesPrefix.length);
    const parsed = parseInt(suffix, 10);
    if (!Number.isNaN(parsed)) lastSeq = parsed;
  }

  return `${prefix}-${yearMonth}-${String(lastSeq + 1).padStart(4, '0')}`;
}
