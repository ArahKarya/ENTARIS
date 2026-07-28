import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportToExcel } from '../../lib/exportExcel';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../../lib/utils';
import { formatRupiah, formatDate } from '../../lib/formatters';
import { ReportLayout } from '../../components/reports';

interface LedgerEntry {
  id: string;
  date: string;
  debit: number;
  credit: number;
  description: string;
  referenceType: string | null;
  runningBalance: number;
}

interface AccountLedger {
  accountId: string;
  accountNumber: string;
  accountName: string;
  rootType: string;
  openingBalance: number;
  entries: LedgerEntry[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

const PAGE_SIZE = 200;

const LedgerBook: React.FC = () => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  const { data: ledgerData, isLoading, isError, refetch } = useQuery<AccountLedger[]>({
    queryKey: ['ledger-book', startDate, endDate],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const r = await api.get('/reports/ledger-book', { params });
      return r.data;
    },
  });

  const filtered = useMemo(() => {
    if (!ledgerData) return [];
    if (!searchTerm) return ledgerData;
    const q = searchTerm.toLowerCase();
    return ledgerData.filter(
      (a) =>
        a.accountName.toLowerCase().includes(q) ||
        a.accountNumber.includes(q),
    );
  }, [ledgerData, searchTerm]);

  // Pagination: pack accounts into pages until each page holds ~PAGE_SIZE entries.
  // An account with > PAGE_SIZE entries occupies its own page.
  const pages = useMemo(() => {
    const result: AccountLedger[][] = [];
    let current: AccountLedger[] = [];
    let currentCount = 0;
    for (const acc of filtered) {
      const n = acc.entries.length || 1;
      if (currentCount > 0 && currentCount + n > PAGE_SIZE) {
        result.push(current);
        current = [];
        currentCount = 0;
      }
      current.push(acc);
      currentCount += n;
    }
    if (current.length > 0) result.push(current);
    return result.length > 0 ? result : [[]];
  }, [filtered]);

  const totalEntries = useMemo(
    () => filtered.reduce((s, a) => s + a.entries.length, 0),
    [filtered],
  );

  const totalPages = pages.length;
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageAccounts = pages[safePage - 1] ?? [];

  // Reset to page 1 when filter/data changes
  React.useEffect(() => { setPage(1); }, [searchTerm, startDate, endDate, ledgerData]);

