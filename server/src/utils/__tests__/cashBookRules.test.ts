import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  ROW_LIMIT,
  TXN_TYPES,
  applyRowEdit,
  balanceCheck,
  buildRowJournalLines,
  checkRowCount,
  classifyRow,
  clampConfidence,
  coerceTxnType,
  computeTotals,
  descriptionPattern,
  duplicateKey,
  learnedConfidence,
  matchLearned,
  mergeReasons,
  normalizeDateInput,
  normalizeRowInput,
  parseMoney,
  roundMoney,
  txnTypeFits,
  type ClassifyInput,
  type Direction,
  type LearnedMapEntry,
  type TxnType,
} from '../cashBookRules';

const CASH = 'acc-cash';
const ADV = 'acc-adv';
const EXP = 'acc-exp';
const INC = 'acc-inc';
const BEBAN_ATK = 'acc-atk';
const SALES = 'acc-sales';

const cls = (over: Partial<ClassifyInput> & { direction: Direction }): ClassifyInput => ({
  engine: {},
  learned: null,
  cashAccountId: CASH,
  advanceAccountId: ADV,
  defaultExpenseAccountId: EXP,
  defaultIncomeAccountId: INC,
  ...over,
});

describe('txnTypeFits / coerceTxnType', () => {
  const table: Array<[TxnType, Direction, boolean]> = [
    ['pengeluaran', 'keluar', true],
    ['pengeluaran', 'masuk', false],
    ['pemasukan', 'masuk', true],
    ['pemasukan', 'keluar', false],
    ['uang_muka', 'keluar', true],
    ['uang_muka', 'masuk', false],
    ['terima_kasbon', 'masuk', true],
    ['terima_kasbon', 'keluar', false],
    ['lainnya', 'masuk', true],
    ['lainnya', 'keluar', true],
  ];
  it.each(table)('%s × %s fits=%s', (t, d, fits) => {
    expect(txnTypeFits(t, d)).toBe(fits);
  });
  it('coerces a contradicting type to the plain type of the real direction', () => {
    expect(coerceTxnType('pemasukan', 'keluar')).toBe('pengeluaran');
    expect(coerceTxnType('terima_kasbon', 'keluar')).toBe('pengeluaran');
    expect(coerceTxnType('pengeluaran', 'masuk')).toBe('pemasukan');
    expect(coerceTxnType('uang_muka', 'masuk')).toBe('pemasukan');
    expect(coerceTxnType('lainnya', 'masuk')).toBe('lainnya');
    expect(coerceTxnType('uang_muka', 'keluar')).toBe('uang_muka');
  });
});

describe('parseMoney', () => {
  it.each([
    [undefined, '0'],
    [null, '0'],
    ['', '0'],
    [1500, '1500'],
    [1500.456, '1500.46'],
    [0.005, '0.01'],
    ['1500', '1500'],
    ['Rp 1.250.000', '1250000'],
    ['Rp. 1.250.000,50', '1250000.5'],
    ['1,250,000.50', '1250000.5'],
    ['1.500', '1500'],
    ['12.5', '12.5'],
    ['0.500', '0.5'],
    ['1500,75', '1500.75'],
    ['1234.567', '1234.57'],
    ['(500)', '-500'],
    ['-500', '-500'],
    ['IDR 2.000', '2000'],
  ])('%j -> %s', (input, out) => {
    expect(parseMoney(input)?.toString()).toBe(out);
  });
  it.each(['abc', '1.2.3,4,5x', '--', {}, NaN, Infinity, true])('rejects %j', (v) => {
    expect(parseMoney(v)).toBeNull();
  });
  it('rounds half up to 2 decimals', () => {
    expect(roundMoney('1.005').toString()).toBe('1.01');
    expect(roundMoney('1.004').toString()).toBe('1');
    expect(roundMoney('2.675').toString()).toBe('2.68');
  });
});

