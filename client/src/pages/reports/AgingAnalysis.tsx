import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CalendarClock, CheckCircle2, Wallet } from 'lucide-react';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { AgingPDF } from '@/lib/pdf/ReportPDF';
import type { AgingRow } from '@/lib/pdf/ReportPDF';
import { useCompanyPDF } from '@/lib/pdf/useCompanyPDF';
import {
  ExportMenu,
  ReportNotice,
  ReportPage,
  ReportState,
  ReportSummaryCards,
  ReportTable,
  type ReportRow,
} from '@/components/report-kit';

interface AgingProps {
  type: 'Customer' | 'Supplier';
}

interface AgingApiRow {
  name: string;
  current: number;
  1: number;
  31: number;
  61: number;
  91: number;
  total: number;
}

const AgingAnalysis: React.FC<AgingProps> = ({ type }) => {
  const { t } = useTranslation('reports');
  const columns = [
    { key: 'current', label: t('agingAnalysis.columns.current') },
    { key: 'd1', label: t('agingAnalysis.columns.d1') },
    { key: 'd31', label: t('agingAnalysis.columns.d31') },
    { key: 'd61', label: t('agingAnalysis.columns.d61') },
    { key: 'd91', label: t('agingAnalysis.columns.d91') },
    { key: 'total', label: t('agingAnalysis.columns.total') },
  ];
  // Judul = label registry rute (Umur Piutang / Umur Utang); nama file ekspor tetap.
  const isCustomer = type === 'Customer';
  const title = isCustomer ? t('agingAnalysis.titleAr') : t('agingAnalysis.titleAp');
  const exportName = isCustomer ? 'Aging Piutang' : 'Aging Hutang';
  const subtitle = isCustomer ? t('agingAnalysis.descriptionAr') : t('agingAnalysis.descriptionAp');
  const company = useCompanyPDF();

  const { data: agingData, isLoading, isError, refetch } = useQuery({
    queryKey: ['aging-report', type],
    queryFn: async () => {
      const response = await api.get('/reports/aging', { params: { type } });
      return response.data;
    },
  });

  const rows: AgingApiRow[] = Array.isArray(agingData) ? agingData : [];

  const totals = rows.reduce(
    (acc, curr) => ({
      current: acc.current + curr.current,
      1: acc[1] + curr[1],
      31: acc[31] + curr[31],
      61: acc[61] + curr[61],
      91: acc[91] + curr[91],
      total: acc.total + curr.total,
    }),
    { current: 0, 1: 0, 31: 0, 61: 0, 91: 0, total: 0 },
  );

  const stamp = new Date().toISOString().slice(0, 10);

  const handleExport = () => {
    const h = {
      name: t('agingAnalysis.excel.name'),
      current: t('agingAnalysis.excel.current'),
      d1: t('agingAnalysis.excel.d1'),
      d31: t('agingAnalysis.excel.d31'),
      d61: t('agingAnalysis.excel.d61'),
      d91: t('agingAnalysis.excel.d91'),
      total: t('agingAnalysis.excel.total'),
    };
    const toRow = (name: string, v: Omit<AgingApiRow, 'name'>) => ({
      [h.name]: name,
      [h.current]: v.current,
      [h.d1]: v[1],
      [h.d31]: v[31],
      [h.d61]: v[61],
      [h.d91]: v[91],
      [h.total]: v.total,
    });
    const excelRows = [...rows.map((r) => toRow(r.name, r)), toRow(t('reportsShared.totalUpper'), totals)];
    exportToExcel(excelRows, `${exportName}-${stamp}`);
  };

  const pdfRows: AgingRow[] = rows.map((r) => ({
    name: r.name,
    current: r.current,
    d1_30: r[1],
    d31_60: r[31],
    d61_90: r[61],
    d91_plus: r[91],
    total: r.total,
  }));

  const pdfTotals: AgingRow = {
    name: 'TOTAL',
    current: totals.current,
    d1_30: totals[1],
    d31_60: totals[31],
    d61_90: totals[61],
    d91_plus: totals[91],
    total: totals.total,
  };

  const tableRows: ReportRow[] =
    rows.length === 0
      ? [{ key: 'empty', kind: 'note', label: t('agingAnalysis.empty') }]
      : rows.map((r, idx) => ({
          key: `${idx}-${r.name}`,
          label: r.name,
          values: [r.current, r[1], r[31], r[61], r[91], r.total],
        }));

  return (
    <ReportPage
      title={title}
      description={subtitle}
      period={t('scheduleReport.currentPosition')}
      actions={
        <ExportMenu
          disabled={isLoading || isError}
          onExcel={handleExport}
          pdf={{
            fileName: `${exportName}-${stamp}.pdf`,
            render: () => <AgingPDF company={company} type={type} rows={pdfRows} totals={pdfTotals} />,
          }}
        />
      }
      filters={
        totals[91] > 0 ? (
          <ReportNotice tone="warning">
            {t('agingAnalysis.criticalNotice')}
          </ReportNotice>
        ) : undefined
      }
      summary={
        <ReportSummaryCards
          loading={isLoading}
          items={[
            { label: t('agingAnalysis.summary.total'), value: totals.total, icon: Wallet, tone: 'neutral' },
            { label: t('agingAnalysis.summary.current'), value: totals.current, icon: CheckCircle2, tone: 'positive' },
            { label: t('agingAnalysis.summary.overdue'), value: (totals[31] || 0) + (totals[61] || 0), icon: CalendarClock, tone: 'neutral' },
            { label: t('agingAnalysis.summary.critical'), value: totals[91] || 0, icon: AlertTriangle, tone: totals[91] > 0 ? 'negative' : 'neutral' },
          ]}
        />
      }
    >
      <ReportState isLoading={isLoading} isError={isError} onRetry={() => refetch()}>
        <ReportTable
          caption={isCustomer ? t('agingAnalysis.captionAr', { title }) : t('agingAnalysis.captionAp', { title })}
          columns={columns}
          labelHeader={t('agingAnalysis.excel.name')}
          zero="dash"
          rows={tableRows}
          footer={[
            {
              key: 'total',
              kind: 'total',
              label: t('agingAnalysis.totalRow'),
              values: [totals.current, totals[1], totals[31], totals[61], totals[91], totals.total],
            },
          ]}
        />
      </ReportState>
    </ReportPage>
  );
};

export default AgingAnalysis;
