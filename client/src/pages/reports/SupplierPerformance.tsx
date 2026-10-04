/**
 * Laporan Kinerja Pemasok — per supplier for POs dated in the period:
 * PO count, on-time delivery rate, average lead time (PO → first STT),
 * fill rate (received / ordered) and PI-vs-PO price variance.
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportToExcel } from '../../lib/exportExcel';
import { formatNumber, formatRupiah } from '../../lib/format';
import { ReportLayout } from '../../components/reports';
import { PartyFilter } from '../../components/shared/party-filter';

interface PerformanceRow {
  supplierId: string | null;
  supplierName: string;
  poCount: number;
  evaluatedCount: number;
  onTimeRate: number | null;
  firstOnTimeRate: number | null;
  avgLeadTimeDays: number | null;
  fillRate: number | null;
  priceVariancePct: number | null;
  priceVarianceAmount: number;
}

const today = () => new Date().toLocaleDateString('en-CA');
const startOfYear = () => `${new Date().getFullYear()}-01-01`;
const pct = (v: number | null) => (v == null ? '-' : `${formatNumber(v, { maxDecimals: 2 })}%`);
const signedPct = (v: number | null) => (v == null ? '-' : `${v > 0 ? '+' : ''}${formatNumber(v, { maxDecimals: 2 })}%`);

const rateClass = (v: number | null) =>
  v == null ? 'text-gray-500' : v >= 90 ? 'text-green-700' : v >= 70 ? 'text-amber-700' : 'text-red-700';

const SupplierPerformance: React.FC = () => {
  const [startDate, setStartDate] = useState(startOfYear);
  const [endDate, setEndDate] = useState(today);
  const [partyId, setPartyId] = useState('');

  const params = { startDate: startDate || undefined, endDate: endDate || undefined, partyId: partyId || undefined };
  const { data, isLoading, isError, refetch } = useQuery<{ rows: PerformanceRow[] }>({
    queryKey: ['report-supplier-performance', params],
    queryFn: async () => (await api.get('/reports/supplier-performance', { params })).data,
  });
  const rows = data?.rows ?? [];

  const handleExport = () => {
    exportToExcel(
      rows.map((r) => ({
        Pemasok: r.supplierName,
        'Jumlah PO': r.poCount,
        'PO Dinilai': r.evaluatedCount,
        'Tepat Waktu (%)': r.onTimeRate ?? '',
        'Kiriman Pertama Tepat Waktu (%)': r.firstOnTimeRate ?? '',
        'Rata-rata Lead Time (hari)': r.avgLeadTimeDays ?? '',
        'Fill Rate (%)': r.fillRate ?? '',
        'Selisih Harga Faktur vs PO (%)': r.priceVariancePct ?? '',
        'Selisih Harga (Rp)': r.priceVarianceAmount,
      })),
      `Kinerja-Pemasok-${startDate || 'awal'}-${endDate || 'akhir'}`,
    );
  };

  return (
    <ReportLayout
      title="Kinerja Pemasok"
      subtitle="Ketepatan kirim, lead time, fill rate, dan selisih harga per pemasok (berdasarkan tanggal PO)"
      dateFilter={{ mode: 'range', startDate, endDate, onStartDateChange: setStartDate, onEndDateChange: setEndDate }}
      onExportExcel={handleExport}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      extraControls={
        <div className="space-y-2">
          <PartyFilter partyType="Supplier" value={partyId} onChange={setPartyId} />
          <p className="text-xs text-gray-500">
            Tepat waktu = STT terakhir pada/sebelum target terima (PO bertarget yang sudah ada STT). Lead time = tanggal PO →
            STT pertama. Fill rate = qty diterima ÷ qty dipesan. Selisih harga = harga faktur vs harga PO setelah diskon.
          </p>
        </div>
      }
    >
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="table-responsive" role="region" aria-label="Tabel kinerja pemasok" tabIndex={0}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Pemasok</th>
                <th className="text-right">Jumlah PO</th>
                <th className="text-right">Tepat Waktu</th>
                <th className="text-right">Lead Time</th>
                <th className="text-right">Fill Rate</th>
                <th className="text-right">Selisih Harga</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    Tidak ada PO pada periode ini.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.supplierId ?? 'general'}>
                    <td className="font-medium text-gray-900">{r.supplierName}</td>
                    <td className="text-right tabular-nums">{formatNumber(r.poCount)}</td>
                    <td className={`text-right tabular-nums font-medium ${rateClass(r.onTimeRate)}`}>
                      {pct(r.onTimeRate)}
                      {r.evaluatedCount > 0 && (
                        <span className="block text-xs font-normal text-gray-500">dari {formatNumber(r.evaluatedCount)} PO</span>
                      )}
                    </td>
                    <td className="text-right tabular-nums">
                      {r.avgLeadTimeDays == null ? '-' : `${formatNumber(r.avgLeadTimeDays, { maxDecimals: 1 })} hari`}
                    </td>
                    <td className={`text-right tabular-nums font-medium ${rateClass(r.fillRate)}`}>{pct(r.fillRate)}</td>
                    <td className="text-right tabular-nums">
                      {signedPct(r.priceVariancePct)}
                      {r.priceVarianceAmount !== 0 && (
                        <span className="block text-xs text-gray-500">{formatRupiah(r.priceVarianceAmount)}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ReportLayout>
  );
};

export default SupplierPerformance;
