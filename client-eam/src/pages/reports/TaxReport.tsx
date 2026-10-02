import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportToExcel } from '../../lib/exportExcel';
import { formatRupiah } from '../../lib/formatters';
import { cn } from '../../lib/utils';
import { ReportLayout, ReportSummaryCards } from '../../components/reports';
import type { SummaryCard } from '../../components/reports';
import { format } from 'date-fns';
import { ArrowUpCircle, ArrowDownCircle, Scale, Receipt } from 'lucide-react';

interface TaxMonth {
  month: string;
  ppnKeluaran: number;
  ppnMasukan: number;
  pph: number;
  net: number;
}

interface TaxReport {
  months: TaxMonth[];
  totals: {
    ppnKeluaran: number;
    ppnMasukan: number;
    pph: number;
    net: number;
  };
}

const monthLabel = (m: string) => {
  const [year, month] = m.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${months[parseInt(month, 10) - 1]} ${year}`;
};

const TaxReport: React.FC = () => {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-01-01'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: report, isLoading, isError, refetch } = useQuery<TaxReport>({
    queryKey: ['tax-report', startDate, endDate],
    queryFn: async () => {
      const r = await api.get('/tax/report', { params: { startDate, endDate } });
      return r.data;
    },
  });

  const totals = report?.totals || { ppnKeluaran: 0, ppnMasukan: 0, pph: 0, net: 0 };

  const summaryCards: SummaryCard[] = [
    {
      label: 'PPN Keluaran',
      value: totals.ppnKeluaran,
      icon: ArrowUpCircle,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'PPN Masukan',
      value: totals.ppnMasukan,
      icon: ArrowDownCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: 'Total PPh',
      value: totals.pph,
      icon: Receipt,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ];

  const accentCard: SummaryCard = {
    label: 'PPN Kurang/Lebih Bayar',
    value: totals.net,
    icon: Scale,
    color: 'text-white',
    bgColor: 'bg-blue-600',
  };

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
      `Laporan-Pajak-${startDate}-sd-${endDate}`
    );
  };

  return (
    <ReportLayout
      title="Laporan Pajak"
      subtitle="Ringkasan PPN dan PPh berdasarkan transaksi invoice"
      dateFilter={{
        mode: 'range',
        startDate,
        endDate,
        onStartDateChange: setStartDate,
        onEndDateChange: setEndDate,
      }}
      onExportExcel={handleExport}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      extraControls={
        <ReportSummaryCards cards={summaryCards} accentCard={accentCard} />
      }
    >
      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
      >
       <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Bulan</th>
              <th className="text-right">PPN Keluaran</th>
              <th className="text-right">PPN Masukan</th>
              <th className="text-right">Selisih PPN</th>
              <th className="text-right pr-4">PPh</th>
            </tr>
          </thead>
          <tbody>
            {(!report?.months || report.months.length === 0) ? (
              <tr>
                <td colSpan={5} className="py-16 text-center" style={{ color: 'var(--color-text-muted)' }}>
                  Tidak ada data pajak untuk periode ini
                </td>
              </tr>
            ) : (
              report.months.map((m) => (
                <tr key={m.month}>
                  <td className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {monthLabel(m.month)}
                  </td>
                  <td className="text-right tabular-nums text-blue-600">
                    {m.ppnKeluaran > 0 ? formatRupiah(m.ppnKeluaran) : '—'}
                  </td>
                  <td className="text-right tabular-nums text-green-600">
                    {m.ppnMasukan > 0 ? formatRupiah(m.ppnMasukan) : '—'}
                  </td>
                  <td className={cn('text-right tabular-nums', m.net >= 0 ? 'text-orange-600' : 'text-green-600')}>
                    {formatRupiah(m.net)}
                  </td>
                  <td className="text-right tabular-nums pr-4" style={{ color: 'var(--color-text-secondary)' }}>
                    {m.pph > 0 ? formatRupiah(m.pph) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {report?.months && report.months.length > 0 && (
            <tfoot>
              <tr className="bg-blue-600 text-white">
                <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Total</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatRupiah(totals.ppnKeluaran)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatRupiah(totals.ppnMasukan)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatRupiah(totals.net)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums pr-4">{formatRupiah(totals.pph)}</td>
              </tr>
            </tfoot>
          )}
        </table>
       </div>
      </div>
    </ReportLayout>
  );
};

export default TaxReport;
