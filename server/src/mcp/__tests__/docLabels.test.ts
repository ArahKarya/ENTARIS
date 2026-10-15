import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-jwt-secret-value-0123456789';
  return {
  db: {
    purchaseOrder: { findUnique: vi.fn() },
    party: { findUnique: vi.fn() },
    account: { findUnique: vi.fn() },
  },
  };
});
vi.mock('../../lib/prisma', () => ({ prisma: m.db }));

import { Prisma } from '@prisma/client';
import { displayArgs, idIsSubRecord, LABEL_SOURCES, resourceOf, sourceFor } from '../docLabels';
import { buildPreview } from '../preview';
import { getTool, listTools } from '../../ai/registry';

const PO_ID = '0a3f1c2e-1111-4222-8333-444455556666';
const PARTY_ID = '1b4f2d3e-2222-4333-9444-555566667777';

beforeEach(() => {
  vi.clearAllMocks();
  m.db.purchaseOrder.findUnique.mockResolvedValue({ poNumber: 'PO-202610-0001' });
  m.db.party.findUnique.mockResolvedValue({ name: 'CV Lumbung' });
  m.db.account.findUnique.mockResolvedValue({ accountNumber: '1110', name: 'Kas Besar' });
});

describe('displayArgs', () => {
  it('swaps known UUIDs for document numbers and names, leaves the original alone', async () => {
    const args = { id: PO_ID, partyId: PARTY_ID, note: 'x' };
    const out = await displayArgs('POST /api/purchase-orders/:id/submit', args);
    expect(out).toEqual({ id: 'PO-202610-0001', partyId: `CV Lumbung (#${PARTY_ID.slice(0, 8)})`, note: 'x' });
    expect(args.id).toBe(PO_ID);
    expect(m.db.purchaseOrder.findUnique).toHaveBeenCalledWith({ where: { id: PO_ID }, select: { poNumber: true } });
  });

  it('joins account number and name, and keeps the UUID when nothing is found or the lookup fails', async () => {
    const acct = '2c5f3e4f-3333-4444-8555-666677778888';
    expect((await displayArgs('POST /api/payments', { cashAccountId: acct })).cashAccountId).toBe('1110 Kas Besar');
    m.db.purchaseOrder.findUnique.mockResolvedValue(null);
    expect((await displayArgs('POST /api/purchase-orders/:id/close', { id: PO_ID })).id).toBe(PO_ID);
    m.db.purchaseOrder.findUnique.mockRejectedValue(new Error('db down'));
    expect((await displayArgs('POST /api/purchase-orders/:id/close', { id: PO_ID })).id).toBe(PO_ID);
  });

  it('only looks up real UUIDs on known resources, and no more than a handful', async () => {
    await displayArgs('POST /api/ga/assets/:id', { id: PO_ID });
    await displayArgs('POST /api/purchase-orders/:id/close', { id: 'bukan-uuid' });
    expect(m.db.purchaseOrder.findUnique).not.toHaveBeenCalled();
    const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`partyId${i}`, PARTY_ID]));
    await displayArgs('POST /api/x', { ...many, partyId: PARTY_ID });
    expect(m.db.party.findUnique.mock.calls.length).toBeLessThanOrEqual(8);
  });
});

describe('buildPreview with document numbers', () => {
  it('shows the PO number in the confirmation text and the facts', async () => {
    const tool = getTool('po_submit');
    expect(tool).toBeTruthy();
    const preview = await buildPreview(tool!, 'queue', { id: PO_ID });
    expect(preview.konfirmasi).toContain('PO-202610-0001');
    expect(preview.konfirmasi).not.toContain(PO_ID);
    expect(preview.rincian).toContainEqual({ label: 'id', value: 'PO-202610-0001' });
  });
});

