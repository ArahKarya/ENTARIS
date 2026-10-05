import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, Wallet } from 'lucide-react';
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
      title="Jadwal Utang"
      description="Daftar utang berdasarkan jatuh tempo, status, dan prioritas pembayaran."
      partyHeader="Supplier"
      caption="Jadwal utang per invoice pembelian"
      emptyText="Tidak ada utang outstanding."
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      invoices={(data?.invoices ?? []).map((inv) => ({ ...inv, partyName: inv.supplierName }))}
      summary={[
        { label: 'Total Utang', value: summary?.totalOutstanding ?? 0, icon: Wallet, tone: 'neutral', hint: `${summary?.totalInvoices ?? 0} invoice` },
        { label: 'Jatuh Tempo', value: summary?.overdueAmount ?? 0, icon: AlertTriangle, tone: (summary?.overdueAmount ?? 0) > 0 ? 'negative' : 'neutral' },
        { label: 'Segera (7 hari)', value: summary?.dueSoonAmount ?? 0, icon: Clock, tone: 'neutral' },
      ]}
    />
  );
}
