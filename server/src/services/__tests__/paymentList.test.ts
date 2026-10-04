import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  buildCashLedgerFilter,
  CASH_LEDGER_KINDS,
  CASH_LEDGER_SORT_FIELDS,
  cashLedgerOrderBySql,
  cashLedgerWhereSql,
  DEFAULT_CASH_LEDGER_SORT,
  escapeLike,
  INFLOW_PAYMENT_TYPES,
  mapCashLedgerRow,
  summarizeCashLedger,
  type CashLedgerFilter,
} from '../paymentList';
import { parseSort } from '../../utils/listQuery';

const sqlText = (s: Prisma.Sql) => s.text.replace(/\s+/g, ' ').trim();

describe('buildCashLedgerFilter', () => {
  it('parses every filter shared by list and summary', () => {
    const r = buildCashLedgerFilter({
      type: 'Transfer',
      direction: 'out',
      status: 'Submitted',
      partyId: 'p1',
      accountId: 'a1',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      search: '  PAY-01 ',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.filter).toEqual({
      kind: 'Transfer',
      direction: 'out',
      status: 'Submitted',
      partyId: 'p1',
      accountId: 'a1',
      // Business-local (WIB) days, half-open range.
      date: { gte: new Date('2025-12-31T17:00:00.000Z'), lt: new Date('2026-01-31T17:00:00.000Z') },
      search: 'PAY-01',
    });
  });

  it('returns an empty filter for an empty query', () => {
    expect(buildCashLedgerFilter({})).toEqual({ ok: true, filter: {} });
  });

  it('accepts every payment type and journal kind', () => {
    for (const kind of CASH_LEDGER_KINDS) {
      expect(buildCashLedgerFilter({ type: kind }).ok).toBe(true);
    }
    expect(CASH_LEDGER_KINDS).toEqual(
      expect.arrayContaining(['Receive', 'Pay', 'VendorDeposit', 'CustomerDeposit', 'VendorRefund', 'CustomerRefund', 'Transfer', 'Expense', 'JournalIn']),
    );
  });

  it.each([
    [{ type: 'Bogus' }, 'Tipe transaksi tidak dikenal.'],
    [{ direction: 'sideways' }, 'Arah transaksi harus "in" atau "out".'],
    [{ status: 'Paid' }, 'Status transaksi tidak dikenal.'],
    [{ startDate: '2026-13-01' }, 'Format tanggal harus YYYY-MM-DD.'],
    [{ endDate: '01/02/2026' }, 'Format tanggal harus YYYY-MM-DD.'],
  ])('rejects invalid input %j', (query, error) => {
    expect(buildCashLedgerFilter(query)).toEqual({ ok: false, error });
  });

  it('keeps only one end of the date range when only one is given', () => {
    const r = buildCashLedgerFilter({ endDate: '2026-02-01' });
    expect(r.ok && r.filter.date).toEqual({ lt: new Date('2026-02-01T17:00:00.000Z') });
  });
});

describe('cashLedgerWhereSql', () => {
  it('is empty without filters', () => {
    expect(cashLedgerWhereSql({}).sql).toBe('');
  });

  it('parameterises every value (no user input in the SQL text)', () => {
    const filter: CashLedgerFilter = {
      kind: 'Pay',
      direction: 'out',
      status: 'Cancelled',
      partyId: "p'1",
      accountId: 'acc-1',
      date: { gte: new Date('2025-12-31T17:00:00.000Z'), lt: new Date('2026-01-31T17:00:00.000Z') },
      search: "50%_x' OR 1=1",
    };
    const where = cashLedgerWhereSql(filter);
    const text = sqlText(where);
    expect(text).toMatch(/^WHERE l\.kind = \$1 AND l\.direction = \$2 AND l\.status = \$3 AND l\.party_id = \$4/);
    expect(text).toContain("l.source = 'payment' AND EXISTS");
    expect(text).toContain('l.date >= $7::timestamp AND l.date < $8::timestamp');
    expect(text).toContain('l.number ILIKE $9');
    expect(text).not.toContain('OR 1=1');
    expect(where.values).toEqual([
      'Pay',
      'out',
      'Cancelled',
      "p'1",
      'acc-1',
      'acc-1',
      '2025-12-31T17:00:00.000Z',
      '2026-01-31T17:00:00.000Z',
      "%50\\%\\_x' OR 1=1%",
      "%50\\%\\_x' OR 1=1%",
      "%50\\%\\_x' OR 1=1%",
      "%50\\%\\_x' OR 1=1%",
    ]);
  });

  it('searches number, party, notes and memo', () => {
    const text = sqlText(cashLedgerWhereSql({ search: 'abc' }));
    expect(text).toBe(
      'WHERE (l.number ILIKE $1 OR l.party_name ILIKE $2 OR l.notes ILIKE $3 OR l.memo ILIKE $4)',
    );
  });
});

describe('escapeLike', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
    expect(escapeLike('PAY-2026')).toBe('PAY-2026');
  });
});

