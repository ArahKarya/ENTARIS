import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import api from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { DECISION_LABEL, DECISION_TONE, type CallDecision } from '@/lib/mcpEndpoint';
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
const DECISION_OPTIONS = (Object.keys(DECISION_LABEL) as CallDecision[])
  .filter((d) => d !== 'inflight')
  .map((d) => ({ value: d, label: DECISION_LABEL[d] }));

/** Riwayat panggilan MCP (server-paged, filter di URL). */
export function McpCallsCard() {
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
        header: 'Waktu',
        meta: { cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => <time dateTime={row.original.createdAt}>{formatDateTime(row.original.createdAt)}</time>,
      },
      {
        id: 'token',
        header: 'Token',
        meta: { hideBelow: 'xl', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => row.original.tokenName,
      },
      {
        id: 'actor',
        header: 'Aktor',
        meta: { cellClassName: 'max-w-44' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">{row.original.actorName ?? <span className="text-muted-foreground">-</span>}</p>
            {row.original.channel && <p className="truncate text-xs text-muted-foreground">via {row.original.channel}</p>}
          </div>
        ),
      },
      {
        id: 'tool',
        header: 'Tool',
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
        header: 'Risiko',
        meta: { hideBelow: 'md' },
        cell: ({ row }) => <Badge variant={RISK_VARIANT[row.original.risk]}>{row.original.risk}</Badge>,
      },
      {
        id: 'decision',
        header: 'Keputusan',
        cell: ({ row }) => (
          <StatusBadge label={DECISION_LABEL[row.original.decision] ?? row.original.decision} tone={DECISION_TONE[row.original.decision] ?? 'neutral'} />
        ),
      },
      {
        id: 'duration',
        header: 'Durasi',
        meta: { hideBelow: 'xl', align: 'right', cellClassName: 'whitespace-nowrap tabular-nums' },
        cell: ({ row }) => `${row.original.durationMs} ms`,
      },
      {
        id: 'approval',
        header: 'Persetujuan',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) =>
          row.original.approvalId ? (
            <Link className="text-primary underline-offset-4 hover:underline" to={`/approvals?request=${row.original.approvalId}`}>
              Buka
            </Link>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
    ],
    [],
  );

  const tokenOptions = (tokens.data ?? []).map((t) => ({ value: t.id, label: t.name }));

  return (
    <SettingsCard title="Riwayat panggilan" description="Setiap panggilan tool dari engine AIRA: siapa, lewat channel apa, keputusan, dan tautan ke persetujuan. Argumen tidak disimpan." contentClassName="space-y-3">
      <FilterBar
        list={list}
        searchLabel="Cari tool"
        searchPlaceholder="Cari nama tool"
        status={{ key: 'decision', label: 'Keputusan', allLabel: 'Semua keputusan', options: DECISION_OPTIONS }}
        dateRange
      >
        <ComboboxFilter
          label="Token"
          allLabel="Semua token"
          value={list.filters.tokenId}
          onChange={(v) => list.setFilter('tokenId', v)}
          options={tokenOptions}
        />
        <div className="w-full sm:w-48">
          <label htmlFor="mcp-actor-filter" className="sr-only">Cari aktor</label>
          <Input
            id="mcp-actor-filter"
            value={list.filters.actor ?? ''}
            onChange={(e) => list.setFilter('actor', e.target.value)}
            placeholder="Cari aktor"
            autoComplete="off"
          />
        </div>
      </FilterBar>

      <DataTable
        {...listTableProps(list, calls.data?.total)}
        label="Riwayat panggilan MCP"
        itemLabel="panggilan"
        columns={columns}
        data={calls.data?.data}
        getRowId={(row) => row.id}
        loading={calls.isLoading}
        fetching={calls.isFetching && calls.isPlaceholderData}
        error={calls.error}
        onRetry={() => calls.refetch()}
        density={density}
        onDensityChange={setDensity}
        empty={{ title: 'Belum ada panggilan', description: 'Panggilan dari engine AIRA akan tampil di sini.' }}
      />
    </SettingsCard>
  );
}
