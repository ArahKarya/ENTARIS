import { describe, expect, it } from 'vitest';
import {
  buildCoaTree,
  countAccounts,
  countByRootType,
  displayBalance,
  expandableNumbers,
  exportRows,
  filterCoaTree,
  flattenVisible,
  hasActiveFilter,
  normalSide,
  parseBalanceInput,
  parseExpanded,
  rootTypeFromNumber,
  serializeExpanded,
  splitHighlight,
  toggleInSet,
  walkTree,
  type CoaAccount,
} from './coa-tree';

let seq = 0;
function acc(
  accountNumber: string,
  name: string,
  rootType: string,
  opts: {
    group?: boolean;
    balance?: string | number;
    children?: CoaAccount[];
    active?: boolean;
  } = {},
): CoaAccount {
  seq += 1;
  return {
    id: `id-${accountNumber}-${seq}`,
    accountNumber,
    name,
    accountType: rootType,
    rootType,
    isGroup: opts.group ?? false,
    isActive: opts.active ?? true,
    balance: opts.balance ?? '0',
    parentId: null,
    children: opts.children ?? [],
  };
}

const RAW: CoaAccount[] = [
  acc('1', 'Aset', 'ASSET', {
    group: true,
    children: [
      acc('1.1', 'Kas & Bank', 'ASSET', {
        group: true,
        children: [
          acc('1.1.1', 'Petty Cash', 'ASSET', { balance: '1000.50' }),
          acc('1.1.2', 'Bank BRI', 'ASSET', { balance: '2000' }),
        ],
      }),
      acc('1.2', 'Piutang Usaha', 'ASSET', {
        group: true,
        children: [acc('1.2.1', 'Piutang Dagang', 'ASSET', { balance: 0 })],
      }),
      acc('1.3', 'Uang Muka Pembelian', 'ASSET', { balance: '500' }),
    ],
  }),
  acc('2', 'Liabilitas', 'LIABILITY', {
    group: true,
    children: [acc('2.3', 'Hutang Jangka Panjang', 'LIABILITY', { group: true })],
  }),
  acc('4', 'Pendapatan', 'REVENUE', {
    group: true,
    children: [
      acc('4.1', 'Penjualan', 'REVENUE', { balance: '10000' }),
      acc('4.3', 'Retur Penjualan', 'REVENUE', { balance: '-400' }),
    ],
  }),
];

const tree = buildCoaTree(RAW);
const byNumber = (num: string) => walkTree(tree).find((n) => n.accountNumber === num)!;

describe('buildCoaTree', () => {
  it('sets depth and coerces Decimal strings', () => {
    expect(byNumber('1').depth).toBe(0);
    expect(byNumber('1.1').depth).toBe(1);
    expect(byNumber('1.1.1').depth).toBe(2);
    expect(byNumber('1.1.1').balance).toBe(1000.5);
  });

  it('computes group subtotals recursively, including contra (negative) balances', () => {
    expect(byNumber('1.1').subtotal).toBe(3000.5);
    expect(byNumber('1').subtotal).toBe(3500.5);
    expect(byNumber('4').subtotal).toBe(9600);
    expect(byNumber('2').subtotal).toBe(0);
  });

  it('subtracts children whose normal side differs from the parent', () => {
    const mixed = buildCoaTree([
      acc('9', 'Campuran', 'ASSET', {
        group: true,
        children: [acc('9.1', 'Debit', 'ASSET', { balance: 100 }), acc('9.2', 'Kredit', 'LIABILITY', { balance: 30 })],
      }),
    ]);
    expect(mixed[0].subtotal).toBe(70);
  });

  it('displayBalance uses the subtotal for groups and the own balance for details', () => {
    expect(displayBalance(byNumber('1.1'))).toBe(3000.5);
    expect(displayBalance(byNumber('1.3'))).toBe(500);
  });

  it('strips children from the raw account kept for dialogs', () => {
    expect(byNumber('1').account.children).toBeUndefined();
  });
});

