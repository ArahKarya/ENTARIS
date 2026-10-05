import { describe, it, expect } from 'vitest';
import {
  errorLines,
  liveBalance,
  liveTotals,
  mergeEdit,
  pendingRows,
  toPatches,
  typeFitsDirection,
  typesFor,
  withEdit,
  type DraftRow,
} from './cash-book';
import { hasBlockingProblems, isBlankAmount, parseCashBookText, toCreateRows, tokenize } from './cash-book-parse';

const row = (over: Partial<DraftRow> = {}): DraftRow => ({
  id: 'r1', idx: 1, rowDate: '2026-10-05', description: 'Beli ATK', amount: 100, direction: 'keluar', txnType: 'pengeluaran',
  accountId: 'a-atk', accountCode: '6.1', accountLabel: '6.1 ATK', confidence: 0.5, needsReview: true, reason: null, isDuplicate: false,
  skip: false, userEdited: false, journalEntryId: null, journalNumber: null, postedAt: null, error: null, ...over,
});
const label = (id: string) => (id === 'a-bbm' ? '6.2 BBM' : null);

describe('type/direction rules (preview)', () => {
  it('lists only the types that fit', () => {
    expect(typesFor('keluar')).toEqual(['pengeluaran', 'uang_muka', 'lainnya']);
    expect(typesFor('masuk')).toEqual(['pemasukan', 'terima_kasbon', 'lainnya']);
    expect(typeFitsDirection('pemasukan', 'keluar')).toBe(false);
  });
});

describe('withEdit', () => {
  it('returns the row untouched without an edit', () => {
    const r = row();
    expect(withEdit(r, undefined, 'adv', label)).toBe(r);
  });
  it('choosing an account clears needsReview and marks it user-edited, without mutating', () => {
    const r = row();
    const n = withEdit(r, { accountId: 'a-bbm' }, 'adv', label);
    expect(n).toMatchObject({ accountId: 'a-bbm', accountLabel: '6.2 BBM', needsReview: false, userEdited: true });
    expect(r.needsReview).toBe(true);
  });
  it('advance types force the advance account; leaving them clears it', () => {
    expect(withEdit(row(), { txnType: 'uang_muka' }, 'adv', label).accountId).toBe('adv');
    const adv = row({ txnType: 'uang_muka', accountId: 'adv' });
    expect(withEdit(adv, { txnType: 'pengeluaran' }, 'adv', label)).toMatchObject({ accountId: null, needsReview: true });
  });
  it('amount / description / skip / reviewed', () => {
    expect(withEdit(row(), { amount: 5, description: 'x', skip: true }, null, label)).toMatchObject({ amount: 5, description: 'x', skip: true });
    expect(withEdit(row(), { reviewed: true }, null, label)).toMatchObject({ needsReview: false, userEdited: true });
  });
});

describe('patches', () => {
  it('merges edits immutably and drops empty ones', () => {
    const a = mergeEdit({}, 'r1', { skip: true });
    const b = mergeEdit(a, 'r1', { accountId: 'x' });
    expect(a).toEqual({ r1: { skip: true } });
    expect(b).toEqual({ r1: { skip: true, accountId: 'x' } });
    expect(toPatches({ ...b, r2: {} })).toEqual([{ id: 'r1', skip: true, accountId: 'x' }]);
  });
});

describe('live totals and balance', () => {
  const rows = [row({ amount: 1000.1, direction: 'masuk' }), row({ amount: 250.05 }), row({ amount: 999, skip: true })];
  it('ignores skipped rows and keeps 2 decimals', () => {
    expect(liveTotals(rows)).toEqual({ masuk: 1000.1, keluar: 250.05, rowCount: 3, activeCount: 2 });
  });
  it('balance ok / mismatch / unchecked', () => {
    const t = liveTotals(rows);
    expect(liveBalance(100, 850.05, t)).toMatchObject({ checked: true, ok: true, difference: 0 });
    expect(liveBalance(100, 900, t)).toMatchObject({ ok: false, difference: 49.95, warning: 'Saldo akhir tidak cocok' });
    expect(liveBalance(null, 900, t).checked).toBe(false);
  });
  it('pendingRows excludes skipped and posted', () => {
    expect(pendingRows([row(), row({ skip: true }), row({ journalEntryId: 'j' })])).toHaveLength(1);
  });
});

