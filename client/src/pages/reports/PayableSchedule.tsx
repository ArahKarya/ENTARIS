import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { ScheduleReport, type ScheduleStatus } from '@/components/reports/ScheduleReport';

interface Invoice {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  date: string;
  dueDate: string | null;
  grandTotal: number;
  outstanding: number;
  daysUntilDue: number | null;
  status: ScheduleStatus;
}

interface ScheduleData {
  invoices: Invoice[];
  summary: { totalOutstanding: number; overdueAmount: number; dueSoonAmount: number; totalInvoices: number };
}

export default function PayableSchedule() {
  const { t } = useTranslation('reports');
  const { data, isLoading, isError, refetch } = useQuery<ScheduleData>({
    queryKey: ['payable-schedule'],
    queryFn: async () => {
      const res = await api.get('/reports/payable-schedule');
      return res.data;
    },
  });

  const summary = data?.summary;

  return (
    <ScheduleReport
      title={t('payableSchedule.title')}
      description={t('payableSchedule.description')}
      partyHeader={t('payableSchedule.partyHeader')}
      caption={t('payableSchedule.caption')}
      emptyText={t('payableSchedule.empty')}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      invoices={(data?.invoices ?? []).map((inv) => ({ ...inv, partyName: inv.supplierName }))}
      summary={[
        { label: t('payableSchedule.summary.total'), value: summary?.totalOutstanding ?? 0, icon: Wallet, tone: 'neutral', hint: t('reportsShared.invoiceCount', { count: summary?.totalInvoices ?? 0 }) },
        { label: t('scheduleReport.status.overdue'), value: summary?.overdueAmount ?? 0, icon: AlertTriangle, tone: (summary?.overdueAmount ?? 0) > 0 ? 'negative' : 'neutral' },
        { label: t('payableSchedule.summary.dueSoon'), value: summary?.dueSoonAmount ?? 0, icon: Clock, tone: 'neutral' },
      ]}
    />
  );
}
