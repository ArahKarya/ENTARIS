import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, Receipt, Scale } from 'lucide-react';
import { format } from 'date-fns';
import api from '@/lib/api';
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

const monthLabel = (m: string) => {
  const [year, month] = m.split('-');
  return `${MONTHS[parseInt(month, 10) - 1]} ${year}`;
};

const COLUMNS = [
  { key: 'ppnKeluaran', label: 'PPN Keluaran' },
  { key: 'ppnMasukan', label: 'PPN Masukan' },
  { key: 'net', label: 'Selisih PPN' },
  { key: 'pph', label: 'PPh' },
];

const EMPTY_TOTALS = { ppnKeluaran: 0, ppnMasukan: 0, pph: 0, net: 0 };

const TaxReport: React.FC = () => {
  // Default = tahun berjalan sampai hari ini (sama seperti sebelumnya).
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
    exportToExcel(
      [
        ...report.months.map((m) => ({
          Bulan: monthLabel(m.month),
          'PPN Keluaran (Rp)': m.ppnKeluaran,
          'PPN Masukan (Rp)': m.ppnMasukan,
          'Selisih PPN (Rp)': m.net,
          'PPh (Rp)': m.pph,
        })),
        {
          Bulan: 'TOTAL',
          'PPN Keluaran (Rp)': totals.ppnKeluaran,
          'PPN Masukan (Rp)': totals.ppnMasukan,
          'Selisih PPN (Rp)': totals.net,
          'PPh (Rp)': totals.pph,
        },
      ],
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
      title="Laporan Pajak"
      description="Ringkasan PPN dan PPh berdasarkan transaksi invoice"
      period={period}
      actions={<ExportMenu disabled={isLoading || isError} onExcel={handleExport} />}
      filters={<ReportFilters mode="range" value={{ startDate, endDate }} onChange={setRange} />}
      summary={
        <ReportSummaryCards
          loading={isLoading}
          items={[
            { label: 'PPN Keluaran', value: totals.ppnKeluaran, icon: ArrowUpCircle, tone: 'neutral' },
            { label: 'PPN Masukan', value: totals.ppnMasukan, icon: ArrowDownCircle, tone: 'neutral' },
            { label: 'Total PPh', value: totals.pph, icon: Receipt, tone: 'neutral' },
            { label: 'PPN Kurang/Lebih Bayar', value: totals.net, icon: Scale, tone: 'neutral' },
          ]}
        />
      }
    >
      <ReportState isLoading={isLoading} isError={isError} isEmpty={months.length === 0} onRetry={() => refetch()}>
        <ReportTable
          caption={`Laporan pajak per bulan, ${period}`}
          columns={COLUMNS}
          labelHeader="Bulan"
          zero="dash"
          rows={rows}
          footer={[{ key: 'total', kind: 'total', label: 'Total', values: [totals.ppnKeluaran, totals.ppnMasukan, totals.net, totals.pph] }]}
        />
      </ReportState>
    </ReportPage>
  );
};

export default TaxReport;
