import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Wallet } from 'lucide-react';
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
  const { data, isLoading, isError, refetch } = useQuery<ScheduleData>({
    queryKey: ['receivable-schedule'],
    queryFn: async () => (await api.get('/reports/receivable-schedule')).data,
  });

  const summary = data?.summary;

  return (
    <ScheduleReport
      title="Jadwal Piutang"
      description="Daftar piutang berdasarkan jatuh tempo dan status penagihan."
      partyHeader="Pelanggan"
      caption="Jadwal piutang per invoice penjualan"
      emptyText="Tidak ada piutang outstanding."
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      invoices={(data?.invoices ?? []).map((inv) => ({ ...inv, partyName: inv.customerName }))}
      summary={[
        { label: 'Total Piutang', value: summary?.totalOutstanding ?? 0, icon: Wallet, tone: 'neutral', hint: `${summary?.totalInvoices ?? 0} invoice` },
        { label: 'Jatuh Tempo', value: summary?.overdueAmount ?? 0, icon: AlertTriangle, tone: (summary?.overdueAmount ?? 0) > 0 ? 'negative' : 'neutral' },
        { label: 'On Track', value: (summary?.totalOutstanding ?? 0) - (summary?.overdueAmount ?? 0), icon: CheckCircle2, tone: 'positive' },
      ]}
    />
  );
}