describe('normalizeDateInput', () => {
  it('accepts ISO and Indonesian formats', () => {
    expect(normalizeDateInput('2026-10-05')).toBe('2026-10-05');
    expect(normalizeDateInput('2026-1-5')).toBe('2026-01-05');
    expect(normalizeDateInput('05/10/2026')).toBe('2026-10-05');
    expect(normalizeDateInput('5-10-2026')).toBe('2026-10-05');
    expect(normalizeDateInput('2026-10-05T10:00:00Z')).toBe('2026-10-05');
  });
  it('rejects impossible or malformed dates', () => {
    expect(normalizeDateInput('2026-02-30')).toBeNull();
    expect(normalizeDateInput('31/04/2026')).toBeNull();
    expect(normalizeDateInput('2026/10/05')).toBeNull();
    expect(normalizeDateInput('besok')).toBeNull();
    expect(normalizeDateInput(20261005)).toBeNull();
  });
  it('accepts a leap day only in a leap year', () => {
    expect(normalizeDateInput('2028-02-29')).toBe('2028-02-29');
    expect(normalizeDateInput('2027-02-29')).toBeNull();
  });
});

describe('normalizeRowInput', () => {
  const FALLBACK = '2026-10-01';
  it('masuk/keluar pair: keluar row', () => {
    const r = normalizeRowInput({ date: '2026-10-03', description: '  Beli   ATK ', keluar: 125000 }, 1, FALLBACK);
    expect(r).toMatchObject({ ok: true, value: { idx: 1, date: '2026-10-03', description: 'Beli ATK', direction: 'keluar' } });
    if (r.ok) expect(r.value.amount.toString()).toBe('125000');
  });
  it('masuk/keluar pair: masuk row with 0 keluar and fallback date', () => {
    const r = normalizeRowInput({ description: 'Setoran', masuk: '500.000', keluar: 0 }, 2, FALLBACK);
    expect(r).toMatchObject({ ok: true, value: { date: FALLBACK, direction: 'masuk' } });
  });
  it('amount + direction form', () => {
    const r = normalizeRowInput({ description: 'x', amount: 10.005, direction: 'keluar' }, 3, FALLBACK);
    expect(r.ok && r.value.amount.toString()).toBe('10.01');
  });
  it('rounds to 2 decimals half-up', () => {
    const r = normalizeRowInput({ description: 'x', masuk: 100.125 }, 1, FALLBACK);
    expect(r.ok && r.value.amount.toString()).toBe('100.13');
  });
  it.each([
    [{ description: '', keluar: 1 }, 'keterangan wajib'],
    [{ description: '   ', keluar: 1 }, 'keterangan wajib'],
    [{ keluar: 1 }, 'keterangan wajib'],
    [{ description: 'x'.repeat(501), keluar: 1 }, 'maksimal 500'],
    [{ description: 'x', masuk: 5, keluar: 5 }, 'salah satu saja'],
    [{ description: 'x', masuk: 0, keluar: 0 }, 'lebih dari 0'],
    [{ description: 'x' }, 'arah harus'],
    [{ description: 'x', masuk: -5 }, 'negatif'],
    [{ description: 'x', masuk: 'abc' }, 'bukan angka'],
    [{ description: 'x', amount: 0, direction: 'masuk' }, 'lebih dari 0'],
    [{ description: 'x', amount: 5, direction: 'sideways' }, 'arah harus'],
    [{ description: 'x', amount: 'zz', direction: 'masuk' }, 'bukan angka'],
    [{ description: 'x', date: '31/02/2026', keluar: 1 }, 'tanggal'],
    [{ description: 'x', keluar: 1e19 }, 'terlalu besar'],
    [{ description: 'x', masuk: 0.001 }, 'lebih dari 0'],
  ])('rejects %j', (raw, fragment) => {
    const r = normalizeRowInput(raw as never, 7, FALLBACK);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('Baris 7');
      expect(r.error).toContain(fragment);
    }
  });
});

describe('checkRowCount', () => {
  it('enforces 1..ROW_LIMIT', () => {
    expect(ROW_LIMIT).toBe(300);
    expect(checkRowCount(0, 0)).toMatch(/Minimal/);
    expect(checkRowCount(0, 1)).toBeNull();
    expect(checkRowCount(0, 300)).toBeNull();
    expect(checkRowCount(0, 301)).toMatch(/Maksimal 300/);
    expect(checkRowCount(250, 50)).toBeNull();
    expect(checkRowCount(250, 51)).toMatch(/Maksimal 300/);
  });
});

