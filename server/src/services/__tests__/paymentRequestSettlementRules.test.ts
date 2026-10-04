import { describe, expect, it } from 'vitest';
import {
  SETTLEMENT_OVERDUE_DAYS,
  advanceAgeDays,
  buildSettlementJournalLines,
  checkAdvanceFreeOfSettlement,
  checkCancelSettlementPosting,
  checkSettlementDecide,
  checkSettlementEditable,
  checkSettlementSubmittable,
  initialSettlementStatus,
  isAdvanceOverdue,
  previewSettlementJournal,
  summarizeAdvances,
  type SettlementRef,
} from '../paymentRequestSettlementRules';
import { checkCancelPayment, canViewRequest, scopeWhere, type Actor, type ViewerCtx } from '../paymentRequestRules';

const REQ = 'u-req';
const SUP = 'u-sup';
const actor = (id: string, over: Partial<Actor> = {}): Actor => ({ id, role: 'StaffProduksi', isSuperAdmin: false, isFinance: false, ...over });
const finance = actor('u-fin', { role: 'Accountant', isFinance: true });
const ref = (over: Partial<SettlementRef> = {}): SettlementRef => ({
  status: 'PAID',
  requesterId: REQ,
  settlementStatus: 'OPEN',
  settlementSupervisorId: SUP,
  ...over,
});

const base = (lines: Array<[number, string | null]>, advance: number, cash: string | null) => ({
  lines: lines.map(([amount, expenseAccountId], i) => ({ description: `L${i + 1}`, amount, expenseAccountId })),
  advanceAmount: advance,
  advanceAccountId: 'acc-adv',
  cashAccountId: cash,
  narration: 'PP-1',
});

const sum = (lines: Array<{ debit: number; credit: number }>, key: 'debit' | 'credit') => lines.reduce((s, l) => s + l[key], 0);

describe('settlement journal', () => {
  it('R = A: DR expenses / CR advance, no cash line, balanced', () => {
    const out = buildSettlementJournalLines(base([[600000, 'acc-a'], [400000, 'acc-b']], 1_000_000, null));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.preview.mode).toBe('EXACT');
    expect(out.lines).toEqual([
      expect.objectContaining({ accountId: 'acc-a', debit: 600000 }),
      expect.objectContaining({ accountId: 'acc-b', debit: 400000 }),
      expect.objectContaining({ accountId: 'acc-adv', credit: 1_000_000 }),
    ]);
    expect(sum(out.lines, 'debit')).toBe(sum(out.lines, 'credit'));
  });

  it('R < A (sisa): employee returns cash — DR cash for A−R, CR advance for the full A', () => {
    const out = buildSettlementJournalLines(base([[700000, 'acc-a']], 1_000_000, 'acc-cash'));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.preview).toMatchObject({ mode: 'RETURN', realized: 700000, advance: 1_000_000, difference: -300000, cashRequired: true });
    expect(out.lines.filter((l) => l.accountId === 'acc-cash')).toEqual([expect.objectContaining({ debit: 300000, credit: 0 })]);
    expect(out.lines.filter((l) => l.accountId === 'acc-adv').reduce((s, l) => s + l.credit, 0)).toBe(1_000_000);
    expect(sum(out.lines, 'debit')).toBe(1_000_000);
    expect(sum(out.lines, 'credit')).toBe(1_000_000);
  });

  it('R > A (kurang bayar): extra expense, company pays the employee — CR cash for R−A', () => {
    const out = buildSettlementJournalLines(base([[1_000_000, 'acc-a'], [250000, 'acc-a']], 1_000_000, 'acc-cash'));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.preview).toMatchObject({ mode: 'REIMBURSE', difference: 250000 });
    expect(out.lines).toEqual([
      expect.objectContaining({ accountId: 'acc-a', debit: 1_250_000, credit: 0 }),
      expect.objectContaining({ accountId: 'acc-adv', debit: 0, credit: 1_000_000 }),
      expect.objectContaining({ accountId: 'acc-cash', debit: 0, credit: 250000 }),
    ]);
    expect(sum(out.lines, 'debit')).toBe(sum(out.lines, 'credit'));
  });

  it('requires a cash account when R ≠ A, but not when R = A', () => {
    const r = buildSettlementJournalLines(base([[700000, 'acc-a']], 1_000_000, null));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/kas\/bank/);
    expect(buildSettlementJournalLines(base([[1_300_000, 'acc-a']], 1_000_000, null)).ok).toBe(false);
    expect(buildSettlementJournalLines(base([[1_000_000, 'acc-a']], 1_000_000, null)).ok).toBe(true);
  });

  it('blocks posting while a line has no expense account', () => {
    const out = buildSettlementJournalLines(base([[1_000_000, null]], 1_000_000, null));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/baris 1/);
  });

  it('refuses cash = expense account and expense = advance account', () => {
    expect(buildSettlementJournalLines(base([[700000, 'acc-cash']], 1_000_000, 'acc-cash')).ok).toBe(false);
    expect(buildSettlementJournalLines(base([[1_000_000, 'acc-adv']], 1_000_000, null)).ok).toBe(false);
  });

  it('refuses when the EMPLOYEE_ADVANCE account is not mapped', () => {
    const out = buildSettlementJournalLines({ ...base([[1_000_000, 'acc-a']], 1_000_000, null), advanceAccountId: null });
    expect(out.ok).toBe(false);
  });

  it('preview always returns lines and lists the problems instead of throwing', () => {
    const p = previewSettlementJournal(base([[500000, null]], 1_000_000, null));
    expect(p.lines.length).toBeGreaterThan(0);
    expect(p.lines[0]).toMatchObject({ side: 'DR', accountId: null, amount: 500000 });
    expect(p.problems.length).toBe(2);
  });

  it('keeps cents exact', () => {
    const out = buildSettlementJournalLines(base([[333333.33, 'acc-a'], [0.1, 'acc-a']], 500000, 'acc-cash'));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(sum(out.lines, 'debit').toFixed(2)).toBe(sum(out.lines, 'credit').toFixed(2));
  });
});

