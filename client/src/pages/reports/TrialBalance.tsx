import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportToExcel } from '../../lib/exportExcel';
import { Search, AlertTriangle } from 'lucide-react';
import { format, endOfMonth } from 'date-fns';
import { cn } from '../../lib/utils';
import { formatRupiah } from '../../lib/formatters';
import { TrialBalancePDF } from '../../lib/pdf/ReportPDF';
import { useCompanyPDF } from '../../lib/pdf/useCompanyPDF';
import { ReportLayout } from '../../components/reports';
import LedgerDetailDrawer from '../../components/reports/LedgerDetailDrawer';

const TrialBalance: React.FC = () => {
  // Default ke satu bulan penuh (bukan month-to-date) supaya entri akhir-bulan
  // seperti penyusutan & jurnal penyesuaian (diposting tgl 30/31) langsung muncul.
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-01'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [searchTerm, setSearchTerm] = useState('');
  const company = useCompanyPDF();

  // Drill-down drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<{ id: string; name: string } | null>(null);

  const { data: report, isLoading, isError, refetch } = useQuery({
    queryKey: ['trial-balance', startDate, endDate],
    queryFn: async () => {
      const r = await api.get('/reports/trial-balance', { params: { startDate, endDate } });
      return r.data;
    },
  });

  const filtered = Array.isArray(report)
    ? report.filter(
        (item: any) =>
          (item.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
          (item.accountNumber || '').includes(searchTerm)
      )
    : [];

  const totalDebit = filtered.reduce((s: number, i: any) => s + i.debit, 0);
  const totalCredit = filtered.reduce((s: number, i: any) => s + i.credit, 0);
  const isUnbalanced = !isLoading && Math.abs(totalDebit - totalCredit) > 0.01;

  const handleExport = () => {
    exportToExcel(
      filtered.map((item: any) => ({
        'No. Akun': item.accountNumber,
        'Nama Akun': item.name,
        Tipe: item.accountType,
        'Debit (Rp)': item.debit,
        'Kredit (Rp)': item.credit,
        'Saldo (Rp)': item.balance,
      })),
      `Neraca-Saldo-${startDate}-sd-${endDate}`
    );
  };

  const handleAccountClick = (accountId: string, accountName: string) => {
    setSelectedAccount({ id: accountId, name: accountName });
    setDrawerOpen(true);
  };

  return (
    <>
      <ReportLayout
        title="Neraca Saldo"
        subtitle="Verifikasi keseimbangan debit-kredit per akun"
        dateFilter={{ mode: 'range', startDate, endDate, onStartDateChange: setStartDate, onEndDateChange: setEndDate }}
        pdfDocument={
          <TrialBalancePDF
            company={company}
            period={`${startDate} s/d ${endDate}`}
            rows={filtered.map((item: any) => ({
              accountNumber: item.accountNumber,
              accountName: item.name,
              debit: Number(item.debit),
              credit: Number(item.credit),
            }))}
          />
        }
        pdfFileName={`Neraca-Saldo-${startDate}-sd-${endDate}.pdf`}
        onExportExcel={handleExport}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        alert={
          isUnbalanced ? (
            <div className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              <AlertTriangle size={16} className="text-yellow-600 shrink-0" />
              <span>Neraca tidak seimbang! Selisih: <strong>{formatRupiah(Math.abs(totalDebit - totalCredit))}</strong></span>
            </div>
          ) : undefined
        }
        extraControls={
          <div className="relative max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Cari akun atau nomor..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        }
      >
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
         <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-24">No. Akun</th>
                <th>Nama Akun</th>
                <th className="text-right pr-4">Debit</th>
                <th className="text-right pr-4">Kredit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="py-16 text-center text-gray-400">Tidak ada data ditemukan</td></tr>
              ) : (
                filtered.map((item: any) => (
                  <tr key={item.id}>
                    <td className="font-mono text-xs text-gray-400">{item.accountNumber}</td>
                    <td>
                      <button
                        onClick={() => handleAccountClick(item.id, item.name)}
                        className="font-medium text-left cursor-pointer hover:underline text-blue-600 dark:text-blue-400"
                      >
                        {item.name}
                      </button>
                    </td>
                    <td className={cn('text-right pr-4 tabular-nums', item.debit > 0 ? 'text-blue-600' : 'text-gray-300')}>
                      {item.debit > 0 ? formatRupiah(item.debit) : '\u2014'}
                    </td>
                    <td className={cn('text-right pr-4 tabular-nums', item.credit > 0 ? 'text-gray-700' : 'text-gray-300')}>
                      {item.credit > 0 ? formatRupiah(item.credit) : '\u2014'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-blue-600 text-white">
                <td colSpan={2} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Total Saldo</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatRupiah(totalDebit)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums pr-4">{formatRupiah(totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
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

export default TrialBalance;
