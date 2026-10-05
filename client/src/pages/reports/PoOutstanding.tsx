/**
 * Laporan PO Outstanding — open POs (ordered, not short-closed) per line:
 * ordered / received / remaining qty and remaining value (net of discount,
 * incl. line PPN). Filters: supplier, warehouse, PO date range, overdue only.
 */
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ClipboardList, Package, Wallet } from 'lucide-react';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { formatDate, formatNumber, formatRupiah } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DateInput, PartyFilter } from '@/components/shared';
import WarehousePicker from '@/components/WarehousePicker';
import {
  ExportMenu,
  ReportDataTable,
  ReportFilterSection,
  ReportPage,
  ReportState,
  ReportSummaryCards,
  type DataColumn,
} from '@/components/report-kit';

interface OutstandingRow {
  poId: string;
  poNumber: string;
  date: string;
  expectedDeliveryDate: string | null;
  supplierName: string;
  warehouseName: string | null;
  isOverdue: boolean;
  daysOverdue: number;
  itemId: string;
  itemName: string;
  unit: string;
  ordered: number;
  received: number;
  remaining: number;
  unitValue: number;
  remainingValue: number;
}

interface OutstandingData {
  rows: OutstandingRow[];
  summary: { poCount: number; lineCount: number; remainingValue: number; overduePoCount: number };
}

const qty = (n: number) => formatNumber(n, { maxDecimals: 3 });

const COLUMNS: DataColumn<OutstandingRow>[] = [
  { key: 'po', header: 'No. PO', rowHeader: true, className: 'whitespace-nowrap font-mono text-xs', render: (r) => r.poNumber },
  { key: 'supplier', header: 'Pemasok', render: (r) => r.supplierName },
  {
    key: 'item',
    header: 'Item',
    render: (r) => (
      <>
        <span>{r.itemName}</span>
        {r.warehouseName && <span className="block text-xs text-muted-foreground">{r.warehouseName}</span>}
      </>
    ),
  },
  {
    key: 'eta',
    header: 'Target Terima',
    className: 'whitespace-nowrap text-xs',
    render: (r) => (
      <>
        {r.expectedDeliveryDate ? formatDate(r.expectedDeliveryDate) : '-'}
        {r.isOverdue && (
          <span className="mt-0.5 flex items-center gap-1 font-medium text-danger-text">
            <AlertTriangle className="size-3" aria-hidden /> Terlambat {r.daysOverdue} hari
          </span>
        )}
      </>
    ),
  },
  { key: 'ordered', header: 'Dipesan', numeric: true, className: 'whitespace-nowrap', render: (r) => `${qty(r.ordered)} ${r.unit}` },
  { key: 'received', header: 'Diterima', numeric: true, className: 'whitespace-nowrap', render: (r) => qty(r.received) },
  { key: 'remaining', header: 'Sisa', numeric: true, className: 'whitespace-nowrap font-medium', render: (r) => qty(r.remaining) },
  {
    key: 'value',
    header: 'Nilai Sisa (Rp)',
    numeric: true,
    className: 'whitespace-nowrap font-medium',
    render: (r) => formatRupiah(r.remainingValue, { symbol: false }),
  },
];

export default function PoOutstanding() {
  const overdueId = useId();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [partyId, setPartyId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const params = {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    partyId: partyId || undefined,
    warehouseId: warehouseId || undefined,
    overdue: overdueOnly ? '1' : undefined,
  };
  const { data, isLoading, isError, refetch } = useQuery<OutstandingData>({
    queryKey: ['report-po-outstanding', params],
    queryFn: async () => (await api.get('/reports/po-outstanding', { params })).data,
  });
  const rows = data?.rows ?? [];

  const handleExport = () => {
    exportToExcel(
      rows.map((r) => ({
        'No. PO': r.poNumber,
        'Tanggal PO': r.date,
        'Target Terima': r.expectedDeliveryDate ?? '',
        Pemasok: r.supplierName,
        Gudang: r.warehouseName ?? '',
        Item: r.itemName,
        Satuan: r.unit,
        'Qty Dipesan': r.ordered,
        'Qty Diterima': r.received,
        'Qty Sisa': r.remaining,
        'Harga Satuan Neto (Rp)': r.unitValue,
        'Nilai Sisa (Rp)': r.remainingValue,
        Terlambat: r.isOverdue ? `Ya (${r.daysOverdue} hari)` : 'Tidak',
      })),
      `PO-Outstanding-${new Date().toISOString().slice(0, 10)}`,
    );
  };

  const counts = (n: number | undefined) => formatNumber(n ?? 0);
  const rangeInvalid = !!startDate && !!endDate && startDate > endDate;

  return (
    <ReportPage
      title="PO Outstanding"
      description="Sisa pesanan pembelian yang belum diterima per item"
      period={startDate || endDate ? `Tanggal PO ${startDate ? formatDate(startDate) : 'awal'} s/d ${endDate ? formatDate(endDate) : 'akhir'}` : 'Semua tanggal PO'}
      actions={<ExportMenu onExcel={handleExport} disabled={isLoading || isError} />}
      filters={
        <ReportFilterSection>
          <div className="grid gap-1.5">
            <Label htmlFor="po-start">Tanggal PO dari</Label>
            <DateInput id="po-start" className="w-40 max-sm:min-w-36" value={startDate} onChange={setStartDate} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="po-end">Sampai tanggal</Label>
            <DateInput id="po-end" className="w-40 max-sm:min-w-36" value={endDate} onChange={setEndDate} />
          </div>
          {(startDate || endDate) && (
            <Button
              variant="ghost"
              className="max-sm:h-11"
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
            >
              Hapus tanggal
            </Button>
          )}
          <PartyFilter partyType="Supplier" value={partyId} onChange={setPartyId} />
          <div className="w-full sm:w-56">
            <WarehousePicker value={warehouseId} onChange={setWarehouseId} autoDefault={false} placeholder="Semua gudang" />
          </div>
          <label htmlFor={overdueId} className="inline-flex min-h-11 items-center gap-2 text-sm text-foreground">
            <input
              id={overdueId}
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
            />
            Hanya yang terlambat
          </label>
          {rangeInvalid && (
            <p role="alert" className="basis-full text-xs text-danger-text">
              Tanggal akhir sebelum tanggal mulai: hasil bisa kosong.
            </p>
          )}
        </ReportFilterSection>
      }
      summary={
        <ReportSummaryCards
          loading={isLoading}
          items={[
            { label: 'Nilai Sisa', value: data?.summary.remainingValue ?? 0, icon: Wallet, tone: 'neutral' },
            { label: 'PO Terbuka', value: data?.summary.poCount ?? 0, formatted: counts(data?.summary.poCount), icon: ClipboardList },
            { label: 'Baris Item', value: data?.summary.lineCount ?? 0, formatted: counts(data?.summary.lineCount), icon: Package },
            {
              label: 'PO Terlambat',
              value: data?.summary.overduePoCount ?? 0,
              formatted: counts(data?.summary.overduePoCount),
              icon: AlertTriangle,
              tone: (data?.summary.overduePoCount ?? 0) > 0 ? 'negative' : 'neutral',
            },
          ]}
        />
      }
    >
      <ReportState isLoading={isLoading} isError={isError} onRetry={() => refetch()}>
        <ReportDataTable
          caption="PO outstanding per item"
          columns={COLUMNS}
          rows={rows}
          emptyText="Tidak ada PO outstanding untuk filter ini."
          getRowKey={(r) => `${r.poId}-${r.itemId}`}
        />
      </ReportState>
    </ReportPage>
  );
}
