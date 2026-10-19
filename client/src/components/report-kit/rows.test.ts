import { describe, expect, it } from 'vitest';
import { flattenAccountTree, formatAmount, visibleRows, type AccountNode, type ReportRow } from './rows';

const tree: AccountNode[] = [
  {
    id: 'a',
    name: 'Aset Lancar',
    accountNumber: '1100',
    isGroup: true,
    balance: 150,
    children: [
      { id: 'a1', name: 'Kas', accountNumber: '1101', balance: 100 },
      { id: 'a2', name: 'Bank', accountNumber: '1102', balance: 50 },
    ],
  },
  { id: 'b', name: 'Piutang', accountNumber: '1200', balance: -20 },
];

describe('flattenAccountTree', () => {
  it('keeps order, levels and kinds', () => {
    const rows = flattenAccountTree(tree);
    expect(rows.map((r) => [r.key, r.kind, r.level])).toEqual([
      ['a', 'group', 0],
      ['a1', 'item', 1],
      ['a2', 'item', 1],
      ['b', 'item', 0],
    ]);
    expect(rows[0].values).toEqual([150]);
    expect(rows[3].values).toEqual([-20]);
  });

  it('adds drill-down only to non-group accounts', () => {
    const picked: string[] = [];
    const rows = flattenAccountTree(tree, { onSelect: (n) => picked.push(n.id) });
    rows.forEach((r) => r.onSelect?.());
    expect(picked).toEqual(['a1', 'a2', 'b']);
  });

  it('handles empty input', () => {
    expect(flattenAccountTree(undefined)).toEqual([]);
  });
});

describe('visibleRows', () => {
  const rows: ReportRow[] = [
    { key: 'sec', kind: 'section', label: 'S' },
    ...flattenAccountTree(tree),
    { key: 'tot', kind: 'total', label: 'Total', values: [130] },
  ];

  it('marks only groups with deeper rows as expandable', () => {
    const v = visibleRows(rows, new Set());
    expect(v.filter((x) => x.expandable).map((x) => x.row.key)).toEqual(['a']);
    expect(v).toHaveLength(rows.length);
  });

  it('hides descendants of a collapsed group but not siblings or totals', () => {
    const keys = visibleRows(rows, new Set(['a'])).map((x) => x.row.key);
    expect(keys).toEqual(['sec', 'a', 'b', 'tot']);
  });
});

describe('formatAmount', () => {
  it('wraps negatives in parentheses', () => {
    expect(formatAmount(-1500)).toBe('(Rp 1.500)');
    expect(formatAmount(1500)).toBe('Rp 1.500');
  });
  it('renders dash for zero only when asked', () => {
    expect(formatAmount(0, 'dash')).toBe('—');
    expect(formatAmount(0)).toBe('Rp 0');
  });
  it('is empty for missing values', () => {
    expect(formatAmount(null)).toBe('');
    expect(formatAmount(undefined)).toBe('');
  });
});
