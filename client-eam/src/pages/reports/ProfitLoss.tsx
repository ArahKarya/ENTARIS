import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportToExcel } from '../../lib/exportExcel';
import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import { format, endOfMonth } from 'date-fns';
import { formatRupiah } from '../../lib/formatters';
import { ProfitLossPDF } from '../../lib/pdf/ReportPDF';
import { useCompanyPDF } from '../../lib/pdf/useCompanyPDF';
import { useCompanySettings } from '../../contexts/CompanySettingsContext';
import { ReportLayout, AccountTreeTable, ReportSummaryCards } from '../../components/reports';
import type { SummaryCard } from '../../components/reports';
import LedgerDetailDrawer from '../../components/reports/LedgerDetailDrawer';

const ProfitLoss: React.FC = () => {
  // Default ke satu bulan penuh (bukan month-to-date) supaya entri akhir-bulan
  // seperti penyusutan & jurnal penyesuaian (diposting tgl 30/31) langsung
  // muncul. Konsisten dgn CashFlow yang memakai endOfMonth.
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-01'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const company = useCompanyPDF();
  const companySettings = useCompanySettings();

  // Drill-down drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<{ id: string; name: string } | null>(null);

  const { data: report, isLoading, isError, refetch } = useQuery({
    queryKey: ['profit-loss', startDate, endDate],
    queryFn: async () => {
      const r = await api.get('/reports/profit-loss', { params: { startDate, endDate } });
      return r.data;
    },
  });

  const handleExport = () => {
    const flat = [
      ...(report?.revenue?.flatMap((r: any) => [{ Seksi: 'Pendapatan', 'Nama Akun': r.name, 'Saldo (Rp)': r.balance }]) || []),
      ...(report?.expense?.flatMap((e: any) => [{ Seksi: 'Beban', 'Nama Akun': e.name, 'Saldo (Rp)': e.balance }]) || []),
      { Seksi: '---', 'Nama Akun': 'LABA BERSIH', 'Saldo (Rp)': report?.netProfit || 0 },
    ];
    exportToExcel(flat, `Laba-Rugi-${startDate}-sd-${endDate}`);
  };

  const handleAccountClick = (accountId: string, accountName: string) => {
    setSelectedAccount({ id: accountId, name: accountName });
    setDrawerOpen(true);
  };

  const summaryCards: SummaryCard[] = [
    { label: 'Total Pendapatan', value: report?.totalRevenue || 0, icon: TrendingUp, color: 'text-green-600', bgColor: 'bg-green-50' },
    { label: 'Total Beban', value: report?.totalExpense || 0, icon: TrendingDown, color: 'text-red-600', bgColor: 'bg-red-50' },
    {
      label: 'Laba Bersih',
      value: report?.netProfit || 0,
      icon: BarChart3,
      color: (report?.netProfit || 0) >= 0 ? 'text-blue-600' : 'text-red-600',
      bgColor: 'bg-blue-50',
    },
  ];

  return (
    <>
      <ReportLayout
        title="Laporan Laba Rugi"
        subtitle={`Performa finansial ${companySettings?.companyName || 'perusahaan'}`}
        dateFilter={{ mode: 'range', startDate, endDate, onStartDateChange: setStartDate, onEndDateChange: setEndDate }}
        pdfDocument={
          <ProfitLossPDF
            company={company}
            period={`${startDate} s/d ${endDate}`}
            revenue={report?.revenue ?? []}
            expense={report?.expense ?? []}
            totalRevenue={report?.totalRevenue ?? 0}
            totalExpense={report?.totalExpense ?? 0}
            netProfit={report?.netProfit ?? 0}
          />
        }
        pdfFileName={`Laba-Rugi-${startDate}-sd-${endDate}.pdf`}
        onExportExcel={handleExport}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        extraControls={<ReportSummaryCards cards={summaryCards} />}
      >
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Revenue */}
          <div className="section-header">I. Pendapatan</div>
          {report?.revenue?.length > 0 ? (
            <AccountTreeTable data={report.revenue} onAccountClick={handleAccountClick} />
          ) : (
            <div className="py-6 text-center text-gray-400 text-sm border-b border-gray-50">Tidak ada data pendapatan</div>
          )}
          <div className="flex justify-between items-center px-4 py-3 bg-green-50/60 border-b border-gray-100">
            <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Total Pendapatan</span>
            <span className="text-sm font-semibold text-green-700 tabular-nums whitespace-nowrap pr-6">{formatRupiah(report?.totalRevenue || 0)}</span>
          </div>

          {/* Expenses */}
          <div className="section-header mt-2">II. Beban-Beban</div>
          {report?.expense?.length > 0 ? (
            <AccountTreeTable data={report.expense} onAccountClick={handleAccountClick} />
          ) : (
            <div className="py-6 text-center text-gray-400 text-sm border-b border-gray-50">Tidak ada data beban</div>
          )}
          <div className="flex justify-between items-center px-4 py-3 bg-red-50/60 border-b border-gray-100">
            <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">Total Beban</span>
            <span className="text-sm font-semibold text-red-700 tabular-nums whitespace-nowrap pr-6">{formatRupiah(Math.abs(report?.totalExpense || 0))}</span>
          </div>

          {/* Net Profit */}
          <div className={`flex justify-between items-center px-4 py-4 ${(report?.netProfit || 0) >= 0 ? 'bg-blue-600' : 'bg-red-600'}`}>
            <span className="text-sm font-semibold text-white uppercase tracking-wide">Laba (Rugi) Bersih</span>
            <span className="text-lg font-bold text-white tabular-nums whitespace-nowrap pr-6">{formatRupiah(report?.netProfit || 0)}</span>
          </div>
        </div>
      </ReportLayout>

      <LedgerDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        accountId={selectedAccount?.id || null}
        accountName={selectedAccount?.name || ''}
        startDate={startDate}
        endDate={endDate}
      />
    </>
  );
};

export default ProfitLoss;
