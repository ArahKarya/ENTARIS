/**
 * Bagan Akun treegrid (WAI-ARIA treegrid, row-focus mode).
 *
 * Keyboard (focus on a row, roving tabindex):
 *   ↓/↑ next/previous row · Home/End first/last row
 *   → expand, or move to the first child when already expanded
 *   ← collapse, or move to the parent row
 *   Enter/Space toggle a group · Tab reaches the row's ⋯ menu
 */
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { ChevronRight, Lock, Pencil, PlusCircle, Trash2, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { RowActions } from '@/components/shared';
import { Skeleton } from '@/components/ui/skeleton';
import {
  displayBalance,
  isZero,
  normalSide,
  rootTypeLabel,
  splitHighlight,
  type CoaNode,
  type FlatRow,
} from './coa-tree';

export interface CoaRowHandlers {
  onToggle: (node: CoaNode, open: boolean) => void;
  onAddChild: (node: CoaNode) => void;
  onEdit: (node: CoaNode) => void;
  onSetBalance: (node: CoaNode) => void;
  onDelete: (node: CoaNode) => void;
}

export interface CoaTreeTableProps extends CoaRowHandlers {
  rows: FlatRow[];
  /** Search text, for highlighting. */
  query: string;
  matchIds: ReadonlySet<string>;
  /** accountId → system role labels (accounts used for automatic GL posting). */
  systemRoles: ReadonlyMap<string, string[]>;
  canEdit: boolean;
  canDelete: boolean;
  loading?: boolean;
  /** Rendered in place of the rows (error / empty / no-results). */
  emptyState?: ReactNode;
}

const COL_COUNT = 5;

function Highlight({ text, query, active }: { text: string; query: string; active: boolean }) {
  if (!active || !query) return <>{text}</>;
  return (
    <>
      {splitHighlight(text, query).map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded-[2px] bg-warning-subtle text-foreground">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

export function SystemAccountBadge({ roles, className }: { roles: string[]; className?: string }) {
  const { t } = useTranslation('finance');
  return (
    <span
      title={t('coaTreeTable.systemBadge.title', { roles: roles.join(', ') })}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-sm bg-neutral-subtle px-1.5 py-0.5 text-xs font-medium leading-4 text-neutral-text',
        className,
      )}
    >
      <Lock className="size-3" aria-hidden />
      <span className="sr-only sm:not-sr-only">{t('coaTreeTable.systemBadge.label')}</span>
      <span className="sr-only">: {roles.join(', ')}</span>
    </span>
  );
}

function BalanceCell({ node }: { node: CoaNode }) {
  const { t } = useTranslation('finance');
  const amount = displayBalance(node);
  const zero = isZero(amount);
  const negative = !zero && amount < 0;
  return (
    <span className={cn('num', zero && 'text-muted-foreground', negative && 'text-danger-text')}>
      {formatRupiah(zero ? 0 : amount, { symbol: false, negative: 'parens' })}
      {negative && <span className="sr-only"> {t('coaTreeTable.oppositeBalance')}</span>}
    </span>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <tr key={i} className="border-b border-border">
          <td className="h-10 px-3">
            <Skeleton
              className="h-4"
              style={{
                width: `${40 + ((i * 17) % 40)}%`,
                marginLeft: `${(i % 3) * 1.25}rem`,
              }}
            />
          </td>
          <td className="hidden h-10 px-3 md:table-cell">
            <Skeleton className="h-4 w-16" />
          </td>
          <td className="hidden h-10 px-3 md:table-cell">
            <Skeleton className="h-4 w-12" />
          </td>
          <td className="h-10 px-3">
            <Skeleton className="ml-auto h-4 w-20" />
          </td>
          <td className="h-10 w-12" aria-hidden />
        </tr>
      ))}
    </>
  );
}

