import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/documentNumber', () => ({ generateDocumentNumber: vi.fn(async (_tx, prefix: string) => `${prefix}-202610-0001`) }));
vi.mock('../../utils/accountBalance', () => ({ updateBalancesForItems: vi.fn(async () => undefined) }));
vi.mock('../gaFinance', () => ({ cancelJournalInTx: vi.fn(async () => undefined) }));

import { updateBalancesForItems } from '../../utils/accountBalance';
import { cancelJournalInTx } from '../gaFinance';
import {
  approvePaymentRequestInTx,
  cancelPaymentRequestPaymentInTx,
  payPaymentRequestInTx,
  submitPaymentRequestInTx,
} from '../paymentRequestService';
import type { Actor } from '../paymentRequestRules';

const finance: Actor = { id: 'u-fin', role: 'Accountant', isSuperAdmin: false, isFinance: true };
const requester: Actor = { id: 'u-req', role: 'StaffProduksi', isSuperAdmin: false, isFinance: false };

function makeRequest(over: Record<string, unknown> = {}) {
  return {
    id: 'pr-1',
    number: 'PP-202610-0001',
    status: 'APPROVED',
    requesterId: 'u-req',
    supervisorId: 'u-sup',
    directorRole: null,
    totalAmount: { toString: () => '250000' },
    purpose: 'Taksi ke klien',
    settlementStatus: null,
    journalEntryId: null,
    type: { kind: 'REIMBURSEMENT', requiresAttachment: false, isActive: true },
    ...over,
  };
}

function makeTx(pr: ReturnType<typeof makeRequest>, opts: { fiscalYear?: object | null; claimCount?: number } = {}) {
  const journalCreate = vi.fn(async ({ data }: { data: { items: { create: Array<Record<string, number | string>> } } }) => ({
    id: 'je-1',
    entryNumber: 'JV-202610-0001',
    items: data.items.create.map((i, n) => ({ id: `ji-${n}`, ...i })),
  }));
  const tx = {
    paymentRequest: {
      findUnique: vi.fn(async () => pr),
      findUniqueOrThrow: vi.fn(async () => ({ ...pr })),
      updateMany: vi.fn(async (_args: { where: unknown; data: Record<string, unknown> }) => ({ count: opts.claimCount ?? 1 })),
      update: vi.fn(async () => pr),
    },
    paymentRequestLine: {
      findMany: vi.fn(async () => [
        { description: 'Taksi', amount: { toString: () => '200000' }, expenseAccountId: 'acc-6.10' },
        { description: 'Parkir', amount: { toString: () => '50000' }, expenseAccountId: 'acc-6.10' },
      ]),
      count: vi.fn(async () => 2),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    paymentRequestAttachment: { count: vi.fn(async () => 0) },
    paymentRequestSettlementLine: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    paymentRequestHistory: { create: vi.fn(async () => ({})) },
    user: { findUnique: vi.fn(async () => ({ supervisor: null })) },
    account: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        isGroup: false,
        isActive: true,
        accountNumber: where.id === 'acc-cash' ? '1.1.2' : '6.10',
        accountType: where.id === 'acc-cash' ? 'ASSET' : 'EXPENSE',
        name: 'x',
      })),
    },
    systemAccountMapping: { count: vi.fn(async () => 1), findFirst: vi.fn(async () => ({ accountId: 'acc-adv' })) },
    approvalRule: { findMany: vi.fn(async () => [{ minAmount: '100000', requiredRole: 'Direktur', isActive: true }]) },
    fiscalYear: { findFirst: vi.fn(async () => (opts.fiscalYear === undefined ? { id: 'fy-2026' } : opts.fiscalYear)) },
    journalEntry: { create: journalCreate, findUnique: vi.fn(async () => ({ fiscalYear: { isClosed: false } })) },
    accountingLedgerEntry: { createMany: vi.fn(async () => ({ count: 2 })) },
  };
  return tx;
}

const asTx = (tx: unknown) => tx as Parameters<typeof payPaymentRequestInTx>[0];

beforeEach(() => vi.clearAllMocks());

