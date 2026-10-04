/**
 * Laporan PO Outstanding — open POs (ordered, not short-closed) per line:
 * ordered / received / remaining qty and remaining value (net of discount,
 * incl. line PPN). Filters: supplier, warehouse, PO date range, overdue only.
 */
import React, { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ClipboardList, Package, Wallet } from 'lucide-react';
import api from '../../lib/api';
import { exportToExcel } from '../../lib/exportExcel';
import { formatDate, formatNumber, formatRupiah } from '../../lib/format';
import { ReportLayout, ReportSummaryCards } from '../../components/reports';
import type { SummaryCard } from '../../components/reports';
import { PartyFilter } from '../../components/shared/party-filter';
import WarehousePicker from '../../components/WarehousePicker';

interface OutstandingRow {
  poId: string;
  poNumber: string;
  date: string;
  expectedDeliveryDate: string | null;
  supplierName: string;
  warehouseName: string | null;
  isOverdue: boolean;
  daysOverdue: number;
  itemId: string;
  itemName: string;
  unit: string;
  ordered: number;
  received: number;
  remaining: number;
  unitValue: number;
  remainingValue: number;
}

interface OutstandingData {
  rows: OutstandingRow[];
  summary: { poCount: number; lineCount: number; remainingValue: number; overduePoCount: number };
}

const qty = (n: number) => formatNumber(n, { maxDecimals: 3 });

const PoOutstanding: React.FC = () => {
  const overdueId = useId();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [partyId, setPartyId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const params = {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    partyId: partyId || undefined,
    warehouseId: warehouseId || undefined,
    overdue: overdueOnly ? '1' : undefined,
  };
  const { data, isLoading, isError, refetch } = useQuery<OutstandingData>({
    queryKey: ['report-po-outstanding', params],
    queryFn: async () => (await api.get('/reports/po-outstanding', { params })).data,
  });
  const rows = data?.rows ?? [];

  const handleExport = () => {
    exportToExcel(
      rows.map((r) => ({
        'No. PO': r.poNumber,
        'Tanggal PO': r.date,
        'Target Terima': r.expectedDeliveryDate ?? '',
        Pemasok: r.supplierName,
        Gudang: r.warehouseName ?? '',
        Item: r.itemName,
        Satuan: r.unit,
        'Qty Dipesan': r.ordered,
        'Qty Diterima': r.received,
        'Qty Sisa': r.remaining,
        'Harga Satuan Neto (Rp)': r.unitValue,
        'Nilai Sisa (Rp)': r.remainingValue,
        Terlambat: r.isOverdue ? `Ya (${r.daysOverdue} hari)` : 'Tidak',
      })),
      `PO-Outstanding-${new Date().toISOString().slice(0, 10)}`,
    );
  };

  const cards: SummaryCard[] = [
    { label: 'Nilai Sisa', value: data?.summary.remainingValue ?? 0, icon: Wallet, color: 'text-gray-900', bgColor: 'bg-gray-100' },
    { label: 'PO Terbuka', value: data?.summary.poCount ?? 0, icon: ClipboardList, color: 'text-blue-700', bgColor: 'bg-blue-50', formatValue: (v) => formatNumber(v) },
    { label: 'Baris Item', value: data?.summary.lineCount ?? 0, icon: Package, color: 'text-gray-700', bgColor: 'bg-gray-100', formatValue: (v) => formatNumber(v) },
    { label: 'PO Terlambat', value: data?.summary.overduePoCount ?? 0, icon: AlertTriangle, color: 'text-red-700', bgColor: 'bg-red-50', formatValue: (v) => formatNumber(v) },
  ];

  return (
    <ReportLayout
      title="PO Outstanding"
      subtitle="Sisa pesanan pembelian yang belum diterima per item"
      dateFilter={{ mode: 'range', startDate, endDate, onStartDateChange: setStartDate, onEndDateChange: setEndDate }}
      onExportExcel={handleExport}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      extraControls={
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <PartyFilter partyType="Supplier" value={partyId} onChange={setPartyId} />
            <div className="w-full sm:w-56">
              <WarehousePicker value={warehouseId} onChange={setWarehouseId} autoDefault={false} placeholder="Semua gudang" />
            </div>
            <label htmlFor={overdueId} className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input id={overdueId} type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
              Hanya yang terlambat
            </label>
          </div>
          <ReportSummaryCards cards={cards} />
        </div>
      }
    >
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>No. PO</th>
                <th>Pemasok</th>
                <th>Item</th>
                <th>Target Terima</th>
                <th className="text-right">Dipesan</th>
                <th className="text-right">Diterima</th>
                <th className="text-right">Sisa</th>
                <th className="text-right">Nilai Sisa (Rp)</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-500">
                    Tidak ada PO outstanding untuk filter ini.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={`${r.poId}-${r.itemId}`}>
                    <td className="font-mono text-xs font-medium whitespace-nowrap">{r.poNumber}</td>
                    <td>{r.supplierName}</td>
                    <td>
                      <span className="text-gray-900">{r.itemName}</span>
                      {r.warehouseName && <span className="block text-xs text-gray-500">{r.warehouseName}</span>}
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {r.expectedDeliveryDate ? formatDate(r.expectedDeliveryDate) : '-'}
                      {r.isOverdue && (
                        <span className="mt-0.5 flex items-center gap-1 font-medium text-red-700">
                          <AlertTriangle size={12} aria-hidden /> Terlambat {r.daysOverdue} hari
                        </span>
                      )}
                    </td>
                    <td className="text-right tabular-nums whitespace-nowrap">{qty(r.ordered)} {r.unit}</td>
                    <td className="text-right tabular-nums whitespace-nowrap">{qty(r.received)}</td>
                    <td className="text-right tabular-nums whitespace-nowrap font-medium">{qty(r.remaining)}</td>
                    <td className="text-right tabular-nums whitespace-nowrap font-medium">{formatRupiah(r.remainingValue, { symbol: false })}</td>
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

export default PoOutstanding;
