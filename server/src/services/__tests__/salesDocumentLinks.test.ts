import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../utils/fiscalYear', () => ({ getOpenFiscalYear: vi.fn(async () => ({ id: 'fy-1' })) }));

import {
  assertQuotationLinkable,
  assertSalesOrderLinkable,
  resolveSalesOrderQuotationId,
} from '../salesDocumentLinks';
import { createTemporaryNoteInTx, updateTemporaryNoteInTx } from '../temporaryDeliveryNote';

type Tx = Parameters<typeof assertQuotationLinkable>[0];

const quotationTx = (q: { quotationNumber: string; partyId: string; status: string } | null) =>
  ({ quotation: { findUnique: vi.fn(async () => q) } }) as unknown as Tx;
const soTx = (so: { soNumber: string; partyId: string; status: string } | null) =>
  ({ salesOrder: { findUnique: vi.fn(async () => so) } }) as unknown as Tx;

describe('assertQuotationLinkable', () => {
  it('accepts an Accepted quotation of the same customer', async () => {
    await expect(
      assertQuotationLinkable(quotationTx({ quotationNumber: 'QTN-1', partyId: 'c1', status: 'Accepted' }), 'q1', 'c1'),
    ).resolves.toBeUndefined();
  });
  it('rejects missing, other-customer and not-accepted quotations', async () => {
    await expect(assertQuotationLinkable(quotationTx(null), 'q1', 'c1')).rejects.toThrow('tidak ditemukan');
    await expect(
      assertQuotationLinkable(quotationTx({ quotationNumber: 'QTN-1', partyId: 'c2', status: 'Accepted' }), 'q1', 'c1'),
    ).rejects.toThrow('customer lain');
    await expect(
      assertQuotationLinkable(quotationTx({ quotationNumber: 'QTN-1', partyId: 'c1', status: 'Sent' }), 'q1', 'c1'),
    ).rejects.toThrow('belum diterima');
  });
});

describe('resolveSalesOrderQuotationId', () => {
  const tx = quotationTx({ quotationNumber: 'QTN-1', partyId: 'c1', status: 'Expired' });
  it('keeps the current link when the field is omitted on edit', async () => {
    expect(await resolveSalesOrderQuotationId(tx, undefined, 'q1', 'c1')).toBe('q1');
  });
  it('clears with null and keeps an unchanged link without the status check', async () => {
    expect(await resolveSalesOrderQuotationId(tx, null, 'q1', 'c1')).toBeNull();
    expect(await resolveSalesOrderQuotationId(tx, 'q1', 'q1', 'c1')).toBe('q1');
  });
  it('validates a new link and a customer change', async () => {
    await expect(resolveSalesOrderQuotationId(tx, 'q2', 'q1', 'c1')).rejects.toThrow('belum diterima');
    await expect(resolveSalesOrderQuotationId(tx, 'q1', 'q1', 'c9')).rejects.toThrow('customer lain');
  });
});

describe('assertSalesOrderLinkable', () => {
  it('rejects other-customer and cancelled SOs, unless the link is kept', async () => {
    await expect(assertSalesOrderLinkable(soTx({ soNumber: 'PSN-1', partyId: 'c1', status: 'Submitted' }), 's1', 'c1')).resolves.toBeUndefined();
    await expect(assertSalesOrderLinkable(soTx(null), 's1', 'c1')).rejects.toThrow('tidak ditemukan');
    await expect(assertSalesOrderLinkable(soTx({ soNumber: 'PSN-1', partyId: 'c2', status: 'Submitted' }), 's1', 'c1')).rejects.toThrow('customer lain');
    const cancelled = soTx({ soNumber: 'PSN-1', partyId: 'c1', status: 'Cancelled' });
    await expect(assertSalesOrderLinkable(cancelled, 's1', 'c1')).rejects.toThrow('dibatalkan');
    await expect(assertSalesOrderLinkable(cancelled, 's1', 'c1', { keptLink: true })).resolves.toBeUndefined();
  });
});

describe('temporary delivery note sales order link', () => {
  function tdnTx(so: { soNumber: string; partyId: string; status: string } | null, current: string | null = null) {
    const executeRaw = vi.fn(async (..._args: unknown[]) => 1);
    const queryRaw = vi.fn(async (sql: TemplateStringsArray) => {
      const text = sql.join('?');
      if (text.includes('FOR UPDATE')) return [{ status: 'Open', sales_order_id: current }];
      if (text.includes('SELECT number')) return [];
      if (text.includes('FROM temporary_delivery_notes t')) return [{ id: 'n1', salesOrderId: so ? 's1' : null, soNumber: so?.soNumber ?? null }];
      return [];
    });
    const tx = {
      $executeRaw: executeRaw,
      $queryRaw: queryRaw,
      party: { findUnique: vi.fn(async () => ({ id: 'c1', name: 'Toko A', isActive: true, partyType: 'Customer' })) },
      inventoryItem: { findUnique: vi.fn(async () => ({ id: 'inv-1', name: 'Beras', unit: 'Kg' })) },
      salesOrder: { findUnique: vi.fn(async () => so) },
    } as unknown as Parameters<typeof createTemporaryNoteInTx>[0];
    return { tx, executeRaw };
  }
  const body = {
    date: '2026-10-10',
    partyId: 'c1',
    salesOrderId: 's1',
    items: [{ inventoryItemId: 'inv-1', quantity: 5 }],
  };

  it('saves sales_order_id on create and returns the SO number', async () => {
    const { tx, executeRaw } = tdnTx({ soNumber: 'PSN-1', partyId: 'c1', status: 'Submitted' });
    const note = await createTemporaryNoteInTx(tx, body, 'u1');
    const insert = executeRaw.mock.calls.find((c) =>
      (c[0] as string[]).join('?').includes('INSERT INTO temporary_delivery_notes'),
    ) as unknown[];
    expect(insert.slice(1)).toContain('s1');
    expect(note).toMatchObject({ salesOrderId: 's1', soNumber: 'PSN-1' });
  });

  it('rejects an SO of another customer on create', async () => {
    const { tx } = tdnTx({ soNumber: 'PSN-9', partyId: 'c2', status: 'Submitted' });
    await expect(createTemporaryNoteInTx(tx, body, 'u1')).rejects.toThrow('customer lain');
  });

  it('keeps a link to an SO cancelled later when editing', async () => {
    const { tx } = tdnTx({ soNumber: 'PSN-1', partyId: 'c1', status: 'Cancelled' }, 's1');
    await expect(updateTemporaryNoteInTx(tx, 'n1', body)).resolves.toMatchObject({ salesOrderId: 's1' });
  });
});
