import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { formatRupiah } from '@/lib/format';
import { TrialBalancePDF } from '@/lib/pdf/ReportPDF';
import { useCompanyPDF } from '@/lib/pdf/useCompanyPDF';
import { Input } from '@/components/ui/input';
import LedgerDetailDrawer from '@/components/reports/LedgerDetailDrawer';
import {
  ExportMenu,
  ReportFilters,
  ReportNotice,
  ReportPage,
  ReportState,
  ReportTable,
  periodLabel,
  useReportRange,
  type ReportRow,
} from '@/components/report-kit';

interface TrialBalanceItem {
  id: string;
  accountNumber: string;
  name: string;
  accountType?: string;
  debit: number;
  credit: number;
  balance?: number;
}

const COLUMNS = [
  { key: 'debit', label: 'Debit (Rp)' },
  { key: 'credit', label: 'Kredit (Rp)' },
];

const TrialBalance: React.FC = () => {
  // Default = satu bulan penuh (bukan month-to-date) supaya entri akhir-bulan
  // seperti penyusutan & jurnal penyesuaian (diposting tgl 30/31) langsung muncul.
  const { startDate, endDate, setRange, list } = useReportRange();
  const searchTerm = list.search;
  const company = useCompanyPDF();

  // Drill-down drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<{ id: string; name: string } | null>(null);
  const openLedger = (id: string, name: string) => {
    setSelectedAccount({ id, name });
    setDrawerOpen(true);
  };

  const { data: report, isLoading, isError, refetch } = useQuery({
    queryKey: ['trial-balance', startDate, endDate],
    queryFn: async () => {
      const r = await api.get('/reports/trial-balance', { params: { startDate, endDate } });
      return r.data;
    },
  });

  const filtered: TrialBalanceItem[] = useMemo(
    () =>
      Array.isArray(report)
        ? report.filter(
            (item: TrialBalanceItem) =>
              (item.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
              (item.accountNumber || '').includes(searchTerm),
          )
        : [],
    [report, searchTerm],
  );

  const totalDebit = filtered.reduce((s, i) => s + i.debit, 0);
  const totalCredit = filtered.reduce((s, i) => s + i.credit, 0);
  const isUnbalanced = !isLoading && Math.abs(totalDebit - totalCredit) > 0.01;

  const rows: ReportRow[] = useMemo(
    () =>
      filtered.map((item) => ({
        key: item.id,
        label: item.name,
        code: item.accountNumber,
        values: [item.debit > 0 ? item.debit : 0, item.credit > 0 ? item.credit : 0],
        onSelect: () => openLedger(item.id, item.name),
        selectLabel: `Lihat buku besar ${item.name}`,
      })),
    [filtered],
  );

  const handleExport = () =>
    exportToExcel(
      filtered.map((item) => ({
        'No. Akun': item.accountNumber,
        'Nama Akun': item.name,
        Tipe: item.accountType,
        'Debit (Rp)': item.debit,
        'Kredit (Rp)': item.credit,
        'Saldo (Rp)': item.balance,
      })),
      `Neraca-Saldo-${startDate}-sd-${endDate}`,
    );

  return (
    <>
      <ReportPage
        title="Neraca Saldo"
        description="Verifikasi keseimbangan debit-kredit per akun"
        period={periodLabel({ startDate, endDate })}
        actions={
          <ExportMenu
            disabled={isLoading || isError}
            onExcel={handleExport}
            pdf={{
              fileName: `Neraca-Saldo-${startDate}-sd-${endDate}.pdf`,
              render: () => (
                <TrialBalancePDF
                  company={company}
                  period={`${startDate} s/d ${endDate}`}
                  rows={filtered.map((item) => ({
                    accountNumber: item.accountNumber,
                    accountName: item.name,
                    debit: Number(item.debit),
                    credit: Number(item.credit),
                  }))}
                />
              ),
            }}
          />
        }
        filters={
          <>
            <ReportFilters mode="range" value={{ startDate, endDate }} onChange={setRange}>
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  type="search"
                  aria-label="Cari akun atau nomor"
                  placeholder="Cari akun atau nomor..."
                  value={list.searchInput}
                  onChange={(e) => list.setSearch(e.target.value)}
                  className="pl-9 max-sm:h-11"
                />
              </div>
            </ReportFilters>
            {isUnbalanced && (
              <ReportNotice>
                Neraca tidak seimbang! Selisih: <strong>{formatRupiah(Math.abs(totalDebit - totalCredit))}</strong>
              </ReportNotice>
            )}
          </>
        }
      >
        <ReportState
          isLoading={isLoading}
          isError={isError}
          isEmpty={filtered.length === 0}
          filtered={searchTerm !== ''}
          onRetry={() => refetch()}
        >
          <ReportTable
            caption={`Neraca saldo per akun, ${periodLabel({ startDate, endDate })}`}
            columns={COLUMNS}
            labelHeader="Nama Akun"
            codeHeader="No. Akun"
            zero="dash"
            rows={rows}
            footer={[{ key: 'total', kind: 'grand', label: 'Total Saldo', values: [totalDebit, totalCredit] }]}
          />
        </ReportState>
      </ReportPage>

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
