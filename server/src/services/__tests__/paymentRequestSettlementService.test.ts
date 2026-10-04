import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/documentNumber', () => ({ generateDocumentNumber: vi.fn(async (_tx, prefix: string) => `${prefix}-202610-0001`) }));
vi.mock('../../utils/accountBalance', () => ({ updateBalancesForItems: vi.fn(async () => undefined) }));
vi.mock('../gaFinance', () => ({ cancelJournalInTx: vi.fn(async () => undefined) }));

import { cancelJournalInTx } from '../gaFinance';
import {
  approveSettlementInTx,
  cancelSettlementPostingInTx,
  postSettlementInTx,
  previewSettlementInTx,
  returnSettlementInTx,
  saveSettlementDraftInTx,
  submitSettlementInTx,
} from '../paymentRequestSettlementService';
import type { Actor } from '../paymentRequestRules';

const finance: Actor = { id: 'u-fin', role: 'Accountant', isSuperAdmin: false, isFinance: true };
const requester: Actor = { id: 'u-req', role: 'StaffProduksi', isSuperAdmin: false, isFinance: false };
const supervisor: Actor = { id: 'u-sup', role: 'Viewer', isSuperAdmin: false, isFinance: false };

function makeRequest(over: Record<string, unknown> = {}) {
  return {
    id: 'pr-1',
    number: 'PP-202610-0001',
    status: 'PAID',
    requesterId: 'u-req',
    supervisorId: 'u-sup',
    settlementSupervisorId: 'u-sup',
    directorRole: null,
    totalAmount: { toString: () => '1000000' },
    purpose: 'Dinas ke Surabaya',
    settlementStatus: 'OPEN',
    settlementRealized: null,
    settlementJournalId: null,
    journalEntryId: 'je-pay',
    paymentDate: new Date('2026-10-05T00:00:00.000Z'),
    type: { kind: 'TRAVEL', requiresSettlement: true, defaultExpenseAccountId: null },
    ...over,
  };
}

type Row = { id: string; description: string; amount: string; expenseAccountId: string | null; lineNo?: number };

function makeTx(pr: ReturnType<typeof makeRequest>, opts: { lines?: Row[]; fiscalYear?: object | null; claimCount?: number; supervisor?: object | null } = {}) {
  const lines: Row[] = opts.lines ?? [{ id: 's1', description: 'Tiket', amount: '700000', expenseAccountId: 'acc-6.10' }];
  const journalCreate = vi.fn(async ({ data }: { data: { items: { create: Array<Record<string, number | string>> } } }) => ({
    id: 'je-set',
    entryNumber: 'JV-202610-0001',
    items: data.items.create.map((i, n) => ({ id: `ji-${n}`, ...i })),
  }));
  return {
    paymentRequest: {
      findUnique: vi.fn(async () => pr),
      findUniqueOrThrow: vi.fn(async () => ({ ...pr, settlementRealized: lines.reduce((t, l) => t + Number(l.amount), 0).toFixed(2) })),
      updateMany: vi.fn(async (_args: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({ count: opts.claimCount ?? 1 })),
      update: vi.fn(async () => pr),
    },
    paymentRequestLine: { findMany: vi.fn(async () => [{ id: 'p1', expenseAccountId: 'acc-6.20' }]) },
    paymentRequestSettlementLine: {
      findMany: vi.fn(async () => lines.map((l, i) => ({ lineNo: i + 1, ...l, amount: { toString: () => l.amount } }))),
      deleteMany: vi.fn(async () => ({ count: lines.length })),
      createMany: vi.fn(async (_args: { data: Array<Record<string, unknown>> }) => ({ count: 1 })),
      update: vi.fn(async () => ({})),
    },
    paymentRequestHistory: { create: vi.fn(async (_args: { data: Record<string, unknown> }) => ({})) },
    user: { findUnique: vi.fn(async () => ({ supervisor: opts.supervisor === undefined ? { id: 'u-sup', isActive: true } : opts.supervisor })) },
    journalItem: { findFirst: vi.fn(async () => ({ accountId: 'acc-adv' })) },
    account: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        isGroup: false,
        isActive: true,
        accountNumber: where.id === 'acc-cash' ? '1.1.2' : '6.10',
        accountType: where.id === 'acc-cash' ? 'ASSET' : 'EXPENSE',
        name: 'x',
      })),
      findMany: vi.fn(async (): Promise<Array<{ id: string; accountNumber: string; name: string }>> => []),
    },
    systemAccountMapping: { count: vi.fn(async () => 1), findFirst: vi.fn(async () => ({ accountId: 'acc-adv' })) },
    fiscalYear: { findFirst: vi.fn(async () => (opts.fiscalYear === undefined ? { id: 'fy-2026' } : opts.fiscalYear)) },
    journalEntry: { create: journalCreate, findUnique: vi.fn(async () => ({ fiscalYear: { isClosed: false } })) },
    accountingLedgerEntry: { createMany: vi.fn(async () => ({ count: 2 })) },
  };
}
const asTx = (tx: unknown) => tx as Parameters<typeof submitSettlementInTx>[0];
const claimed = (tx: ReturnType<typeof makeTx>) => tx.paymentRequest.updateMany.mock.calls[0]![0];
const journalItems = (tx: ReturnType<typeof makeTx>) => tx.journalEntry.create.mock.calls[0]![0].data.items.create;

