import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowDownCircle, ArrowUpCircle, Receipt, Scale } from 'lucide-react';
import { format } from 'date-fns';
import api from '@/lib/api';
import { LOCALE } from '@/lib/format';
import { exportToExcel } from '@/lib/exportExcel';
import {
  ExportMenu,
  ReportFilters,
  ReportPage,
  ReportState,
  ReportSummaryCards,
  ReportTable,
  periodLabel,
  useReportRange,
  type ReportRow,
} from '@/components/report-kit';

interface TaxMonth {
  month: string;
  ppnKeluaran: number;
  ppnMasukan: number;
  pph: number;
  net: number;
}

interface TaxReportData {
  months: TaxMonth[];
  totals: {
    ppnKeluaran: number;
    ppnMasukan: number;
    pph: number;
    net: number;
  };
}

/** "2026-10" -> "Okt 2026" / "Oct 2026" (follows the UI language). */
const monthLabel = (m: string) => {
  const [year, month] = m.split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALE, { month: 'short', year: 'numeric' }).format(new Date(year, month - 1, 1));
};

const EMPTY_TOTALS = { ppnKeluaran: 0, ppnMasukan: 0, pph: 0, net: 0 };

const TaxReport: React.FC = () => {
  const { t } = useTranslation('reports');
  const columns = [
    { key: 'ppnKeluaran', label: t('taxReport.outputVat') },
    { key: 'ppnMasukan', label: t('taxReport.inputVat') },
    { key: 'net', label: t('taxReport.vatDiff') },
    { key: 'pph', label: t('taxReport.pph') },
  ];
  // Default: current year to date.
  const today = new Date();
  const { startDate, endDate, setRange } = useReportRange({
    startDate: format(today, 'yyyy-01-01'),
    endDate: format(today, 'yyyy-MM-dd'),
  });

  const { data: report, isLoading, isError, refetch } = useQuery<TaxReportData>({
    queryKey: ['tax-report', startDate, endDate],
    queryFn: async () => {
      const r = await api.get('/tax/report', { params: { startDate, endDate } });
      return r.data;
    },
  });

  const totals = report?.totals || EMPTY_TOTALS;
  const months = report?.months ?? [];

  const handleExport = () => {
    if (!report?.months) return;
    const row = (label: string, v: Omit<TaxMonth, 'month'>) => ({
      [t('taxReport.month')]: label,
      [t('taxReport.excel.outputVat')]: v.ppnKeluaran,
      [t('taxReport.excel.inputVat')]: v.ppnMasukan,
      [t('taxReport.excel.vatDiff')]: v.net,
      [t('taxReport.excel.pph')]: v.pph,
    });
    exportToExcel(
      [...report.months.map((m) => row(monthLabel(m.month), m)), row(t('reportsShared.totalUpper'), totals)],
      `Laporan-Pajak-${startDate}-sd-${endDate}`,
    );
  };

  const rows: ReportRow[] = months.map((m) => ({
    key: m.month,
    label: monthLabel(m.month),
    values: [m.ppnKeluaran, m.ppnMasukan, m.net, m.pph],
  }));

  const period = periodLabel({ startDate, endDate });

  return (
    <ReportPage
      title={t('taxReport.title')}
      description={t('taxReport.description')}
      period={period}
      actions={<ExportMenu disabled={isLoading || isError} onExcel={handleExport} />}
      filters={<ReportFilters mode="range" value={{ startDate, endDate }} onChange={setRange} />}
      summary={
        <ReportSummaryCards
          loading={isLoading}
          items={[
            { label: t('taxReport.outputVat'), value: totals.ppnKeluaran, icon: ArrowUpCircle, tone: 'neutral' },
            { label: t('taxReport.inputVat'), value: totals.ppnMasukan, icon: ArrowDownCircle, tone: 'neutral' },
            { label: t('taxReport.totalPph'), value: totals.pph, icon: Receipt, tone: 'neutral' },
            { label: t('taxReport.vatPayable'), value: totals.net, icon: Scale, tone: 'neutral' },
          ]}
        />
      }
    >
      <ReportState isLoading={isLoading} isError={isError} isEmpty={months.length === 0} onRetry={() => refetch()}>
        <ReportTable
          caption={t('taxReport.caption', { period })}
          columns={columns}
          labelHeader={t('taxReport.month')}
          zero="dash"
          rows={rows}
          footer={[{ key: 'total', kind: 'total', label: t('reportsShared.total'), values: [totals.ppnKeluaran, totals.ppnMasukan, totals.net, totals.pph] }]}
        />
      </ReportState>
    </ReportPage>
  );
};

export default TaxReport;
