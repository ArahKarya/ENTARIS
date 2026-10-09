/**
 * Pertanggungjawaban uang muka / perjalanan dinas — pure rules (stage 2):
 * statuses, who may act, the settlement journal and the open-advance
 * aging helpers. No database access; paymentRequestSettlementService.ts
 * applies them inside transactions.
 *
 * settlementStatus (on a PAID advance request):
 *   OPEN ──submit──▶ SUBMITTED (atasan) ──▶ PENDING_FINANCE ──post──▶ SETTLED
 *        (no active supervisor → straight to PENDING_FINANCE)
 *   Supervisor or Finance can RETURN (→ REVISION, requester edits & resubmits).
 *   Finance can cancel the posting (SETTLED → PENDING_FINANCE, journal voided).
 *   Nobody — not even a super admin — decides on their own settlement.
 *
 * Journal (realized R vs advance A, one balanced entry on the settlement date):
 *   DR each line's expense account (grouped)            = R
 *   CR Uang Muka Karyawan (1.5.6)                       = min(R, A)
 *   R < A  (sisa)      : DR kas/bank (A−R)  / CR 1.5.6 (A−R)   employee returns cash
 *   R > A  (kurang)    : CR kas/bank (R−A)                      company reimburses now
 *   R = A              : no cash line
 */
import Decimal from 'decimal.js';
import {
  SELF_APPROVAL_ERROR,
  computeTotal,
  type Actor,
  type Check,
  type JournalLine,
  type PrRef,
} from './paymentRequestRules';

export const SETTLEMENT_STATUSES = ['OPEN', 'SUBMITTED', 'PENDING_FINANCE', 'REVISION', 'SETTLED'] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

/** Advance paid but not yet fully settled. */
export const OUTSTANDING_SETTLEMENT_STATUSES: readonly SettlementStatus[] = ['OPEN', 'SUBMITTED', 'PENDING_FINANCE', 'REVISION'];
export const SETTLEMENT_EDITABLE: readonly SettlementStatus[] = ['OPEN', 'REVISION'];

/** An open advance older than this many days (since payment) is highlighted / warned about. */
export const SETTLEMENT_OVERDUE_DAYS = 14;

const ok: Check = { ok: true };
const fail = (error: string): Check => ({ ok: false, error });

export interface SettlementRef extends Pick<PrRef, 'requesterId'> {
  status: string;
  settlementStatus: string | null;
  settlementSupervisorId: string | null;
}

export type SettlementStep = 'SUPERVISOR' | 'FINANCE';

export function settlementStepFor(settlementStatus: string | null): SettlementStep | null {
  if (settlementStatus === 'SUBMITTED') return 'SUPERVISOR';
  if (settlementStatus === 'PENDING_FINANCE') return 'FINANCE';
  return null;
}

export function checkSettlementEditable(pr: SettlementRef, actorId: string): Check {
  if (pr.requesterId !== actorId) return fail('Hanya pengaju yang dapat mengisi pertanggungjawaban.');
  if (pr.status !== 'PAID') return fail('Pertanggungjawaban hanya untuk uang muka yang sudah dibayar.');
  if (!SETTLEMENT_EDITABLE.includes(pr.settlementStatus as SettlementStatus)) {
    return fail('Pertanggungjawaban hanya bisa diubah saat Belum Dipertanggungjawabkan atau Perlu Revisi.');
  }
  return ok;
}

export function checkSettlementSubmittable(
  pr: SettlementRef,
  actorId: string,
  facts: { lineCount: number; totalAmount: number },
): Check {
  const editable = checkSettlementEditable(pr, actorId);
  if (!editable.ok) return editable;
  if (facts.lineCount < 1) return fail('Tambahkan minimal satu rincian realisasi.');
  if (!(facts.totalAmount > 0)) return fail('Total realisasi harus lebih dari 0.');
  return ok;
}

/** Can this actor decide (approve / return / post) at the settlement's current step? */
export function checkSettlementDecide(
  pr: SettlementRef,
  actor: Actor,
): { ok: true; step: SettlementStep } | { ok: false; error: string } {
  const step = pr.status === 'PAID' ? settlementStepFor(pr.settlementStatus) : null;
  if (!step) return { ok: false, error: 'Pertanggungjawaban tidak sedang menunggu persetujuan.' };
  if (actor.id === pr.requesterId) return { ok: false, error: SELF_APPROVAL_ERROR };
  if (step === 'SUPERVISOR' && actor.id !== pr.settlementSupervisorId) {
    return { ok: false, error: 'Hanya atasan langsung pengaju yang dapat memproses tahap ini.' };
  }
  if (step === 'FINANCE' && !actor.isFinance) {
    return { ok: false, error: 'Hanya Keuangan yang dapat memverifikasi dan memposting pertanggungjawaban.' };
  }
  return { ok: true, step };
}

export function checkCancelSettlementPosting(pr: SettlementRef, actor: Actor): Check {
  if (!actor.isFinance) return fail('Hanya Keuangan yang dapat membatalkan posting pertanggungjawaban.');
  if (pr.settlementStatus !== 'SETTLED') return fail('Pertanggungjawaban ini belum diposting.');
  return ok;
}

