/**
 * Stok per Gudang (/warehouse-stock) — stock position dashboard.
 *
 * Source: GET /warehouses/stock-snapshot?date=&warehouseIds= — stock per
 * warehouse "as of" the end of the selected day (live stock for today). The
 * endpoint returns the whole snapshot (non-zero rows only), so the DataTable
 * runs in client mode; warehouse, date, search and filters live in the URL.
 * The PDF export uses the same endpoint and scope (warehouse + date).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { pdf } from '@react-pdf/renderer';
import { AlertTriangle, Boxes, FileDown, Loader2, Package, Wallet, Warehouse as WarehouseIcon } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatNumber, formatRupiah } from '@/lib/format';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { CATEGORY_ORDER, categoryGroupLabel } from '@/lib/stockCategories';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { Button } from '@/components/ui/button';
import { ComboboxFilter, DataTable, DateInput, FilterBar, PageHeader, StatCard } from '@/components/shared';
import WarehouseStockPDF, { type WarehouseBlock } from '@/lib/pdf/WarehouseStockPDF';

interface WarehouseOption {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
}

interface SnapshotItem {
  itemId: string;
  code: string;
  name: string;
  unit: string;
  category?: string | null;
  qty: number;
  averageCost: number;
  value: number;
}
interface SnapshotWarehouse {
  warehouseId: string;
  code: string;
  name: string;
  location: string | null;
  isDefault: boolean;
  items: SnapshotItem[];
  totalValue: number;
  itemCount: number;
}
interface StockSnapshotResponse {
  asOfDate: string;
  valuationNote: string;
  grandTotalValue: number;
  warehouses: SnapshotWarehouse[];
}

/** One table row: an item's balance in one warehouse. */
interface StockRow extends SnapshotItem {
  key: string;
  categoryLabel: string;
  warehouseCode: string;
  warehouseName: string;
}

const FILTER_KEYS = ['warehouse', 'date', 'category', 'stock'] as const;
const STOCK_FILTER = [
  { value: 'negative', label: 'Stok negatif' },
  { value: 'positive', label: 'Stok positif' },
];
const CATEGORY_OPTIONS = [...CATEGORY_ORDER, 'Lainnya'].map((c) => ({
  value: c,
  label: c,
}));
const CATEGORY_RANK = new Map(CATEGORY_OPTIONS.map((o, i) => [o.value, i]));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today as a local calendar date (YYYY-MM-DD), not the UTC day. */
function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const errorMessage = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

/** Flattens the snapshot into rows: warehouse order → category order → qty desc. */
function toRows(snapshot: StockSnapshotResponse | undefined): StockRow[] {
  if (!snapshot) return [];
  return snapshot.warehouses.flatMap((w) =>
    w.items
      .map((it) => ({
        ...it,
        key: `${w.warehouseId}|${it.itemId}`,
        categoryLabel: categoryGroupLabel(it.category),
        warehouseCode: w.code,
        warehouseName: w.name,
      }))
      .sort(
        (a, b) =>
          (CATEGORY_RANK.get(a.categoryLabel) ?? 99) - (CATEGORY_RANK.get(b.categoryLabel) ?? 99) || b.qty - a.qty,
      ),
  );
}

function StockQty({ row }: { row: StockRow }) {
  const negative = row.qty < 0;
  return (
    <div className="flex flex-col items-end">
      <span
        className={cn(
          'inline-flex items-center gap-1',
          negative ? 'font-semibold text-danger-text' : 'text-foreground',
        )}
      >
        {negative && <AlertTriangle className="size-3.5 shrink-0" aria-hidden />}
        {formatNumber(row.qty, { maxDecimals: 3 })}
        <span className="text-xs font-normal text-muted-foreground">{row.unit}</span>
      </span>
      {negative && <span className="text-[11px] font-medium leading-4 text-danger-text">Stok negatif</span>}
      {/* Mobile: value stacked here because its column is hidden. */}
      <span className="text-xs text-muted-foreground sm:hidden">{formatRupiah(row.value)}</span>
    </div>
  );
}

