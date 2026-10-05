import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, CheckCircle2, Wallet } from 'lucide-react';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { AgingPDF } from '@/lib/pdf/ReportPDF';
import type { AgingRow } from '@/lib/pdf/ReportPDF';
import { useCompanyPDF } from '@/lib/pdf/useCompanyPDF';
import {
  ExportMenu,
  ReportNotice,
  ReportPage,
  ReportState,
  ReportSummaryCards,
  ReportTable,
  type ReportRow,
} from '@/components/report-kit';

interface AgingProps {
  type: 'Customer' | 'Supplier';
}

interface AgingApiRow {
  name: string;
  current: number;
  1: number;
  31: number;
  61: number;
  91: number;
  total: number;
}

const COLUMNS = [
  { key: 'current', label: 'Belum JT' },
  { key: 'd1', label: '1-30 Hari' },
  { key: 'd31', label: '31-60 Hari' },
  { key: 'd61', label: '61-90 Hari' },
  { key: 'd91', label: '>90 Hari' },
  { key: 'total', label: 'Total' },
];

const AgingAnalysis: React.FC<AgingProps> = ({ type }) => {
  // Judul = label registry rute (Umur Piutang / Umur Utang); nama file ekspor tetap.
  const title = type === 'Customer' ? 'Umur Piutang' : 'Umur Utang';
  const exportName = type === 'Customer' ? 'Aging Piutang' : 'Aging Hutang';
  const subtitle = type === 'Customer' ? 'Analisis saldo tak tertagih per pelanggan' : 'Analisis kewajiban pembayaran per vendor';
  const company = useCompanyPDF();

  const { data: agingData, isLoading, isError, refetch } = useQuery({
    queryKey: ['aging-report', type],
    queryFn: async () => {
      const response = await api.get('/reports/aging', { params: { type } });
      return response.data;
    },
  });

  const rows: AgingApiRow[] = Array.isArray(agingData) ? agingData : [];

  const totals = rows.reduce(
    (acc, curr) => ({
      current: acc.current + curr.current,
      1: acc[1] + curr[1],
      31: acc[31] + curr[31],
      61: acc[61] + curr[61],
      91: acc[91] + curr[91],
      total: acc.total + curr.total,
    }),
    { current: 0, 1: 0, 31: 0, 61: 0, 91: 0, total: 0 },
  );

  const stamp = new Date().toISOString().slice(0, 10);

  const handleExport = () => {
    const excelRows = rows.map((r) => ({
      'Nama Mitra': r.name,
      'Belum Jatuh Tempo (Rp)': r.current,
      '1-30 Hari (Rp)': r[1],
      '31-60 Hari (Rp)': r[31],
      '61-90 Hari (Rp)': r[61],
      '>90 Hari (Rp)': r[91],
      'Total (Rp)': r.total,
    }));
    excelRows.push({
      'Nama Mitra': 'TOTAL',
      'Belum Jatuh Tempo (Rp)': totals.current,
      '1-30 Hari (Rp)': totals[1],
      '31-60 Hari (Rp)': totals[31],
      '61-90 Hari (Rp)': totals[61],
      '>90 Hari (Rp)': totals[91],
      'Total (Rp)': totals.total,
    });
    exportToExcel(excelRows, `${exportName}-${stamp}`);
  };

  const pdfRows: AgingRow[] = rows.map((r) => ({
    name: r.name,
    current: r.current,
    d1_30: r[1],
    d31_60: r[31],
    d61_90: r[61],
    d91_plus: r[91],
    total: r.total,
  }));

  const pdfTotals: AgingRow = {
    name: 'TOTAL',
    current: totals.current,
    d1_30: totals[1],
    d31_60: totals[31],
    d61_90: totals[61],
    d91_plus: totals[91],
    total: totals.total,
  };

  const tableRows: ReportRow[] =
    rows.length === 0
      ? [{ key: 'empty', kind: 'note', label: 'Tidak ada saldo outstanding saat ini.' }]
      : rows.map((r, idx) => ({
          key: `${idx}-${r.name}`,
          label: r.name,
          values: [r.current, r[1], r[31], r[61], r[91], r.total],
        }));

  return (
    <ReportPage
      title={title}
      description={subtitle}
      period="Posisi saat ini"
      actions={
        <ExportMenu
          disabled={isLoading || isError}
          onExcel={handleExport}
          pdf={{
            fileName: `${exportName}-${stamp}.pdf`,
            render: () => <AgingPDF company={company} type={type} rows={pdfRows} totals={pdfTotals} />,
          }}
        />
      }
      filters={
        totals[91] > 0 ? (
          <ReportNotice tone="warning">
            Terdapat tagihan kritis yang menunggak lebih dari 90 hari. Mohon lakukan tindakan penagihan intensif.
          </ReportNotice>
        ) : undefined
      }
      summary={
        <ReportSummaryCards
          loading={isLoading}
          items={[
            { label: 'Total Outstanding', value: totals.total, icon: Wallet, tone: 'neutral' },
            { label: 'Belum Jatuh Tempo', value: totals.current, icon: CheckCircle2, tone: 'positive' },
            { label: 'Menunggak 31-90 Hari', value: (totals[31] || 0) + (totals[61] || 0), icon: CalendarClock, tone: 'neutral' },
            { label: 'Kritis (>90 Hari)', value: totals[91] || 0, icon: AlertTriangle, tone: totals[91] > 0 ? 'negative' : 'neutral' },
          ]}
        />
      }
    >
      <ReportState isLoading={isLoading} isError={isError} onRetry={() => refetch()}>
        <ReportTable
          caption={`${title} per ${type === 'Customer' ? 'pelanggan' : 'vendor'}`}
          columns={COLUMNS}
          labelHeader="Nama Mitra"
          zero="dash"
          rows={tableRows}
          footer={[
            {
              key: 'total',
              kind: 'total',
              label: 'Total Kolektibilitas',
              values: [totals.current, totals[1], totals[31], totals[61], totals[91], totals.total],
            },
          ]}
        />
      </ReportState>
    </ReportPage>
  );
};

export default AgingAnalysis;
