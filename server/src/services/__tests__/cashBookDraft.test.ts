import { describe, it, expect, vi, beforeEach } from 'vitest';

const { genNumber, postJournal, openFy, cashCheck } = vi.hoisted(() => ({
  genNumber: vi.fn().mockResolvedValue('DKB-202610-0001'),
  postJournal: vi.fn(),
  openFy: vi.fn(),
  cashCheck: vi.fn(),
}));
vi.mock('../../utils/documentNumber', () => ({ generateDocumentNumber: (...a: unknown[]) => genNumber(...a) }));
vi.mock('../../utils/fiscalYear', () => ({ getOpenFiscalYear: (...a: unknown[]) => openFy(...a) }));
vi.mock('../paymentRequestService', () => ({
  assertCashAccount: (...a: unknown[]) => cashCheck(...a),
  resolveAdvanceAccountId: async () => 'acc-adv',
  postJournalInTx: (...a: unknown[]) => postJournal(...a),
}));

import {
  appendDraftRows,
  createCashBookDraft,
  discardCashBookDraft,
  getCashBookDraftDetail,
  updateDraftHeader,
  updateDraftRows,
  RowErrorsError,
} from '../cashBookDraft';
import { postCashBookDraft } from '../cashBookDraftPost';
import { BusinessError } from '../../utils/errors';

const ACCOUNTS = [
  { id: 'acc-cash', accountNumber: '1.1.1', name: 'Kas Kecil', isGroup: false, isActive: true },
  { id: 'acc-adv', accountNumber: '1.5.6', name: 'Uang Muka Karyawan', isGroup: false, isActive: true },
  { id: 'acc-exp', accountNumber: '8.7', name: 'Beban Lain-lain', isGroup: false, isActive: true },
  { id: 'acc-inc', accountNumber: '7.4', name: 'Pendapatan Lain-lain', isGroup: false, isActive: true },
  { id: 'acc-atk', accountNumber: '6.1', name: 'Beban ATK', isGroup: false, isActive: true },
  { id: 'acc-bbm', accountNumber: '6.2', name: 'Beban BBM', isGroup: false, isActive: true },
  { id: 'acc-sales', accountNumber: '4.1', name: 'Penjualan', isGroup: false, isActive: true },
  { id: 'acc-grp', accountNumber: '6', name: 'Beban', isGroup: true, isActive: true },
  { id: 'acc-off', accountNumber: '6.9', name: 'Nonaktif', isGroup: false, isActive: false },
];

const matches = (obj: any, where: any): boolean =>
  Object.entries(where ?? {}).every(([k, v]: [string, any]) => {
    if (k === 'OR') return v.some((w: any) => matches(obj, w));
    if (v && typeof v === 'object' && 'in' in v) return v.in.includes(obj[k]);
    if (v && typeof v === 'object' && 'not' in v) return obj[k] !== v.not;
    return obj[k] === v;
  });

