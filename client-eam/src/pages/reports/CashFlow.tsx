import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportToExcel } from '../../lib/exportExcel';
import { TrendingUp, Building2, Banknote, ArrowRightLeft } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { cn } from '../../lib/utils';
import { formatRupiah } from '../../lib/formatters';
import { CashFlowPDF } from '../../lib/pdf/ReportPDF';
import { useCompanyPDF } from '../../lib/pdf/useCompanyPDF';
import { ReportLayout, ReportSummaryCards } from '../../components/reports';
import type { SummaryCard } from '../../components/reports';

interface CashFlowData {
  operating: number;
  investing: number;
  financing: number;
  netChange: number;
  details: {
    operating: { name: string; amount: number }[];
    investing: { name: string; amount: number }[];
    financing: { name: string; amount: number }[];
  };
}

const CashFlow: React.FC = () => {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const company = useCompanyPDF();

  const { data, isLoading, isError, refetch } = useQuery<CashFlowData>({
    queryKey: ['report-cash-flow', startDate, endDate],
    queryFn: async () => {
      const res = await api.get('/reports/cash-flow', { params: { startDate, endDate } });
      return res.data;
    },
  });

  const handleExport = () => {
    const rows: object[] = [];
    const sections = [
      { label: 'Aktivitas Operasi', items: data?.details?.operating || [], subtotal: data?.operating || 0 },
      { label: 'Aktivitas Investasi', items: data?.details?.investing || [], subtotal: data?.investing || 0 },
      { label: 'Aktivitas Pendanaan', items: data?.details?.financing || [], subtotal: data?.financing || 0 },
    ];
    for (const s of sections) {
      for (const item of s.items) {
        rows.push({ Kategori: s.label, Keterangan: item.name, 'Jumlah (Rp)': item.amount });
      }
      rows.push({ Kategori: s.label, Keterangan: `Subtotal ${s.label}`, 'Jumlah (Rp)': s.subtotal });
    }
    rows.push({ Kategori: '---', Keterangan: 'NET CHANGE', 'Jumlah (Rp)': data?.netChange || 0 });
    exportToExcel(rows, `Arus-Kas-${startDate}-sd-${endDate}`);
  };

  const sections = [
    { key: 'operating', label: 'Aktivitas Operasi', icon: TrendingUp, value: data?.operating || 0, items: data?.details?.operating || [] },
    { key: 'investing', label: 'Aktivitas Investasi', icon: Building2, value: data?.investing || 0, items: data?.details?.investing || [] },
    { key: 'financing', label: 'Aktivitas Pendanaan', icon: Banknote, value: data?.financing || 0, items: data?.details?.financing || [] },
  ];

  const summaryCards: SummaryCard[] = sections.map((s) => ({
    label: s.label,
    value: s.value,
    icon: s.icon,
    color: s.value >= 0 ? 'text-green-700' : 'text-red-600',
    bgColor: 'bg-gray-100',
  }));

  const accentCard: SummaryCard = {
    label: 'Net Change',
    value: data?.netChange || 0,
    icon: ArrowRightLeft,
    color: (data?.netChange || 0) >= 0 ? 'text-white' : 'text-red-200',
    bgColor: 'bg-white/20',
  };

  return (
    <ReportLayout
      title="Laporan Arus Kas"
      subtitle="Pergerakan kas masuk dan keluar perusahaan"
      dateFilter={{ mode: 'range', startDate, endDate, onStartDateChange: setStartDate, onEndDateChange: setEndDate }}
      pdfDocument={
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
      }
      pdfFileName={`Arus-Kas-${startDate}-sd-${endDate}.pdf`}
      onExportExcel={handleExport}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      extraControls={<ReportSummaryCards cards={summaryCards} accentCard={accentCard} />}
    >
      {/* Detail Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {sections.map((s) => (
          <div key={s.key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="section-header flex items-center gap-2">
              <s.icon size={13} />
              {s.label}
            </div>
            <div className="divide-y divide-gray-50 px-4">
              {s.items.length > 0 ? s.items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center gap-2 py-3">
                  <span className="text-sm text-gray-600 min-w-0 truncate">{item.name}</span>
                  <span className={cn('text-sm font-medium tabular-nums whitespace-nowrap shrink-0', item.amount >= 0 ? 'text-green-600' : 'text-red-500')}>
                    {formatRupiah(item.amount)}
                  </span>
                </div>
              )) : (
                <p className="py-8 text-center text-sm text-gray-300">Tidak ada pergerakan kas</p>
              )}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/60 flex justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Subtotal</span>
              <span className={cn('text-sm font-semibold tabular-nums whitespace-nowrap', s.value >= 0 ? 'text-green-600' : 'text-red-500')}>
                {formatRupiah(s.value)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </ReportLayout>
  );
};

export default CashFlow;
