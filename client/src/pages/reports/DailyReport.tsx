import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { LOCALE, parseDate } from '@/lib/format';
import { DailyReportPDF } from '@/lib/pdf/DailyReportPDF';
import { useCompanyPDF } from '@/lib/pdf/useCompanyPDF';
import {
  ExportMenu,
  ReportFilters,
  ReportPage,
  ReportState,
  periodLabel,
  useReportAsOf,
} from '@/components/report-kit';
import { SalesSection, PurchasesSection, ProductionSection, StockSection } from './daily/trade-sections';
import { FinanceSection, ReceivablesSection, PayablesSection, DepositsSection } from './daily/finance-sections';
import type { DailyData } from './daily/types';

const DailyReport = () => {
  const { t } = useTranslation('reports');
  const { date, setDate } = useReportAsOf();
  const company = useCompanyPDF();

  // Landscape A4 for the printed daily report.
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'daily-report-print';
    style.textContent = '@page { size: A4 landscape; margin: 1cm; }';
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);

  const { data, isLoading, isError, refetch } = useQuery<DailyData>({
    queryKey: ['daily-report', date],
    queryFn: async () => {
      const r = await api.get('/reports/daily', { params: { date } });
      return r.data;
    },
  });

  const parsed = parseDate(date);
  const formattedDate = parsed
    ? new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(parsed)
    : date;

  return (
    <ReportPage
      title={t('dailyReport.title')}
      description={t('dailyReport.description', { date: formattedDate })}
      period={periodLabel(date)}
      actions={
        <ExportMenu
          disabled={isLoading || isError || !data}
          pdf={{
            fileName: `Laporan-Harian-${date}.pdf`,
            render: () => <DailyReportPDF company={company} date={date} data={data} />,
          }}
        />
      }
      filters={<ReportFilters mode="asOf" value={date} onChange={setDate} />}
    >
      <ReportState isLoading={isLoading} isError={isError} onRetry={() => refetch()} rows={6}>
        {data && (
          <div className="space-y-5 print-landscape">
            <SalesSection data={data.sales} />
            <PurchasesSection data={data.purchases} />
            <ProductionSection data={data.production} />
            {data.stock && <StockSection data={data.stock} />}
            <FinanceSection data={data.finance} />
            <ReceivablesSection data={data.receivables} />
            <PayablesSection data={data.payables} />
            <DepositsSection data={data.vendorDeposits} />
          </div>
        )}
      </ReportState>
    </ReportPage>
  );
};

export default DailyReport;