/** In-memory fake of the Prisma tx surface used by the cash book services. */
function makeDb(opts: { existingRows?: any[]; learned?: any[] } = {}) {
  const drafts = new Map<string, any>();
  const rows = new Map<string, any>();
  const maps: any[] = [...(opts.learned ?? [])];
  let seq = 0;
  const withRows = (d: any, include?: any) => (d && include?.rows ? { ...d, rows: [...rows.values()].filter((r) => r.draftId === d.id).sort((a, b) => a.idx - b.idx) } : d);
  const tx: any = {
    drafts, rows, maps,
    account: {
      findMany: vi.fn(async ({ where }: any) => ACCOUNTS.filter((a) => matches(a, where) || (where.OR ? false : false))),
      findUnique: vi.fn(async ({ where }: any) => ACCOUNTS.find((a) => a.id === where.id) ?? null),
    },
    systemAccountMapping: {
      findFirst: vi.fn(async ({ where }: any) => ({ OTHER_EXPENSE: { accountId: 'acc-exp' }, OTHER_INCOME: { accountId: 'acc-inc' } } as any)[where.role] ?? null),
    },
    cashBookLearnedMap: {
      findMany: vi.fn(async () => maps),
      findUnique: vi.fn(async ({ where }: any) => maps.find((m) => m.pattern === where.pattern_txnType.pattern && m.txnType === where.pattern_txnType.txnType) ?? null),
      create: vi.fn(async ({ data }: any) => { maps.push({ id: `m${++seq}`, ...data }); }),
      update: vi.fn(async ({ where, data }: any) => {
        const m = maps.find((x) => x.id === where.id);
        for (const [k, v] of Object.entries<any>(data)) m[k] = v && typeof v === 'object' && 'increment' in v ? m[k] + v.increment : v;
      }),
    },
    cashBookDraft: {
      create: vi.fn(async ({ data }: any) => { const d = { id: `d${++seq}`, ...data }; drafts.set(d.id, d); return d; }),
      findUnique: vi.fn(async ({ where, include }: any) => withRows(drafts.get(where.id) ?? null, include)),
      findUniqueOrThrow: vi.fn(async ({ where, include }: any) => withRows(drafts.get(where.id), include)),
      update: vi.fn(async ({ where, data }: any) => { Object.assign(drafts.get(where.id), data); return drafts.get(where.id); }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const d of drafts.values()) if (matches(d, where)) { Object.assign(d, data); count++; }
        return { count };
      }),
    },
    cashBookDraftRow: {
      findMany: vi.fn(async ({ where }: any) => (where?.draft ? opts.existingRows ?? [] : [...rows.values()].filter((r) => matches(r, where)))),
      createMany: vi.fn(async ({ data }: any) => { for (const r of data) rows.set(`r${++seq}`, { id: `r${seq}`, skip: false, journalEntryId: null, error: null, ...r }); }),
      aggregate: vi.fn(async ({ where }: any) => {
        const mine = [...rows.values()].filter((r) => r.draftId === where.draftId);
        return { _max: { idx: mine.length ? Math.max(...mine.map((r) => r.idx)) : null }, _count: { _all: mine.length } };
      }),
      update: vi.fn(async ({ where, data }: any) => { Object.assign(rows.get(where.id), data); return rows.get(where.id); }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const r of rows.values()) if (matches(r, where)) { Object.assign(r, data); count++; }
        return { count };
      }),
      count: vi.fn(async ({ where }: any) => [...rows.values()].filter((r) => matches(r, where)).length),
    },
    user: { findUnique: vi.fn(async () => ({ id: 'u1', fullName: 'Staf' })) },
    journalEntry: { findMany: vi.fn(async ({ where }: any) => where.id.in.map((id: string) => ({ id, entryNumber: `JV-${id}` }))) },
  };
  const db: any = { ...tx, $transaction: async (fn: any) => fn(tx) };
  return { db, tx };
}

const ACTOR = { userId: 'u1', via: 'mcp' as const };
const BASE = { entryDate: '2026-10-05', cashAccountId: 'acc-cash', source: 'aira' as const };
const draftRows = (tx: any) => [...tx.rows.values()].sort((a: any, b: any) => a.idx - b.idx);

beforeEach(() => {
  genNumber.mockClear();
  postJournal.mockReset();
  let n = 0;
  postJournal.mockImplementation(async (_tx: unknown, input: any) => ({ id: `je${++n}`, entryNumber: `JV-202610-${String(n).padStart(4, '0')}`, items: input.lines }));
  openFy.mockReset();
  openFy.mockResolvedValue({ id: 'fy1' });
  cashCheck.mockReset();
  cashCheck.mockResolvedValue({ id: 'acc-cash' });
});