describe('descriptionPattern / duplicateKey', () => {
  it('drops numbers, single chars, punctuation, case and diacritics', () => {
    expect(descriptionPattern('Beli ATK 2 box, Rp 50.000!')).toBe('beli atk box rp');
    expect(descriptionPattern('BELI atk 7 BOX')).toBe('beli atk box');
    expect(descriptionPattern('Café  Bensin')).toBe('cafe bensin');
    expect(descriptionPattern('1 2 3 a b')).toBe('');
  });
  it('caps the token count and length', () => {
    const long = Array.from({ length: 40 }, (_, i) => `kata${String.fromCharCode(97 + (i % 26))}x`).join(' ');
    expect(descriptionPattern(long).split(' ').length).toBeLessThanOrEqual(12);
    expect(descriptionPattern(long).length).toBeLessThanOrEqual(120);
  });
  it('duplicateKey ignores case/spacing/punctuation but not digits, direction or amount', () => {
    const a = duplicateKey('2026-10-01', 1000, 'keluar', 'Beli  ATK, 2 box');
    expect(duplicateKey('2026-10-01', '1000.00', 'keluar', 'beli atk 2 BOX')).toBe(a);
    expect(duplicateKey('2026-10-01', 1000, 'keluar', 'beli atk 3 box')).not.toBe(a);
    expect(duplicateKey('2026-10-01', 1000.01, 'keluar', 'beli atk 2 box')).not.toBe(a);
    expect(duplicateKey('2026-10-01', 1000, 'masuk', 'beli atk 2 box')).not.toBe(a);
    expect(duplicateKey('2026-10-02', 1000, 'keluar', 'beli atk 2 box')).not.toBe(a);
  });
});

describe('matchLearned', () => {
  const maps: LearnedMapEntry[] = [
    { pattern: 'beli atk', txnType: 'pengeluaran', accountId: BEBAN_ATK, hits: 2 },
    { pattern: 'bensin motor operasional', txnType: 'pengeluaran', accountId: 'acc-bbm', hits: 1 },
    { pattern: 'setoran penjualan', txnType: 'pemasukan', accountId: SALES, hits: 5 },
  ];
  it('matches exact normalised pattern', () => {
    expect(matchLearned('Beli ATK 3 pcs', 'keluar', maps)?.accountId).toBe(BEBAN_ATK);
  });
  it('matches by token overlap (Jaccard >= 0.6)', () => {
    expect(matchLearned('bensin motor', 'keluar', maps)?.accountId).toBe('acc-bbm'); // 2/3
    expect(matchLearned('bensin', 'keluar', maps)).toBeNull(); // 1/3
  });
  it('does not match unrelated text or empty patterns', () => {
    expect(matchLearned('gaji harian', 'keluar', maps)).toBeNull();
    expect(matchLearned('12 34', 'keluar', maps)).toBeNull();
  });
  it('respects direction (type must fit)', () => {
    expect(matchLearned('beli atk', 'masuk', maps)).toBeNull();
    expect(matchLearned('setoran penjualan', 'masuk', maps)?.accountId).toBe(SALES);
    expect(matchLearned('setoran penjualan', 'keluar', maps)).toBeNull();
  });
  it('prefers the higher score, then more hits', () => {
    const m: LearnedMapEntry[] = [
      { pattern: 'beli atk kantor', txnType: 'pengeluaran', accountId: 'a', hits: 9 },
      { pattern: 'beli atk', txnType: 'pengeluaran', accountId: 'b', hits: 1 },
    ];
    expect(matchLearned('beli atk', 'keluar', m)?.accountId).toBe('b');
    const tie: LearnedMapEntry[] = [
      { pattern: 'beli atk', txnType: 'pengeluaran', accountId: 'x', hits: 1 },
      { pattern: 'beli atk', txnType: 'lainnya', accountId: 'y', hits: 4 },
    ];
    expect(matchLearned('beli atk', 'keluar', tie)?.accountId).toBe('y');
  });
  it('ignores maps with unknown types', () => {
    expect(matchLearned('beli atk', 'keluar', [{ pattern: 'beli atk', txnType: 'zzz', accountId: 'a', hits: 1 }])).toBeNull();
  });
  it('learnedConfidence: one hit stays below the review threshold', () => {
    expect(learnedConfidence(1)).toBeLessThan(0.7);
    expect(learnedConfidence(2)).toBeGreaterThanOrEqual(0.7);
    expect(learnedConfidence(3)).toBeGreaterThan(learnedConfidence(2));
    expect(learnedConfidence(50)).toBe(learnedConfidence(3));
  });
});

