import React from 'react';
import { useQuery } from '@tanstack/react-query';
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

const COLUMNS = [{ key: 'amount', label: 'Jumlah (Rp)' }];

const CashFlow: React.FC = () => {
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
    { key: 'operating', label: 'Aktivitas Operasi', icon: TrendingUp, value: data?.operating || 0, items: data?.details?.operating || [] },
    { key: 'investing', label: 'Aktivitas Investasi', icon: Building2, value: data?.investing || 0, items: data?.details?.investing || [] },
    { key: 'financing', label: 'Aktivitas Pendanaan', icon: Banknote, value: data?.financing || 0, items: data?.details?.financing || [] },
  ];

  const handleExport = () => {
    const rows: object[] = [];
    for (const s of sections) {
      for (const item of s.items) {
        rows.push({ Kategori: s.label, Keterangan: item.name, 'Jumlah (Rp)': item.amount });
      }
      rows.push({ Kategori: s.label, Keterangan: `Subtotal ${s.label}`, 'Jumlah (Rp)': s.value });
    }
    rows.push({ Kategori: '---', Keterangan: 'NET CHANGE', 'Jumlah (Rp)': data?.netChange || 0 });
    exportToExcel(rows, `Arus-Kas-${startDate}-sd-${endDate}`);
  };

  const rows: ReportRow[] = sections.flatMap<ReportRow>((s) => [
    { key: `${s.key}-head`, kind: 'section', label: s.label },
    ...(s.items.length > 0
      ? s.items.map<ReportRow>((item, idx) => ({ key: `${s.key}-${idx}`, label: item.name, values: [item.amount] }))
      : [{ key: `${s.key}-empty`, kind: 'note' as const, label: 'Tidak ada pergerakan kas' }]),
    { key: `${s.key}-subtotal`, kind: 'subtotal', label: `Subtotal ${s.label}`, values: [s.value] },
  ]);

  const period = periodLabel({ startDate, endDate });

  return (
    <ReportPage
      title="Arus Kas"
      description="Pergerakan kas masuk dan keluar perusahaan"
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
                period={`${startDate} s/d ${endDate}`}
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
            { label: 'Net Change', value: data?.netChange || 0, icon: ArrowRightLeft },
          ]}
        />
      }
    >
      <ReportState isLoading={isLoading} isError={isError} onRetry={() => refetch()}>
        <ReportTable
          caption={`Laporan arus kas, ${period}`}
          columns={COLUMNS}
          labelHeader="Keterangan"
          rows={rows}
          footer={[{ key: 'net', kind: 'grand', label: 'Net Change (Kenaikan/Penurunan Kas)', values: [data?.netChange || 0] }]}
        />
      </ReportState>
    </ReportPage>
  );
};

export default CashFlow;
