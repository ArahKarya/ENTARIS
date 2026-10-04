/**
 * Stok & Produksi → tab "Layanan" (?tab=services). Service items (jasa) in the
 * list kit, using the paged mode of GET /service-items (sent with `page`).
 */
import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, Pencil, Plus } from 'lucide-react';
import api from '@/lib/api';
import { formatRupiah } from '@/lib/format';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import { DataTable, FilterBar, RowActions, StatusBadge, listTableProps, type Paginated } from '@/components/shared';
import { withUnit } from './list-helpers';
import { SERVICE_FILTER_KEYS, type ServiceItemRow } from './inventory-rows';

const ENDPOINT = '/service-items';
const ACTIVE_FILTER = [
  { value: 'true', label: 'Aktif' },
  { value: 'false', label: 'Nonaktif' },
];

interface ServiceItemsTabProps {
  canEdit: boolean;
  canDeactivate: boolean;
  onCreate?: () => void;
  onEdit: (svc: ServiceItemRow) => void;
  onDeactivate: (svc: ServiceItemRow) => void;
}

export function ServiceItemsTab({ canEdit, canDeactivate, onCreate, onEdit, onDeactivate }: ServiceItemsTabProps) {
  const list = useListState({ filters: SERVICE_FILTER_KEYS, defaultSort: { id: 'code', desc: false } });
  const [density, setDensity] = useTableDensity();

  const servicesQuery = useQuery({
    queryKey: ['service-items', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<ServiceItemRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });
  const total = servicesQuery.data?.total;

  const columns = useMemo<ColumnDef<ServiceItemRow>[]>(
    () => [
      {
        id: 'code',
        header: 'Kode',
        enableSorting: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap font-mono text-xs text-foreground' },
        cell: ({ row }) => row.original.code,
      },
      {
        id: 'name',
        header: 'Nama Layanan',
        enableSorting: true,
        meta: { cellClassName: 'min-w-36 max-w-80' },
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="min-w-0">
              <p className="line-clamp-2 font-medium break-words text-foreground">{s.name}</p>
              <p className="num font-mono text-xs text-muted-foreground md:hidden">{s.code}</p>
              {s.description && (
                <p className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden max-md:hidden">
                  {s.description}
                </p>
              )}
            </div>
          );
        },
      },
      {
        id: 'unit',
        header: 'Satuan',
        meta: { hideBelow: 'md', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => row.original.unit || '-',
      },
      {
        id: 'defaultRate',
        header: () => withUnit('Tarif Default'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="flex flex-col items-end gap-1">
              <span className="text-foreground">
                {s.defaultRate != null && Number(s.defaultRate) > 0 ? formatRupiah(s.defaultRate, { symbol: false }) : '-'}
                {s.defaultRate != null && Number(s.defaultRate) > 0 && (
                  <span className="text-xs text-muted-foreground"> /{s.unit}</span>
                )}
              </span>
              {!s.isActive && <StatusBadge status="inactive" className="sm:hidden" />}
            </div>
          );
        },
      },
      {
        id: 'account',
        header: 'Akun Pendapatan',
        meta: { hideBelow: 'lg', cellClassName: 'max-w-64 truncate text-muted-foreground' },
        cell: ({ row }) => {
          const a = row.original.account;
          return a ? `${a.accountNumber} · ${a.name}` : '-';
        },
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
          return (
            <RowActions
              label={`Aksi untuk ${s.code}`}
              actions={[
                { label: 'Edit layanan', icon: Pencil, hidden: !canEdit, onSelect: () => onEdit(s) },
                {
                  label: 'Nonaktifkan',
                  icon: Ban,
                  tone: 'danger',
                  hidden: !s.isActive || !canDeactivate,
                  onSelect: () => onDeactivate(s),
                },
              ]}
            />
          );
        },
      },
    ],
    [canEdit, canDeactivate, onEdit, onDeactivate],
  );

  return (
    <div className="space-y-3">
      <FilterBar
        list={list}
        searchLabel="Cari layanan"
        searchPlaceholder="Cari kode atau nama layanan"
        status={{ options: ACTIVE_FILTER, key: 'isActive', label: 'Status layanan', allLabel: 'Semua status' }}
      />
      <DataTable
        {...listTableProps(list, total)}
        label="Daftar layanan"
        itemLabel="layanan"
        columns={columns}
        data={servicesQuery.data?.data}
        getRowId={(row) => row.id}
        loading={servicesQuery.isLoading}
        fetching={servicesQuery.isFetching && servicesQuery.isPlaceholderData}
        error={servicesQuery.error}
        onRetry={() => servicesQuery.refetch()}
        rowClassName={(row) => (row.isActive ? undefined : 'text-muted-foreground')}
        density={density}
        onDensityChange={setDensity}
        empty={{
          title: 'Belum ada layanan',
          description: 'Layanan (jasa) dipakai di faktur penjualan dan penawaran.',
          action: onCreate ? (
            <Button size="sm" onClick={onCreate}>
              <Plus aria-hidden />
              Tambah layanan
            </Button>
          ) : undefined,
        }}
      />
    </div>
  );
}
