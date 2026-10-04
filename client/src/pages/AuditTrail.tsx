/**
 * Jejak Audit (/audit) — list kit page (see pages/SalesInvoices.tsx).
 *
 * GET /audit-logs (page, limit, userId, action, entityType, startDate, endDate,
 * search = entity id, sort) + /summary (counts per action, same filters) +
 * /facets (filter options). ?log=<id> opens the detail sheet with a readable
 * before/after diff. Values are shown exactly as stored: the server redacts
 * secrets when the log is written.
 */
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Eye, FilePlus2, FileX2, History, PencilLine } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { formatDateTime, formatNumber } from '@/lib/format';
import { auditActionLabel, auditActionTone, formatRelativeTime } from '@/lib/auditDiff';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  ComboboxFilter,
  DataTable,
  FilterBar,
  PageHeader,
  RowActions,
  StatCard,
  StatusBadge,
  fetchAllPages,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import AuditLogDetailSheet, { type AuditLogEntry } from '@/components/AuditLogDetailSheet';

interface AuditSummary {
  total: number;
  byAction: Record<string, number>;
}

interface AuditFacets {
  actions: string[];
  entityTypes: string[];
  users: Array<{ id: string; fullName: string }>;
}

const ENDPOINT = '/audit-logs';
const FILTER_KEYS = ['userId', 'action', 'entityType', 'startDate', 'endDate'] as const;
const DETAIL_PARAM = 'log';