describe('clampConfidence / mergeReasons', () => {
  it('clamps and rounds to 3 dp', () => {
    expect(clampConfidence(0.12345)).toBe(0.123);
    expect(clampConfidence(5)).toBe(1);
    expect(clampConfidence(-1)).toBe(0);
    expect(clampConfidence('0.8')).toBe(0.8);
    expect(clampConfidence('x')).toBe(0);
    expect(clampConfidence(undefined)).toBe(0);
    expect(clampConfidence(NaN)).toBe(0);
  });
  it('dedupes, trims, caps length', () => {
    expect(mergeReasons([null, ' a ', 'a', undefined, 'b'])).toBe('a; b');
    expect(mergeReasons([null, ''])).toBeNull();
    expect(mergeReasons(['x'.repeat(900)])?.length).toBe(500);
  });
});

describe('classifyRow — every txnType × direction', () => {
  it('pengeluaran/keluar with a confident engine account keeps it (no review)', () => {
    const r = classifyRow(cls({ direction: 'keluar', engine: { txnType: 'pengeluaran', accountId: BEBAN_ATK, confidence: 0.9 } }));
    expect(r).toMatchObject({ txnType: 'pengeluaran', accountId: BEBAN_ATK, needsReview: false, source: 'engine', contradiction: false });
  });
  it('pemasukan/masuk keeps the engine source account', () => {
    const r = classifyRow(cls({ direction: 'masuk', engine: { txnType: 'pemasukan', accountId: SALES, confidence: 0.85 } }));
    expect(r).toMatchObject({ txnType: 'pemasukan', accountId: SALES, needsReview: false });
  });
  it('uang_muka/keluar forces the advance account regardless of the engine account', () => {
    const r = classifyRow(cls({ direction: 'keluar', engine: { txnType: 'uang_muka', accountId: BEBAN_ATK, confidence: 0.95 } }));
    expect(r).toMatchObject({ txnType: 'uang_muka', accountId: ADV, source: 'advance', needsReview: false });
  });
  it('terima_kasbon/masuk forces the advance account', () => {
    const r = classifyRow(cls({ direction: 'masuk', engine: { txnType: 'terima_kasbon', confidence: 0.9 } }));
    expect(r).toMatchObject({ txnType: 'terima_kasbon', accountId: ADV, needsReview: false });
  });
  it('advance type without a mapped advance account: no account, needsReview, explained', () => {
    const r = classifyRow(cls({ direction: 'keluar', advanceAccountId: null, engine: { txnType: 'uang_muka', confidence: 0.9 } }));
    expect(r.accountId).toBeNull();
    expect(r.needsReview).toBe(true);
    expect(r.reason).toMatch(/Uang Muka Karyawan/);
  });
  it('lainnya/keluar: engine account kept but ALWAYS needsReview', () => {
    const r = classifyRow(cls({ direction: 'keluar', engine: { txnType: 'lainnya', accountId: BEBAN_ATK, confidence: 0.99 } }));
    expect(r).toMatchObject({ txnType: 'lainnya', accountId: BEBAN_ATK, needsReview: true });
  });
  it('lainnya/keluar without account: default expense account, needsReview', () => {
    const r = classifyRow(cls({ direction: 'keluar', engine: { txnType: 'lainnya', confidence: 0.9 } }));
    expect(r).toMatchObject({ accountId: EXP, needsReview: true, source: 'default' });
    expect(r.confidence).toBeLessThanOrEqual(0.3);
    expect(r.reason).toMatch(/beban lain-lain/);
  });
  it('lainnya/masuk without account: default income account', () => {
    const r = classifyRow(cls({ direction: 'masuk', engine: { txnType: 'lainnya' } }));
    expect(r).toMatchObject({ txnType: 'lainnya', accountId: INC, needsReview: true, source: 'default' });
  });
  it('no default configured: account stays empty and is explained', () => {
    const r = classifyRow(cls({ direction: 'keluar', defaultExpenseAccountId: null, engine: {} }));
    expect(r.accountId).toBeNull();
    expect(r.needsReview).toBe(true);
    expect(r.reason).toMatch(/belum dipilih/);
  });
  it('no engine type: inferred from direction', () => {
    expect(classifyRow(cls({ direction: 'keluar', engine: { accountId: BEBAN_ATK, confidence: 0.8 } })).txnType).toBe('pengeluaran');
    expect(classifyRow(cls({ direction: 'masuk', engine: { accountId: SALES, confidence: 0.8 } })).txnType).toBe('pemasukan');
  });
  it('unknown engine type is ignored with a note', () => {
    const r = classifyRow(cls({ direction: 'keluar', engine: { txnType: 'sedekah', accountId: BEBAN_ATK, confidence: 0.9 } }));
    expect(r.txnType).toBe('pengeluaran');
    expect(r.reason).toMatch(/tidak dikenal/);
  });
});