  const toggleAccount = (accountId: string) => {
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  const expandAll = () => {
    if (!filtered) return;
    setExpandedAccounts(new Set(filtered.map((a) => a.accountId)));
  };

  const collapseAll = () => {
    setExpandedAccounts(new Set());
  };

  const handleExportExcel = () => {
    if (!filtered) return;
    const rows: Record<string, string | number>[] = [];
    for (const account of filtered) {
      // Account header row
      rows.push({
        'No. Akun': account.accountNumber,
        'Nama Akun': account.accountName,
        Tanggal: '',
        Keterangan: '── SALDO AWAL ──',
        'Debit (Rp)': '',
        'Kredit (Rp)': '',
        'Saldo (Rp)': account.openingBalance,
      });
      // Entry rows
      for (const entry of account.entries) {
        rows.push({
          'No. Akun': account.accountNumber,
          'Nama Akun': account.accountName,
          Tanggal: format(new Date(entry.date), 'dd/MM/yyyy'),
          Keterangan: entry.description || '',
          'Debit (Rp)': entry.debit || '',
          'Kredit (Rp)': entry.credit || '',
          'Saldo (Rp)': entry.runningBalance,
        });
      }
      // Total row
      rows.push({
        'No. Akun': account.accountNumber,
        'Nama Akun': account.accountName,
        Tanggal: '',
        Keterangan: '── TOTAL ──',
        'Debit (Rp)': account.totalDebit,
        'Kredit (Rp)': account.totalCredit,
        'Saldo (Rp)': account.closingBalance,
      });
      // Blank separator
      rows.push({ 'No. Akun': '', 'Nama Akun': '', Tanggal: '', Keterangan: '', 'Debit (Rp)': '', 'Kredit (Rp)': '', 'Saldo (Rp)': '' });
    }
    exportToExcel(rows, `Buku-Besar-${startDate}-sd-${endDate}`);
  };

  return (
    <ReportLayout
      title="Buku Besar"
      subtitle="Mutasi per akun dengan saldo berjalan."
      dateFilter={{
        mode: 'range',
        startDate,
        endDate,
        onStartDateChange: setStartDate,
        onEndDateChange: setEndDate,
      }}
      onExportExcel={handleExportExcel}
      onPrint={() => window.print()}
      isLoading={isLoading}
      isError={isError}
      onRetry={refetch}
    >
      {/* Preset periods */}
      <div className="flex flex-wrap items-center gap-2 mb-3 no-print">
        <span className="text-xs text-gray-400">Preset:</span>
        <button
          onClick={() => { setStartDate(''); setEndDate(''); }}
          className="btn-secondary text-xs py-1.5 px-3"
        >
          Semua Histori
        </button>
        <button
          onClick={() => { setStartDate(format(new Date(), 'yyyy-01-01')); setEndDate(format(new Date(), 'yyyy-MM-dd')); }}
          className="btn-secondary text-xs py-1.5 px-3"
        >
          Tahun Ini (YTD)
        </button>
        <button
          onClick={() => { setStartDate(format(new Date(), 'yyyy-MM-01')); setEndDate(format(new Date(), 'yyyy-MM-dd')); }}
          className="btn-secondary text-xs py-1.5 px-3"
        >
          Bulan Ini
        </button>
      </div>

      {/* Search + expand/collapse */}
      <div className="flex flex-wrap items-center gap-3 mb-4 no-print">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari akun..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button onClick={expandAll} className="btn-secondary text-xs py-2 px-3">
          Buka Semua
        </button>
        <button onClick={collapseAll} className="btn-secondary text-xs py-2 px-3">
          Tutup Semua
        </button>
        {filtered && (
          <span className="text-xs text-gray-400">
            {filtered.length} akun · {totalEntries.toLocaleString('id-ID')} mutasi
          </span>
        )}
      </div>

      {/* Ledger content */}
      <div className="space-y-3">
        {pageAccounts.length === 0 && !isLoading && (
          <div className="text-center py-16 text-gray-400 text-sm">
            Tidak ada data buku besar untuk periode ini.
          </div>
        )}

        {pageAccounts.map((account) => {
          const isExpanded = expandedAccounts.has(account.accountId);

          return (
            <div
              key={account.accountId}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden"
            >
              {/* Account header */}
              <button
                onClick={() => toggleAccount(account.accountId)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown size={16} className="text-gray-400" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-400" />
                  )}
                  <span className="text-xs font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                    {account.accountNumber}
                  </span>
                  <span className="text-sm font-semibold text-gray-800">
                    {account.accountName}
                  </span>
                  <span className="text-xs text-gray-400 uppercase">
                    {account.entries.length} mutasi
                  </span>
                </div>
                <div className="flex items-center gap-6 text-sm font-mono tabular-nums">
                  <div className="text-right">
                    <span className="text-xs text-gray-400 block">Saldo Akhir</span>
                    <span className={cn(
                      'font-medium',
                      account.closingBalance >= 0 ? 'text-gray-900' : 'text-red-600',
                    )}>
                      {formatRupiah(Math.abs(account.closingBalance))}
                      {account.closingBalance < 0 && ' (CR)'}
                    </span>
                  </div>
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-gray-100 table-responsive">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        <th className="text-left px-5 py-2 w-28">Tanggal</th>
                        <th className="text-left px-3 py-2">Keterangan</th>
                        <th className="text-right px-3 py-2 w-32">Debit</th>
                        <th className="text-right px-3 py-2 w-32">Kredit</th>
                        <th className="text-right px-5 py-2 w-36">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Opening balance row */}
                      {account.openingBalance !== 0 && (
                        <tr className="bg-blue-50/50 border-b border-gray-50">
                          <td className="px-5 py-2 text-xs text-gray-400" colSpan={4}>
                            <em>Saldo Awal</em>
                          </td>
                          <td className="px-5 py-2 text-right font-mono text-xs font-medium text-blue-700">
                            {formatRupiah(Math.abs(account.openingBalance))}
                            {account.openingBalance < 0 && ' (CR)'}
                          </td>
                        </tr>
                      )}

                      {account.entries.map((entry, idx) => (
                        <tr
                          key={entry.id}
                          className={cn(
                            'border-b border-gray-50',
                            idx % 2 === 1 && 'bg-gray-50/30',
                          )}
                        >
                          <td className="px-5 py-2 text-xs text-gray-500 whitespace-nowrap">
                            {formatDate(entry.date)}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700">
                            {entry.description || '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                            {entry.debit > 0 ? (
                              <span className="text-gray-900">{formatRupiah(entry.debit)}</span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                            {entry.credit > 0 ? (
                              <span className="text-gray-900">{formatRupiah(entry.credit)}</span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-5 py-2 text-right font-mono text-xs font-medium tabular-nums">
                            <span className={entry.runningBalance < 0 ? 'text-red-600' : 'text-gray-900'}>
                              {formatRupiah(Math.abs(entry.runningBalance))}
                              {entry.runningBalance < 0 && ' (CR)'}
                            </span>
                          </td>
                        </tr>
                      ))}

                      {/* Total row */}
                      <tr className="bg-gray-100 font-semibold">
                        <td className="px-5 py-2.5 text-xs text-gray-600" colSpan={2}>
                          Total Mutasi
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-900 tabular-nums">
                          {formatRupiah(account.totalDebit)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-900 tabular-nums">
                          {formatRupiah(account.totalCredit)}
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono text-xs font-bold tabular-nums">
                          <span className={account.closingBalance < 0 ? 'text-red-600' : 'text-gray-900'}>
                            {formatRupiah(Math.abs(account.closingBalance))}
                            {account.closingBalance < 0 && ' (CR)'}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 no-print">
          <span className="text-xs text-gray-500">
            Halaman {safePage} dari {totalPages} · ~{PAGE_SIZE} mutasi/halaman
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={safePage === 1}
              className="btn-secondary text-xs py-1.5 px-2.5 disabled:opacity-40"
            >« Awal</button>
            <button
              onClick={() => setPage(safePage - 1)}
              disabled={safePage === 1}
              className="btn-secondary text-xs py-1.5 px-2.5 disabled:opacity-40"
            >‹ Sebelumnya</button>
            <span className="text-xs text-gray-600 px-2">
              {safePage} / {totalPages}
            </span>
            <button
              onClick={() => setPage(safePage + 1)}
              disabled={safePage === totalPages}
              className="btn-secondary text-xs py-1.5 px-2.5 disabled:opacity-40"
            >Berikutnya ›</button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={safePage === totalPages}
              className="btn-secondary text-xs py-1.5 px-2.5 disabled:opacity-40"
            >Akhir »</button>
          </div>
        </div>
      )}
    </ReportLayout>
  );
};

export default LedgerBook;