export const WarehouseStockDashboard = () => {
  const list = useListState({ filters: FILTER_KEYS });
  const [density, setDensity] = useTableDensity();
  const [isDownloading, setIsDownloading] = useState(false);
  const company = useCompanySettings();
  const { filters, search } = list;

  const today = localToday();
  const asOfDate = ISO_DATE.test(filters.date) && filters.date <= today ? filters.date : today;
  const warehouseId = filters.warehouse;
  const snapshotParams = useMemo(
    () => ({
      date: asOfDate,
      ...(warehouseId ? { warehouseIds: warehouseId } : {}),
    }),
    [asOfDate, warehouseId],
  );

  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'active'],
    queryFn: async () => (await api.get('/warehouses?active=true')).data.data as WarehouseOption[],
  });

  const snapshotQuery = useQuery({
    queryKey: ['warehouses', 'stock-snapshot', snapshotParams],
    queryFn: async () =>
      (await api.get('/warehouses/stock-snapshot', { params: snapshotParams })).data as StockSnapshotResponse,
    staleTime: 30 * 1000,
  });
  const snapshot = snapshotQuery.data;

  const allRows = useMemo(() => toRows(snapshot), [snapshot]);
  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return allRows.filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)) &&
        (!filters.category || r.categoryLabel === filters.category) &&
        (!filters.stock || (filters.stock === 'negative' ? r.qty < 0 : r.qty > 0)),
    );
  }, [allRows, search, filters.category, filters.stock]);

  const summary = useMemo(() => {
    if (!snapshot) return null;
    return {
      warehouses: snapshot.warehouses.length,
      rows: allRows.length,
      items: new Set(allRows.map((r) => r.itemId)).size,
      negative: allRows.filter((r) => r.qty < 0).length,
      value: snapshot.grandTotalValue,
    };
  }, [snapshot, allRows]);

  const warehouseOptions = useMemo(
    () =>
      (warehousesQuery.data ?? []).map((w) => ({
        value: w.id,
        label: w.isDefault ? `${w.name} (default)` : w.name,
        hint: w.code,
      })),
    [warehousesQuery.data],
  );
  const showWarehouseColumn = !warehouseId && (snapshot?.warehouses.length ?? 0) > 1;
  // Only search/category/stock narrow the rows; warehouse + date define the scope.
  const narrowed = !!(search || filters.category || filters.stock);
  const isToday = asOfDate === today;

  const columns = useMemo<ColumnDef<StockRow>[]>(() => {
    const all: ColumnDef<StockRow>[] = [
      {
        id: 'name',
        accessorFn: (r) => r.name,
        header: 'Item',
        enableSorting: true,
        meta: { cellClassName: 'min-w-36 max-w-48 sm:max-w-80' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{r.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{r.code}</span>
                {/* Mobile: category (and warehouse) stacked here because their columns are hidden. */}
                <span className="lg:hidden"> · {r.categoryLabel}</span>
                {showWarehouseColumn && <span className="md:hidden"> · {r.warehouseCode}</span>}
              </p>
            </div>
          );
        },
      },
      {
        id: 'category',
        accessorFn: (r) => CATEGORY_RANK.get(r.categoryLabel) ?? 99,
        header: 'Kategori',
        enableSorting: true,
        meta: {
          hideBelow: 'lg',
          cellClassName: 'whitespace-nowrap text-muted-foreground',
        },
        cell: ({ row }) => row.original.categoryLabel,
      },
      {
        id: 'warehouse',
        accessorFn: (r) => r.warehouseName,
        header: 'Gudang',
        enableSorting: true,
        meta: {
          hideBelow: 'md',
          cellClassName: 'whitespace-nowrap text-muted-foreground',
        },
        cell: ({ row }) => row.original.warehouseName,
      },
      {
        id: 'qty',
        accessorFn: (r) => r.qty,
        header: 'Stok',
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => <StockQty row={row.original} />,
      },
      {
        id: 'averageCost',
        accessorFn: (r) => r.averageCost,
        header: 'Avg. Cost (Rp)',
        enableSorting: true,
        sortDescFirst: true,
        meta: {
          align: 'right',
          hideBelow: 'lg',
          cellClassName: 'text-muted-foreground',
        },
        cell: ({ row }) =>
          row.original.averageCost > 0 ? formatRupiah(row.original.averageCost, { symbol: false }) : '-',
      },
      {
        id: 'value',
        accessorFn: (r) => r.value,
        header: 'Nilai (Rp)',
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ row }) => (
          <span className={cn(row.original.value < 0 ? 'text-danger-text' : 'text-foreground')}>
            {row.original.value !== 0 ? formatRupiah(row.original.value, { symbol: false }) : '-'}
          </span>
        ),
      },
    ];
    return showWarehouseColumn ? all : all.filter((c) => c.id !== 'warehouse');
  }, [showWarehouseColumn]);

  // PDF of the stock position for the selected date (and warehouse, if any).
  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      const res = await api.get('/warehouses/stock-snapshot', {
        params: snapshotParams,
      });
      const snap = res.data as StockSnapshotResponse;

      const blocks: WarehouseBlock[] = snap.warehouses.map((w) => ({
        code: w.code,
        name: w.name,
        location: w.location,
        isDefault: w.isDefault,
        items: w.items.map((s) => ({
          code: s.code,
          name: s.name,
          unit: s.unit,
          category: s.category,
          currentStock: s.qty,
          averageCost: s.averageCost,
        })),
      }));

      const blob = await pdf(
        <WarehouseStockPDF
          warehouses={blocks}
          generatedAt={new Date()}
          asOfDate={snap.asOfDate}
          valuationNote={snap.valuationNote}
          company={{
            name: company?.companyName ?? 'Perusahaan',
            address: company?.address,
            logoUrl: company?.logoUrl,
          }}
        />,
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Stok-Per-Gudang_${asOfDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errorMessage(e, 'Gagal membuat PDF.'));
    } finally {
      setIsDownloading(false);
    }
  };

  const noWarehouses = !!snapshot && snapshot.warehouses.length === 0;
  const scopeLabel = warehouseId
    ? (snapshot?.warehouses[0]?.name ?? 'gudang terpilih')
    : `${formatNumber(summary?.warehouses ?? 0)} gudang aktif`;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Stok per Gudang"
        description="Posisi stok per gudang pada akhir tanggal terpilih. Item dengan stok 0 tidak ditampilkan."
        actions={
          <Button
            onClick={handleDownloadPDF}
            disabled={isDownloading || !snapshot || noWarehouses}
            title="Unduh posisi stok per tanggal terpilih"
          >
            {isDownloading ? <Loader2 className="animate-spin" aria-hidden /> : <FileDown aria-hidden />}
            Unduh PDF
          </Button>
        }
      />

      <section aria-label="Ringkasan stok" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Gudang"
          icon={WarehouseIcon}
          loading={!summary && !snapshotQuery.isError}
          value={summary ? formatNumber(summary.warehouses) : '-'}
          hint={warehouseId ? scopeLabel : 'gudang aktif'}
        />
        <StatCard
          label="Item Bersaldo"
          icon={Package}
          loading={!summary && !snapshotQuery.isError}
          value={summary ? formatNumber(summary.items) : '-'}
          hint={
            summary && summary.rows !== summary.items ? `${formatNumber(summary.rows)} saldo per gudang` : 'jenis item'
          }
        />
        <StatCard
          label="Nilai Persediaan"
          icon={Wallet}
          loading={!summary && !snapshotQuery.isError}
          value={summary ? formatRupiah(summary.value, { compact: true }) : '-'}
          valueTitle={summary ? formatRupiah(summary.value) : undefined}
          hint="estimasi avg cost terkini"
        />
        <StatCard
          label="Stok Negatif"
          icon={summary?.negative ? AlertTriangle : Boxes}
          loading={!summary && !snapshotQuery.isError}
          value={summary ? formatNumber(summary.negative) : '-'}
          hint={summary ? (summary.negative > 0 ? 'perlu ditindaklanjuti' : 'tidak ada') : undefined}
          className={summary && summary.negative > 0 ? 'border-danger/40' : undefined}
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari item"
          searchPlaceholder="Cari nama atau kode item"
          status={{
            options: STOCK_FILTER,
            key: 'stock',
            label: 'Kondisi stok',
            allLabel: 'Semua stok',
          }}
        >
          <ComboboxFilter
            label="Gudang"
            allLabel="Semua gudang"
            searchPlaceholder="Cari gudang…"
            value={warehouseId}
            onChange={(v) => list.setFilter('warehouse', v)}
            options={warehouseOptions}
            loading={warehousesQuery.isLoading}
            className="w-[calc(50%-0.25rem)] sm:w-48"
          />
          <ComboboxFilter
            label="Kategori"
            allLabel="Semua kategori"
            searchPlaceholder="Cari kategori…"
            value={filters.category}
            onChange={(v) => list.setFilter('category', v)}
            options={CATEGORY_OPTIONS}
            className="w-[calc(50%-0.25rem)] sm:w-40"
          />
          <div className="flex w-[calc(50%-0.25rem)] items-center gap-2 sm:w-auto">
            <label
              htmlFor="stock-as-of"
              className="sr-only whitespace-nowrap text-sm text-muted-foreground sm:not-sr-only"
            >
              Posisi per
            </label>
            <DateInput
              id="stock-as-of"
              value={asOfDate}
              max={today}
              // Partial input reports ''; keep the current date until a full date is typed.
              onChange={(v) => v && list.setFilter('date', v >= today ? '' : v)}
              className="min-w-0 flex-1 sm:w-36 sm:flex-none"
            />
          </div>
        </FilterBar>

        <DataTable
          label={`Stok per gudang per ${formatDate(asOfDate)}`}
          itemLabel="saldo"
          columns={columns}
          data={snapshot ? rows : undefined}
          getRowId={(row) => row.key}
          pageSize={50}
          loading={snapshotQuery.isLoading}
          fetching={snapshotQuery.isFetching && !snapshotQuery.isLoading}
          error={snapshotQuery.error}
          onRetry={() => snapshotQuery.refetch()}
          filtered={narrowed}
          onClearFilters={() => {
            list.setFilters({ category: '', stock: '' });
            list.setSearch('');
          }}
          rowClassName={(r) => (r.qty < 0 ? 'bg-danger-subtle/40' : undefined)}
          density={density}
          onDensityChange={setDensity}
          empty={
            noWarehouses
              ? {
                  title: 'Belum ada gudang aktif',
                  description: 'Aktifkan atau tambahkan gudang untuk melihat stok per lokasi.',
                  action: can('warehouse', 'view') ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/warehouses">Buka Daftar Gudang</Link>
                    </Button>
                  ) : undefined,
                }
              : {
                  title: isToday ? 'Belum ada stok' : `Tidak ada stok per ${formatDate(asOfDate)}`,
                  description: 'Saldo stok akan muncul setelah ada penerimaan barang atau pergerakan stok.',
                }
          }
        />

        {snapshot?.valuationNote && (
          <p className="text-xs text-muted-foreground">
            {snapshot.valuationNote}
            {!isToday && ' Posisi historis dihitung mundur dari stok terkini.'}
          </p>
        )}
      </div>
    </div>
  );
};

export default WarehouseStockDashboard;
