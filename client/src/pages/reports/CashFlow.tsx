import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRightLeft, Banknote, Building2, TrendingUp } from 'lucide-react';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { CashFlowPDF } from '@/lib/pdf/ReportPDF';
import { useCompanyPDF } from '@/lib/pdf/useCompanyPDF';
import {
  ExportMenu,
  ReportFilters,
  ReportPage,
  ReportState,
  ReportSummaryCards,
  ReportTable,
  periodLabel,
  useReportRange,
  type ReportRow,
} from '@/components/report-kit';

interface CashFlowItem {
  name: string;
  amount: number;
}

interface CashFlowData {
  operating: number;
  investing: number;
  financing: number;
  netChange: number;
  details: {
    operating: CashFlowItem[];
    investing: CashFlowItem[];
    financing: CashFlowItem[];
  };
}

const CashFlow: React.FC = () => {
  const { t } = useTranslation('reports');
  const columns = [{ key: 'amount', label: t('reportsShared.amountRp') }];
  const { startDate, endDate, setRange } = useReportRange();
  const company = useCompanyPDF();

  const { data, isLoading, isError, refetch } = useQuery<CashFlowData>({
    queryKey: ['report-cash-flow', startDate, endDate],
    queryFn: async () => {
      const res = await api.get('/reports/cash-flow', { params: { startDate, endDate } });
      return res.data;
    },
  });

  const sections = [
    { key: 'operating', label: t('cashFlow.operating'), icon: TrendingUp, value: data?.operating || 0, items: data?.details?.operating || [] },
    { key: 'investing', label: t('cashFlow.investing'), icon: Building2, value: data?.investing || 0, items: data?.details?.investing || [] },
    { key: 'financing', label: t('cashFlow.financing'), icon: Banknote, value: data?.financing || 0, items: data?.details?.financing || [] },
  ];

  const handleExport = () => {
    const hCategory = t('cashFlow.excel.category');
    const hDescription = t('reportsShared.description');
    const hAmount = t('reportsShared.amountRp');
    const row = (category: string, description: string, amount: number) => ({ [hCategory]: category, [hDescription]: description, [hAmount]: amount });
    const rows: object[] = [];
    for (const s of sections) {
      for (const item of s.items) {
        rows.push(row(s.label, item.name, item.amount));
      }
      rows.push(row(s.label, t('cashFlow.subtotal', { label: s.label }), s.value));
    }
    rows.push(row('---', t('cashFlow.excel.netChange'), data?.netChange || 0));
    exportToExcel(rows, `Arus-Kas-${startDate}-sd-${endDate}`);
  };

  const rows: ReportRow[] = sections.flatMap<ReportRow>((s) => [
    { key: `${s.key}-head`, kind: 'section', label: s.label },
    ...(s.items.length > 0
      ? s.items.map<ReportRow>((item, idx) => ({ key: `${s.key}-${idx}`, label: item.name, values: [item.amount] }))
      : [{ key: `${s.key}-empty`, kind: 'note' as const, label: t('cashFlow.noMovement') }]),
    { key: `${s.key}-subtotal`, kind: 'subtotal', label: t('cashFlow.subtotal', { label: s.label }), values: [s.value] },
  ]);

  const period = periodLabel({ startDate, endDate });

  return (
    <ReportPage
      title={t('cashFlow.title')}
      description={t('cashFlow.description')}
      period={period}
      actions={
        <ExportMenu
          disabled={isLoading || isError}
          onExcel={handleExport}
          pdf={{
            fileName: `Arus-Kas-${startDate}-sd-${endDate}.pdf`,
            render: () => (
              <CashFlowPDF
                company={company}
                period={t('reportsShared.dateRange', { start: startDate, end: endDate })}
                operating={data?.operating ?? 0}
                investing={data?.investing ?? 0}
                financing={data?.financing ?? 0}
                netChange={data?.netChange ?? 0}
                operatingItems={(data?.details?.operating ?? []).map((it) => ({ description: it.name, amount: it.amount }))}
                investingItems={(data?.details?.investing ?? []).map((it) => ({ description: it.name, amount: it.amount }))}
                financingItems={(data?.details?.financing ?? []).map((it) => ({ description: it.name, amount: it.amount }))}
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
            ...sections.map((s) => ({ label: s.label, value: s.value, icon: s.icon })),
            { label: t('cashFlow.netChange'), value: data?.netChange || 0, icon: ArrowRightLeft },
          ]}
        />
      }
    >
      <ReportState isLoading={isLoading} isError={isError} onRetry={() => refetch()}>
        <ReportTable
          caption={t('cashFlow.caption', { period })}
          columns={columns}
          labelHeader={t('reportsShared.description')}
          rows={rows}
          footer={[{ key: 'net', kind: 'grand', label: t('cashFlow.netChangeRow'), values: [data?.netChange || 0] }]}
        />
      </ReportState>
    </ReportPage>
  );
};

export default CashFlow;
