import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { ScheduleReport, type ScheduleStatus } from '@/components/reports/ScheduleReport';

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  date: string;
  dueDate: string | null;
  grandTotal: number;
  outstanding: number;
  daysUntilDue: number | null;
  status: ScheduleStatus;
}

interface ScheduleData {
  invoices: Invoice[];
  summary: { totalOutstanding: number; overdueAmount: number; totalInvoices: number };
}

export default function ReceivableSchedule() {
  const { t } = useTranslation('reports');
  const { data, isLoading, isError, refetch } = useQuery<ScheduleData>({
    queryKey: ['receivable-schedule'],
    queryFn: async () => (await api.get('/reports/receivable-schedule')).data,
  });

  const summary = data?.summary;

  return (
    <ScheduleReport
      title={t('receivableSchedule.title')}
      description={t('receivableSchedule.description')}
      partyHeader={t('receivableSchedule.partyHeader')}
      caption={t('receivableSchedule.caption')}
      emptyText={t('receivableSchedule.empty')}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      invoices={(data?.invoices ?? []).map((inv) => ({ ...inv, partyName: inv.customerName }))}
      summary={[
        { label: t('receivableSchedule.summary.total'), value: summary?.totalOutstanding ?? 0, icon: Wallet, tone: 'neutral', hint: t('reportsShared.invoiceCount', { count: summary?.totalInvoices ?? 0 }) },
        { label: t('scheduleReport.status.overdue'), value: summary?.overdueAmount ?? 0, icon: AlertTriangle, tone: (summary?.overdueAmount ?? 0) > 0 ? 'negative' : 'neutral' },
        { label: t('scheduleReport.status.on_track'), value: (summary?.totalOutstanding ?? 0) - (summary?.overdueAmount ?? 0), icon: CheckCircle2, tone: 'positive' },
      ]}
    />
  );
}