beforeEach(() => vi.clearAllMocks());

describe('settlement state machine', () => {
  it('save draft keeps the status, fills the default account from the planned line and replaces the lines', async () => {
    const tx = makeTx(makeRequest());
    await saveSettlementDraftInTx(asTx(tx), 'pr-1', requester, {
      note: 'Selesai',
      deadline: '2026-10-25',
      lines: [{ description: 'Tiket', amount: 700000, plannedLineId: 'p1', category: 'TRANSPORT' }],
    });
    expect(claimed(tx).where).toEqual({ id: 'pr-1', status: 'PAID', settlementStatus: { in: ['OPEN'] } });
    expect(claimed(tx).data).not.toHaveProperty('settlementStatus');
    expect(tx.paymentRequestSettlementLine.createMany.mock.calls[0]![0].data[0]).toMatchObject({ expenseAccountId: 'acc-6.20', category: 'TRANSPORT' });
  });

  it('only the requester can save the draft, and not while it waits for approval', async () => {
    await expect(saveSettlementDraftInTx(asTx(makeTx(makeRequest())), 'pr-1', supervisor, { lines: [] })).rejects.toThrow(/pengaju/);
    await expect(saveSettlementDraftInTx(asTx(makeTx(makeRequest({ settlementStatus: 'SUBMITTED' }))), 'pr-1', requester, { lines: [] })).rejects.toThrow(/diubah/);
  });

  it('submit with a supervisor → SUBMITTED, snapshot supervisor, notify them', async () => {
    const tx = makeTx(makeRequest());
    const out = await submitSettlementInTx(asTx(tx), 'pr-1', requester);
    expect(claimed(tx).data).toMatchObject({ settlementStatus: 'SUBMITTED', settlementSupervisorId: 'u-sup', settlementRealized: '700000.00' });
    expect(out.events[0]).toMatchObject({ kind: 'settlement_pending_supervisor', supervisorId: 'u-sup', amount: 700000 });
    expect(tx.paymentRequestHistory.create.mock.calls[0]![0].data).toMatchObject({ action: 'SETTLE_SUBMIT', fromStatus: 'OPEN', toStatus: 'SUBMITTED' });
  });

  it('submit without a supervisor goes straight to finance; resubmit after REVISION works', async () => {
    const tx = makeTx(makeRequest({ settlementStatus: 'REVISION' }), { supervisor: null });
    const out = await submitSettlementInTx(asTx(tx), 'pr-1', requester);
    expect(claimed(tx).data).toMatchObject({ settlementStatus: 'PENDING_FINANCE', settlementSupervisorId: null });
    expect(out.events[0]!.kind).toBe('settlement_pending_finance');
  });

  it('submit refuses an empty settlement and a non-requester', async () => {
    await expect(submitSettlementInTx(asTx(makeTx(makeRequest(), { lines: [] })), 'pr-1', requester)).rejects.toThrow(/minimal satu/);
    await expect(submitSettlementInTx(asTx(makeTx(makeRequest())), 'pr-1', finance)).rejects.toThrow(/pengaju/);
  });

  it('a lost race (claim count 0) is reported as a stale status', async () => {
    await expect(submitSettlementInTx(asTx(makeTx(makeRequest(), { claimCount: 0 })), 'pr-1', requester)).rejects.toThrow(/sudah berubah/);
  });

  it('supervisor approves → PENDING_FINANCE; the claim is conditional on SUBMITTED', async () => {
    const tx = makeTx(makeRequest({ settlementStatus: 'SUBMITTED' }));
    const out = await approveSettlementInTx(asTx(tx), 'pr-1', supervisor, 'OK');
    expect(claimed(tx).where.settlementStatus).toEqual({ in: ['SUBMITTED'] });
    expect(claimed(tx).data).toMatchObject({ settlementStatus: 'PENDING_FINANCE', settlementLastNote: 'OK' });
    expect(out.events[0]!.kind).toBe('settlement_pending_finance');
  });

  it('self-approval is blocked at both steps, even for finance', async () => {
    const own = makeRequest({ settlementStatus: 'SUBMITTED', requesterId: 'u-sup' });
    await expect(approveSettlementInTx(asTx(makeTx(own)), 'pr-1', supervisor)).rejects.toThrow(/sendiri/);
    const ownFin = makeRequest({ settlementStatus: 'PENDING_FINANCE', requesterId: 'u-fin' });
    const tx = makeTx(ownFin);
    await expect(postSettlementInTx(asTx(tx), 'pr-1', finance, { settlementDate: '2026-10-10', cashAccountId: 'acc-cash' })).rejects.toThrow(/sendiri/);
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('a stranger cannot approve; finance cannot skip the supervisor step', async () => {
    const r = makeRequest({ settlementStatus: 'SUBMITTED' });
    await expect(approveSettlementInTx(asTx(makeTx(r)), 'pr-1', { ...supervisor, id: 'u-other' })).rejects.toThrow(/atasan/);
    await expect(approveSettlementInTx(asTx(makeTx(r)), 'pr-1', finance)).rejects.toThrow(/atasan/);
  });

  it('return for revision needs a reason and goes to REVISION', async () => {
    const r = makeRequest({ settlementStatus: 'PENDING_FINANCE' });
    await expect(returnSettlementInTx(asTx(makeTx(r)), 'pr-1', finance, 'x')).rejects.toThrow(/Alasan/);
    const tx = makeTx(r);
    const out = await returnSettlementInTx(asTx(tx), 'pr-1', finance, 'Nota kurang jelas');
    expect(claimed(tx).data).toMatchObject({ settlementStatus: 'REVISION', settlementLastNote: 'Nota kurang jelas' });
    expect(out.events[0]).toMatchObject({ kind: 'settlement_revision' });
  });
});

describe('postSettlementInTx', () => {
  const pending = () => makeRequest({ settlementStatus: 'PENDING_FINANCE' });

  it('R < A: returns the rest in cash — one balanced journal, advance cleared in full', async () => {
    const tx = makeTx(pending()); // R = 700.000, A = 1.000.000
    const out = await postSettlementInTx(asTx(tx), 'pr-1', finance, { settlementDate: '2026-10-10', cashAccountId: 'acc-cash', reference: 'SETOR-1' });
    const items = journalItems(tx) as Array<{ accountId: string; debit: number; credit: number }>;
    expect(items.reduce((s, i) => s + i.debit, 0)).toBe(items.reduce((s, i) => s + i.credit, 0));
    expect(items.find((i) => i.accountId === 'acc-cash')).toMatchObject({ debit: 300000, credit: 0 });
    expect(items.filter((i) => i.accountId === 'acc-adv').reduce((s, i) => s + i.credit, 0)).toBe(1_000_000);
    expect(claimed(tx).where.settlementStatus).toEqual({ in: ['PENDING_FINANCE'] });
    expect(claimed(tx).data).toMatchObject({ settlementStatus: 'SETTLED', settlementCashAccountId: 'acc-cash', settlementReference: 'SETOR-1', settlementRealized: '700000.00' });
    expect(tx.paymentRequest.update).toHaveBeenCalledWith({ where: { id: 'pr-1' }, data: { settlementJournalId: 'je-set' } });
    expect(out.events[0]).toMatchObject({ kind: 'settlement_settled', amount: 700000 });
  });

  it('R = A: no cash line and no cash account needed', async () => {
    const tx = makeTx(pending(), { lines: [{ id: 's1', description: 'Tiket', amount: '1000000', expenseAccountId: 'acc-6.10' }] });
    await postSettlementInTx(asTx(tx), 'pr-1', finance, { settlementDate: '2026-10-10' });
    expect(journalItems(tx)).toEqual([
      expect.objectContaining({ accountId: 'acc-6.10', debit: 1_000_000 }),
      expect.objectContaining({ accountId: 'acc-adv', credit: 1_000_000 }),
    ]);
    expect(claimed(tx).data.settlementCashAccountId).toBeNull();
  });

  it('R > A: kurang bayar is paid from the chosen cash account', async () => {
    const tx = makeTx(pending(), { lines: [{ id: 's1', description: 'Tiket', amount: '1300000', expenseAccountId: 'acc-6.10' }] });
    await postSettlementInTx(asTx(tx), 'pr-1', finance, { settlementDate: '2026-10-10', cashAccountId: 'acc-cash' });
    const items = journalItems(tx) as Array<{ accountId: string; debit: number; credit: number }>;
    expect(items.find((i) => i.accountId === 'acc-cash')).toMatchObject({ debit: 0, credit: 300000 });
    expect(items.find((i) => i.accountId === 'acc-6.10')).toMatchObject({ debit: 1_300_000 });
  });

  it('requires the cash account when R ≠ A — nothing is posted', async () => {
    const tx = makeTx(pending());
    await expect(postSettlementInTx(asTx(tx), 'pr-1', finance, { settlementDate: '2026-10-10' })).rejects.toThrow(/kas\/bank/);
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
    expect(tx.paymentRequest.updateMany).not.toHaveBeenCalled();
  });

  it('finance fills a missing expense account in the same step', async () => {
    const tx = makeTx(pending(), { lines: [{ id: 's1', description: 'Tiket', amount: '1000000', expenseAccountId: null }] });
    await postSettlementInTx(asTx(tx), 'pr-1', finance, { settlementDate: '2026-10-10', lineAccounts: [{ id: 's1', expenseAccountId: 'acc-6.10' }] });
    expect(tx.paymentRequestSettlementLine.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { expenseAccountId: 'acc-6.10' } });
    expect(journalItems(tx)[0]).toMatchObject({ accountId: 'acc-6.10', debit: 1_000_000 });
  });

  it('rejects a settlement dated in a closed fiscal period — nothing is posted', async () => {
    const tx = makeTx(pending(), { fiscalYear: null });
    await expect(postSettlementInTx(asTx(tx), 'pr-1', finance, { settlementDate: '2025-12-31', cashAccountId: 'acc-cash' })).rejects.toThrow(/Tahun fiskal|sebelum tanggal pembayaran/);
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
    const closed = makeTx(pending(), { fiscalYear: null });
    await expect(postSettlementInTx(asTx(closed), 'pr-1', finance, { settlementDate: '2026-10-10', cashAccountId: 'acc-cash' })).rejects.toThrow(/Tahun fiskal/);
    expect(closed.journalEntry.create).not.toHaveBeenCalled();
  });

  it('refuses a date before the advance was paid and posting before supervisor approval', async () => {
    await expect(postSettlementInTx(asTx(makeTx(pending())), 'pr-1', finance, { settlementDate: '2026-10-01', cashAccountId: 'acc-cash' })).rejects.toThrow(/sebelum tanggal pembayaran/);
    await expect(
      postSettlementInTx(asTx(makeTx(makeRequest({ settlementStatus: 'SUBMITTED' }))), 'pr-1', finance, { settlementDate: '2026-10-10', cashAccountId: 'acc-cash' }),
    ).rejects.toThrow(/atasan/);
  });

  it('only finance posts', async () => {
    await expect(postSettlementInTx(asTx(makeTx(pending())), 'pr-1', supervisor, { settlementDate: '2026-10-10', cashAccountId: 'acc-cash' })).rejects.toThrow(/Keuangan/);
  });
});

describe('previewSettlementInTx', () => {
  it('returns the DR/CR preview with labels and flags missing cash, without writing anything', async () => {
    const tx = makeTx(makeRequest({ settlementStatus: 'PENDING_FINANCE' }));
    tx.account.findMany = vi.fn(async () => [{ id: 'acc-6.10', accountNumber: '6.10', name: 'Beban Perjalanan' }, { id: 'acc-adv', accountNumber: '1.5.6', name: 'Uang Muka Karyawan' }]);
    const p = await previewSettlementInTx(asTx(tx), 'pr-1', {});
    expect(p).toMatchObject({ mode: 'RETURN', realized: 700000, advance: 1_000_000, cashRequired: true });
    expect(p.problems.join(' ')).toMatch(/kas\/bank/);
    expect(p.lines.find((l) => l.accountId === 'acc-adv')?.accountLabel).toBe('1.5.6 — Uang Muka Karyawan');
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
    expect(tx.paymentRequest.updateMany).not.toHaveBeenCalled();
  });
});

describe('cancelSettlementPostingInTx', () => {
  const settled = () => makeRequest({ settlementStatus: 'SETTLED', settlementJournalId: 'je-set' });

  it('voids the journal and returns to PENDING_FINANCE', async () => {
    const tx = makeTx(settled());
    const out = await cancelSettlementPostingInTx(asTx(tx), 'pr-1', finance, 'Salah akun');
    expect(cancelJournalInTx).toHaveBeenCalledWith(tx, 'je-set');
    expect(claimed(tx).where.settlementStatus).toEqual({ in: ['SETTLED'] });
    expect(claimed(tx).data).toMatchObject({ settlementStatus: 'PENDING_FINANCE', settledAt: null });
    expect(tx.paymentRequest.update).toHaveBeenCalledWith({ where: { id: 'pr-1' }, data: { settlementJournalId: null } });
    expect(out.events[0]!.kind).toBe('settlement_posting_cancelled');
  });

  it('refuses when the journal year is closed, for non-finance, and when not settled', async () => {
    const closed = makeTx(settled());
    closed.journalEntry.findUnique = vi.fn(async () => ({ fiscalYear: { isClosed: true } }));
    await expect(cancelSettlementPostingInTx(asTx(closed), 'pr-1', finance, 'Salah akun')).rejects.toThrow(/ditutup/);
    expect(cancelJournalInTx).not.toHaveBeenCalled();
    await expect(cancelSettlementPostingInTx(asTx(makeTx(settled())), 'pr-1', supervisor, 'Salah akun')).rejects.toThrow(/Keuangan/);
    await expect(cancelSettlementPostingInTx(asTx(makeTx(makeRequest({ settlementStatus: 'PENDING_FINANCE' }))), 'pr-1', finance, 'Salah akun')).rejects.toThrow(/belum diposting/);
  });
});