describe('errorLines', () => {
  it('prefers rowErrors, then error, then the fallback', () => {
    expect(errorLines({ response: { data: { error: 'x', rowErrors: ['Baris 1: a', 'Baris 2: b'] } } }, 'f')).toEqual(['Baris 1: a', 'Baris 2: b']);
    expect(errorLines({ response: { data: { error: 'boom' } } }, 'f')).toEqual(['boom']);
    expect(errorLines(new Error('net'), 'gagal')).toEqual(['gagal']);
  });
});

describe('parseCashBookText', () => {
  it('parses a tab separated paste with a header (Excel copy)', () => {
    const r = parseCashBookText('Tanggal\tKeterangan\tMasuk\tKeluar\n05/10/2026\tBeli ATK\t\t125.000\n06/10/2026\tSetoran\t500.000\t');
    expect(r.hasHeader).toBe(true);
    expect(r.problems).toEqual([]);
    expect(r.rows).toEqual([
      { line: 2, date: '05/10/2026', description: 'Beli ATK', masuk: '', keluar: '125.000', error: null },
      { line: 3, date: '06/10/2026', description: 'Setoran', masuk: '500.000', keluar: '', error: null },
    ]);
    expect(hasBlockingProblems(r)).toBe(false);
    expect(toCreateRows(r.rows)).toEqual([
      { date: '05/10/2026', description: 'Beli ATK', keluar: '125.000' },
      { date: '06/10/2026', description: 'Setoran', masuk: '500.000' },
    ]);
  });
  it('parses semicolon CSV with quotes and debit/kredit synonyms in any order', () => {
    const r = parseCashBookText('Uraian;Kredit;Debit;Tgl\n"Bensin; motor";75000;;2026-10-02\n"Sewa ""gudang""";;1.000.000;2026-10-03');
    expect(r.rows[0]).toMatchObject({ description: 'Bensin; motor', keluar: '75000', masuk: '', date: '2026-10-02' });
    expect(r.rows[1]).toMatchObject({ description: 'Sewa "gudang"', masuk: '1.000.000', keluar: '' });
  });
  it('defaults to tanggal, keterangan, masuk, keluar without a header (comma CSV, CRLF, BOM)', () => {
    const r = parseCashBookText('﻿2026-10-01,Parkir,,5000\r\n2026-10-01,Setor,20000,\r\n');
    expect(r.hasHeader).toBe(false);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ line: 1, keluar: '5000' });
  });
  it('flags rows with no amount, both amounts, or no description; treats "-" and 0 as blank', () => {
    const r = parseCashBookText('Tanggal,Keterangan,Masuk,Keluar\n2026-10-01,A,-,0\n2026-10-01,B,5,5\n2026-10-01,,5,\n2026-10-01,C,,7');
    expect(r.rows.map((x) => x.error)).toEqual(['Isi nominal masuk atau keluar', 'Isi salah satu saja: masuk atau keluar', 'Keterangan kosong', null]);
    expect(hasBlockingProblems(r)).toBe(true);
    expect(isBlankAmount('0,00')).toBe(true);
    expect(isBlankAmount('1')).toBe(false);
  });
  it('reports empty input, missing data rows and the 300 row limit', () => {
    expect(parseCashBookText('   ').problems[0]).toMatch(/Belum ada data/);
    expect(parseCashBookText('Tanggal,Keterangan,Masuk,Keluar').problems.join()).toMatch(/Tidak ada baris data/);
    const big = Array.from({ length: 301 }, (_, i) => `2026-10-01,r${i},,1`).join('\n');
    expect(parseCashBookText(big).problems.join()).toMatch(/Maksimal 300/);
  });
  it('tokenizes newlines inside quotes', () => {
    expect(tokenize('a,"b\nc",d', ',')).toEqual([['a', 'b\nc', 'd']]);
  });
});