export function CoaTreeTable({
  rows,
  query,
  matchIds,
  systemRoles,
  canEdit,
  canDelete,
  loading,
  emptyState,
  onToggle,
  onAddChild,
  onEdit,
  onSetBalance,
  onDelete,
}: CoaTreeTableProps) {
  const { t } = useTranslation('finance');
  const [activeId, setActiveId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const pendingFocus = useRef<string | null>(null);

  // Active row falls back to the first visible row (e.g. after filtering).
  const currentId = activeId && rows.some((r) => r.node.id === activeId) ? activeId : (rows[0]?.node.id ?? null);

  // Only the active row's buttons stay in the tab order (one tab stop per grid row).
  useEffect(() => {
    rowRefs.current.forEach((el, id) => {
      el.querySelectorAll('button').forEach((btn) => btn.setAttribute('tabindex', id === currentId ? '0' : '-1'));
    });
  });

  useEffect(() => {
    if (!pendingFocus.current) return;
    rowRefs.current.get(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  });

  const focusRow = (id: string | undefined) => {
    if (!id) return;
    setActiveId(id);
    pendingFocus.current = id;
    rowRefs.current.get(id)?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTableRowElement>, index: number) => {
    if (e.target !== e.currentTarget) return; // keys inside the ⋯ menu button
    const row = rows[index];
    const { node } = row;
    switch (e.key) {
      case 'ArrowDown':
        focusRow(rows[index + 1]?.node.id);
        break;
      case 'ArrowUp':
        focusRow(rows[index - 1]?.node.id);
        break;
      case 'Home':
        focusRow(rows[0]?.node.id);
        break;
      case 'End':
        focusRow(rows[rows.length - 1]?.node.id);
        break;
      case 'ArrowRight':
        if (row.hasChildren && !row.expanded) onToggle(node, true);
        else if (row.expanded) focusRow(rows[index + 1]?.node.id);
        break;
      case 'ArrowLeft':
        if (row.expanded) onToggle(node, false);
        else focusRow(row.parentId ?? undefined);
        break;
      case 'Enter':
      case ' ':
        if (row.hasChildren) onToggle(node, !row.expanded);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const handleClick = (e: MouseEvent<HTMLTableRowElement>, row: FlatRow) => {
    // Clicks bubbling from the ⋯ button or its portalled menu are not row clicks.
    const target = e.target as HTMLElement;
    if (!e.currentTarget.contains(target) || target.closest('button, a, [role="menu"]')) return;
    setActiveId(row.node.id);
    if (row.hasChildren) onToggle(row.node, !row.expanded);
  };

  let body: ReactNode;
  if (loading) {
    body = <SkeletonRows />;
  } else if (rows.length === 0) {
    body = (
      <tr>
        <td colSpan={COL_COUNT} className="p-0">
          {emptyState}
        </td>
      </tr>
    );
  } else {
    body = rows.map((row, index) => {
      const { node } = row;
      const roles = systemRoles.get(node.id);
      const isSystem = Boolean(roles?.length);
      const isGroupRow = node.isGroup || row.hasChildren;
      const matched = matchIds.has(node.id);
      const hasKids = node.children.length > 0;
      const deleteBlock = isSystem ? t('coaTreeTable.deleteBlock.system') : hasKids ? t('coaTreeTable.deleteBlock.children') : null;
      const depth = row.level - 1;
      return (
        <tr
          key={node.id}
          ref={(el) => {
            if (el) rowRefs.current.set(node.id, el);
            else rowRefs.current.delete(node.id);
          }}
          role="row"
          aria-level={row.level}
          aria-posinset={row.posInSet}
          aria-setsize={row.setSize}
          aria-expanded={row.hasChildren ? row.expanded : undefined}
          tabIndex={node.id === currentId ? 0 : -1}
          onKeyDown={(e) => handleKeyDown(e, index)}
          onClick={(e) => handleClick(e, row)}
          onFocus={(e) => e.target === e.currentTarget && setActiveId(node.id)}
          className={cn(
            'group/row border-b border-border transition-colors hover:bg-accent',
            'focus-visible:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
            row.hasChildren && 'cursor-pointer',
            depth === 0 && isGroupRow && 'bg-muted/50',
            !node.isActive && 'text-muted-foreground',
          )}
        >
          <td
            role="gridcell"
            className="relative h-10 py-1.5 pr-2"
            style={{
              paddingLeft: `calc(${depth} * var(--coa-indent) + 0.5rem)`,
            }}
          >
            {/* Tree guide lines, one per ancestor level. */}
            {Array.from({ length: depth }, (_, i) => (
              <span
                key={i}
                aria-hidden
                className="absolute inset-y-0 border-l border-border"
                style={{
                  left: `calc(${i} * var(--coa-indent) + 0.5rem + 0.6875rem)`,
                }}
              />
            ))}
            <div className="relative flex min-w-0 items-center gap-1.5">
              {row.hasChildren ? (
                <span
                  aria-hidden
                  className="flex size-[1.375rem] shrink-0 items-center justify-center rounded-sm text-muted-foreground group-hover/row:text-foreground"
                >
                  <ChevronRight className={cn('size-4 transition-transform', row.expanded && 'rotate-90')} />
                </span>
              ) : (
                <span aria-hidden className="flex size-[1.375rem] shrink-0 items-center justify-center">
                  <span className="size-1 rounded-full bg-border" />
                </span>
              )}
              <span
                className={cn(
                  'num shrink-0 font-mono text-xs',
                  isGroupRow ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                <Highlight text={node.accountNumber} query={query} active={matched} />
              </span>
              <span
                className={cn(
                  'line-clamp-2 min-w-0 break-words sm:line-clamp-none sm:truncate',
                  isGroupRow ? 'font-semibold text-foreground' : 'text-foreground',
                )}
              >
                <Highlight text={node.name} query={query} active={matched} />
              </span>
              {isGroupRow && <span className="sr-only">{t('coaTreeTable.groupSr')}</span>}
              {isSystem && <SystemAccountBadge roles={roles!} />}
              {!node.isActive && (
                <span className="shrink-0 rounded-sm bg-neutral-subtle px-1.5 py-0.5 text-xs font-medium leading-4 text-neutral-text">
                  {t('coaTreeTable.inactive')}
                </span>
              )}
            </div>
          </td>
          <td role="gridcell" className="hidden h-10 px-3 text-muted-foreground md:table-cell">
            {rootTypeLabel(node.rootType)}
            <span className="text-xs"> · {isGroupRow ? t('coaTreeTable.group') : t('coaTreeTable.detail')}</span>
          </td>
          <td role="gridcell" className="hidden h-10 px-3 text-muted-foreground md:table-cell">
            {normalSide(node.rootType) === 'D' ? t('coaTreeTable.debit') : t('coaTreeTable.credit')}
          </td>
          <td role="gridcell" className={cn('h-10 px-2 text-right sm:px-3', isGroupRow && 'font-semibold')}>
            <BalanceCell node={node} />
          </td>
          <td role="gridcell" className="h-10 py-0 pr-1 text-right sm:pr-2">
            <RowActions
              label={t('coaTreeTable.rowActions', { number: node.accountNumber, name: node.name })}
              actions={[
                {
                  label: t('coaTreeTable.actions.addChild'),
                  icon: PlusCircle,
                  hidden: !canEdit || !node.isGroup,
                  onSelect: () => onAddChild(node),
                },
                {
                  label: t('coaTreeTable.actions.setBalance'),
                  icon: Wallet,
                  hidden: !canEdit || node.isGroup,
                  onSelect: () => onSetBalance(node),
                },
                {
                  label: t('coaTreeTable.actions.edit'),
                  icon: Pencil,
                  hidden: !canEdit,
                  onSelect: () => onEdit(node),
                },
                {
                  label: deleteBlock ? t('coaTreeTable.actions.deleteBlocked', { reason: deleteBlock }) : t('coaTreeTable.actions.delete'),
                  icon: Trash2,
                  tone: 'danger',
                  hidden: !canEdit || !canDelete,
                  disabled: Boolean(deleteBlock),
                  onSelect: () => onDelete(node),
                },
              ]}
            />
          </td>
        </tr>
      );
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-1)]">
      {/* A native table re-roled as treegrid (WAI-ARIA treegrid pattern). */}
      <table
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
        role="treegrid"
        aria-label={t('coaTreeTable.label')}
        aria-busy={loading || undefined}
        className="w-full table-fixed border-collapse text-sm [--coa-indent:0.875rem] sm:[--coa-indent:1.375rem]"
      >
        <colgroup>
          <col />
          <col className="hidden w-36 md:table-column" />
          <col className="hidden w-32 md:table-column" />
          <col className="w-[6.75rem] sm:w-44" />
          <col className="w-10 sm:w-12" />
        </colgroup>
        <thead className="bg-muted">
          <tr role="row" className="border-b border-border">
            {(
              [
                ['account', 'pl-3 text-left'],
                ['type', 'hidden text-left md:table-cell'],
                ['normalBalance', 'hidden text-left md:table-cell'],
                ['balance', 'text-right max-sm:px-2'],
              ] as const
            ).map(([key, cls]) => (
              <th
                key={key}
                role="columnheader"
                scope="col"
                className={cn(
                  'h-10 whitespace-nowrap px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                  cls,
                )}
              >
                {t(`coaTreeTable.columns.${key}`)}
              </th>
            ))}
            <th role="columnheader" scope="col" className="h-10 w-12">
              <span className="sr-only">{t('coaTreeTable.columns.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  );
}
