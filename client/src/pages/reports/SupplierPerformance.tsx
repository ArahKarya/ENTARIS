/**
 * Laporan Kinerja Pemasok — per supplier for POs dated in the period:
 * PO count, on-time delivery rate, average lead time (PO → first STT),
 * fill rate (received / ordered) and PI-vs-PO price variance.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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

const pct = (v: number | null) => (v == null ? '—' : `${formatNumber(v, { maxDecimals: 2 })}%`);
const signedPct = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${formatNumber(v, { maxDecimals: 2 })}%`);

/** >= 90 good, >= 70 watch, else poor. The label text states the rate, so colour is reinforcement only. */
const rateClass = (v: number | null) =>
  v == null ? 'text-muted-foreground' : v >= 90 ? 'text-success-text' : v >= 70 ? 'text-warning-text' : 'text-danger-text';

const columns = (t: TFunction<'reports'>): DataColumn<PerformanceRow>[] => [
  { key: 'supplier', header: t('dailyReport.cols.supplier'), rowHeader: true, render: (r) => r.supplierName },
  { key: 'po', header: t('supplierPerformance.cols.poCount'), numeric: true, render: (r) => formatNumber(r.poCount) },
  {
    key: 'onTime',
    header: t('supplierPerformance.cols.onTime'),
    numeric: true,
    className: (r) => cn('font-medium', rateClass(r.onTimeRate)),
    render: (r) => (
      <>
        {pct(r.onTimeRate)}
        {r.evaluatedCount > 0 && (
          <span className="block text-xs font-normal text-muted-foreground">{t('supplierPerformance.ofPo', { count: r.evaluatedCount, formatted: formatNumber(r.evaluatedCount) })}</span>
        )}
      </>
    ),
  },
  {
    key: 'lead',
    header: t('supplierPerformance.cols.leadTime'),
    numeric: true,
    render: (r) => (r.avgLeadTimeDays == null ? '—' : t('supplierPerformance.days', { value: formatNumber(r.avgLeadTimeDays, { maxDecimals: 1 }) })),
  },
  {
    key: 'fill',
    header: t('supplierPerformance.cols.fillRate'),
    numeric: true,
    className: (r) => cn('font-medium', rateClass(r.fillRate)),
    render: (r) => pct(r.fillRate),
  },
  {
    key: 'variance',
    header: t('supplierPerformance.cols.priceVariance'),
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
  const { t } = useTranslation('reports');
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
        [t('dailyReport.cols.supplier')]: r.supplierName,
        [t('supplierPerformance.cols.poCount')]: r.poCount,
        [t('supplierPerformance.excel.evaluated')]: r.evaluatedCount,
        [t('supplierPerformance.excel.onTime')]: r.onTimeRate ?? '',
        [t('supplierPerformance.excel.firstOnTime')]: r.firstOnTimeRate ?? '',
        [t('supplierPerformance.excel.leadTime')]: r.avgLeadTimeDays ?? '',
        [t('supplierPerformance.excel.fillRate')]: r.fillRate ?? '',
        [t('supplierPerformance.excel.variancePct')]: r.priceVariancePct ?? '',
        [t('supplierPerformance.excel.varianceRp')]: r.priceVarianceAmount,
      })),
      `Kinerja-Supplier-${startDate || 'awal'}-${endDate || 'akhir'}`,
    );
  };

  return (
    <ReportPage
      title={t('supplierPerformance.title')}
      description={t('supplierPerformance.description')}
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
              {t('supplierPerformance.notice')}
            </p>
          </ReportNotice>
        </div>
      }
    >
      <ReportState isLoading={isLoading} isError={isError} isEmpty={!!data && rows.length === 0} onRetry={() => refetch()}>
        <ReportDataTable
          caption={t('supplierPerformance.caption', { period: periodLabel({ startDate, endDate }) })}
          columns={columns(t)}
          rows={rows}
          getRowKey={(r) => r.supplierId ?? 'general'}
        />
      </ReportState>
    </ReportPage>
  );
}