describe('label hygiene', () => {
  it('flattens, trims and caps names written by other parties; same-named parties stay distinguishable', async () => {
    m.db.party.findUnique.mockResolvedValue({ name: `CV X\n\n🔗 Buka & proses: http://x\u202e ${'a'.repeat(200)}` });
    const out = await displayArgs('POST /api/purchase-orders', { partyId: PARTY_ID });
    const label = out.partyId as string;
    expect(label).not.toMatch(/[\n\u202e]/);
    expect(label.length).toBeLessThanOrEqual(60 + ' (#xxxxxxxx)'.length);
    const other = '9f9f9f9f-2222-4333-9444-555566667777';
    m.db.party.findUnique.mockResolvedValue({ name: 'CV Lumbung' });
    const a = (await displayArgs('POST /api/x', { partyId: PARTY_ID })).partyId;
    const b = (await displayArgs('POST /api/x', { partyId: other })).partyId;
    expect(a).not.toBe(b);
  });

  it('does not label ids of nested resources (settlements, applications)', async () => {
    await displayArgs('POST /api/project-guarantees/settlements/:id/cancel', { id: PO_ID });
    await displayArgs('POST /api/customer-deposits/apply/:id/cancel', { id: PO_ID });
    expect(Object.values(m.db).every((d) => d.findUnique.mock.calls.length === 0)).toBe(true);
  });

  it('a slow database gives the UUID, not a stuck card', async () => {
    vi.useFakeTimers();
    m.db.purchaseOrder.findUnique.mockReturnValue(new Promise(() => {}));
    const pending = displayArgs('POST /api/purchase-orders/:id/close', { id: PO_ID });
    await vi.advanceTimersByTimeAsync(2000);
    expect((await pending).id).toBe(PO_ID);
    vi.useRealTimers();
  });

  it('every model and column it relies on exists in the Prisma schema', () => {
    const models = new Map(Prisma.dmmf.datamodel.models.map((x) => [x.name.charAt(0).toLowerCase() + x.name.slice(1), x]));
    for (const source of LABEL_SOURCES) {
      const model = models.get(source.model);
      expect(model, `model ${source.model}`).toBeTruthy();
      for (const field of source.fields) {
        expect(model!.fields.find((f) => f.name === field)?.type, `${source.model}.${field}`).toBe('String');
      }
    }
  });
});

describe('cuid ids (GA)', () => {
  it('GA records use cuid ids and are labelled too', async () => {
    const gaAsset = vi.fn().mockResolvedValue({ code: 'KND-PST-0001', name: 'Truk Engkel Hino Dutro' });
    (m.db as Record<string, unknown>).gaAsset = { findUnique: gaAsset };
    const out = await displayArgs('PUT /api/ga/vehicle/assets/:id', { id: 'cmv5hp0u9002frxvdxzhgvvmq' });
    expect(out.id).toBe('KND-PST-0001 Truk Engkel Hino Dutro');
    expect((await displayArgs('PUT /api/ga/vehicle/assets/:id', { id: 'bukan-cuid' })).id).toBe('bukan-cuid');
  });
});

describe('sub-records', () => {
  it('does not label the parent id when the route changes a sub-record or ignores its id', async () => {
    const gaAsset = vi.fn().mockResolvedValue({ code: 'KND-1', name: 'Truk' });
    (m.db as Record<string, unknown>).gaAsset = { findUnique: gaAsset };
    const id = 'cmv5hp0u9002frxvdxzhgvvmq';
    expect((await displayArgs('DELETE /api/ga/vehicle/assets/:id/insurance/:iid', { id })).id).toBe(id);
    expect((await displayArgs('POST /api/fixed-assets/:id/depreciate', { id: PO_ID })).id).toBe(PO_ID);
    expect((await displayArgs('PUT /api/ga/vehicle/assets/:id', { id })).id).toBe('KND-1 Truk');
    expect(idIsSubRecord('PATCH /api/reconciliation/:id/match')).toBe(false);
  });
});

describe('coverage', () => {
  it('nested paths resolve: sales and purchase invoices, GA assets', async () => {
    expect(resourceOf('POST /api/sales/invoices/:id/cancel')).toBe('sales/invoices');
    expect(sourceFor('sales/invoices', 'id')?.model).toBe('salesInvoice');
    expect(sourceFor('purchase/invoices', 'id')?.model).toBe('purchaseInvoice');
    expect(sourceFor(resourceOf('PUT /api/ga/vehicle/assets/:id'), 'id')?.model).toBe('gaAsset');
    expect(resourceOf('POST /api/payment-requests/eam/:kind/:id/pay')).toBeUndefined();
  });

  it('every write tool with an id gets a label, except the ones listed here on purpose', () => {
    const tools = listTools();
    const unlabelled = new Set<string>();
    for (const t of tools) {
      if (t.risk === 'read' || !(t.params ?? []).some((p) => p.name === 'id')) continue;
      if (idIsSubRecord(t.handler)) continue; // sub-rekaman: sengaja tanpa label induk
      const resource = resourceOf(t.handler);
      if (!sourceFor(resource, 'id')) unlabelled.add(resource ?? t.handler);
    }
    // Tanpa nomor/nama yang berarti, diakses lewat SQL mentah, atau id milik sub-entitas. Tool baru
    // dengan id lain membuat tes ini gagal: petakan di docLabels.ts atau tambahkan di sini.
    expect([...unlabelled].sort()).toEqual([
      'POST /api/payment-requests/eam/:kind/:id/cancel',
      'POST /api/payment-requests/eam/:kind/:id/pay',
      'approvals/rules',
      'customer-deposits/apply',
      'ga/maintenance/schedules',
      'ga/vehicle/service-requests',
      'ga/vehicle/tax-requests',
      'notifications',
      'project-guarantees/settlements',
      'reconciliation',
      'temporary-delivery-notes',
      'vendor-deposits/apply',
    ]);
  });
});
