import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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

const COLUMNS = [{ key: 'balance', label: 'Saldo (Rp)' }];

const BalanceSheet: React.FC = () => {
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
        { Seksi: section, 'Nama Akun': a.name, 'No. Akun': a.accountNumber, 'Saldo (Rp)': a.balance },
        ...flatten(a.children || [], section),
      ]) || [];
    const data = [
      ...flatten(report?.assets, 'Aset'),
      ...flatten(report?.liabilities, 'Kewajiban'),
      ...flatten(report?.equity, 'Ekuitas'),
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
      return rows.length > 0 ? rows : [{ key: `${key}-empty`, kind: 'note', label: 'Tidak ada data' }];
    };
    return {
      assetRows: [
        ...tree('assets', report?.assets),
        { key: 'assets-total', kind: 'grand', label: 'Total Aset', values: [totalAssets] },
      ] as ReportRow[],
      passivaRows: [
        { key: 'liab-head', kind: 'section', label: 'Kewajiban' },
        ...tree('liab', report?.liabilities),
        { key: 'liab-total', kind: 'total', label: 'Total Kewajiban', values: [totalLiabilities] },
        { key: 'eq-head', kind: 'section', label: 'Ekuitas' },
        ...tree('eq', report?.equity),
        { key: 'eq-total', kind: 'total', label: 'Total Ekuitas', values: [totalEquity] },
        { key: 'passiva-total', kind: 'grand', label: 'Total Pasiva (L + E)', values: [totalLiabilities + totalEquity] },
      ] as ReportRow[],
    };
  }, [report, totalAssets, totalLiabilities, totalEquity]);

  return (
    <>
      <ReportPage
        title="Neraca (Balance Sheet)"
        description="Posisi keuangan aset, liabilitas, dan ekuitas"
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
              <ReportNotice>Terdapat selisih antara total Aktiva dan Pasiva. Periksa jurnal yang tidak seimbang.</ReportNotice>
            )}
          </>
        }
      >
        <ReportState isLoading={isLoading} isError={isError} onRetry={() => refetch()}>
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <ReportTable
              caption={`Aset per ${date}`}
              labelHeader="Aset"
              codeHeader="No. Akun"
              columns={COLUMNS}
              rows={assetRows}
            />
            <ReportTable
              caption={`Kewajiban dan ekuitas per ${date}`}
              labelHeader="Kewajiban dan Ekuitas"
              codeHeader="No. Akun"
              columns={COLUMNS}
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
