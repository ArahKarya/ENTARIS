/**
 * Jadwal Preventif tab of the Pemeliharaan page. GET /ga/maintenance/schedules
 * returns every schedule (small master list), so search, filters, sorting and
 * paging run in memory on the same URL state as the server-paged lists.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarCheck, CalendarClock, CalendarX, FilePlus, Pencil, Plus } from 'lucide-react';
import api from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  ComboboxFilter,
  DataTable,
  FilterBar,
  RowActions,
  StatCard,
  StatusBadge,
  listTableProps,
} from '@/components/shared';
import { DueDate } from '@/components/ProjectGuaranteeDueDate';
import { compareNullable, includesText, pageRows, sortRows, type Comparators } from './local-list';
import { ScheduleFormModal } from './schedule-forms';
import { SCHEDULE_FILTER_KEYS } from './queries';
import { intervalLabel, scheduleDueState, toDateInput, type ScheduleRow, type WoPrefill } from './wo-meta';


const ACTIVE_FILTER = [
  { value: 'active', label: 'Aktif' },
  { value: 'inactive', label: 'Nonaktif' },
];
const DUE_FILTER = [
  { value: 'overdue', label: 'Lewat jatuh tempo' },
  { value: 'dueSoon', label: 'Jatuh tempo 7 hari' },
];
const FILTER_CLASS = 'w-[calc(50%-0.25rem)] sm:w-44';

const COMPARATORS: Comparators<ScheduleRow> = {
  asset: (a, b) => compareNullable(a.asset?.code, b.asset?.code),
  nextDueAt: (a, b) => compareNullable(a.nextDueAt, b.nextDueAt),
};

export interface SchedulesTabProps {
  canEdit: boolean;
  onCreate: () => void;
  onCreateWorkOrder: (prefill: WoPrefill) => void;
}

export function SchedulesTab({ canEdit, onCreate, onCreateWorkOrder }: SchedulesTabProps) {
  const list = useListState({ filters: SCHEDULE_FILTER_KEYS, defaultSort: { id: 'nextDueAt', desc: false } });
  const [density, setDensity] = useTableDensity();
  const [editing, setEditing] = useState<ScheduleRow | null>(null);

  const query = useQuery({
    queryKey: ['ga-schedules'],
    queryFn: async () => {
      const res = await api.get<ScheduleRow[]>('/ga/maintenance/schedules');
      return Array.isArray(res.data) ? res.data : [];
    },
  });
  const all = useMemo(() => query.data ?? [], [query.data]);

  const { active, due } = list.filters;
  const filtered = useMemo(() => {
    const now = new Date();
    return all.filter((s) => {
      if (active === 'active' && !s.isActive) return false;
      if (active === 'inactive' && s.isActive) return false;
      if (due && scheduleDueState(s, now) !== due) return false;
      return includesText([s.asset?.code, s.asset?.name, s.notes], list.search);
    });
  }, [all, active, due, list.search]);
  const sorted = useMemo(() => sortRows(filtered, list.sort, COMPARATORS), [filtered, list.sort]);
  const rows = pageRows(sorted, list.page, list.pageSize);

  const counts = useMemo(() => {
    const now = new Date();
    let activeCount = 0;
    let overdue = 0;
    let dueSoon = 0;
    for (const s of all) {
      if (!s.isActive) continue;
      activeCount += 1;
      const state = scheduleDueState(s, now);
      if (state === 'overdue') overdue += 1;
      if (state === 'dueSoon') dueSoon += 1;
    }
    return { total: all.length, active: activeCount, overdue, dueSoon };
  }, [all]);

  const columns = useMemo<ColumnDef<ScheduleRow>[]>(
    () => [
      {
        id: 'asset',
        header: 'Aset',
        enableSorting: true,
        meta: { cellClassName: 'min-w-40 max-w-72' },
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{s.asset?.name ?? '-'}</p>
              <p className="num truncate text-xs text-muted-foreground">{s.asset?.code ?? ''}</p>
              {/* Mobile: interval stacked here because its column is hidden. */}
              <p className="text-xs text-muted-foreground sm:hidden">{intervalLabel(s)}</p>
            </div>
          );
        },
      },
      {
        id: 'interval',
        header: 'Interval',
        meta: { hideBelow: 'sm', cellClassName: 'whitespace-nowrap text-foreground' },
        cell: ({ row }) => intervalLabel(row.original),
      },
      {
        id: 'nextDueAt',
        header: 'Jatuh Tempo Berikutnya',
        enableSorting: true,
        cell: ({ row }) =>
          row.original.nextDueAt ? (
            <DueDate date={row.original.nextDueAt} dueState={scheduleDueState(row.original)} />
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        id: 'notes',
        header: 'Catatan',
        meta: { hideBelow: 'lg', cellClassName: 'max-w-72' },
        cell: ({ row }) =>
          row.original.notes ? (
            <span className="line-clamp-2 text-muted-foreground">{row.original.notes}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'active' : 'inactive'} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const s = row.original;
          const dueNow = scheduleDueState(s) !== null;
          return (
            <RowActions
              label={`Aksi untuk jadwal ${s.asset?.code ?? ''}`}
              actions={[
                {
                  label: 'Buat WO dari jadwal',
                  icon: FilePlus,
                  hidden: !canEdit || !dueNow || !s.asset?.id,
                  onSelect: () =>
                    onCreateWorkOrder({
                      assetId: s.asset!.id,
                      type: 'PREVENTIVE',
                      scheduleId: s.id,
                      dueAt: toDateInput(s.nextDueAt),
                    }),
                },
                { label: 'Edit jadwal', icon: Pencil, hidden: !canEdit, onSelect: () => setEditing(s) },
              ]}
            />
          );
        },
      },
    ],
    [canEdit, onCreateWorkOrder],
  );

  const loading = query.isLoading;

  return (
    <div className="space-y-5">
      <section aria-label="Ringkasan jadwal preventif" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Jadwal Aktif" icon={CalendarCheck} loading={loading} value={formatNumber(counts.active)} hint={`dari ${formatNumber(counts.total)} jadwal`} />
        <StatCard label="Lewat Jatuh Tempo" icon={CalendarX} loading={loading} value={formatNumber(counts.overdue)} hint="perlu dibuatkan WO" />
        <StatCard label="Jatuh Tempo 7 Hari" icon={CalendarClock} loading={loading} value={formatNumber(counts.dueSoon)} hint="siapkan WO preventif" />
        <StatCard label="Nonaktif" icon={CalendarCheck} loading={loading} value={formatNumber(counts.total - counts.active)} hint="tidak dipantau" />
      </section>

      <div className="space-y-3">
        <FilterBar list={list} searchLabel="Cari jadwal" searchPlaceholder="Cari aset atau catatan">
          <ComboboxFilter
            label="Filter status jadwal"
            allLabel="Semua status"
            value={list.filters.active}
            onChange={(v) => list.setFilter('active', v)}
            options={ACTIVE_FILTER}
            className={FILTER_CLASS}
          />
          <ComboboxFilter
            label="Filter jatuh tempo"
            allLabel="Semua jatuh tempo"
            value={list.filters.due}
            onChange={(v) => list.setFilter('due', v)}
            options={DUE_FILTER}
            className={FILTER_CLASS}
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, filtered.length)}
          label="Daftar jadwal preventif"
          itemLabel="jadwal"
          columns={columns}
          data={query.data ? rows : undefined}
          getRowId={(row) => row.id}
          loading={loading}
          error={query.error}
          onRetry={() => query.refetch()}
          onRowClick={canEdit ? setEditing : undefined}
          rowClassName={(row) => (!row.isActive ? 'text-muted-foreground' : undefined)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: 'Belum ada jadwal preventif',
            description: 'Buat jadwal perawatan berkala per aset (hari, jam operasi, atau km).',
            action: canEdit ? (
              <Button size="sm" onClick={onCreate}>
                <Plus aria-hidden />
                Buat jadwal pertama
              </Button>
            ) : undefined,
          }}
        />
      </div>

      {editing && <ScheduleFormModal schedule={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