describe('normalSide', () => {
  it('is debit for ASSET/EXPENSE and credit otherwise', () => {
    expect(normalSide('ASSET')).toBe('D');
    expect(normalSide('EXPENSE')).toBe('D');
    expect(normalSide('LIABILITY')).toBe('K');
    expect(normalSide('EQUITY')).toBe('K');
    expect(normalSide('REVENUE')).toBe('K');
  });
});

describe('counts', () => {
  it('counts all accounts and per root type', () => {
    expect(countAccounts(tree)).toBe(12);
    expect(countByRootType(tree)).toEqual({
      ASSET: 7,
      LIABILITY: 2,
      REVENUE: 3,
    });
  });
});

describe('filterCoaTree', () => {
  const numbers = (nodes: ReturnType<typeof walkTree>) => nodes.map((n) => n.accountNumber);

  it('returns the whole tree without filters', () => {
    const r = filterCoaTree(tree, {});
    expect(r.visibleCount).toBe(12);
    expect(r.matchIds.size).toBe(0);
    expect(hasActiveFilter({})).toBe(false);
  });

  it('keeps ancestors of matches and marks only direct matches', () => {
    const r = filterCoaTree(tree, { query: 'bri' });
    expect(numbers(walkTree(r.nodes))).toEqual(['1', '1.1', '1.1.2']);
    expect([...r.matchIds]).toEqual([byNumber('1.1.2').id]);
    expect(r.visibleCount).toBe(3);
  });

  it('matches account numbers and keeps descendants of a matched group', () => {
    const r = filterCoaTree(tree, { query: 'Kas' });
    expect(numbers(walkTree(r.nodes))).toEqual(['1', '1.1', '1.1.1', '1.1.2']);
    expect(r.matchIds.has(byNumber('1.1').id)).toBe(true);
    expect(r.matchIds.has(byNumber('1.1.1').id)).toBe(false);

    const byNum = filterCoaTree(tree, { query: '4.3' });
    expect(numbers(walkTree(byNum.nodes))).toEqual(['4', '4.3']);
  });

  it('filters by root type', () => {
    const r = filterCoaTree(tree, { rootType: 'REVENUE' });
    expect(numbers(walkTree(r.nodes))).toEqual(['4', '4.1', '4.3']);
  });

  it('keeps only non-zero accounts (and their ancestors)', () => {
    const r = filterCoaTree(tree, { nonZeroOnly: true });
    expect(numbers(walkTree(r.nodes))).toEqual(['1', '1.1', '1.1.1', '1.1.2', '1.3', '4', '4.1', '4.3']);
  });

  it('combines search with other filters', () => {
    const r = filterCoaTree(tree, { query: 'piutang', nonZeroOnly: true });
    expect(r.nodes).toEqual([]);
    expect(r.visibleCount).toBe(0);
    expect(hasActiveFilter({ query: ' piutang ' })).toBe(true);
  });

  it('does not mutate the input tree', () => {
    filterCoaTree(tree, { query: 'bri' });
    expect(byNumber('1.1').children).toHaveLength(2);
  });
});

describe('flattenVisible', () => {
  it('emits children only under expanded parents with aria metadata', () => {
    const open = new Set(['1']);
    const rows = flattenVisible(tree, (n) => open.has(n.accountNumber));
    expect(rows.map((r) => r.node.accountNumber)).toEqual(['1', '1.1', '1.2', '1.3', '2', '4']);
    const kas = rows[1];
    expect(kas).toMatchObject({
      level: 2,
      posInSet: 1,
      setSize: 3,
      hasChildren: true,
      expanded: false,
    });
    expect(kas.parentId).toBe(byNumber('1').id);
    expect(rows[0]).toMatchObject({
      level: 1,
      expanded: true,
      hasChildren: true,
    });
  });

  it('never marks a leaf (or an empty group) as expanded', () => {
    const rows = flattenVisible(tree, () => true);
    expect(rows).toHaveLength(12);
    const emptyGroup = rows.find((r) => r.node.accountNumber === '2.3')!;
    expect(emptyGroup).toMatchObject({
      hasChildren: false,
      expanded: false,
      level: 2,
    });
  });
});

