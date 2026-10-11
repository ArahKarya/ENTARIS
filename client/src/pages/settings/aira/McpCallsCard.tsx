import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import api from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { CALL_DECISIONS, DECISION_TONE, decisionLabel, type CallDecision } from '@/lib/mcpEndpoint';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { ComboboxFilter, DataTable, FilterBar, StatusBadge, listTableProps, type Paginated } from '@/components/shared';
import { Input } from '@/components/ui/input';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { McpTokenRow } from './McpTokensCard';
import { MCP_TOKENS_KEY } from './keys';

interface CallRow {
  id: string;
  tokenId: string;
  tokenName: string;
  actorUserId: string | null;
  actorName: string | null;
  channel: string | null;
  tool: string;
  risk: 'read' | 'write' | 'critical';
  decision: CallDecision;
  httpStatus: number | null;
  durationMs: number;
  approvalId: string | null;
  error: string | null;
  createdAt: string;
}

const FILTERS = ['decision', 'tokenId', 'actor', 'startDate', 'endDate'] as const;
const RISK_VARIANT: Record<CallRow['risk'], BadgeProps['variant']> = { read: 'success', write: 'warning', critical: 'danger' };
const FILTER_DECISIONS = CALL_DECISIONS.filter((d) => d !== 'inflight');

/** Riwayat panggilan MCP (server-paged, filter di URL). */
export function McpCallsCard() {
  const { t } = useTranslation('aira');
  const list = useListState({ filters: FILTERS });
  const [density, setDensity] = useTableDensity();

  // search → filter nama tool (API: `tool`).
  const params = useMemo(() => {
    const { search, sort: _sort, ...rest } = list.params as Record<string, string | number>;
    return { ...rest, ...(search ? { tool: search } : {}) };
  }, [list.params]);

  const calls = useQuery({
    queryKey: ['ai-mcp-calls', params],
    queryFn: async () => (await api.get<Paginated<CallRow>>('/ai/mcp/calls', { params })).data,
    placeholderData: keepPreviousData,
  });
  const tokens = useQuery<McpTokenRow[]>({
    queryKey: MCP_TOKENS_KEY,
    queryFn: async () => (await api.get('/ai/mcp/tokens')).data,
  });

  const columns = useMemo<ColumnDef<CallRow>[]>(
    () => [
      {
        id: 'createdAt',
        header: t('mcp.calls.columns.time'),
        meta: { cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => <time dateTime={row.original.createdAt}>{formatDateTime(row.original.createdAt)}</time>,
      },
      {
        id: 'token',
        header: t('mcp.calls.columns.token'),
        meta: { hideBelow: 'xl', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => row.original.tokenName,
      },
      {
        id: 'actor',
        header: t('mcp.calls.columns.actor'),
        meta: { cellClassName: 'max-w-44' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">{row.original.actorName ?? <span className="text-muted-foreground">—</span>}</p>
            {row.original.channel && <p className="truncate text-xs text-muted-foreground">{t('mcp.calls.via', { channel: row.original.channel })}</p>}
          </div>
        ),
      },
      {
        id: 'tool',
        header: t('mcp.calls.columns.tool'),
        meta: { cellClassName: 'max-w-56 text-xs' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-mono">{row.original.tool}</p>
            {row.original.error && <p className="mt-0.5 whitespace-normal break-words text-danger-text">{row.original.error}</p>}
          </div>
        ),
      },
      {
        id: 'risk',
        header: t('mcp.calls.columns.risk'),
        meta: { hideBelow: 'md' },
        cell: ({ row }) => <Badge variant={RISK_VARIANT[row.original.risk]}>{row.original.risk}</Badge>,
      },
      {
        id: 'decision',
        header: t('mcp.calls.columns.decision'),
        cell: ({ row }) => (
          <StatusBadge label={decisionLabel(row.original.decision)} tone={DECISION_TONE[row.original.decision] ?? 'neutral'} />
        ),
      },
      {
        id: 'duration',
        header: t('mcp.calls.columns.duration'),
        meta: { hideBelow: 'xl', align: 'right', cellClassName: 'whitespace-nowrap tabular-nums' },
        cell: ({ row }) => `${row.original.durationMs} ms`,
      },
      {
        id: 'approval',
        header: t('mcp.calls.columns.approval'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) =>
          row.original.approvalId ? (
            <Link className="text-primary underline-offset-4 hover:underline" to={`/approvals?request=${row.original.approvalId}`}>
              {t('mcp.calls.open')}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],
    [t],
  );

  const decisionOptions = FILTER_DECISIONS.map((d: CallDecision) => ({ value: d, label: decisionLabel(d) }));
  const tokenOptions = (tokens.data ?? []).map((t) => ({ value: t.id, label: t.name }));

  return (
    <SettingsCard title={t('mcp.calls.title')} description={t('mcp.calls.description')} contentClassName="space-y-3">
      <FilterBar
        list={list}
        searchLabel={t('mcp.calls.searchLabel')}
        searchPlaceholder={t('mcp.calls.searchPlaceholder')}
        status={{ key: 'decision', label: t('mcp.calls.decisionFilter'), allLabel: t('mcp.calls.allDecisions'), options: decisionOptions }}
        dateRange
      >
        <ComboboxFilter
          label={t('mcp.calls.tokenFilter')}
          allLabel={t('mcp.calls.allTokens')}
          value={list.filters.tokenId}
          onChange={(v) => list.setFilter('tokenId', v)}
          options={tokenOptions}
        />
        <div className="w-full sm:w-48">
          <label htmlFor="mcp-actor-filter" className="sr-only">{t('mcp.calls.actorSearch')}</label>
          <Input
            id="mcp-actor-filter"
            value={list.filters.actor ?? ''}
            onChange={(e) => list.setFilter('actor', e.target.value)}
            placeholder={t('mcp.calls.actorSearch')}
            autoComplete="off"
          />
        </div>
      </FilterBar>

      <DataTable
        {...listTableProps(list, calls.data?.total)}
        label={t('mcp.calls.tableLabel')}
        itemLabel={t('mcp.calls.itemLabel')}
        columns={columns}
        data={calls.data?.data}
        getRowId={(row) => row.id}
        loading={calls.isLoading}
        fetching={calls.isFetching && calls.isPlaceholderData}
        error={calls.error}
        onRetry={() => calls.refetch()}
        density={density}
        onDensityChange={setDensity}
        empty={{ title: t('mcp.calls.emptyTitle'), description: t('mcp.calls.emptyDescription') }}
      />
    </SettingsCard>
  );
}
