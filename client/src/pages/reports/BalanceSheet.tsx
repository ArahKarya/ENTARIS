import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { BalanceSheetPDF } from '@/lib/pdf/ReportPDF';
import { useCompanyPDF } from '@/lib/pdf/useCompanyPDF';
import LedgerDetailDrawer from '@/components/reports/LedgerDetailDrawer';
import {
  ExportMenu,
  ReportFilters,
  ReportNotice,
  ReportPage,
  ReportState,
  ReportTable,
  flattenAccountTree,
  periodLabel,
  useReportAsOf,
  type AccountNode,
  type ReportRow,
} from '@/components/report-kit';

const BalanceSheet: React.FC = () => {
  const { t } = useTranslation('reports');
  const columns = [{ key: 'balance', label: t('reportsShared.balanceRp') }];
  const { date, setDate } = useReportAsOf();
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
    const flatten = (accounts: AccountNode[] | undefined, section: string): object[] =>
      accounts?.flatMap((a): object[] => [
        {
          [t('balanceSheet.excel.section')]: section,
          [t('reportsShared.accountName')]: a.name,
          [t('reportsShared.accountNumber')]: a.accountNumber,
          [t('reportsShared.balanceRp')]: a.balance,
        },
        ...flatten(a.children || [], section),
      ]) || [];
    const data = [
      ...flatten(report?.assets, t('balanceSheet.assets')),
      ...flatten(report?.liabilities, t('balanceSheet.liabilities')),
      ...flatten(report?.equity, t('balanceSheet.equity')),
    ];
    return exportToExcel(data, `Neraca-${date}`);
  };

  const totalAssets: number = report?.totalAssets || 0;
  const totalLiabilities: number = report?.totalLiabilities || 0;
  const totalEquity: number = report?.totalEquity || 0;
  const isBalanced = !isLoading && Math.abs(totalAssets - (totalLiabilities + totalEquity)) <= 1;

  const { assetRows, passivaRows } = useMemo(() => {
    const open = (node: AccountNode) => {
      setSelectedAccount({ id: node.id, name: node.name });
      setDrawerOpen(true);
    };
    const tree = (key: string, nodes: AccountNode[] | undefined): ReportRow[] => {
      const rows = flattenAccountTree(nodes, { onSelect: open });
      return rows.length > 0 ? rows : [{ key: `${key}-empty`, kind: 'note', label: t('reportsShared.noData') }];
    };
    return {
      assetRows: [
        ...tree('assets', report?.assets),
        { key: 'assets-total', kind: 'grand', label: t('balanceSheet.totalAssets'), values: [totalAssets] },
      ] as ReportRow[],
      passivaRows: [
        { key: 'liab-head', kind: 'section', label: t('balanceSheet.liabilities') },
        ...tree('liab', report?.liabilities),
        { key: 'liab-total', kind: 'total', label: t('balanceSheet.totalLiabilities'), values: [totalLiabilities] },
        { key: 'eq-head', kind: 'section', label: t('balanceSheet.equity') },
        ...tree('eq', report?.equity),
        { key: 'eq-total', kind: 'total', label: t('balanceSheet.totalEquity'), values: [totalEquity] },
        { key: 'passiva-total', kind: 'grand', label: t('balanceSheet.totalPassiva'), values: [totalLiabilities + totalEquity] },
      ] as ReportRow[],
    };
  }, [report, totalAssets, totalLiabilities, totalEquity, t]);

  return (
    <>
      <ReportPage
        title={t('balanceSheet.title')}
        description={t('balanceSheet.description')}
        period={periodLabel(date)}
        actions={
          <ExportMenu
            disabled={isLoading || isError}
            onExcel={handleExport}
            pdf={{
              fileName: `Neraca-${date}.pdf`,
              render: () => (
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
              ),
            }}
          />
        }
        filters={
          <>
            <ReportFilters mode="asOf" value={date} onChange={setDate} />
            {!isLoading && !isError && !isBalanced && (
              <ReportNotice>{t('balanceSheet.unbalanced')}</ReportNotice>
            )}
          </>
        }
      >
        <ReportState isLoading={isLoading} isError={isError} onRetry={() => refetch()}>
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <ReportTable
              caption={t('balanceSheet.assetsCaption', { date })}
              labelHeader={t('balanceSheet.assets')}
              codeHeader={t('reportsShared.accountNumber')}
              columns={columns}
              rows={assetRows}
            />
            <ReportTable
              caption={t('balanceSheet.passivaCaption', { date })}
              labelHeader={t('balanceSheet.passivaHeader')}
              codeHeader={t('reportsShared.accountNumber')}
              columns={columns}
              rows={passivaRows}
            />
          </div>
        </ReportState>
      </ReportPage>

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
