import { describe, it, expect, vi } from 'vitest';
import { generateDocumentNumber } from '../documentNumber';

/**
 * Factory: builds a minimal Prisma transaction mock where each model returns a
 * configurable "last used number" (or null when the series is empty).
 * Strategy under test: MAX(existing number) + 1 — immune to deleted/backdated rows.
 */
function makeTx(last: { si?: string | null; pi?: string | null; pay?: string | null; jv?: string | null; sm?: string | null; stt?: string | null } = {}) {
  const model = (field: string, value: string | null | undefined) => ({
    findFirst: vi.fn().mockResolvedValue(value ? { [field]: value } : null),
  });
  return {
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    salesInvoice: model('invoiceNumber', last.si),
    purchaseInvoice: model('invoiceNumber', last.pi),
    payment: model('paymentNumber', last.pay),
    journalEntry: model('entryNumber', last.jv),
    stockMovement: model('movementNumber', last.sm),
    goodsReceipt: model('sttNumber', last.stt),
  } as any;
}

const FISCAL_YEAR_ID = 'fy-2026';
const MARCH_2026 = new Date('2026-03-15');

describe('generateDocumentNumber — format', () => {
  it('generates SI-202603-0001 for first sales invoice in March 2026', async () => {
    const tx = makeTx({ si: null });
    const num = await generateDocumentNumber(tx, 'SI', MARCH_2026, FISCAL_YEAR_ID);
    expect(num).toBe('SI-202603-0001');
  });

  it('generates PI-202603-0003 when last used is PI-202603-0002', async () => {
    const tx = makeTx({ pi: 'PI-202603-0002' });
    const num = await generateDocumentNumber(tx, 'PI', MARCH_2026, FISCAL_YEAR_ID);
    expect(num).toBe('PI-202603-0003');
  });

  it('generates PAY-202603-0010 when last used is PAY-202603-0009', async () => {
    const tx = makeTx({ pay: 'PAY-202603-0009' });
    const num = await generateDocumentNumber(tx, 'PAY', MARCH_2026, FISCAL_YEAR_ID);
    expect(num).toBe('PAY-202603-0010');
  });

  it('generates JV-202601-0001 for first journal entry in January', async () => {
    const tx = makeTx({ jv: null });
    const jan = new Date('2026-01-05');
    const num = await generateDocumentNumber(tx, 'JV', jan, FISCAL_YEAR_ID);
    expect(num).toBe('JV-202601-0001');
  });

  it('pads sequence to 4 digits', async () => {
    const tx = makeTx({ si: 'SI-202603-0009' });
    const num = await generateDocumentNumber(tx, 'SI', MARCH_2026, FISCAL_YEAR_ID);
    expect(num).toBe('SI-202603-0010');
  });

  it('handles sequence ≥ 1000 without truncation', async () => {
    const tx = makeTx({ jv: 'JV-202603-0999' });
    const num = await generateDocumentNumber(tx, 'JV', MARCH_2026, FISCAL_YEAR_ID);
    expect(num).toBe('JV-202603-1000');
  });

  it('handles 5-digit suffix once series passes 9999', async () => {
    const tx = makeTx({ jv: 'JV-202603-10000' });
    const num = await generateDocumentNumber(tx, 'JV', MARCH_2026, FISCAL_YEAR_ID);
    expect(num).toBe('JV-202603-10001');
  });
});

describe('generateDocumentNumber — regression: MAX+1 vs deleted/backdated rows', () => {
  // Real-world bug (PMD prod, Jul 2026): count(month)=114 but max=SM-202607-0134
  // → count+1 collided with existing numbers → P2002 "Data duplikat terdeteksi".
  it('continues after the MAX even when rows were deleted (gap in series)', async () => {
    // 20 rows deleted → hypothetical count would be 114, but max is 0134.
    const tx = makeTx({ sm: 'SM-202607-0134' });
    const july = new Date('2026-07-03');
    const num = await generateDocumentNumber(tx, 'SM', july, FISCAL_YEAR_ID);
    expect(num).toBe('SM-202607-0135'); // NOT 0115 (count-based would collide)
  });

  it('starts a fresh month at 0001 regardless of other months', async () => {
    // findFirst filters by startsWith `STT-202608-` → empty series → null.
    const tx = makeTx({ stt: null });
    const aug = new Date('2026-08-01');
    const num = await generateDocumentNumber(tx, 'STT', aug, FISCAL_YEAR_ID);
    expect(num).toBe('STT-202608-0001');
  });
});

describe('generateDocumentNumber — model routing', () => {
  it('queries salesInvoice.findFirst for prefix SI with series filter', async () => {
    const tx = makeTx();
    await generateDocumentNumber(tx, 'SI', MARCH_2026, FISCAL_YEAR_ID);
    expect(tx.salesInvoice.findFirst).toHaveBeenCalledWith({
      where: { invoiceNumber: { startsWith: 'SI-202603-' } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });
    expect(tx.purchaseInvoice.findFirst).not.toHaveBeenCalled();
  });

  it('queries purchaseInvoice.findFirst for prefix PI', async () => {
    const tx = makeTx();
    await generateDocumentNumber(tx, 'PI', MARCH_2026, FISCAL_YEAR_ID);
    expect(tx.purchaseInvoice.findFirst).toHaveBeenCalled();
    expect(tx.salesInvoice.findFirst).not.toHaveBeenCalled();
  });

  it('queries payment.findFirst for prefix PAY', async () => {
    const tx = makeTx();
    await generateDocumentNumber(tx, 'PAY', MARCH_2026, FISCAL_YEAR_ID);
    expect(tx.payment.findFirst).toHaveBeenCalled();
  });

  it('queries journalEntry.findFirst for prefix JV', async () => {
    const tx = makeTx();
    await generateDocumentNumber(tx, 'JV', MARCH_2026, FISCAL_YEAR_ID);
    expect(tx.journalEntry.findFirst).toHaveBeenCalled();
  });

  it('acquires advisory lock before querying the series', async () => {
    const tx = makeTx();
    await generateDocumentNumber(tx, 'SI', MARCH_2026, FISCAL_YEAR_ID);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    const lockCallOrder = tx.$executeRaw.mock.invocationCallOrder[0];
    const queryCallOrder = tx.salesInvoice.findFirst.mock.invocationCallOrder[0];
    expect(lockCallOrder).toBeLessThan(queryCallOrder);
  });
});