/** Cancel-payment of the original advance is only allowed while no settlement is under way. */
export function checkAdvanceFreeOfSettlement(settlementStatus: string | null | undefined): Check {
  if (settlementStatus === 'SETTLED') {
    return fail('Uang muka sudah dipertanggungjawabkan; batalkan posting pertanggungjawaban terlebih dahulu.');
  }
  if (settlementStatus && settlementStatus !== 'OPEN') {
    return fail('Pertanggungjawaban uang muka sedang diproses; selesaikan atau kembalikan dulu sebelum membatalkan pembayaran.');
  }
  return ok;
}

/**
 * Whether paying this request opens a settlement. Posting account follows the
 * type KIND (CASH_ADVANCE/TRAVEL → DR 1.5.6); whether a settlement is
 * REQUIRED follows ONLY type.requiresSettlement.
 */
export function initialSettlementStatus(kind: string, requiresSettlement: boolean): 'OPEN' | null {
  return (kind === 'CASH_ADVANCE' || kind === 'TRAVEL') && requiresSettlement ? 'OPEN' : null;
}

// ─── Journal ─────────────────────────────────────────────────────────────────

export interface SettlementLineInput {
  description: string;
  amount: Decimal.Value;
  expenseAccountId: string | null;
}

export type SettlementMode = 'EXACT' | 'RETURN' | 'REIMBURSE';

export interface SettlementPreviewLine {
  side: 'DR' | 'CR';
  /** null = still to be chosen by Finance (expense account of a line). */
  accountId: string | null;
  amount: number;
  description: string;
}

export interface SettlementPreview {
  realized: number;
  advance: number;
  /** R − A: negative = sisa uang muka (employee returns), positive = kurang bayar. */
  difference: number;
  mode: SettlementMode;
  cashRequired: boolean;
  lines: SettlementPreviewLine[];
  problems: string[];
}

/**
 * Journal preview + validation. `problems` lists everything that blocks
 * posting (missing expense account, missing cash account, same account on both
 * sides); the preview itself is always produced so the UI can show it.
 */