describe('classifyRow — contradictions (direction is authoritative)', () => {
  it('pemasukan with keluar -> pengeluaran, needsReview, confidence capped', () => {
    const r = classifyRow(cls({ direction: 'keluar', engine: { txnType: 'pemasukan', accountId: SALES, confidence: 0.95 } }));
    expect(r).toMatchObject({ txnType: 'pengeluaran', contradiction: true, needsReview: true });
    expect(r.confidence).toBeLessThanOrEqual(0.5);
    expect(r.reason).toMatch(/tidak cocok dengan arah kas keluar/);
    // low confidence after the cap: the engine account is kept only as a low-confidence suggestion
    expect(r.accountId).toBe(SALES);
  });
  it('pengeluaran with masuk -> pemasukan', () => {
    const r = classifyRow(cls({ direction: 'masuk', engine: { txnType: 'pengeluaran', accountId: BEBAN_ATK, confidence: 0.9 } }));
    expect(r).toMatchObject({ txnType: 'pemasukan', contradiction: true, needsReview: true });
  });
  it('uang_muka with masuk -> pemasukan and the advance account is NOT carried over', () => {
    const r = classifyRow(cls({ direction: 'masuk', engine: { txnType: 'uang_muka', accountId: ADV, confidence: 0.9 } }));
    expect(r.txnType).toBe('pemasukan');
    expect(r.accountId).toBe(INC);
    expect(r.accountId).not.toBe(ADV);
    expect(r.needsReview).toBe(true);
  });
  it('terima_kasbon with keluar -> pengeluaran, advance account dropped', () => {
    const r = classifyRow(cls({ direction: 'keluar', engine: { txnType: 'terima_kasbon', accountId: ADV, confidence: 0.9 } }));
    expect(r.txnType).toBe('pengeluaran');
    expect(r.accountId).toBe(EXP);
    expect(r.contradiction).toBe(true);
  });
  it('lainnya never contradicts', () => {
    expect(classifyRow(cls({ direction: 'masuk', engine: { txnType: 'lainnya' } })).contradiction).toBe(false);
    expect(classifyRow(cls({ direction: 'keluar', engine: { txnType: 'lainnya' } })).contradiction).toBe(false);
  });
});

