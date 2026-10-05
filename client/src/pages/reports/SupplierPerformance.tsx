/**
 * Laporan Kinerja Pemasok — per supplier for POs dated in the period:
 * PO count, on-time delivery rate, average lead time (PO → first STT),
 * fill rate (received / ordered) and PI-vs-PO price variance.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { formatNumber, formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PartyFilter } from '@/components/shared';
import {
  ExportMenu,
  ReportDataTable,
  ReportFilterSection,
  ReportFilters,
  ReportNotice,
  ReportPage,
  ReportState,
  periodLabel,
  toIso,
  useReportRange,
  type DataColumn,
} from '@/components/report-kit';

interface PerformanceRow {
  supplierId: string | null;
  supplierName: string;
  poCount: number;
  evaluatedCount: number;
  onTimeRate: number | null;
  firstOnTimeRate: number | null;
  avgLeadTimeDays: number | null;
  fillRate: number | null;
  priceVariancePct: number | null;
  priceVarianceAmount: number;
}

const pct = (v: number | null) => (v == null ? '-' : `${formatNumber(v, { maxDecimals: 2 })}%`);
const signedPct = (v: number | null) => (v == null ? '-' : `${v > 0 ? '+' : ''}${formatNumber(v, { maxDecimals: 2 })}%`);

/** >= 90 good, >= 70 watch, else poor. The label text states the rate, so colour is reinforcement only. */
const rateClass = (v: number | null) =>
  v == null ? 'text-muted-foreground' : v >= 90 ? 'text-success-text' : v >= 70 ? 'text-warning-text' : 'text-danger-text';

const COLUMNS: DataColumn<PerformanceRow>[] = [
  { key: 'supplier', header: 'Pemasok', rowHeader: true, render: (r) => r.supplierName },
  { key: 'po', header: 'Jumlah PO', numeric: true, render: (r) => formatNumber(r.poCount) },
  {
    key: 'onTime',
    header: 'Tepat Waktu',
    numeric: true,
    className: (r) => cn('font-medium', rateClass(r.onTimeRate)),
    render: (r) => (
      <>
        {pct(r.onTimeRate)}
        {r.evaluatedCount > 0 && (
          <span className="block text-xs font-normal text-muted-foreground">dari {formatNumber(r.evaluatedCount)} PO</span>
        )}
      </>
    ),
  },
  {
    key: 'lead',
    header: 'Lead Time',
    numeric: true,
    render: (r) => (r.avgLeadTimeDays == null ? '-' : `${formatNumber(r.avgLeadTimeDays, { maxDecimals: 1 })} hari`),
  },
  {
    key: 'fill',
    header: 'Fill Rate',
    numeric: true,
    className: (r) => cn('font-medium', rateClass(r.fillRate)),
    render: (r) => pct(r.fillRate),
  },
  {
    key: 'variance',
    header: 'Selisih Harga',
    numeric: true,
    render: (r) => (
      <>
        {signedPct(r.priceVariancePct)}
        {r.priceVarianceAmount !== 0 && (
          <span className="block text-xs text-muted-foreground">{formatRupiah(r.priceVarianceAmount, { negative: 'parens' })}</span>
        )}
      </>
    ),
  },
];

export default function SupplierPerformance() {
  const now = new Date();
  const { startDate, endDate, setRange } = useReportRange({ startDate: `${now.getFullYear()}-01-01`, endDate: toIso(now) });
  const [partyId, setPartyId] = useState('');

  const params = { startDate: startDate || undefined, endDate: endDate || undefined, partyId: partyId || undefined };
  const { data, isLoading, isError, refetch } = useQuery<{ rows: PerformanceRow[] }>({
    queryKey: ['report-supplier-performance', params],
    queryFn: async () => (await api.get('/reports/supplier-performance', { params })).data,
  });
  const rows = data?.rows ?? [];

  const handleExport = () => {
    exportToExcel(
      rows.map((r) => ({
        Pemasok: r.supplierName,
        'Jumlah PO': r.poCount,
        'PO Dinilai': r.evaluatedCount,
        'Tepat Waktu (%)': r.onTimeRate ?? '',
        'Kiriman Pertama Tepat Waktu (%)': r.firstOnTimeRate ?? '',
        'Rata-rata Lead Time (hari)': r.avgLeadTimeDays ?? '',
        'Fill Rate (%)': r.fillRate ?? '',
        'Selisih Harga Faktur vs PO (%)': r.priceVariancePct ?? '',
        'Selisih Harga (Rp)': r.priceVarianceAmount,
      })),
      `Kinerja-Pemasok-${startDate || 'awal'}-${endDate || 'akhir'}`,
    );
  };

  return (
    <ReportPage
      title="Kinerja Pemasok"
      description="Ketepatan kirim, lead time, fill rate, dan selisih harga per pemasok (berdasarkan tanggal PO)"
      period={periodLabel({ startDate, endDate })}
      actions={<ExportMenu onExcel={handleExport} disabled={isLoading || isError} />}
      filters={
        <div className="flex flex-col gap-3">
          <ReportFilters mode="range" value={{ startDate, endDate }} onChange={setRange} />
          <ReportFilterSection>
            <PartyFilter partyType="Supplier" value={partyId} onChange={setPartyId} />
          </ReportFilterSection>
          <ReportNotice tone="info">
            <p className="text-xs">
              Tepat waktu = STT terakhir pada/sebelum target terima (PO bertarget yang sudah ada STT). Lead time = tanggal PO
              sampai STT pertama. Fill rate = qty diterima dibagi qty dipesan. Selisih harga = harga faktur vs harga PO setelah diskon.
            </p>
          </ReportNotice>
        </div>
      }
    >
      <ReportState isLoading={isLoading} isError={isError} isEmpty={!!data && rows.length === 0} onRetry={() => refetch()}>
        <ReportDataTable
          caption={`Kinerja pemasok, ${periodLabel({ startDate, endDate })}`}
          columns={COLUMNS}
          rows={rows}
          getRowKey={(r) => r.supplierId ?? 'general'}
        />
      </ReportState>
    </ReportPage>
  );
}
