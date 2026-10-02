import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportToExcel } from '../../lib/exportExcel';
import { TrendingUp, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatRupiah } from '../../lib/formatters';
import { AgingPDF } from '../../lib/pdf/ReportPDF';
import type { AgingRow } from '../../lib/pdf/ReportPDF';
import { useCompanyPDF } from '../../lib/pdf/useCompanyPDF';
import { ReportLayout, ReportSummaryCards } from '../../components/reports';
import type { SummaryCard } from '../../components/reports';

interface AgingProps {
  type: 'Customer' | 'Supplier';
}

const AgingAnalysis: React.FC<AgingProps> = ({ type }) => {
  const title = type === 'Customer' ? 'Aging Piutang' : 'Aging Hutang';
  const subtitle = type === 'Customer' ? 'Analisis saldo tak tertagih per pelanggan' : 'Analisis kewajiban pembayaran per vendor';
  const company = useCompanyPDF();

  const { data: agingData, isLoading, isError, refetch } = useQuery({
    queryKey: ['aging-report', type],
    queryFn: async () => {
      const response = await api.get('/reports/aging', { params: { type } });
      return response.data;
    },
  });

  const rows = Array.isArray(agingData) ? agingData : [];

  const totals = rows.reduce(
    (acc: any, curr: any) => ({
      current: acc.current + curr.current,
      1: acc[1] + curr[1],
      31: acc[31] + curr[31],
      61: acc[61] + curr[61],
      91: acc[91] + curr[91],
      total: acc.total + curr.total,
    }),
    { current: 0, 1: 0, 31: 0, 61: 0, 91: 0, total: 0 }
  );

  const handleExport = () => {
    const excelRows = rows.map((r: any) => ({
      'Nama Mitra': r.name,
      'Belum Jatuh Tempo (Rp)': r.current,
      '1-30 Hari (Rp)': r[1],
      '31-60 Hari (Rp)': r[31],
      '61-90 Hari (Rp)': r[61],
      '>90 Hari (Rp)': r[91],
      'Total (Rp)': r.total,
    }));
    excelRows.push({
      'Nama Mitra': 'TOTAL',
      'Belum Jatuh Tempo (Rp)': totals.current,
      '1-30 Hari (Rp)': totals[1],
      '31-60 Hari (Rp)': totals[31],
      '61-90 Hari (Rp)': totals[61],
      '>90 Hari (Rp)': totals[91],
      'Total (Rp)': totals.total,
    });
    exportToExcel(excelRows, `${title}-${new Date().toISOString().slice(0, 10)}`);
  };

  const pdfRows: AgingRow[] = rows.map((r: any) => ({
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

  const summaryCards: SummaryCard[] = [
    { label: 'Total Outstanding', value: totals.total, icon: TrendingUp, color: 'text-gray-900', bgColor: 'bg-gray-100' },
    { label: 'Belum Jatuh Tempo', value: totals.current, icon: TrendingUp, color: 'text-green-600', bgColor: 'bg-green-50' },
    { label: 'Menunggak 31-90 Hari', value: (totals[31] || 0) + (totals[61] || 0), icon: AlertTriangle, color: 'text-amber-600', bgColor: 'bg-amber-50' },
    { label: 'Kritis (>90 Hari)', value: totals[91] || 0, icon: AlertTriangle, color: 'text-red-600', bgColor: 'bg-red-50' },
  ];

  return (
    <ReportLayout
      title={title}
      subtitle={subtitle}
      dateFilter={{ mode: 'none' }}
      pdfDocument={<AgingPDF company={company} type={type} rows={pdfRows} totals={pdfTotals} />}
      pdfFileName={`${title}-${new Date().toISOString().slice(0, 10)}.pdf`}
      onExportExcel={handleExport}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      extraControls={<ReportSummaryCards cards={summaryCards} />}
      alert={
        totals[91] > 0 ? (
          <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            <AlertTriangle size={16} className="text-red-600 shrink-0" />
            <span>Terdapat tagihan kritis yang menunggak lebih dari 90 hari. Mohon lakukan tindakan penagihan intensif.</span>
          </div>
        ) : undefined
      }
    >
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
       <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nama Mitra</th>
              <th className="text-right pr-4">Belum JT</th>
              <th className="text-right pr-4">1-30 Hari</th>
              <th className="text-right pr-4">31-60 Hari</th>
              <th className="text-right pr-4">61-90 Hari</th>
              <th className="text-right pr-4">{'>'}90 Hari</th>
              <th className="text-right pr-4">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-gray-400">
                  Tidak ada saldo outstanding saat ini.
                </td>
              </tr>
            ) : (
              rows.map((row: any) => (
                <tr key={row.name}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className={cn('w-1 h-5 rounded-full', row[91] > 0 ? 'bg-red-500' : row[31] > 0 || row[61] > 0 ? 'bg-amber-400' : 'bg-green-400')} />
                      <span className="font-medium text-gray-800">{row.name}</span>
                    </div>
                  </td>
                  <td className="text-right pr-4 tabular-nums text-gray-600">{formatRupiah(row.current)}</td>
                  <td className="text-right pr-4 tabular-nums text-gray-600">{formatRupiah(row[1])}</td>
                  <td className={cn('text-right pr-4 tabular-nums', row[31] > 0 ? 'text-amber-600 font-medium' : 'text-gray-400')}>
                    {row[31] > 0 ? formatRupiah(row[31]) : '—'}
                  </td>
                  <td className={cn('text-right pr-4 tabular-nums', row[61] > 0 ? 'text-orange-600 font-medium' : 'text-gray-400')}>
                    {row[61] > 0 ? formatRupiah(row[61]) : '—'}
                  </td>
                  <td className={cn('text-right pr-4 tabular-nums', row[91] > 0 ? 'text-red-600 font-semibold' : 'text-gray-400')}>
                    {row[91] > 0 ? formatRupiah(row[91]) : '—'}
                  </td>
                  <td className="text-right pr-4 tabular-nums font-semibold text-gray-900">{formatRupiah(row.total)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-blue-600 text-white">
              <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Total Kolektibilitas</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatRupiah(totals.current)}</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatRupiah(totals[1])}</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatRupiah(totals[31])}</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatRupiah(totals[61])}</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatRupiah(totals[91])}</td>
              <td className="px-4 py-3 text-right font-bold tabular-nums pr-4">{formatRupiah(totals.total)}</td>
            </tr>
          </tfoot>
        </table>
       </div>
      </div>
    </ReportLayout>
  );
};

export default AgingAnalysis;