describe('payPaymentRequestInTx', () => {
  it('posts one balanced journal (DR expense / CR cash) and marks PAID', async () => {
    const tx = makeTx(makeRequest());
    const out = await payPaymentRequestInTx(asTx(tx), 'pr-1', finance, { cashAccountId: 'acc-cash', paymentDate: '2026-10-05', reference: 'TRF-1' });
    const items = tx.journalEntry.create.mock.calls[0][0].data.items.create;
    expect(items).toEqual([
      expect.objectContaining({ accountId: 'acc-6.10', debit: 250000, credit: 0 }),
      expect.objectContaining({ accountId: 'acc-cash', debit: 0, credit: 250000 }),
    ]);
    expect(tx.paymentRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pr-1', status: { in: ['APPROVED'] } }, data: expect.objectContaining({ status: 'PAID' }) }),
    );
    expect(updateBalancesForItems).toHaveBeenCalledTimes(1);
    expect(out.events[0].kind).toBe('paid');
  });

  it('cash advance debits the EMPLOYEE_ADVANCE account and opens settlement', async () => {
    const tx = makeTx(makeRequest({ type: { kind: 'CASH_ADVANCE', requiresAttachment: false, requiresSettlement: true, isActive: true } }));
    await payPaymentRequestInTx(asTx(tx), 'pr-1', finance, { cashAccountId: 'acc-cash', paymentDate: '2026-10-05' });
    expect(tx.journalEntry.create.mock.calls[0][0].data.items.create[0]).toEqual(expect.objectContaining({ accountId: 'acc-adv', debit: 250000 }));
    expect(tx.paymentRequest.updateMany.mock.calls[0][0].data.settlementStatus).toBe('OPEN');
  });

  it('an advance type that does not require settlement is posted to 1.5.6 but opens no settlement', async () => {
    const tx = makeTx(makeRequest({ type: { kind: 'TRAVEL', requiresAttachment: false, requiresSettlement: false, isActive: true } }));
    await payPaymentRequestInTx(asTx(tx), 'pr-1', finance, { cashAccountId: 'acc-cash', paymentDate: '2026-10-05' });
    expect(tx.journalEntry.create.mock.calls[0][0].data.items.create[0]).toEqual(expect.objectContaining({ accountId: 'acc-adv' }));
    expect(tx.paymentRequest.updateMany.mock.calls[0][0].data.settlementStatus).toBeNull();
  });

  it('rejects a payment dated in a closed fiscal period — nothing is posted', async () => {
    const tx = makeTx(makeRequest(), { fiscalYear: null });
    await expect(
      payPaymentRequestInTx(asTx(tx), 'pr-1', finance, { cashAccountId: 'acc-cash', paymentDate: '2025-12-31' }),
    ).rejects.toThrow(/Tahun fiskal/);
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
    expect(tx.paymentRequest.updateMany).not.toHaveBeenCalled();
  });

  it('is idempotent: a second pay on a PAID request is refused', async () => {
    const tx = makeTx(makeRequest({ status: 'PAID' }));
    await expect(payPaymentRequestInTx(asTx(tx), 'pr-1', finance, { cashAccountId: 'acc-cash', paymentDate: '2026-10-05' })).rejects.toThrow(/sudah dibayar/);
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('a lost status race (claim count 0) aborts before the journal', async () => {
    const tx = makeTx(makeRequest(), { claimCount: 0 });
    await expect(payPaymentRequestInTx(asTx(tx), 'pr-1', finance, { cashAccountId: 'acc-cash', paymentDate: '2026-10-05' })).rejects.toThrow(/sudah berubah/);
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('refuses a non cash/bank source account', async () => {
    const tx = makeTx(makeRequest());
    tx.systemAccountMapping.count = vi.fn(async () => 0);
    await expect(payPaymentRequestInTx(asTx(tx), 'pr-1', finance, { cashAccountId: 'acc-6.10', paymentDate: '2026-10-05' })).rejects.toThrow(/kas\/bank/);
  });
});

describe('approve / submit', () => {
  it('finance approval above the PaymentRequest rule goes to PENDING_DIRECTOR with the rule role', async () => {
    const tx = makeTx(makeRequest({ status: 'PENDING_FINANCE' }));
    const out = await approvePaymentRequestInTx(asTx(tx), 'pr-1', finance, {});
    const data = tx.paymentRequest.updateMany.mock.calls[0][0].data;
    expect(data.status).toBe('PENDING_DIRECTOR');
    expect(data.directorRole).toBe('Direktur');
    expect(out.events[0].kind).toBe('pending_director');
  });

  it('the requester can never approve their own request', async () => {
    const tx = makeTx(makeRequest({ status: 'PENDING_FINANCE', requesterId: 'u-fin' }));
    await expect(approvePaymentRequestInTx(asTx(tx), 'pr-1', finance, {})).rejects.toThrow(/sendiri/);
    expect(tx.paymentRequest.updateMany).not.toHaveBeenCalled();
  });

  it('submit without a supervisor goes straight to finance', async () => {
    const tx = makeTx(makeRequest({ status: 'DRAFT' }));
    const out = await submitPaymentRequestInTx(asTx(tx), 'pr-1', requester);
    expect(tx.paymentRequest.updateMany.mock.calls[0][0].data.status).toBe('PENDING_FINANCE');
    expect(out.events[0].kind).toBe('pending_finance');
  });
});

describe('cancelPaymentRequestPaymentInTx', () => {
  it('voids the journal and returns to APPROVED', async () => {
    const tx = makeTx(makeRequest({ status: 'PAID', journalEntryId: 'je-1' }));
    await cancelPaymentRequestPaymentInTx(asTx(tx), 'pr-1', finance, 'Salah rekening');
    expect(cancelJournalInTx).toHaveBeenCalledWith(tx, 'je-1');
    expect(tx.paymentRequest.updateMany.mock.calls[0][0].data.status).toBe('APPROVED');
  });

  it('stays blocked once the advance is settled or a settlement is in progress', async () => {
    for (const settlementStatus of ['SETTLED', 'SUBMITTED', 'PENDING_FINANCE', 'REVISION']) {
      const tx = makeTx(makeRequest({ status: 'PAID', journalEntryId: 'je-1', settlementStatus }));
      await expect(cancelPaymentRequestPaymentInTx(asTx(tx), 'pr-1', finance, 'Salah rekening')).rejects.toThrow(/pertanggungjawaban/i);
      expect(cancelJournalInTx).not.toHaveBeenCalled();
    }
  });

  it('an untouched OPEN advance can still be cancelled and drops its settlement draft', async () => {
    const tx = makeTx(makeRequest({ status: 'PAID', journalEntryId: 'je-1', settlementStatus: 'OPEN' }));
    await cancelPaymentRequestPaymentInTx(asTx(tx), 'pr-1', finance, 'Salah rekening');
    expect(tx.paymentRequestSettlementLine.deleteMany).toHaveBeenCalled();
  });

  it('refuses when the journal year is closed', async () => {
    const tx = makeTx(makeRequest({ status: 'PAID', journalEntryId: 'je-1' }));
    tx.journalEntry.findUnique = vi.fn(async () => ({ fiscalYear: { isClosed: true } }));
    await expect(cancelPaymentRequestPaymentInTx(asTx(tx), 'pr-1', finance, 'Salah rekening')).rejects.toThrow(/ditutup/);
    expect(cancelJournalInTx).not.toHaveBeenCalled();
  });
});
