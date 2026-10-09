/**
 * Pure helpers for the Bagan Akun (COA) tree: normalising the GET /coa payload,
 * group subtotals, filtering while keeping ancestors visible, flattening the
 * visible rows for the treegrid, and encoding the expanded state in the URL.
 * No React here — everything is unit tested in coa-tree.test.ts.
 */
import { toNumber } from '@/lib/format';

export const ROOT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;
export type RootType = (typeof ROOT_TYPES)[number];

export const ROOT_TYPE_LABELS: Record<RootType, string> = {
  ASSET: 'Aset',
  LIABILITY: 'Kewajiban',
  EQUITY: 'Ekuitas',
  REVENUE: 'Pendapatan',
  EXPENSE: 'Beban',
};

export function rootTypeLabel(rootType: string): string {
  return ROOT_TYPE_LABELS[rootType as RootType] ?? rootType;
}

export function isRootType(value: string): value is RootType {
  return (ROOT_TYPES as readonly string[]).includes(value);
}

/**
 * Root type implied by the first segment of an account number (mirrors the
 * server's deriveRootType, which overrides the submitted value): 1 Aset,
 * 2 Kewajiban, 3 Ekuitas, 4 Pendapatan, 5–8 Beban. Null when not derivable.
 */
export function rootTypeFromNumber(accountNumber: string): RootType | null {
  switch (accountNumber.trim().split('.')[0]) {
    case '1':
      return 'ASSET';
    case '2':
      return 'LIABILITY';
    case '3':
      return 'EQUITY';
    case '4':
      return 'REVENUE';
    case '5':
    case '6':
    case '7':
    case '8':
      return 'EXPENSE';
    default:
      return null;
  }
}

/** Account as returned by GET /api/coa (balance is a Prisma Decimal string). */
export interface CoaAccount {
  id: string;
  accountNumber: string;
  name: string;
  accountType: string;
  rootType: string;
  isGroup: boolean;
  isActive: boolean;
  balance: number | string | null;
  parentId: string | null;
  description?: string | null;
  children?: CoaAccount[];
}

export interface CoaNode {
  id: string;
  accountNumber: string;
  name: string;
  rootType: string;
  isGroup: boolean;
  isActive: boolean;
  /** Own balance, in the account's normal-balance direction (+ = normal side). */
  balance: number;
  /** Own balance plus all descendants, in this account's normal direction. */
  subtotal: number;
  /** 0 for top-level accounts. */
  depth: number;
  parentId: string | null;
  /** The raw account (without children) for the edit/balance dialogs. */
  account: CoaAccount;
  children: CoaNode[];
}

/** Debit-normal for ASSET/EXPENSE, credit-normal otherwise (mirrors server computeImpact). */
export function normalSide(rootType: string): 'D' | 'K' {
  return rootType === 'ASSET' || rootType === 'EXPENSE' ? 'D' : 'K';
}

/** Amounts below half a cent count as zero (Decimal strings such as "0.00"). */
export function isZero(n: number): boolean {
  return Math.abs(n) < 0.005;
}

/**
 * Builds the normalised tree with depth and group subtotals. A child whose
 * normal side differs from its parent's is subtracted (keeps the subtotal in
 * the parent's direction).
 */
export function buildCoaTree(accounts: readonly CoaAccount[], depth = 0): CoaNode[] {
  return accounts.map((acc) => {
    const children = buildCoaTree(acc.children ?? [], depth + 1);
    const balance = toNumber(acc.balance) ?? 0;
    const side = normalSide(acc.rootType);
    const subtotal = children.reduce(
      (sum, child) => sum + (normalSide(child.rootType) === side ? child.subtotal : -child.subtotal),
      balance,
    );
    const { children: _omit, ...account } = acc;
    void _omit;
    return {
      id: acc.id,
      accountNumber: acc.accountNumber,
      name: acc.name,
      rootType: acc.rootType,
      isGroup: acc.isGroup,
      isActive: acc.isActive,
      balance,
      subtotal,
      depth,
      parentId: acc.parentId,
      account,
      children,
    };
  });
}

/** Amount shown in the Saldo column: subtotal for groups, own balance for details. */
export function displayBalance(node: CoaNode): number {
  return node.isGroup || node.children.length > 0 ? node.subtotal : node.balance;
}

/** Depth-first, in tree order. */
export function walkTree(nodes: readonly CoaNode[]): CoaNode[] {
  return nodes.flatMap((n) => [n, ...walkTree(n.children)]);
}

export function countAccounts(nodes: readonly CoaNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countAccounts(n.children), 0);
}

/** Account counts per root type (for the filter chips). */
export function countByRootType(nodes: readonly CoaNode[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of walkTree(nodes)) out[n.rootType] = (out[n.rootType] ?? 0) + 1;
  return out;
}

export interface CoaFilter {
  /** Matched against account number and name, case-insensitive. */
  query?: string;
  rootType?: string;
  /** Keep only accounts with a non-zero (sub)total. */
  nonZeroOnly?: boolean;
}

export interface FilterResult {
  nodes: CoaNode[];
  /** Ids of accounts that matched the search text directly (highlighted). */
  matchIds: Set<string>;
  /** Accounts kept (matches, their ancestors and descendants of matched groups). */
  visibleCount: number;
}

export function hasActiveFilter(filter: CoaFilter): boolean {
  return Boolean(filter.query?.trim() || filter.rootType || filter.nonZeroOnly);
}