describe('classifyRow — confidence, account problems, learned maps', () => {
  const learned: LearnedMapEntry = { pattern: 'beli atk', txnType: 'pengeluaran', accountId: BEBAN_ATK, hits: 3 };

  it('confidence < 0.7 flags needsReview, >= 0.7 does not', () => {
    expect(classifyRow(cls({ direction: 'keluar', engine: { accountId: BEBAN_ATK, confidence: 0.699 } })).needsReview).toBe(true);
    expect(classifyRow(cls({ direction: 'keluar', engine: { accountId: BEBAN_ATK, confidence: 0.7 } })).needsReview).toBe(false);
  });
  it('engine account equal to the cash account is ignored', () => {
    const r = classifyRow(cls({ direction: 'keluar', engine: { accountId: CASH, confidence: 0.9 } }));
    expect(r.accountId).toBe(EXP);
    expect(r.reason).toMatch(/sama dengan akun kas/);
  });
  it('unknown account code (problem text) is reported and flagged', () => {
    const r = classifyRow(cls({ direction: 'keluar', engine: { accountProblem: 'kode akun "9.9.9" tidak ditemukan', confidence: 0.9 } }));
    expect(r.needsReview).toBe(true);
    expect(r.reason).toMatch(/9\.9\.9/);
    expect(r.accountId).toBe(EXP);
  });
  it('learned map fills a missing engine account', () => {
    const r = classifyRow(cls({ direction: 'keluar', learned, learnedAccountLabel: '6.1 Beban ATK', engine: { txnType: 'pengeluaran', confidence: 0.2 } }));
    expect(r).toMatchObject({ accountId: BEBAN_ATK, source: 'learned', needsReview: false });
    expect(r.confidence).toBe(learnedConfidence(3));
    expect(r.reason).toMatch(/pola terpelajari/);
  });
  it('learned map with a single hit still needs review', () => {
    const r = classifyRow(cls({ direction: 'keluar', learned: { ...learned, hits: 1 }, engine: {} }));
    expect(r).toMatchObject({ accountId: BEBAN_ATK, source: 'learned', needsReview: true });
  });
  it('learned map replaces a LOW-confidence engine account and says so', () => {
    const r = classifyRow(cls({ direction: 'keluar', learned, engineAccountLabel: '6.9 Lain', engine: { accountId: 'acc-other', confidence: 0.4 } }));
    expect(r.accountId).toBe(BEBAN_ATK);
    expect(r.reason).toMatch(/menggantikan usulan engine/);
  });
  it('never overrides a HIGH-confidence engine account silently', () => {
    const r = classifyRow(cls({ direction: 'keluar', learned, learnedAccountLabel: '6.1 Beban ATK', engine: { accountId: 'acc-other', confidence: 0.92 } }));
    expect(r.accountId).toBe('acc-other');
    expect(r.source).toBe('engine');
    expect(r.reason).toMatch(/pola terpelajari menyarankan 6\.1 Beban ATK/);
    expect(r.needsReview).toBe(false);
  });
  it('learned map pointing at the cash account is ignored', () => {
    const r = classifyRow(cls({ direction: 'keluar', learned: { ...learned, accountId: CASH }, engine: {} }));
    expect(r.source).toBe('default');
  });
  it('learned map is not used for advance types (account is deterministic)', () => {
    const r = classifyRow(cls({ direction: 'keluar', learned, engine: { txnType: 'uang_muka', confidence: 0.1 } }));
    expect(r.accountId).toBe(ADV);
  });
  it('low-confidence engine account without a learned map is kept but flagged', () => {
    const r = classifyRow(cls({ direction: 'keluar', engine: { accountId: BEBAN_ATK, confidence: 0.5 } }));
    expect(r).toMatchObject({ accountId: BEBAN_ATK, needsReview: true, source: 'engine' });
  });
  it('engine reason is preserved first and truncated', () => {
    const r = classifyRow(cls({ direction: 'keluar', engine: { accountId: BEBAN_ATK, confidence: 0.9, reason: 'nota toko ATK' } }));
    expect(r.reason).toBe('nota toko ATK');
  });
  it('covers every type for both directions without throwing', () => {
    for (const t of TXN_TYPES) {
      for (const d of ['masuk', 'keluar'] as const) {
        const r = classifyRow(cls({ direction: d, engine: { txnType: t, accountId: BEBAN_ATK, confidence: 0.8 } }));
        expect(txnTypeFits(r.txnType, d)).toBe(true);
      }
    }
  });
});