describe('settlement permissions', () => {
  it('only the requester edits, only while OPEN / REVISION and PAID', () => {
    expect(checkSettlementEditable(ref(), REQ).ok).toBe(true);
    expect(checkSettlementEditable(ref({ settlementStatus: 'REVISION' }), REQ).ok).toBe(true);
    expect(checkSettlementEditable(ref(), SUP).ok).toBe(false);
    expect(checkSettlementEditable(ref({ settlementStatus: 'SUBMITTED' }), REQ).ok).toBe(false);
    expect(checkSettlementEditable(ref({ settlementStatus: 'SETTLED' }), REQ).ok).toBe(false);
    expect(checkSettlementEditable(ref({ status: 'APPROVED', settlementStatus: null }), REQ).ok).toBe(false);
  });

  it('submit needs at least one line and a positive total', () => {
    expect(checkSettlementSubmittable(ref(), REQ, { lineCount: 0, totalAmount: 0 }).ok).toBe(false);
    expect(checkSettlementSubmittable(ref(), REQ, { lineCount: 1, totalAmount: 0 }).ok).toBe(false);
    expect(checkSettlementSubmittable(ref(), REQ, { lineCount: 1, totalAmount: 10 }).ok).toBe(true);
  });

  it('nobody approves their own settlement — not even finance or a super admin', () => {
    const own = ref({ requesterId: 'u-fin', settlementStatus: 'PENDING_FINANCE' });
    expect(checkSettlementDecide(own, finance)).toMatchObject({ ok: false, error: expect.stringMatching(/sendiri/) });
    expect(checkSettlementDecide(ref({ settlementStatus: 'SUBMITTED' }), actor(REQ, { isSuperAdmin: true })).ok).toBe(false);
  });

  it('supervisor step: only the snapshotted settlement supervisor', () => {
    const r = ref({ settlementStatus: 'SUBMITTED' });
    expect(checkSettlementDecide(r, actor(SUP))).toEqual({ ok: true, step: 'SUPERVISOR' });
    expect(checkSettlementDecide(r, actor('u-other')).ok).toBe(false);
    expect(checkSettlementDecide(r, finance).ok).toBe(false);
  });

  it('finance step: only finance; nothing to decide in OPEN / SETTLED', () => {
    const r = ref({ settlementStatus: 'PENDING_FINANCE' });
    expect(checkSettlementDecide(r, finance)).toEqual({ ok: true, step: 'FINANCE' });
    expect(checkSettlementDecide(r, actor(SUP)).ok).toBe(false);
    expect(checkSettlementDecide(ref(), finance).ok).toBe(false);
    expect(checkSettlementDecide(ref({ settlementStatus: 'SETTLED' }), finance).ok).toBe(false);
  });

  it('cancel posting: finance only and only when SETTLED', () => {
    expect(checkCancelSettlementPosting(ref({ settlementStatus: 'SETTLED' }), finance).ok).toBe(true);
    expect(checkCancelSettlementPosting(ref({ settlementStatus: 'SETTLED' }), actor(SUP)).ok).toBe(false);
    expect(checkCancelSettlementPosting(ref({ settlementStatus: 'PENDING_FINANCE' }), finance).ok).toBe(false);
  });

  it('cancel-payment of the advance stays blocked once a settlement is under way or settled', () => {
    expect(checkCancelPayment({ status: 'PAID', settlementStatus: 'OPEN' }, finance).ok).toBe(true);
    expect(checkCancelPayment({ status: 'PAID', settlementStatus: null }, finance).ok).toBe(true);
    for (const s of ['SUBMITTED', 'PENDING_FINANCE', 'REVISION', 'SETTLED']) {
      expect(checkCancelPayment({ status: 'PAID', settlementStatus: s }, finance).ok).toBe(false);
    }
    expect(checkAdvanceFreeOfSettlement('SETTLED')).toMatchObject({ ok: false, error: expect.stringMatching(/batalkan posting/) });
  });

  it('settlement is required ONLY by type.requiresSettlement; kind decides the posting account', () => {
    expect(initialSettlementStatus('TRAVEL', true)).toBe('OPEN');
    expect(initialSettlementStatus('CASH_ADVANCE', true)).toBe('OPEN');
    expect(initialSettlementStatus('TRAVEL', false)).toBeNull();
    expect(initialSettlementStatus('REIMBURSEMENT', true)).toBeNull();
  });
});

