import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-jwt-secret-value-0123456789';
  const state = { present: {} as Record<string, Set<string>>, dbDown: false, lookups: [] as string[] };
  const finder = (model: string) => ({
    findMany: async (a: { where: { id: { in: string[] } } }) => {
      state.lookups.push(model);
      if (state.dbDown) throw new Error('db down');
      return a.where.id.in.filter((id) => state.present[model]?.has(id)).map((id) => ({ id }));
    },
  });
  return {
    state,
    finder,
    can: vi.fn(),
    hasCap: vi.fn(),
    callHandler: vi.fn(),
    queueToolCall: vi.fn(),
    recordCall: vi.fn().mockResolvedValue(undefined),
    claimIdempotency: vi.fn(),
    finishClaimed: vi.fn().mockResolvedValue(undefined),
    releaseClaim: vi.fn().mockResolvedValue(undefined),
    overrides: [] as Array<{ toolName: string; enabled: boolean | null; tier: string | null }>,
  };
});

vi.mock('../../lib/prisma', () => ({
  prisma: {
    aiToolConfig: { findMany: async () => m.overrides },
    party: m.finder('party'),
    account: m.finder('account'),
    salesInvoice: m.finder('salesInvoice'),
    purchaseInvoice: m.finder('purchaseInvoice'),
    payment: m.finder('payment'),
  },
}));
vi.mock('../../services/permissionService', () => ({ can: m.can, hasCap: m.hasCap }));
vi.mock('../execute', async () => ({ ...(await vi.importActual<typeof import('../execute')>('../execute')), callHandler: m.callHandler }));
vi.mock('../queue', () => ({ queueToolCall: m.queueToolCall }));
vi.mock('../callLog', async () => ({
  ...(await vi.importActual<typeof import('../callLog')>('../callLog')),
  recordCall: m.recordCall,
  claimIdempotency: m.claimIdempotency,
  finishClaimed: m.finishClaimed,
  releaseClaim: m.releaseClaim,
}));

import { handleToolCall, type CallContext } from '../callTool';

const PARTY = '8e836864-57b1-4c6a-ad34-14dfe6cc5eb1';
const ACCOUNT = '950d343c-d125-49d9-b07d-f8ad77a548eb';
const INVOICE = 'a03944b8-0e09-46f1-9c1d-bef7ec64f4ec';
const GHOST = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const actor = {
  id: 'u1', fullName: 'Budi', email: 'b@x', role: 'Accountant', airaTier: 'standard', airaJabatan: 'Kasir', channel: 'whatsapp' as const, groupFloor: false,
};
const ctx = (): CallContext => ({ token: { id: 't1', name: 'aira-dev' } as never, actor: actor as never, clientIp: '100.64.0.1' } as never);
const sc = (r: any) => r.structuredContent;
const PAY = { date: '2026-10-25', amount: 1000, paymentType: 'Receive', partyId: PARTY, accountId: ACCOUNT };

beforeEach(() => {
  vi.clearAllMocks();
  m.overrides = [];
  m.state.dbDown = false;
  m.state.lookups = [];
  m.state.present = { party: new Set([PARTY]), account: new Set([ACCOUNT]), salesInvoice: new Set([INVOICE]), purchaseInvoice: new Set(), payment: new Set() };
  m.can.mockResolvedValue(true);
  m.hasCap.mockResolvedValue(true);
  m.callHandler.mockResolvedValue({ status: 200, ok: true, body: { kind: 'json', data: { ok: 1 } } });
  m.claimIdempotency.mockResolvedValue({ kind: 'claimed', id: 'c1' });
  m.queueToolCall.mockResolvedValue({ approvalId: 'apr-1', confirm: 'Catat pembayaran. Setujui?' });
});

