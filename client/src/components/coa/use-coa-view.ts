/**
 * View state of the Bagan Akun tree, URL-synced:
 *   ?q=<search>&root=<ROOT_TYPE>&saldo=1&open=<numbers|*|>
 * Search/filters go through useListState (debounced search, Reset); the
 * expanded state is a separate `open` param (account numbers, see coa-tree).
 * While a filter is active every kept row is shown expanded; collapsing during
 * a search is local and resets when the filter changes.
 */
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useListState } from '@/hooks/useListState';
import {
  EXPAND_ALL,
  filterCoaTree,
  flattenVisible,
  isRootType,
  parseExpanded,
  serializeExpanded,
  toggleInSet,
  type CoaNode,
} from './coa-tree';

const FILTER_KEYS = ['root', 'saldo'] as const;
const OPEN_PARAM = 'open';

export function useCoaView(tree: readonly CoaNode[]) {
  const list = useListState({ filters: FILTER_KEYS });
  const [searchParams, setSearchParams] = useSearchParams();

  const rootType = isRootType(list.filters.root) ? list.filters.root : '';
  const nonZeroOnly = list.filters.saldo === '1';
  const filtering = Boolean(list.search || rootType || nonZeroOnly);
  const filterKey = `${list.search}|${rootType}|${nonZeroOnly}`;

  const filtered = useMemo(
    () => filterCoaTree(tree, { query: list.search, rootType, nonZeroOnly }),
    [tree, list.search, rootType, nonZeroOnly],
  );

  // ── Expanded state (URL) for the unfiltered tree ──────────────────────────
  const openRaw = searchParams.get(OPEN_PARAM);
  const expanded = useMemo(() => parseExpanded(openRaw, tree), [openRaw, tree]);
  const writeExpanded = useCallback(
    (next: ReadonlySet<string> | typeof EXPAND_ALL) => {
      const value = next === EXPAND_ALL ? EXPAND_ALL : serializeExpanded(next, tree);
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set(OPEN_PARAM, value);
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams, tree],
  );

  // ── Local collapsed set while filtering ───────────────────────────────────
  const [collapsed, setCollapsed] = useState<{ key: string; ids: Set<string> }>({ key: filterKey, ids: new Set() });
  const collapsedIds = useMemo(
    () => (collapsed.key === filterKey ? collapsed.ids : new Set<string>()),
    [collapsed, filterKey],
  );

  const isExpanded = useCallback(
    (node: CoaNode) => (filtering ? !collapsedIds.has(node.id) : expanded.has(node.accountNumber)),
    [filtering, collapsedIds, expanded],
  );

  const rows = useMemo(() => flattenVisible(filtered.nodes, isExpanded), [filtered.nodes, isExpanded]);

  const setNodeExpanded = useCallback(
    (node: CoaNode, open: boolean) => {
      if (filtering) {
        setCollapsed({
          key: filterKey,
          ids: toggleInSet(collapsedIds, node.id, !open),
        });
      } else {
        writeExpanded(toggleInSet(expanded, node.accountNumber, open));
      }
    },
    [filtering, filterKey, collapsedIds, expanded, writeExpanded],
  );

  const expandAll = useCallback(() => {
    if (filtering) setCollapsed({ key: filterKey, ids: new Set() });
    else writeExpanded(EXPAND_ALL);
  }, [filtering, filterKey, writeExpanded]);

  const collapseAll = useCallback(() => {
    if (filtering) {
      const ids = new Set<string>();
      const visit = (nodes: readonly CoaNode[]) =>
        nodes.forEach((n) => {
          if (n.children.length > 0) ids.add(n.id);
          visit(n.children);
        });
      visit(filtered.nodes);
      setCollapsed({ key: filterKey, ids });
    } else {
      writeExpanded(new Set());
    }
  }, [filtering, filterKey, filtered.nodes, writeExpanded]);

  return {
    list,
    rootType,
    nonZeroOnly,
    filtering,
    query: list.search,
    filtered,
    rows,
    setNodeExpanded,
    expandAll,
    collapseAll,
    setRootType: (value: string) => list.setFilter('root', value),
    setNonZeroOnly: (value: boolean) => list.setFilter('saldo', value ? '1' : ''),
  };
}

export type CoaView = ReturnType<typeof useCoaView>;