describe('visibility & scopes', () => {
  const ctx = (id: string, over: Partial<ViewerCtx> = {}): ViewerCtx => ({ ...actor(id), canViewAll: false, ...over });

  it('the settlement supervisor snapshot can open the request', () => {
    const pr = { status: 'PAID', requesterId: REQ, supervisorId: null, directorRole: null, settlementSupervisorId: SUP };
    expect(canViewRequest(pr, ctx(SUP))).toBe(true);
    expect(canViewRequest(pr, ctx('u-x'))).toBe(false);
  });

  it('approvals include settlements waiting for me; advances scope is own-only without finance', () => {
    expect(JSON.stringify(scopeWhere('approvals', ctx(SUP)))).toContain('"settlementSupervisorId":"u-sup"');
    expect(JSON.stringify(scopeWhere('approvals', ctx('u-fin', { isFinance: true })))).toContain('"settlementStatus":"PENDING_FINANCE"');
    expect(scopeWhere('advances', ctx(REQ))).toMatchObject({ requesterId: REQ, status: 'PAID' });
    const all = scopeWhere('advances', ctx('u-fin', { isFinance: true })) as Record<string, unknown>;
    expect(all.requesterId).toBeUndefined();
  });
});

describe('open advance aging', () => {
  const now = new Date(2026, 9, 20); // 20 Oct 2026 local

  it('counts whole days since payment', () => {
    expect(advanceAgeDays(new Date('2026-10-06T00:00:00.000Z'), now)).toBe(14);
    expect(advanceAgeDays(null, now)).toBe(0);
    expect(advanceAgeDays(new Date('2026-10-25T00:00:00.000Z'), now)).toBe(0);
  });

  it('is overdue strictly after N days, or past the requester deadline', () => {
    expect(SETTLEMENT_OVERDUE_DAYS).toBe(14);
    expect(isAdvanceOverdue({ paymentDate: new Date('2026-10-06T00:00:00.000Z') }, now)).toBe(false);
    expect(isAdvanceOverdue({ paymentDate: new Date('2026-10-05T00:00:00.000Z') }, now)).toBe(true);
    expect(isAdvanceOverdue({ paymentDate: new Date('2026-10-15T00:00:00.000Z'), settlementDeadline: new Date('2026-10-18T00:00:00.000Z') }, now)).toBe(true);
    expect(isAdvanceOverdue({ paymentDate: new Date('2026-10-15T00:00:00.000Z'), settlementDeadline: new Date('2026-10-20T00:00:00.000Z') }, now)).toBe(false);
  });

  it('summarises totals, overdue and per employee (largest first)', () => {
    const s = summarizeAdvances(
      [
        { requesterId: 'a', requesterName: 'Ani', totalAmount: '1000000', paymentDate: new Date('2026-10-01T00:00:00.000Z') },
        { requesterId: 'a', requesterName: 'Ani', totalAmount: '500000', paymentDate: new Date('2026-10-18T00:00:00.000Z') },
        { requesterId: 'b', requesterName: 'Budi', totalAmount: '2000000', paymentDate: new Date('2026-10-19T00:00:00.000Z') },
      ],
      now,
    );
    expect(s).toMatchObject({ count: 3, amount: 3_500_000, overdueCount: 1, overdueAmount: 1_000_000 });
    expect(s.byEmployee.map((e) => e.name)).toEqual(['Budi', 'Ani']);
    expect(s.byEmployee[1]).toMatchObject({ count: 2, amount: 1_500_000, overdueCount: 1, oldestDays: 19 });
  });
});