describe('cashLedgerOrderBySql', () => {
  it('defaults to newest first with stable tie-breakers', () => {
    expect(cashLedgerOrderBySql(DEFAULT_CASH_LEDGER_SORT).sql).toBe(
      'ORDER BY l.date DESC NULLS LAST, l.number DESC, l.id DESC',
    );
  });

  it('maps whitelisted fields only', () => {
    expect(cashLedgerOrderBySql({ field: 'amount', dir: 'asc' }).sql).toBe(
      'ORDER BY l.amount ASC NULLS LAST, l.number ASC, l.id ASC',
    );
    expect(cashLedgerOrderBySql({ field: 'party', dir: 'desc' }).sql).toBe(
      'ORDER BY l.party_name DESC NULLS LAST, l.number DESC, l.id DESC',
    );
    expect(cashLedgerOrderBySql({ field: 'number', dir: 'asc' }).sql).toBe(
      'ORDER BY l.number ASC NULLS LAST, l.id ASC',
    );
  });

  it('falls back to the default sort for unknown or malicious fields', () => {
    const sort = parseSort('-date; DROP TABLE payments', CASH_LEDGER_SORT_FIELDS, DEFAULT_CASH_LEDGER_SORT);
    expect(sort).toEqual(DEFAULT_CASH_LEDGER_SORT);
    expect(cashLedgerOrderBySql(sort).sql).not.toContain('DROP');
  });
});

describe('INFLOW_PAYMENT_TYPES', () => {
  it('lists the payment types that bring money in', () => {
    expect([...INFLOW_PAYMENT_TYPES].sort()).toEqual(['CustomerDeposit', 'Receive', 'VendorRefund']);
  });
});

describe('mapCashLedgerRow', () => {
  it('maps a raw row to the API shape with numeric amounts', () => {
    const row = mapCashLedgerRow({
      source: 'journal',
      id: 'ji-1',
      journal_entry_id: 'je-1',
      date: new Date('2026-10-02T00:00:00.000Z'),
      number: 'JV-202610-0018',
      party_id: null,
      party_name: null,
      party_type: null,
      kind: 'Expense',
      direction: 'out',
      amount: new Prisma.Decimal('750000.10'),
      status: 'Submitted',
      account_id: 'acc',
      account_name: 'Bank BCA',
      account_number: '1.1.5',
      notes: 'Beban internet',
      memo: 'Bayar internet',
    });
    expect(row).toEqual({
      id: 'ji-1',
      source: 'journal',
      journalEntryId: 'je-1',
      date: '2026-10-02T00:00:00.000Z',
      number: 'JV-202610-0018',
      partyId: null,
      partyName: null,
      partyType: null,
      kind: 'Expense',
      direction: 'out',
      amount: 750000.1,
      status: 'Submitted',
      accountId: 'acc',
      accountName: 'Bank BCA',
      accountNumber: '1.1.5',
      notes: 'Beban internet',
      memo: 'Bayar internet',
    });
  });
});

describe('summarizeCashLedger', () => {
  it('totals money in/out excluding cancelled rows and counts everything', () => {
    const s = summarizeCashLedger([
      { direction: 'in', status: 'Submitted', count: 3, amount: new Prisma.Decimal('300.10') },
      { direction: 'out', status: 'Submitted', count: 2, amount: new Prisma.Decimal('100.05') },
      { direction: 'in', status: 'Cancelled', count: 1, amount: new Prisma.Decimal('999') },
      { direction: 'out', status: 'Draft', count: BigInt(1), amount: '50' },
    ]);
    expect(s).toEqual({
      count: 7,
      cancelledCount: 1,
      inCount: 3,
      inTotal: 300.1,
      outCount: 3,
      outTotal: 150.05,
      net: 150.05,
    });
  });

  it('handles an empty result', () => {
    expect(summarizeCashLedger([])).toEqual({
      count: 0,
      cancelledCount: 0,
      inCount: 0,
      inTotal: 0,
      outCount: 0,
      outTotal: 0,
      net: 0,
    });
  });

  it('keeps decimal precision and allows a negative net', () => {
    const s = summarizeCashLedger([
      { direction: 'in', status: 'Submitted', count: 1, amount: '0.1' },
      { direction: 'in', status: 'Draft', count: 1, amount: '0.2' },
      { direction: 'out', status: 'Submitted', count: 1, amount: '1' },
    ]);
    expect(s.inTotal).toBe(0.3);
    expect(s.net).toBe(-0.7);
  });
});
