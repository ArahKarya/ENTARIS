import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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

const ProfitLoss: React.FC = () => {
  const { t } = useTranslation('reports');
  const columns = [{ key: 'balance', label: t('reportsShared.amountRp') }];
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
    const row = (section: string, name: string, balance: number) => ({
      [t('balanceSheet.excel.section')]: section,
      [t('reportsShared.accountName')]: name,
      [t('reportsShared.balanceRp')]: balance,
    });
    const flat = [
      ...(report?.revenue?.map((r: { name: string; balance: number }) => row(t('profitLoss.excel.revenue'), r.name, r.balance)) || []),
      ...(report?.expense?.map((e: { name: string; balance: number }) => row(t('profitLoss.excel.expense'), e.name, e.balance)) || []),
      row('---', t('profitLoss.excel.netProfit'), report?.netProfit || 0),
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
      ...section('rev', t('profitLoss.revenueSection'), report?.revenue, t('profitLoss.noRevenue')),
      { key: 'rev-total', kind: 'total', label: t('profitLoss.totalRevenue'), values: [report?.totalRevenue || 0] },
      ...section('exp', t('profitLoss.expenseSection'), report?.expense, t('profitLoss.noExpense')),
      { key: 'exp-total', kind: 'total', label: t('profitLoss.totalExpense'), values: [Math.abs(report?.totalExpense || 0)] },
      { key: 'net', kind: 'grand', label: t('profitLoss.netRow'), values: [netProfit] },
    ];
  }, [report, t]);

  return (
    <>
      <ReportPage
        title={t('profitLoss.title')}
        description={t('profitLoss.description', { company: companySettings?.companyName || t('profitLoss.companyFallback') })}
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
                  period={t('reportsShared.dateRange', { start: startDate, end: endDate })}
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
              { label: t('profitLoss.totalRevenue'), value: report?.totalRevenue || 0, icon: TrendingUp, tone: 'positive' },
              { label: t('profitLoss.totalExpense'), value: report?.totalExpense || 0, icon: TrendingDown, tone: 'neutral' },
              { label: t('profitLoss.netProfit'), value: report?.netProfit || 0, icon: BarChart3 },
            ]}
          />
        }
      >
        <ReportState isLoading={isLoading} isError={isError} onRetry={() => refetch()}>
          <ReportTable
            caption={t('profitLoss.caption', { period: periodLabel({ startDate, endDate }) })}
            columns={columns}
            codeHeader={t('reportsShared.accountNumber')}
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