export const AuditTrail = () => {
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'createdAt', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [searchParams, setSearchParams] = useSearchParams();
  const [exporting, setExporting] = useState(false);
  const selectedId = searchParams.get(DETAIL_PARAM);

  const openDetail = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set(DETAIL_PARAM, id);
          else next.delete(DETAIL_PARAM);
          return next;
        },
        { replace: !id },
      );
    },
    [setSearchParams],
  );

  const logsQuery = useQuery({
    queryKey: ['audit-logs', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<AuditLogEntry>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });

  const summaryQuery = useQuery({
    queryKey: ['audit-logs', 'summary', list.filterParams],
    queryFn: async () => (await api.get<AuditSummary>(`${ENDPOINT}/summary`, { params: list.filterParams })).data,
    placeholderData: keepPreviousData,
  });

  const facetsQuery = useQuery({
    queryKey: ['audit-logs', 'facets'],
    queryFn: async () => (await api.get<AuditFacets>(`${ENDPOINT}/facets`)).data,
    staleTime: 60_000,
  });

  const fromList = selectedId ? logsQuery.data?.data.find((l) => l.id === selectedId) : undefined;
  const detailQuery = useQuery({
    queryKey: ['audit-logs', 'detail', selectedId],
    queryFn: async () => (await api.get<AuditLogEntry>(`${ENDPOINT}/${selectedId}`)).data,
    enabled: !!selectedId && !fromList,
  });

  const facets = facetsQuery.data;
  const actionOptions = useMemo(
    () => (facets?.actions ?? []).map((a) => ({ value: a, label: auditActionLabel(a) })),
    [facets],
  );
  const userOptions = useMemo(() => (facets?.users ?? []).map((u) => ({ value: u.id, label: u.fullName })), [facets]);
  const entityOptions = useMemo(() => (facets?.entityTypes ?? []).map((e) => ({ value: e, label: e })), [facets]);

  const total = logsQuery.data?.total;
  const summary = summaryQuery.data;
  const count = (action: string) => (summary ? formatNumber(summary.byAction[action] ?? 0) : '-');

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = { ...list.filterParams, ...(list.params.sort ? { sort: list.params.sort } : {}) };
      const { rows, truncated } = await fetchAllPages<AuditLogEntry>(ENDPOINT, params, { pageSize: 200 });
      exportToExcel(
        rows.map((l) => ({
          Waktu: formatDateTime(l.createdAt),
          Pengguna: l.user?.fullName ?? '-',
          Email: l.user?.email ?? '-',
          Aksi: auditActionLabel(l.action),
          'Kode Aksi': l.action,
          Entitas: l.entityType,
          'ID Entitas': l.entityId,
          'Alamat IP': l.ipAddress ?? '-',
          'Nilai Lama': l.oldValues ? JSON.stringify(l.oldValues) : '-',
          'Nilai Baru': l.newValues ? JSON.stringify(l.newValues) : '-',
        })),
        `jejak-audit-${new Date().toISOString().slice(0, 10)}`,
      );
      if (truncated) toast.warning(`Ekspor dibatasi ${formatNumber(rows.length)} catatan pertama. Persempit filter.`);
    } catch {
      toast.error('Gagal mengekspor jejak audit. Coba lagi.');
    } finally {
      setExporting(false);
    }
  };

  const columns = useMemo<ColumnDef<AuditLogEntry>[]>(
    () => [
      {
        id: 'createdAt',
        header: 'Waktu',
        enableSorting: true,
        sortDescFirst: true,
        meta: { cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <time dateTime={row.original.createdAt} className="text-foreground">
              {formatRelativeTime(row.original.createdAt)}
            </time>
            <span className="num text-xs text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>
            {/* Mobile: entity stacked here because its column is hidden. */}
            <span className="max-w-40 truncate text-xs text-foreground sm:hidden">{row.original.entityType}</span>
          </div>
        ),
      },
      {
        id: 'user',
        header: 'Pengguna',
        meta: { hideBelow: 'md', cellClassName: 'min-w-36 max-w-60' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.original.user?.fullName ?? '-'}</p>
            <p className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden">
              {row.original.user?.email}
            </p>
          </div>
        ),
      },
      {
        id: 'action',
        header: 'Aksi',
        enableSorting: true,
        cell: ({ row }) => (
          <StatusBadge label={auditActionLabel(row.original.action)} tone={auditActionTone(row.original.action)} />
        ),
      },
      {
        id: 'entityType',
        header: 'Entitas',
        enableSorting: true,
        meta: { hideBelow: 'sm', cellClassName: 'min-w-0 max-w-64' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-foreground">{row.original.entityType}</p>
            <p className="truncate font-mono text-xs text-muted-foreground" title={row.original.entityId}>
              {row.original.entityId}
            </p>
          </div>
        ),
      },
      {
        id: 'ipAddress',
        header: 'Alamat IP',
        meta: { hideBelow: 'xl', cellClassName: 'font-mono text-xs text-muted-foreground' },
        cell: ({ row }) => row.original.ipAddress ?? '-',
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => (
          <RowActions
            label={`Aksi untuk catatan ${row.original.entityType} ${formatDateTime(row.original.createdAt)}`}
            actions={[{ label: 'Lihat detail', icon: Eye, onSelect: () => openDetail(row.original.id) }]}
          />
        ),
      },
    ],
    [openDetail],
  );

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Jejak Audit"
        description="Riwayat perubahan data dan aktivitas pengguna di aplikasi."
        actions={
          <Button variant="outline" onClick={handleExport} loading={exporting} disabled={!total}>
            <Download aria-hidden />
            <span className="sr-only sm:not-sr-only">Ekspor Excel</span>
          </Button>
        }
      />

      <section aria-label="Ringkasan aktivitas sesuai filter" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Jumlah Aktivitas"
          icon={History}
          loading={!summary && !summaryQuery.isError}
          value={summary ? formatNumber(summary.total) : '-'}
          hint={summary ? `${formatNumber(summary.byAction.LOGIN ?? 0)} kali masuk` : undefined}
        />
        <StatCard label="Buat" icon={FilePlus2} loading={!summary && !summaryQuery.isError} value={count('CREATE')} />
        <StatCard label="Ubah" icon={PencilLine} loading={!summary && !summaryQuery.isError} value={count('UPDATE')} />
        <StatCard label="Hapus" icon={FileX2} loading={!summary && !summaryQuery.isError} value={count('DELETE')} />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari ID entitas"
          searchPlaceholder="Cari ID entitas"
          status={{ options: actionOptions, key: 'action', label: 'Aksi', allLabel: 'Semua aksi' }}
          dateRange
        >
          <ComboboxFilter
            label="Pengguna"
            allLabel="Semua pengguna"
            value={list.filters.userId}
            onChange={(v) => list.setFilter('userId', v)}
            options={userOptions}
            loading={facetsQuery.isLoading}
          />
          <ComboboxFilter
            label="Entitas"
            allLabel="Semua entitas"
            value={list.filters.entityType}
            onChange={(v) => list.setFilter('entityType', v)}
            options={entityOptions}
            loading={facetsQuery.isLoading}
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, total)}
          label="Daftar jejak audit"
          itemLabel="catatan"
          columns={columns}
          data={logsQuery.data?.data}
          getRowId={(row) => row.id}
          loading={logsQuery.isLoading}
          fetching={logsQuery.isFetching && logsQuery.isPlaceholderData}
          error={logsQuery.error}
          onRetry={() => logsQuery.refetch()}
          onRowClick={(row) => openDetail(row.id)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: 'Belum ada catatan audit',
            description: 'Perubahan data dan aktivitas masuk akan tercatat di sini.',
          }}
        />
      </div>

      <AuditLogDetailSheet
        open={!!selectedId}
        log={fromList ?? detailQuery.data ?? null}
        loading={!fromList && detailQuery.isLoading}
        error={!fromList && detailQuery.isError}
        onClose={() => openDetail(null)}
      />
    </div>
  );
};
