/** Pure row model + helpers for ReportTable. */
import { formatRupiah } from '@/lib/format';

export type ReportRowKind = 'item' | 'group' | 'subtotal' | 'total' | 'grand' | 'section' | 'note';

export interface ReportRow {
  key: string;
  /** Default 'item'. 'section' = full-width heading, 'note' = full-width muted message. */
  kind?: ReportRowKind;
  label: string;
  /** Account number etc., shown in the optional code column. */
  code?: string;
  /** Indent level (0-based). */
  level?: number;
  /** One value per table column (null/undefined renders an empty cell). */
  values?: ReadonlyArray<number | null | undefined>;
  /** Makes the label a drill-down button. */
  onSelect?: () => void;
  /** Accessible name of the drill-down button (default "Lihat rincian <label>"). */
  selectLabel?: string;
}

export interface AccountNode {
  id: string;
  name: string;
  accountNumber?: string;
  isGroup?: boolean;
  balance: number;
  children?: AccountNode[];
}

/**
 * Flattens an account tree (chart-of-accounts style) into rows. Nodes with
 * children become collapsible 'group' rows; leaf accounts (not isGroup) get
 * `onSelect` when provided.
 */
export function flattenAccountTree(
  nodes: ReadonlyArray<AccountNode> | null | undefined,
  options: { onSelect?: (node: AccountNode) => void; level?: number } = {},
): ReportRow[] {
  const { onSelect, level = 0 } = options;
  const out: ReportRow[] = [];
  for (const node of nodes ?? []) {
    const hasChildren = (node.children?.length ?? 0) > 0;
    out.push({
      key: node.id,
      kind: hasChildren || node.isGroup ? 'group' : 'item',
      label: node.name,
      code: node.accountNumber,
      level,
      values: [node.balance],
      onSelect: !node.isGroup && onSelect ? () => onSelect(node) : undefined,
      selectLabel: `Lihat buku besar ${node.name}`,
    });
    if (hasChildren) out.push(...flattenAccountTree(node.children, { onSelect, level: level + 1 }));
  }
  return out;
}

export interface VisibleRow {
  row: ReportRow;
  /** Group row that has deeper rows beneath it (shows a toggle). */
  expandable: boolean;
}

/** Applies collapsed groups: hides item/group rows deeper than a collapsed group. */
export function visibleRows(rows: ReadonlyArray<ReportRow>, collapsed: ReadonlySet<string>): VisibleRow[] {
  const out: VisibleRow[] = [];
  let hideBelow: number | null = null;
  rows.forEach((row, i) => {
    const level = row.level ?? 0;
    const kind = row.kind ?? 'item';
    if (hideBelow !== null) {
      if (level > hideBelow && (kind === 'item' || kind === 'group')) return;
      hideBelow = null;
    }
    const next = rows[i + 1];
    const expandable = kind === 'group' && !!next && (next.level ?? 0) > level && ['item', 'group'].includes(next.kind ?? 'item');
    out.push({ row, expandable });
    if (expandable && collapsed.has(row.key)) hideBelow = level;
  });
  return out;
}

/** Formats a report amount: parentheses for negatives, optional dash for zero. */
export function formatAmount(value: number | null | undefined, zero: 'value' | 'dash' = 'value'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  if (zero === 'dash' && value === 0) return '\u2014';
  return formatRupiah(value, { negative: 'parens' });
}
