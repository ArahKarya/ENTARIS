import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  checkPurchaseOrderClosable,
  checkPurchaseOrderEditable,
  derivePurchaseOrderReceiptStatus,
  remainingQty,
  resolvePoItemLinks,
} from '../purchaseOrderRules';

const open = { status: 'Submitted', closedAt: null };
const line = (quantity: number | string, qtyReceived: number | string) => ({ quantity, qtyReceived });

describe('derivePurchaseOrderReceiptStatus', () => {
  it('is Unreceived when nothing was received (or there are no items)', () => {
    expect(derivePurchaseOrderReceiptStatus(open, [line(10, 0), line(5, 0)])).toBe('Unreceived');
    expect(derivePurchaseOrderReceiptStatus(open, [])).toBe('Unreceived');
  });

  it('is Partial when some, but not every line is fully received', () => {
    expect(derivePurchaseOrderReceiptStatus(open, [line(10, 4), line(5, 0)])).toBe('Partial');
    expect(derivePurchaseOrderReceiptStatus(open, [line(10, 10), line(5, 4.999)])).toBe('Partial');
  });

  it('is Full when every line is received, over-receipt included', () => {
    expect(derivePurchaseOrderReceiptStatus(open, [line(10, 10), line(5, 6)])).toBe('Full');
  });

  it('accepts Prisma Decimals and decimal strings', () => {
    const items = [{ quantity: new Prisma.Decimal('2.5'), qtyReceived: new Prisma.Decimal('2.500') }];
    expect(derivePurchaseOrderReceiptStatus(open, items)).toBe('Full');
    expect(derivePurchaseOrderReceiptStatus(open, [line('1.000', '0.250')])).toBe('Partial');
  });

  it('Cancelled wins over Closed, Closed wins over item progress', () => {
    const closedAt = new Date('2026-10-01');
    expect(derivePurchaseOrderReceiptStatus({ status: 'Cancelled', closedAt }, [line(1, 1)])).toBe('Cancelled');
    expect(derivePurchaseOrderReceiptStatus({ status: 'Submitted', closedAt }, [line(10, 3)])).toBe('Closed');
  });
});

describe('remainingQty', () => {
  it('never goes negative', () => {
    expect(remainingQty(line(10, 4))).toBe(6);
    expect(remainingQty(line(10, 12))).toBe(0);
  });
});

describe('checkPurchaseOrderEditable', () => {
  const base = { ...open, items: [{ qtyReceived: 0 }], linkedReceiptCount: 0, linkedInvoiceCount: 0 };

  it('allows an open PO with nothing linked', () => {
    expect(checkPurchaseOrderEditable(base)).toEqual({ ok: true });
  });

  it.each([
    ['cancelled', { status: 'Cancelled' }, 'dibatalkan'],
    ['closed', { closedAt: new Date() }, 'ditutup'],
    ['linked STT', { linkedReceiptCount: 1 }, 'STT'],
    ['received qty', { items: [{ qtyReceived: '0.5' }] }, 'STT'],
    ['linked PI', { linkedInvoiceCount: 2 }, 'Purchase Invoice'],
  ])('blocks a %s PO with a clear message', (_label, patch, fragment) => {
    const r = checkPurchaseOrderEditable({ ...base, ...patch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(fragment);
  });
});

describe('checkPurchaseOrderClosable', () => {
  const partial = { ...open, items: [line(10, 4)] };

  it('allows closing an open, not fully received PO with a reason', () => {
    expect(checkPurchaseOrderClosable(partial, 'Supplier stop kirim')).toEqual({ ok: true });
    expect(checkPurchaseOrderClosable({ ...open, items: [line(10, 0)] }, 'Batal sisa')).toEqual({ ok: true });
  });

  it('requires a trimmed reason of 5..500 chars', () => {
    expect(checkPurchaseOrderClosable(partial, '   ab  ').ok).toBe(false);
    expect(checkPurchaseOrderClosable(partial, undefined).ok).toBe(false);
    expect(checkPurchaseOrderClosable(partial, 'x'.repeat(501)).ok).toBe(false);
  });

  it('rejects cancelled, already closed and fully received POs', () => {
    expect(checkPurchaseOrderClosable({ ...partial, status: 'Cancelled' }, 'alasan ok').ok).toBe(false);
    expect(checkPurchaseOrderClosable({ ...partial, closedAt: new Date() }, 'alasan ok').ok).toBe(false);
    expect(checkPurchaseOrderClosable({ ...open, items: [line(10, 10)] }, 'alasan ok').ok).toBe(false);
  });
});

describe('resolvePoItemLinks', () => {
  const err = (l: { itemName?: string | null }) => new Error(`ambigu ${l.itemName}`);
  const poItems = [
    { id: 'poi-1', inventoryItemId: 'inv-sekam' },
    { id: 'poi-2', inventoryItemId: 'inv-solar' },
  ];

  it('links an unlinked line to the single PO line with the same inventory item', () => {
    expect(resolvePoItemLinks([{ inventoryItemId: 'inv-sekam' }], poItems, err)).toEqual(['poi-1']);
  });

  it('keeps an explicit link untouched', () => {
    expect(resolvePoItemLinks([{ inventoryItemId: 'inv-sekam', purchaseOrderItemId: 'poi-2' }], poItems, err)).toEqual(['poi-2']);
  });

  it('leaves lines outside the PO unlinked', () => {
    expect(resolvePoItemLinks([{ inventoryItemId: 'inv-lain' }], poItems, err)).toEqual([null]);
  });

  it('rejects when the PO has the same item on two lines', () => {
    const dup = [...poItems, { id: 'poi-3', inventoryItemId: 'inv-sekam' }];
    expect(() => resolvePoItemLinks([{ inventoryItemId: 'inv-sekam', itemName: 'Sekam' }], dup, err)).toThrow('ambigu Sekam');
  });

  it('handles several STT lines of one item (9 trucks) each linking to the same PO line', () => {
    const r = resolvePoItemLinks(Array.from({ length: 3 }, () => ({ inventoryItemId: 'inv-sekam' })), poItems, err);
    expect(r).toEqual(['poi-1', 'poi-1', 'poi-1']);
  });
});