describe('applyRowEdit', () => {
  const base = { direction: 'keluar' as const, txnType: 'pengeluaran' as const, accountId: BEBAN_ATK };
  it('changes the account only', () => {
    expect(applyRowEdit(base, { accountId: 'x' }, ADV)).toEqual({ ok: true, value: { ...base, accountId: 'x' } });
  });
  it('rejects an explicit type that contradicts the direction', () => {
    const r = applyRowEdit(base, { txnType: 'pemasukan' }, ADV);
    expect(r.ok).toBe(false);
  });
  it('switching to an advance type forces the advance account', () => {
    expect(applyRowEdit(base, { txnType: 'uang_muka' }, ADV)).toEqual({ ok: true, value: { direction: 'keluar', txnType: 'uang_muka', accountId: ADV } });
  });
  it('advance type without a mapped advance account fails', () => {
    expect(applyRowEdit(base, { txnType: 'uang_muka' }, null).ok).toBe(false);
  });
  it('leaving an advance type clears the advance account unless one is given', () => {
    const adv = { direction: 'keluar' as const, txnType: 'uang_muka' as const, accountId: ADV };
    expect(applyRowEdit(adv, { txnType: 'pengeluaran' }, ADV)).toEqual({ ok: true, value: { direction: 'keluar', txnType: 'pengeluaran', accountId: null } });
    expect(applyRowEdit(adv, { txnType: 'pengeluaran', accountId: EXP }, ADV)).toEqual({ ok: true, value: { direction: 'keluar', txnType: 'pengeluaran', accountId: EXP } });
  });
  it('flipping the direction coerces the type', () => {
    expect(applyRowEdit(base, { direction: 'masuk' }, ADV)).toEqual({ ok: true, value: { direction: 'masuk', txnType: 'pemasukan', accountId: BEBAN_ATK } });
    const adv = { direction: 'keluar' as const, txnType: 'uang_muka' as const, accountId: ADV };
    const r = applyRowEdit(adv, { direction: 'masuk' }, ADV);
    expect(r.ok && r.value.txnType).toBe('pemasukan');
    expect(r.ok && r.value.accountId).toBeNull();
  });
  it('flipping direction together with a fitting type is accepted', () => {
    expect(applyRowEdit(base, { direction: 'masuk', txnType: 'terima_kasbon' }, ADV)).toEqual({ ok: true, value: { direction: 'masuk', txnType: 'terima_kasbon', accountId: ADV } });
  });
  it('can clear the account', () => {
    expect(applyRowEdit(base, { accountId: null }, ADV)).toEqual({ ok: true, value: { ...base, accountId: null } });
  });
});