export function previewSettlementJournal(input: {
  lines: readonly SettlementLineInput[];
  advanceAmount: Decimal.Value;
  advanceAccountId: string | null;
  cashAccountId: string | null;
  narration: string;
}): SettlementPreview {
  const problems: string[] = [];
  const realized = computeTotal(input.lines);
  const advance = new Decimal(input.advanceAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const diff = realized.minus(advance);
  const mode: SettlementMode = diff.isZero() ? 'EXACT' : diff.lt(0) ? 'RETURN' : 'REIMBURSE';
  const cashRequired = !diff.isZero();

  if (input.lines.length === 0 || !realized.gt(0)) problems.push('Total realisasi harus lebih dari 0.');
  if (!input.advanceAccountId) {
    problems.push('Akun sistem "Uang Muka Karyawan" belum dipetakan. Atur di Pengaturan → Akun Sistem.');
  }
  if (cashRequired && !input.cashAccountId) {
    problems.push(
      mode === 'RETURN'
        ? 'Pilih akun kas/bank tempat sisa uang muka dikembalikan pengaju.'
        : 'Pilih akun kas/bank untuk membayar kekurangan ke pengaju.',
    );
  }

  const lines: SettlementPreviewLine[] = [];
  const byAccount = new Map<string, { accountId: string | null; amount: Decimal; descriptions: string[] }>();
  input.lines.forEach((l, i) => {
    if (!l.expenseAccountId) problems.push(`Akun biaya baris ${i + 1} belum diisi.`);
    const key = l.expenseAccountId ?? '∅';
    const cur = byAccount.get(key) ?? { accountId: l.expenseAccountId, amount: new Decimal(0), descriptions: [] };
    byAccount.set(key, { ...cur, amount: cur.amount.plus(new Decimal(l.amount)), descriptions: [...cur.descriptions, l.description] });
  });
  for (const v of byAccount.values()) {
    lines.push({
      side: 'DR',
      accountId: v.accountId,
      amount: v.amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
      description: v.descriptions.join('; ').slice(0, 250),
    });
  }

  const settled = Decimal.min(realized, advance);
  const advanceLine = (amount: Decimal, description: string): SettlementPreviewLine => ({
    side: 'CR',
    accountId: input.advanceAccountId,
    amount: amount.toNumber(),
    description,
  });
  if (settled.gt(0)) lines.push(advanceLine(settled, input.narration));
  if (mode === 'RETURN') {
    const rest = advance.minus(realized);
    lines.push({ side: 'DR', accountId: input.cashAccountId, amount: rest.toNumber(), description: `Pengembalian sisa uang muka: ${input.narration}`.slice(0, 250) });
    lines.push(advanceLine(rest, `Sisa uang muka dikembalikan: ${input.narration}`.slice(0, 250)));
  } else if (mode === 'REIMBURSE') {
    lines.push({ side: 'CR', accountId: input.cashAccountId, amount: diff.toNumber(), description: `Kekurangan dibayar ke pengaju: ${input.narration}`.slice(0, 250) });
  }

  const expenseIds = [...byAccount.values()].map((v) => v.accountId);
  const cashId = input.cashAccountId;
  if (cashRequired && cashId && expenseIds.includes(cashId)) problems.push('Akun kas/bank tidak boleh sama dengan akun biaya.');
  if (input.advanceAccountId) {
    if (cashRequired && cashId === input.advanceAccountId) problems.push('Akun kas/bank tidak boleh sama dengan akun Uang Muka Karyawan.');
    if (expenseIds.includes(input.advanceAccountId)) problems.push('Akun biaya tidak boleh sama dengan akun Uang Muka Karyawan.');
  }

  return {
    realized: realized.toNumber(),
    advance: advance.toNumber(),
    difference: diff.toNumber(),
    mode,
    cashRequired,
    lines,
    problems: [...new Set(problems)],
  };
}

/** Postable journal lines, or the reason it cannot be posted. Always balanced when ok. */
export function buildSettlementJournalLines(
  input: Parameters<typeof previewSettlementJournal>[0],
): { ok: true; lines: JournalLine[]; preview: SettlementPreview } | { ok: false; error: string; preview: SettlementPreview } {
  const preview = previewSettlementJournal(input);
  if (preview.problems.length > 0) return { ok: false, error: preview.problems[0] as string, preview };
  const lines: JournalLine[] = preview.lines.map((l) => ({
    accountId: l.accountId as string,
    debit: l.side === 'DR' ? l.amount : 0,
    credit: l.side === 'CR' ? l.amount : 0,
    description: l.description,
  }));
  const dr = lines.reduce((s, l) => s.plus(l.debit), new Decimal(0));
  const cr = lines.reduce((s, l) => s.plus(l.credit), new Decimal(0));
  if (!dr.eq(cr)) return { ok: false, error: 'Jurnal tidak seimbang.', preview };
  return { ok: true, lines, preview };
}

// ─── Aging ───────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** Whole days since the advance was paid (never negative). */
export function advanceAgeDays(paymentDate: Date | string | null | undefined, now: Date = new Date()): number {
  if (!paymentDate) return 0;
  const paid = new Date(paymentDate);
  const a = Date.UTC(paid.getUTCFullYear(), paid.getUTCMonth(), paid.getUTCDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((b - a) / DAY_MS));
}

/** Overdue = older than N days since payment, or past the requester's own deadline. */
export function isAdvanceOverdue(
  row: { paymentDate: Date | string | null; settlementDeadline?: Date | string | null },
  now: Date = new Date(),
  overdueDays: number = SETTLEMENT_OVERDUE_DAYS,
): boolean {
  if (row.settlementDeadline) {
    const d = new Date(row.settlementDeadline);
    const dl = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    if (today > dl) return true;
  }
  return advanceAgeDays(row.paymentDate, now) > overdueDays;
}

export interface AdvanceRow {
  requesterId: string;
  requesterName: string;
  totalAmount: Decimal.Value | { toString(): string };
  paymentDate: Date | string | null;
  settlementDeadline?: Date | string | null;
}

export interface AdvanceSummary {
  count: number;
  amount: number;
  overdueCount: number;
  overdueAmount: number;
  overdueDays: number;
  byEmployee: Array<{ employeeId: string; name: string; count: number; amount: number; overdueCount: number; oldestDays: number }>;
}

/** Outstanding advances → totals + per-employee breakdown (largest amount first). */
export function summarizeAdvances(rows: readonly AdvanceRow[], now: Date = new Date(), overdueDays: number = SETTLEMENT_OVERDUE_DAYS): AdvanceSummary {
  let amount = new Decimal(0);
  let overdueAmount = new Decimal(0);
  let overdueCount = 0;
  const per = new Map<string, { name: string; count: number; amount: Decimal; overdueCount: number; oldestDays: number }>();
  for (const r of rows) {
    const a = new Decimal(r.totalAmount.toString());
    const overdue = isAdvanceOverdue(r, now, overdueDays);
    const age = advanceAgeDays(r.paymentDate, now);
    amount = amount.plus(a);
    if (overdue) {
      overdueAmount = overdueAmount.plus(a);
      overdueCount += 1;
    }
    const cur = per.get(r.requesterId) ?? { name: r.requesterName, count: 0, amount: new Decimal(0), overdueCount: 0, oldestDays: 0 };
    per.set(r.requesterId, {
      name: cur.name,
      count: cur.count + 1,
      amount: cur.amount.plus(a),
      overdueCount: cur.overdueCount + (overdue ? 1 : 0),
      oldestDays: Math.max(cur.oldestDays, age),
    });
  }
  const byEmployee = [...per.entries()]
    .map(([employeeId, v]) => ({ employeeId, name: v.name, count: v.count, amount: v.amount.toNumber(), overdueCount: v.overdueCount, oldestDays: v.oldestDays }))
    .sort((x, y) => y.amount - x.amount);
  return { count: rows.length, amount: amount.toNumber(), overdueCount, overdueAmount: overdueAmount.toNumber(), overdueDays, byEmployee };
}
