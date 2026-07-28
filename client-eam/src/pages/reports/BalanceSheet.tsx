import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportToExcel } from '../../lib/exportExcel';
import { AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { formatRupiah } from '../../lib/formatters';
import { BalanceSheetPDF } from '../../lib/pdf/ReportPDF';
import { useCompanyPDF } from '../../lib/pdf/useCompanyPDF';
import { ReportLayout, AccountTreeTable } from '../../components/reports';
import LedgerDetailDrawer from '../../components/reports/LedgerDetailDrawer';

const BalanceSheet: React.FC = () => {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const company = useCompanyPDF();

  // Drill-down drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<{ id: string; name: string } | null>(null);

  const { data: report, isLoading, isError, refetch } = useQuery({
    queryKey: ['balance-sheet', date],
    queryFn: async () => {
      const r = await api.get('/reports/balance-sheet', { params: { date } });
      return r.data;
    },
  });

  const handleExport = () => {
    const flatten = (accounts: any[], section: string): object[] =>
      accounts?.flatMap((a: any): object[] => [
        { Seksi: section, 'Nama Akun': a.name, 'No. Akun': a.accountNumber, 'Saldo (Rp)': a.balance },
        ...flatten(a.children || [], section),
      ]) || [];
    const data = [
      ...flatten(report?.assets, 'Aset'),
      ...flatten(report?.liabilities, 'Kewajiban'),
      ...flatten(report?.equity, 'Ekuitas'),
    ];
    exportToExcel(data, `Neraca-${date}`);
  };

  const handleAccountClick = (accountId: string, accountName: string) => {
    setSelectedAccount({ id: accountId, name: accountName });
    setDrawerOpen(true);
  };

  const isBalanced = !isLoading &&
    Math.abs((report?.totalAssets || 0) - ((report?.totalLiabilities || 0) + (report?.totalEquity || 0))) <= 1;

  return (
    <>
      <ReportLayout
        title="Neraca (Balance Sheet)"
        subtitle="Posisi keuangan aset, liabilitas, dan ekuitas"
        dateFilter={{ mode: 'single', date, onDateChange: setDate }}
        pdfDocument={
          <BalanceSheetPDF
            company={company}
            asOf={date}
            assets={report?.assets ?? []}
            liabilities={report?.liabilities ?? []}
            equity={report?.equity ?? []}
            totalAssets={report?.totalAssets ?? 0}
            totalLiabilities={report?.totalLiabilities ?? 0}
            totalEquity={report?.totalEquity ?? 0}
          />
        }
        pdfFileName={`Neraca-${date}.pdf`}
        onExportExcel={handleExport}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        alert={
          !isLoading && !isBalanced ? (
            <div className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              <AlertTriangle size={16} className="text-yellow-600 shrink-0" />
              <span>Terdapat selisih antara total Aktiva dan Pasiva. Periksa jurnal yang tidak seimbang.</span>
            </div>
          ) : undefined
        }
      >
        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* Assets */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="section-header flex justify-between">
              <span>Aset</span>
              <span className="font-semibold text-gray-700 tracking-normal normal-case whitespace-nowrap">{formatRupiah(report?.totalAssets || 0)}</span>
            </div>
            <div className="overflow-y-auto max-h-[500px]">
              {report?.assets?.map((a: any) => (
                <AccountTreeTable key={a.id} data={[a]} indentPx={20} valueColWidth="w-48" onAccountClick={handleAccountClick} />
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex justify-between bg-gray-50/60">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Total Aset</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">{formatRupiah(report?.totalAssets || 0)}</span>
            </div>
          </div>

          {/* Liabilities + Equity */}
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="section-header flex justify-between">
                <span>Kewajiban</span>
                <span className="font-semibold text-gray-700 tracking-normal normal-case whitespace-nowrap">{formatRupiah(report?.totalLiabilities || 0)}</span>
              </div>
              <div className="overflow-y-auto max-h-[240px]">
                {report?.liabilities?.map((a: any) => (
                  <AccountTreeTable key={a.id} data={[a]} indentPx={20} valueColWidth="w-48" onAccountClick={handleAccountClick} />
                ))}
              </div>
              <div className="px-4 py-3 border-t border-gray-100 flex justify-between bg-gray-50/60">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Total Kewajiban</span>
                <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">{formatRupiah(report?.totalLiabilities || 0)}</span>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="section-header flex justify-between">
                <span>Ekuitas</span>
                <span className="font-semibold text-gray-700 tracking-normal normal-case whitespace-nowrap">{formatRupiah(report?.totalEquity || 0)}</span>
              </div>
              <div className="overflow-y-auto max-h-[240px]">
                {report?.equity?.map((a: any) => (
                  <AccountTreeTable key={a.id} data={[a]} indentPx={20} valueColWidth="w-48" onAccountClick={handleAccountClick} />
                ))}
              </div>
              <div className="px-4 py-3 border-t border-gray-100 flex justify-between bg-gray-50/60">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Total Ekuitas</span>
                <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">{formatRupiah(report?.totalEquity || 0)}</span>
              </div>
            </div>

            {/* Pasiva Total */}
            <div className="bg-blue-600 text-white rounded-xl px-4 py-4 flex justify-between items-center">
              <span className="text-sm font-semibold">Total Pasiva (L + E)</span>
              <span className="text-lg font-bold tabular-nums whitespace-nowrap">{formatRupiah((report?.totalLiabilities || 0) + (report?.totalEquity || 0))}</span>
            </div>
          </div>
        </div>
      </ReportLayout>

      <LedgerDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        accountId={selectedAccount?.id || null}
        accountName={selectedAccount?.name || ''}
        endDate={date}
      />
    </>
  );
};

export default BalanceSheet;
