import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingDown, TrendingUp } from 'lucide-react';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { ProfitLossPDF } from '@/lib/pdf/ReportPDF';
import { useCompanyPDF } from '@/lib/pdf/useCompanyPDF';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import LedgerDetailDrawer from '@/components/reports/LedgerDetailDrawer';
import {
  ExportMenu,
  ReportFilters,
  ReportPage,
  ReportState,
  ReportSummaryCards,
  ReportTable,
  flattenAccountTree,
  periodLabel,
  useReportRange,
  type AccountNode,
  type ReportRow,
} from '@/components/report-kit';

const COLUMNS = [{ key: 'balance', label: 'Jumlah (Rp)' }];

const ProfitLoss: React.FC = () => {
  // Default = satu bulan penuh (bukan month-to-date) supaya entri akhir-bulan
  // (penyusutan & jurnal penyesuaian tgl 30/31) langsung muncul.
  const { startDate, endDate, setRange } = useReportRange();
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
      ...(report?.revenue?.flatMap((r: { name: string; balance: number }) => [{ Seksi: 'Pendapatan', 'Nama Akun': r.name, 'Saldo (Rp)': r.balance }]) || []),
      ...(report?.expense?.flatMap((e: { name: string; balance: number }) => [{ Seksi: 'Beban', 'Nama Akun': e.name, 'Saldo (Rp)': e.balance }]) || []),
      { Seksi: '---', 'Nama Akun': 'LABA BERSIH', 'Saldo (Rp)': report?.netProfit || 0 },
    ];
    return exportToExcel(flat, `Laba-Rugi-${startDate}-sd-${endDate}`);
  };

  const rows: ReportRow[] = useMemo(() => {
    const open = (node: AccountNode) => {
      setSelectedAccount({ id: node.id, name: node.name });
      setDrawerOpen(true);
    };
    const section = (key: string, title: string, nodes: AccountNode[] | undefined, emptyText: string): ReportRow[] => [
      { key: `${key}-head`, kind: 'section', label: title },
      ...(nodes && nodes.length > 0
        ? flattenAccountTree(nodes, { onSelect: open })
        : [{ key: `${key}-empty`, kind: 'note' as const, label: emptyText }]),
    ];
    const netProfit = report?.netProfit || 0;
    return [
      ...section('rev', 'I. Pendapatan', report?.revenue, 'Tidak ada data pendapatan'),
      { key: 'rev-total', kind: 'total', label: 'Total Pendapatan', values: [report?.totalRevenue || 0] },
      ...section('exp', 'II. Beban-Beban', report?.expense, 'Tidak ada data beban'),
      { key: 'exp-total', kind: 'total', label: 'Total Beban', values: [Math.abs(report?.totalExpense || 0)] },
      { key: 'net', kind: 'grand', label: 'Laba (Rugi) Bersih', values: [netProfit] },
    ];
  }, [report]);

  return (
    <>
      <ReportPage
        title="Laporan Laba Rugi"
        description={`Performa finansial ${companySettings?.companyName || 'perusahaan'}`}
        period={periodLabel({ startDate, endDate })}
        actions={
          <ExportMenu
            disabled={isLoading || isError}
            onExcel={handleExport}
            pdf={{
              fileName: `Laba-Rugi-${startDate}-sd-${endDate}.pdf`,
              render: () => (
                <ProfitLossPDF
                  company={company}
                  period={`${startDate} s/d ${endDate}`}
                  revenue={report?.revenue ?? []}
                  expense={report?.expense ?? []}
                  totalRevenue={report?.totalRevenue ?? 0}
                  totalExpense={report?.totalExpense ?? 0}
                  netProfit={report?.netProfit ?? 0}
                />
              ),
            }}
          />
        }
        filters={<ReportFilters mode="range" value={{ startDate, endDate }} onChange={setRange} />}
        summary={
          <ReportSummaryCards
            loading={isLoading}
            items={[
              { label: 'Total Pendapatan', value: report?.totalRevenue || 0, icon: TrendingUp, tone: 'positive' },
              { label: 'Total Beban', value: report?.totalExpense || 0, icon: TrendingDown, tone: 'neutral' },
              { label: 'Laba Bersih', value: report?.netProfit || 0, icon: BarChart3 },
            ]}
          />
        }
      >
        <ReportState isLoading={isLoading} isError={isError} onRetry={() => refetch()}>
          <ReportTable
            caption={`Laporan laba rugi, ${periodLabel({ startDate, endDate })}`}
            columns={COLUMNS}
            codeHeader="No. Akun"
            labelHeader="Uraian"
            rows={rows}
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

export default ProfitLoss;