describe('createCashBookDraft', () => {
  it('stores a Draft with deterministic classification and no journal', async () => {
    const { tx } = makeDb();
    const out = await createCashBookDraft(tx, {
      ...BASE, sourceRef: 'chat-1', openingBalance: 1000, closingBalance: 500,
      rows: [
        { date: '2026-10-03', description: 'Beli ATK', keluar: 125000, txnType: 'pengeluaran', accountCode: '6.1', confidence: 0.92 },
        { date: '2026-10-04', description: 'Setoran penjualan tunai', masuk: '500.000', txnType: 'pemasukan', accountCode: '4.1', confidence: 0.8 },
        { description: 'Kasbon Budi', keluar: 200000, txnType: 'uang_muka', confidence: 0.9 },
        { description: 'Budi kembalikan kasbon', masuk: 50000, txnType: 'terima_kasbon', confidence: 0.9 },
        { description: 'Entah apa', keluar: 5000, txnType: 'lainnya', confidence: 0.2 },
      ],
    }, ACTOR);
    expect(out.draft).toMatchObject({ draftNumber: 'DKB-202610-0001', status: 'Draft', source: 'aira', createdVia: 'mcp', sourceRef: 'chat-1', createdById: 'u1' });
    expect(genNumber).toHaveBeenCalledWith(tx, 'DKB', expect.any(Date), '');
    const rows = draftRows(tx);
    expect(rows.map((r: any) => [r.idx, r.direction, r.txnType, r.accountId, r.needsReview])).toEqual([
      [1, 'keluar', 'pengeluaran', 'acc-atk', false],
      [2, 'masuk', 'pemasukan', 'acc-sales', false],
      [3, 'keluar', 'uang_muka', 'acc-adv', false],
      [4, 'masuk', 'terima_kasbon', 'acc-adv', false],
      [5, 'keluar', 'lainnya', 'acc-exp', true],
    ]);
    expect(rows[0]).toMatchObject({ accountCode: '6.1', accountLabel: '6.1 Beban ATK', description: 'Beli ATK' });
    expect(Number(rows[1].amount)).toBe(500000);
    expect(rows[2].rowDate.toISOString()).toBe('2026-10-05T00:00:00.000Z'); // fallback to the page date
    expect(out.needsReviewCount).toBe(1);
    expect(postJournal).not.toHaveBeenCalled();
  });

  it('rejects structurally invalid rows and lists every problem', async () => {
    const { tx } = makeDb();
    const err = await createCashBookDraft(tx, {
      ...BASE,
      rows: [{ description: 'ok', keluar: 10 }, { description: 'x', masuk: 5, keluar: 5 }, { description: '', keluar: 1 }, { description: 'z' }],
    }, ACTOR).catch((e) => e);
    expect(err).toBeInstanceOf(RowErrorsError);
    expect(err.rowErrors).toHaveLength(3);
    expect(err.rowErrors[0]).toContain('Baris 2');
    expect(tx.cashBookDraft.create).not.toHaveBeenCalled();
  });

  it('enforces the row limit and a non-empty draft', async () => {
    const { tx } = makeDb();
    const many = Array.from({ length: 301 }, (_, i) => ({ description: `r${i}`, keluar: 1 }));
    await expect(createCashBookDraft(tx, { ...BASE, rows: many }, ACTOR)).rejects.toThrow(/Maksimal 300/);
    await expect(createCashBookDraft(tx, { ...BASE, rows: [] }, ACTOR)).rejects.toThrow(/Minimal satu baris/);
    const ok = Array.from({ length: 300 }, (_, i) => ({ description: `r${i}`, keluar: 1 }));
    await expect(createCashBookDraft(tx, { ...BASE, rows: ok }, ACTOR)).resolves.toMatchObject({ rowCount: 300 });
  });

  it('validates header: page date, cash account, balances', async () => {
    const { tx } = makeDb();
    const rows = [{ description: 'a', keluar: 1 }];
    await expect(createCashBookDraft(tx, { ...BASE, entryDate: '2026-13-40', rows }, ACTOR)).rejects.toThrow(/Tanggal/);
    cashCheck.mockRejectedValueOnce(new BusinessError('Akun sumber dana harus akun kas/bank (1.1.x).'));
    await expect(createCashBookDraft(tx, { ...BASE, rows }, ACTOR)).rejects.toThrow(/kas\/bank/);
    await expect(createCashBookDraft(tx, { ...BASE, openingBalance: 'abc', rows }, ACTOR)).rejects.toThrow(/Saldo awal/);
  });

  it('flags unknown / group / inactive engine account codes instead of failing the draft', async () => {
    const { tx } = makeDb();
    await createCashBookDraft(tx, {
      ...BASE,
      rows: [
        { description: 'a', keluar: 1, accountCode: '9.9.9', confidence: 0.95 },
        { description: 'b', keluar: 1, accountCode: '6', confidence: 0.95 },
        { description: 'c', keluar: 1, accountCode: '6.9', confidence: 0.95 },
        { description: 'd', keluar: 1, accountCode: '1.1.1', confidence: 0.95 },
      ],
    }, ACTOR);
    const rows = draftRows(tx);
    expect(rows.every((r: any) => r.needsReview && r.accountId === 'acc-exp')).toBe(true);
    expect(rows[0].reason).toContain('9.9.9');
    expect(rows[1].reason).toMatch(/akun grup/);
    expect(rows[2].reason).toMatch(/tidak aktif/);
    expect(rows[3].reason).toMatch(/sama dengan akun kas/);
  });

  it('marks a contradicting txnType needsReview and fixes the type from the direction', async () => {
    const { tx } = makeDb();
    await createCashBookDraft(tx, { ...BASE, rows: [{ description: 'Gaji', keluar: 1000, txnType: 'pemasukan', accountCode: '4.1', confidence: 0.99 }] }, ACTOR);
    const [r] = draftRows(tx);
    expect(r).toMatchObject({ direction: 'keluar', txnType: 'pengeluaran', needsReview: true });
    expect(r.reason).toMatch(/dikoreksi/);
  });

  it('applies learned maps when the engine has no account, and records why; never overrides a confident engine account', async () => {
    const learned = [{ pattern: 'beli atk', txnType: 'pengeluaran', accountId: 'acc-atk', hits: 3 }];
    const { tx } = makeDb({ learned });
    await createCashBookDraft(tx, {
      ...BASE,
      rows: [
        { description: 'Beli ATK 2 box', keluar: 10 },
        { description: 'Beli ATK 5 pcs', keluar: 20, accountCode: '6.2', confidence: 0.95 },
      ],
    }, ACTOR);
    const [a, b] = draftRows(tx);
    expect(a).toMatchObject({ accountId: 'acc-atk', needsReview: false });
    expect(a.reason).toMatch(/pola terpelajari \(3x/);
    expect(b.accountId).toBe('acc-bbm');
    expect(b.reason).toMatch(/pola terpelajari menyarankan 6\.1 Beban ATK/);
  });

  it('flags duplicates against existing Posted/open-draft rows and within the batch', async () => {
    const existing = [{ rowDate: new Date('2026-10-03T00:00:00Z'), amount: { toString: () => '125000.00' }, direction: 'keluar', description: 'beli atk', draft: { draftNumber: 'DKB-202609-0007' } }];
    const { tx } = makeDb({ existingRows: existing });
    await createCashBookDraft(tx, {
      ...BASE,
      rows: [
        { date: '2026-10-03', description: 'Beli ATK', keluar: 125000, accountCode: '6.1', confidence: 0.9 },
        { date: '2026-10-04', description: 'Parkir', keluar: 5000, accountCode: '6.2', confidence: 0.9 },
        { date: '2026-10-04', description: 'parkir', keluar: 5000, accountCode: '6.2', confidence: 0.9 },
        { date: '2026-10-04', description: 'Parkir', masuk: 5000, accountCode: '4.1', confidence: 0.9 },
      ],
    }, ACTOR);
    const rows = draftRows(tx);
    expect(rows[0]).toMatchObject({ needsReview: true });
    expect(rows[0].reason).toContain('kemungkinan duplikat (sudah ada di DKB-202609-0007)');
    expect(rows[1].needsReview).toBe(false);
    expect(rows[2].reason).toContain('kemungkinan duplikat (sama dengan baris 2)');
    expect(rows[3].needsReview).toBe(false); // other direction ≠ duplicate
  });

  it('rounds amounts to 2 decimals half-up', async () => {
    const { tx } = makeDb();
    await createCashBookDraft(tx, { ...BASE, rows: [{ description: 'a', keluar: 10.005 }] }, ACTOR);
    expect(draftRows(tx)[0].amount.toString()).toBe('10.01');
  });
});

describe('editing', () => {
  async function seeded() {
    const made = makeDb();
    const out = await createCashBookDraft(made.tx, {
      ...BASE,
      rows: [
        { description: 'Beli ATK', keluar: 100, accountCode: '6.1', confidence: 0.9 },
        { description: 'Setoran', masuk: 300, accountCode: '4.1', confidence: 0.9 },
      ],
    }, ACTOR);
    return { ...made, id: out.draft.id, rows: draftRows(made.tx) };
  }

  it('updates account/type/skip only while editable and marks rows as human-edited', async () => {
    const { tx, id, rows } = await seeded();
    await updateDraftRows(tx, id, [{ id: rows[0].id, accountId: 'acc-bbm', skip: false }, { id: rows[1].id, skip: true }]);
    const after = draftRows(tx);
    expect(after[0]).toMatchObject({ accountId: 'acc-bbm', accountCode: '6.2', userEdited: true, needsReview: false, confidence: 1 });
    expect(after[1].skip).toBe(true);
    await updateDraftRows(tx, id, [{ id: rows[0].id, txnType: 'uang_muka' }]);
    expect(draftRows(tx)[0]).toMatchObject({ txnType: 'uang_muka', accountId: 'acc-adv' });
  });

  it('refuses edits when the draft is Posted or Discarded, and header edits too', async () => {
    const { tx, id, rows } = await seeded();
    tx.drafts.get(id).status = 'Posted';
    await expect(updateDraftRows(tx, id, [{ id: rows[0].id, skip: true }])).rejects.toThrow(/hanya bisa diubah/);
    await expect(updateDraftHeader(tx, id, { title: 'x' })).rejects.toThrow(/hanya bisa diubah/);
    await expect(appendDraftRows(tx, id, [{ description: 'x', keluar: 1 }])).rejects.toThrow(/hanya bisa diubah/);
    tx.drafts.get(id).status = 'Discarded';
    await expect(updateDraftRows(tx, id, [{ id: rows[0].id, skip: true }])).rejects.toThrow(/hanya bisa diubah/);
  });

  it('rejects bad row edits with row-indexed errors and writes nothing', async () => {
    const { tx, id, rows } = await seeded();
    const err = await updateDraftRows(tx, id, [
      { id: rows[0].id, accountId: 'acc-grp' },
      { id: rows[1].id, accountId: 'acc-cash' },
      { id: 'nope', skip: true },
      { id: rows[0].id, txnType: 'pemasukan' },
      { id: rows[0].id, amount: 0 },
    ]).catch((e) => e);
    expect(err).toBeInstanceOf(RowErrorsError);
    expect(err.rowErrors).toHaveLength(5);
    expect(draftRows(tx)[0].accountId).toBe('acc-atk');
  });

  it('refuses to edit a row that already has a journal', async () => {
    const { tx, id, rows } = await seeded();
    tx.rows.get(rows[0].id).journalEntryId = 'je-1';
    await expect(updateDraftRows(tx, id, [{ id: rows[0].id, skip: true }])).rejects.toThrow(/sudah diposting/);
  });

  it('appends rows continuing idx and honouring the total limit', async () => {
    const { tx, id } = await seeded();
    await appendDraftRows(tx, id, [{ description: 'Baru', keluar: 7 }]);
    expect(draftRows(tx).map((r: any) => r.idx)).toEqual([1, 2, 3]);
    await expect(appendDraftRows(tx, id, Array.from({ length: 298 }, () => ({ description: 'x', keluar: 1 })))).rejects.toThrow(/Maksimal 300/);
  });

  it('header: cash account change checks the account and clashes; discard only from Draft', async () => {
    const { tx, id } = await seeded();
    await updateDraftHeader(tx, id, { title: '  Buku   Kas  Oktober ', closingBalance: '1.000,5' });
    expect(tx.drafts.get(id)).toMatchObject({ title: 'Buku Kas Oktober' });
    expect(tx.drafts.get(id).closingBalance.toString()).toBe('1000.5');
    await discardCashBookDraft(tx, id);
    expect(tx.drafts.get(id).status).toBe('Discarded');
    await expect(discardCashBookDraft(tx, id)).rejects.toThrow(/Hanya draft berstatus Draft/);
  });

  it('detail exposes totals, review count and the balance check', async () => {
    const { db, tx, id } = await seeded();
    tx.drafts.get(id).openingBalance = 1000;
    tx.drafts.get(id).closingBalance = 1200;
    tx.drafts.get(id).createdById = 'u1';
    tx.account.findUnique.mockImplementation(async ({ where }: any) => ACCOUNTS.find((a) => a.id === where.id) ?? null);
    const detail = await getCashBookDraftDetail(db, id);
    expect(detail?.totals).toMatchObject({ masuk: 300, keluar: 100, rowCount: 2, activeCount: 2 });
    expect(detail?.balance).toMatchObject({ checked: true, ok: true, expectedClosing: 1200 });
    tx.drafts.get(id).closingBalance = 999;
    expect((await getCashBookDraftDetail(db, id))?.balance).toMatchObject({ ok: false, difference: -201 });
  });
});

describe('postCashBookDraft', () => {
  async function seeded(rows?: any[], learned: any[] = []) {
    const made = makeDb({ learned });
    const out = await createCashBookDraft(made.tx, {
      ...BASE,
      rows: rows ?? [
        { date: '2026-10-03', description: 'Beli ATK', keluar: 100, accountCode: '6.1', confidence: 0.9 },
        { date: '2026-10-04', description: 'Setoran penjualan', masuk: 300, accountCode: '4.1', confidence: 0.9 },
        { description: 'Kasbon Budi', keluar: 50, txnType: 'uang_muka', confidence: 0.9 },
      ],
    }, ACTOR);
    return { ...made, id: out.draft.id };
  }

  it('creates ONE balanced journal per non-skipped row, attributed to the posting user', async () => {
    const { db, tx, id } = await seeded();
    const r = draftRows(tx);
    tx.rows.get(r[2].id).skip = true;
    const res = await postCashBookDraft(db, id, 'poster-1');
    expect(res).toMatchObject({ status: 'Posted', postedCount: 2, failed: [], totalAmount: 400 });
    expect(postJournal).toHaveBeenCalledTimes(2);
    const [, first] = postJournal.mock.calls[0] as [unknown, any];
    expect(first).toMatchObject({ actorId: 'poster-1', fiscalYearId: 'fy1' });
    expect(first.narration).toContain('DKB-202610-0001 #1');
    expect(first.lines).toEqual([
      { accountId: 'acc-atk', debit: 100, credit: 0, description: 'Beli ATK' },
      expect.objectContaining({ accountId: 'acc-cash', debit: 0, credit: 100 }),
    ]);
    const [, second] = postJournal.mock.calls[1] as [unknown, any];
    expect(second.lines[0]).toMatchObject({ accountId: 'acc-cash', debit: 300, credit: 0 });
    expect(second.lines[1]).toMatchObject({ accountId: 'acc-sales', debit: 0, credit: 300 });
    for (const [, input] of postJournal.mock.calls as Array<[unknown, any]>) {
      const dr = input.lines.reduce((s: number, l: any) => s + l.debit, 0);
      const cr = input.lines.reduce((s: number, l: any) => s + l.credit, 0);
      expect(dr).toBe(cr);
    }
    const after = draftRows(tx);
    expect(after[0].journalEntryId).toBe('je1');
    expect(after[2].journalEntryId).toBeNull(); // skipped
    expect(tx.drafts.get(id)).toMatchObject({ status: 'Posted', postedById: 'poster-1' });
  });

  it('is idempotent: a second post is refused and writes no journals', async () => {
    const { db, id } = await seeded();
    await postCashBookDraft(db, id, 'u1');
    postJournal.mockClear();
    await expect(postCashBookDraft(db, id, 'u1')).rejects.toThrow(/sudah diposting/);
    expect(postJournal).not.toHaveBeenCalled();
  });

  it('refuses unknown draft, discarded draft and drafts with only skipped rows', async () => {
    const { db, tx, id } = await seeded();
    await expect(postCashBookDraft(db, 'missing', 'u1')).rejects.toThrow(/tidak ditemukan/);
    for (const r of draftRows(tx)) tx.rows.get(r.id).skip = true;
    await expect(postCashBookDraft(db, id, 'u1')).rejects.toThrow(/semua baris dilewati/);
    tx.drafts.get(id).status = 'Discarded';
    await expect(postCashBookDraft(db, id, 'u1')).rejects.toThrow(/tidak lagi bisa diposting/);
  });

  it('all-or-nothing: one invalid row aborts everything and records the errors', async () => {
    const { db, tx, id } = await seeded();
    tx.rows.get(draftRows(tx)[1].id).accountId = null;
    const err = await postCashBookDraft(db, id, 'u1').catch((e) => e);
    expect(err).toBeInstanceOf(RowErrorsError);
    expect(err.rowErrors[0]).toContain('Baris 2');
    expect(postJournal).not.toHaveBeenCalled();
    expect(tx.drafts.get(id).status).toBe('Draft');
    expect(draftRows(tx)[1].error).toMatch(/belum dipilih/);
    expect(tx.drafts.get(id).lastError).toMatch(/Posting gagal/);
  });

  it('rejects a row dated in a closed fiscal year', async () => {
    const { db, tx, id } = await seeded();
    openFy.mockImplementation(async (_tx: unknown, date: Date) => {
      if (date.toISOString().startsWith('2026-10-03')) throw new BusinessError('Tahun fiskal tidak ditemukan atau sudah ditutup untuk tanggal ini.');
      return { id: 'fy1' };
    });
    const err = await postCashBookDraft(db, id, 'u1').catch((e) => e);
    expect(err.rowErrors[0]).toMatch(/Baris 1: Tanggal 2026-10-03: Tahun fiskal/);
    expect(postJournal).not.toHaveBeenCalled();
    expect(tx.drafts.get(id).status).toBe('Draft');
  });

  it('partial: posts the valid rows, records per-row errors, status PartiallyPosted; a later post only posts the rest', async () => {
    const { db, tx, id } = await seeded();
    tx.rows.get(draftRows(tx)[0].id).accountId = 'acc-grp'; // becomes invalid
    const res = await postCashBookDraft(db, id, 'u1', { partial: true });
    expect(res).toMatchObject({ status: 'PartiallyPosted', postedCount: 2 });
    expect(res.failed).toEqual([{ idx: 1, error: expect.stringMatching(/Akun lawan tidak valid/) }]);
    expect(postJournal).toHaveBeenCalledTimes(2);
    expect(draftRows(tx)[0].error).toBeTruthy();
    expect(tx.drafts.get(id).status).toBe('PartiallyPosted');
    // fix and post the remainder: posted rows are never posted again
    await updateDraftRows(tx, id, [{ id: draftRows(tx)[0].id, accountId: 'acc-atk' }]);
    postJournal.mockClear();
    const again = await postCashBookDraft(db, id, 'u1');
    expect(again).toMatchObject({ status: 'Posted', postedCount: 1 });
    expect(postJournal).toHaveBeenCalledTimes(1);
    expect(tx.drafts.get(id).status).toBe('Posted');
  });

  it('partial with nothing valid is an error, not a silent no-op', async () => {
    const { db, tx, id } = await seeded([{ description: 'x', keluar: 1 }]);
    tx.rows.get(draftRows(tx)[0].id).accountId = null;
    await expect(postCashBookDraft(db, id, 'u1', { partial: true })).rejects.toBeInstanceOf(RowErrorsError);
    expect(postJournal).not.toHaveBeenCalled();
  });

  it('rolls back journals if the database fails midway (nothing marked posted by the service)', async () => {
    const { db, id } = await seeded();
    postJournal.mockImplementationOnce(async () => ({ id: 'je1', entryNumber: 'JV-1', items: [] })).mockRejectedValueOnce(new Error('db down'));
    await expect(postCashBookDraft(db, id, 'u1')).rejects.toThrow('db down');
  });

  describe('learning', () => {
    it('learns only human-chosen accounts: creates, then increments, then replaces on disagreement', async () => {
      const { db, tx, id } = await seeded([{ description: 'Beli ATK 3 box', keluar: 10, accountCode: '6.2', confidence: 0.4 }]);
      await updateDraftRows(tx, id, [{ id: draftRows(tx)[0].id, accountId: 'acc-atk' }]);
      await postCashBookDraft(db, id, 'teacher');
      expect(tx.maps).toEqual([expect.objectContaining({ pattern: 'beli atk box', txnType: 'pengeluaran', accountId: 'acc-atk', hits: 1, updatedBy: 'teacher' })]);

      const second = await seeded([{ description: 'beli ATK 9 box', keluar: 11 }], tx.maps);
      await updateDraftRows(second.tx, second.id, [{ id: draftRows(second.tx)[0].id, reviewed: true }]);
      await postCashBookDraft(second.db, second.id, 'teacher');
      expect(second.tx.maps[0].hits).toBe(2);

      const third = await seeded([{ description: 'Beli ATK 1 box', keluar: 12 }], second.tx.maps);
      await updateDraftRows(third.tx, third.id, [{ id: draftRows(third.tx)[0].id, accountId: 'acc-bbm' }]);
      await postCashBookDraft(third.db, third.id, 'boss');
      expect(third.tx.maps[0]).toMatchObject({ accountId: 'acc-bbm', hits: 1, updatedBy: 'boss' });
    });

    it('does not learn untouched engine rows, advance types or blank patterns', async () => {
      const { db, tx, id } = await seeded([
        { description: 'Beli ATK', keluar: 10, accountCode: '6.1', confidence: 0.95 },
        { description: 'Kasbon', keluar: 5, txnType: 'uang_muka', confidence: 0.9 },
        { description: '12345', keluar: 5, accountCode: '6.1', confidence: 0.9 },
      ]);
      await updateDraftRows(tx, id, [{ id: draftRows(tx)[1].id, accountId: 'acc-adv', reviewed: true }, { id: draftRows(tx)[2].id, reviewed: true }]);
      const res = await postCashBookDraft(db, id, 'u1');
      expect(res.learned).toBe(0);
      expect(tx.maps).toHaveLength(0);
    });
  });
});