describe('expanded state encoding', () => {
  it('defaults to top-level groups with children', () => {
    expect([...parseExpanded(null, tree)]).toEqual(['1', '2', '4']);
  });

  it('parses all, none and lists', () => {
    expect([...parseExpanded('*', tree)]).toEqual(expandableNumbers(tree));
    expect(parseExpanded('', tree).size).toBe(0);
    expect([...parseExpanded('1, 1.1,', tree)]).toEqual(['1', '1.1']);
  });

  it('serializes compactly and drops unknown numbers', () => {
    expect(serializeExpanded(new Set(expandableNumbers(tree)), tree)).toBe('*');
    expect(serializeExpanded(new Set(), tree)).toBe('');
    expect(serializeExpanded(new Set(['1.1', '1', 'x']), tree)).toBe('1,1.1');
  });

  it('toggleInSet returns a new set', () => {
    const s = new Set(['a']);
    const t = toggleInSet(s, 'b');
    expect([...t]).toEqual(['a', 'b']);
    expect(s.size).toBe(1);
    expect([...toggleInSet(t, 'a')]).toEqual(['b']);
    expect([...toggleInSet(t, 'a', true)]).toEqual(['a', 'b']);
  });
});

describe('splitHighlight', () => {
  it('splits around case-insensitive matches', () => {
    expect(splitHighlight('Bank BRI 2', 'bri')).toEqual([
      { text: 'Bank ', match: false },
      { text: 'BRI', match: true },
      { text: ' 2', match: false },
    ]);
    expect(splitHighlight('aaa', 'a').filter((p) => p.match)).toHaveLength(3);
    expect(splitHighlight('Kas', '')).toEqual([{ text: 'Kas', match: false }]);
  });
});

describe('exportRows', () => {
  it('keeps the legacy export columns in tree order', () => {
    const rows = exportRows(tree);
    expect(rows).toHaveLength(12);
    expect(rows[2]).toEqual({
      accountNumber: '1.1.1',
      name: 'Petty Cash',
      rootType: 'ASSET',
      accountType: 'ASSET',
      isGroup: 'Tidak',
      balance: '1000.50',
    });
  });
});

describe('rootTypeFromNumber', () => {
  it('follows the first number segment like the server', () => {
    expect(rootTypeFromNumber('1.1.6')).toBe('ASSET');
    expect(rootTypeFromNumber('2')).toBe('LIABILITY');
    expect(rootTypeFromNumber(' 3.9')).toBe('EQUITY');
    expect(rootTypeFromNumber('4.5')).toBe('REVENUE');
    expect(rootTypeFromNumber('7.1')).toBe('EXPENSE');
    expect(rootTypeFromNumber('8')).toBe('EXPENSE');
    expect(rootTypeFromNumber('9.1')).toBeNull();
    expect(rootTypeFromNumber('')).toBeNull();
  });
});

describe('parseBalanceInput (Indonesian number format)', () => {
  it('reads dots as thousands separators', () => {
    expect(parseBalanceInput('1.000.000')).toBe(1000000);
    expect(parseBalanceInput('Rp 1.500')).toBe(1500);
    expect(parseBalanceInput('12.345.678')).toBe(12345678);
  });

  it('reads a comma as the decimal separator', () => {
    expect(parseBalanceInput('1.500.000,25')).toBe(1500000.25);
    expect(parseBalanceInput('2500,5')).toBe(2500.5);
  });

  it('keeps plain and dot-decimal input working', () => {
    expect(parseBalanceInput('1500000')).toBe(1500000);
    expect(parseBalanceInput('1500000.25')).toBe(1500000.25);
    expect(parseBalanceInput('0.5')).toBe(0.5);
  });

  it('handles negatives (minus sign or parentheses) and currency text', () => {
    expect(parseBalanceInput('Rp -2.500')).toBe(-2500);
    expect(parseBalanceInput('(1.250.000)')).toBe(-1250000);
  });

  it('returns NaN for input without digits', () => {
    expect(Number.isNaN(parseBalanceInput('abc'))).toBe(true);
    expect(Number.isNaN(parseBalanceInput(''))).toBe(true);
  });
});