export function matchesQuery(node: Pick<CoaNode, 'accountNumber' | 'name'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return node.accountNumber.toLowerCase().includes(q) || node.name.toLowerCase().includes(q);
}

/**
 * Filters the tree, keeping every ancestor of a kept account so the hierarchy
 * stays readable. A group that matches the search text keeps its descendants
 * (subject to the other filters). Returns new nodes; the input is untouched.
 */
export function filterCoaTree(nodes: readonly CoaNode[], filter: CoaFilter): FilterResult {
  const query = filter.query?.trim() ?? '';
  const matchIds = new Set<string>();
  let visibleCount = 0;

  const passesOther = (n: CoaNode) =>
    (!filter.rootType || n.rootType === filter.rootType) && (!filter.nonZeroOnly || !isZero(displayBalance(n)));

  const visit = (list: readonly CoaNode[], ancestorMatched: boolean): CoaNode[] => {
    const out: CoaNode[] = [];
    for (const n of list) {
      const direct = query !== '' && matchesQuery(n, query);
      const textOk = query === '' || direct || ancestorMatched;
      const children = visit(n.children, ancestorMatched || direct);
      const selfKept = textOk && passesOther(n);
      if (selfKept || children.length > 0) {
        if (direct && passesOther(n)) matchIds.add(n.id);
        visibleCount += 1;
        out.push({ ...n, children });
      }
    }
    return out;
  };

  return { nodes: visit(nodes, false), matchIds, visibleCount };
}

export interface FlatRow {
  node: CoaNode;
  /** aria-level, 1-based. */
  level: number;
  posInSet: number;
  setSize: number;
  hasChildren: boolean;
  expanded: boolean;
  parentId: string | null;
}

/** Visible rows in display order; children are emitted only under expanded parents. */
export function flattenVisible(nodes: readonly CoaNode[], isExpanded: (node: CoaNode) => boolean): FlatRow[] {
  const out: FlatRow[] = [];
  const visit = (list: readonly CoaNode[], level: number, parentId: string | null) => {
    list.forEach((node, i) => {
      const hasChildren = node.children.length > 0;
      const expanded = hasChildren && isExpanded(node);
      out.push({
        node,
        level,
        posInSet: i + 1,
        setSize: list.length,
        hasChildren,
        expanded,
        parentId,
      });
      if (expanded) visit(node.children, level + 1, node.id);
    });
  };
  visit(nodes, 1, null);
  return out;
}

// Expanded state ↔ URL (?open=)
// absent → default (top-level accounts open) · "*" → all · "" → none
// otherwise a comma separated list of account numbers.

export const EXPAND_ALL = '*';

/** Account numbers of every node that has children. */
export function expandableNumbers(nodes: readonly CoaNode[]): string[] {
  return walkTree(nodes)
    .filter((n) => n.children.length > 0)
    .map((n) => n.accountNumber);
}

export function parseExpanded(raw: string | null, nodes: readonly CoaNode[]): Set<string> {
  if (raw === null) return new Set(nodes.filter((n) => n.children.length > 0).map((n) => n.accountNumber));
  if (raw === EXPAND_ALL) return new Set(expandableNumbers(nodes));
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function serializeExpanded(expanded: ReadonlySet<string>, nodes: readonly CoaNode[]): string {
  const all = expandableNumbers(nodes);
  const open = all.filter((num) => expanded.has(num));
  if (open.length === 0) return '';
  if (open.length === all.length) return EXPAND_ALL;
  return open.join(',');
}

export function toggleInSet<T>(set: ReadonlySet<T>, value: T, force?: boolean): Set<T> {
  const next = new Set(set);
  const add = force ?? !next.has(value);
  if (add) next.add(value);
  else next.delete(value);
  return next;
}

// Search highlight

export interface TextPart {
  text: string;
  match: boolean;
}

/** Splits `text` around case-insensitive occurrences of `query`. */
export function splitHighlight(text: string, query: string): TextPart[] {
  const q = query.trim().toLowerCase();
  if (!q) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const parts: TextPart[] = [];
  let from = 0;
  let idx = lower.indexOf(q, from);
  while (idx !== -1) {
    if (idx > from) parts.push({ text: text.slice(from, idx), match: false });
    parts.push({ text: text.slice(idx, idx + q.length), match: true });
    from = idx + q.length;
    idx = lower.indexOf(q, from);
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}

/** Flat export rows. */
export function exportRows(nodes: readonly CoaNode[]) {
  return walkTree(nodes).map((n) => ({
    accountNumber: n.accountNumber,
    name: n.name,
    rootType: n.rootType,
    accountType: n.account.accountType,
    isGroup: n.isGroup ? 'Ya' : 'Tidak',
    balance: n.account.balance,
  }));
}

/**
 * Parse an amount typed the Indonesian way: "." groups thousands and "," marks
 * decimals ("1.500.000,25"). Plain input ("1500000") and dot-decimals
 * ("1500000.25") still work; a single dot followed by exactly three digits
 * ("1.500") is read as thousands. A leading minus or parentheses make it negative.
 */
export function parseBalanceInput(value: string): number {
  const trimmed = value.trim();
  const negative = /^\(.*\)$/.test(trimmed) || /-/.test(trimmed);
  let s = trimmed.replace(/[^0-9.,]/g, '');
  if (!/[0-9]/.test(s)) return NaN;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(/,/g, '.');
  } else {
    const dots = s.split('.').length - 1;
    if (dots > 1 || /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return negative ? -n : n;
}

/** Server error message ({ error }) or a fallback. */
export function apiErrorMessage(e: unknown, fallback: string): string {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
}