describe('pra-cek ID: bentuk (lapis 1)', () => {
  it('partyId berupa nama → ditolak, TIDAK masuk antrean, tidak ada notifikasi', async () => {
    const r = await handleToolCall(ctx(), 'pay_record', { ...PAY, partyId: 'Hermanto' });
    expect(r.isError).toBe(true);
    expect(String(sc(r).error)).toContain('party_search');
    expect(m.queueToolCall).not.toHaveBeenCalled();
    expect(m.callHandler).not.toHaveBeenCalled();
  });

  it('accountId berupa nama akun → ditolak (kasus #1 laporan)', async () => {
    const r = await handleToolCall(ctx(), 'pay_record', { ...PAY, accountId: 'Bank BCA' });
    expect(r.isError).toBe(true);
    expect(String(sc(r).error)).toContain('coa_flat');
    expect(m.queueToolCall).not.toHaveBeenCalled();
  });

  it('allocations[].invoiceId berupa nomor dokumen → ditolak (kasus #2 laporan)', async () => {
    const r = await handleToolCall(ctx(), 'pay_record', { ...PAY, allocations: [{ invoiceType: 'SalesInvoice', invoiceId: 'SI-202610-0053', amount: 1000 }] });
    expect(r.isError).toBe(true);
    expect(String(sc(r).error)).toContain('si_list');
    expect(m.queueToolCall).not.toHaveBeenCalled();
  });

  it('pratinjau_tool memberi penolakan yang sama (jalur bersama)', async () => {
    const r = await handleToolCall(ctx(), 'pratinjau_tool', { tool: 'pay_record', args: { ...PAY, partyId: 'Hermanto' } });
    expect(r.isError).toBe(true);
    expect(String(sc(r).error)).toContain('party_search');
  });

  it('ID valid dan ada → diantre seperti biasa (critical, aktor standar)', async () => {
    const r = await handleToolCall(ctx(), 'pay_record', { ...PAY, allocations: [{ invoiceType: 'SalesInvoice', invoiceId: INVOICE, amount: 1000 }] });
    expect(r.isError).toBe(false);
    expect(sc(r).status).toBe('pending_approval');
    expect(m.queueToolCall).toHaveBeenCalledTimes(1);
  });
});

describe('pra-cek ID: keberadaan (lapis 2)', () => {
  it('UUID benar tetapi tidak ada di DB → ditolak 404-style, tidak diantre', async () => {
    const r = await handleToolCall(ctx(), 'pay_record', { ...PAY, partyId: GHOST });
    expect(r.isError).toBe(true);
    expect(String(sc(r).error)).toContain('tidak ditemukan sebagai pelanggan/pemasok');
    expect(m.queueToolCall).not.toHaveBeenCalled();
  });

  it('invoiceId dicek terhadap model sesuai invoiceType (pembelian ≠ penjualan)', async () => {
    const r = await handleToolCall(ctx(), 'pay_record', { ...PAY, allocations: [{ invoiceType: 'PurchaseInvoice', invoiceId: INVOICE, amount: 1 }] });
    expect(r.isError).toBe(true);
    expect(String(sc(r).error)).toContain('invoice pembelian');
  });

  it('beberapa ID dicek satu query per model (batch)', async () => {
    await handleToolCall(ctx(), 'pay_record', { ...PAY, splits: [{ accountId: ACCOUNT, amount: 1 }, { accountId: ACCOUNT, amount: 2 }] });
    expect(m.state.lookups.filter((x) => x === 'account')).toHaveLength(1);
  });

  it('DB bermasalah → gagal-terbuka: panggilan tetap diproses handler', async () => {
    m.state.dbDown = true;
    const r = await handleToolCall(ctx(), 'pay_record', PAY);
    expect(r.isError).toBe(false);
    expect(m.queueToolCall).toHaveBeenCalledTimes(1);
  });

  it('tool baca tidak memicu pencarian DB sama sekali', async () => {
    await handleToolCall(ctx(), 'party_search', { search: 'Hermanto' });
    expect(m.state.lookups).toEqual([]);
  });
});