describe('buildRowJournalLines — DR/CR per txnType × direction', () => {
  const row = (txnType: string, direction: string, over: object = {}) => ({ txnType, direction, amount: 100000, accountId: 'acc-x', description: 'ket', ...over });
  const cases: Array<[TxnType, Direction, 'DR_ACCOUNT' | 'DR_CASH']> = [
    ['pengeluaran', 'keluar', 'DR_ACCOUNT'],
    ['pemasukan', 'masuk', 'DR_CASH'],
    ['uang_muka', 'keluar', 'DR_ACCOUNT'],
    ['terima_kasbon', 'masuk', 'DR_CASH'],
    ['lainnya', 'keluar', 'DR_ACCOUNT'],
    ['lainnya', 'masuk', 'DR_CASH'],
  ];
  it.each(cases)('%s / %s -> %s', (t, d, shape) => {
    const r = buildRowJournalLines(row(t, d), CASH, 'Buku Kas DKB-1 #1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [first, second] = r.value;
    if (shape === 'DR_ACCOUNT') {
      expect(first).toMatchObject({ accountId: 'acc-x', debit: 100000, credit: 0 });
      expect(second).toMatchObject({ accountId: CASH, debit: 0, credit: 100000 });
    } else {
      expect(first).toMatchObject({ accountId: CASH, debit: 100000, credit: 0 });
      expect(second).toMatchObject({ accountId: 'acc-x', debit: 0, credit: 100000 });
    }
    const dr = r.value.reduce((s, l) => s + l.debit, 0);
    const cr = r.value.reduce((s, l) => s + l.credit, 0);
    expect(dr).toBe(cr);
  });
  it.each([
    ['pemasukan', 'keluar'],
    ['pengeluaran', 'masuk'],
    ['uang_muka', 'masuk'],
    ['terima_kasbon', 'keluar'],
  ])('refuses %s with %s', (t, d) => {
    expect(buildRowJournalLines(row(t, d), CASH, 'n').ok).toBe(false);
  });
  it('refuses missing account, cash == account, zero/negative amount, junk type/direction', () => {
    expect(buildRowJournalLines(row('pengeluaran', 'keluar', { accountId: null }), CASH, 'n')).toMatchObject({ ok: false, error: expect.stringMatching(/belum dipilih/) });
    expect(buildRowJournalLines(row('pengeluaran', 'keluar', { accountId: CASH }), CASH, 'n')).toMatchObject({ ok: false, error: expect.stringMatching(/sama dengan akun kas/) });
    expect(buildRowJournalLines(row('pengeluaran', 'keluar', { amount: 0 }), CASH, 'n').ok).toBe(false);
    expect(buildRowJournalLines(row('pengeluaran', 'keluar', { amount: -1 }), CASH, 'n').ok).toBe(false);
    expect(buildRowJournalLines(row('pengeluaran', 'keluar', { amount: '0.004' }), CASH, 'n').ok).toBe(false);
    expect(buildRowJournalLines(row('zzz', 'keluar'), CASH, 'n').ok).toBe(false);
    expect(buildRowJournalLines(row('pengeluaran', 'zzz'), CASH, 'n').ok).toBe(false);
  });
  it('rounds the amount to 2 decimals and stays balanced', () => {
    const r = buildRowJournalLines(row('pengeluaran', 'keluar', { amount: '10.005' }), CASH, 'n');
    expect(r.ok && r.value.map((l) => [l.debit, l.credit])).toEqual([[10.01, 0], [0, 10.01]]);
  });
  it('accepts Decimal amounts', () => {
    const r = buildRowJournalLines(row('pemasukan', 'masuk', { amount: new Decimal('12345.67') }), CASH, 'n');
    expect(r.ok && r.value[0].debit).toBe(12345.67);
  });
  it('truncates long descriptions', () => {
    const r = buildRowJournalLines(row('pengeluaran', 'keluar', { description: 'x'.repeat(400) }), CASH, 'y'.repeat(400));
    expect(r.ok && r.value.every((l) => l.description.length <= 250)).toBe(true);
  });
});

describe('computeTotals / balanceCheck', () => {
  const rows = [
    { amount: '1000.10', direction: 'masuk', skip: false },
    { amount: '250.05', direction: 'keluar', skip: false },
    { amount: '9999', direction: 'keluar', skip: true },
    { amount: 0.1, direction: 'masuk', skip: false },
  ];
  it('totals ignore skipped rows and avoid float drift', () => {
    expect(computeTotals(rows)).toEqual({ masuk: 1000.2, keluar: 250.05, rowCount: 4, activeCount: 3 });
  });
  it('balance ok when opening + masuk - keluar == closing', () => {
    const b = balanceCheck(500, 1250.15, rows);
    expect(b).toMatchObject({ checked: true, ok: true, difference: 0, expectedClosing: 1250.15, warning: null });
  });
  it('mismatch returns a warning with the difference (not an error)', () => {
    const b = balanceCheck(500, 1300, rows);
    expect(b.ok).toBe(false);
    expect(b.difference).toBe(49.85);
    expect(b.warning).toMatch(/Saldo akhir tidak cocok/);
  });
  it('skipped rows change the expectation', () => {
    expect(balanceCheck(0, 0, [{ amount: 5, direction: 'masuk', skip: true }]).ok).toBe(true);
  });
  it('not checked without both balances', () => {
    expect(balanceCheck(null, 100, rows).checked).toBe(false);
    expect(balanceCheck(100, undefined, rows).checked).toBe(false);
    expect(balanceCheck(null, null, rows).ok).toBe(true);
  });
  it('accepts Decimal-like strings', () => {
    expect(balanceCheck('0', '0', []).ok).toBe(true);
  });
});
