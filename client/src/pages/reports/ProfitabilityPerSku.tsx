import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, TrendingUp, TrendingDown, Calculator, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { cn } from '../../lib/utils';

interface ItemRow {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  category: string;
  totalQty: number;
  totalRevenue: number;
  materialCogs: number;
  loadedCogs: number;
  materialMargin: number;
  loadedMargin: number;
  materialMarginPct: number;
  loadedMarginPct: number;
  linesWithBatch: number;
  totalLines: number;
  coveragePct: number;
}

interface ReportData {
  period: { start: string; end: string };
  items: ItemRow[];
  summary: {
    totalRevenue: number;
    totalMaterialCogs: number;
    totalLoadedCogs: number;
    materialGrossProfit: number;
    loadedGrossProfit: number;
    materialMarginPct: number;
    loadedMarginPct: number;
  };
}

type MarginBasis = 'material' | 'loaded' | 'both';

const fmt = (n: number) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 });

export default function ProfitabilityPerSku() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().substring(0, 10));
  const [basis, setBasis] = useState<MarginBasis>('both');

  const { data, isLoading } = useQuery<ReportData>({
    queryKey: ['report-profitability-per-sku', startDate, endDate],
    queryFn: async () => {
      const res = await api.get('/reports/profitability-per-sku', { params: { startDate, endDate } });
      return res.data;
    },
  });

  const showMaterial = basis === 'material' || basis === 'both';
  const showLoaded = basis === 'loaded' || basis === 'both';

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/reports" className="p-1.5 hover:bg-gray-100 rounded-lg" style={{ color: 'var(--color-text-muted)' }}>
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          Profitability per SKU
        </h1>
      </div>

      {/* Info banner */}
      <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-2">
        <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900">
          <strong>Material vs Loaded HPP:</strong>
          <ul className="text-blue-700 mt-1 space-y-0.5 list-disc list-inside text-xs">
            <li><strong>Material</strong> = COGS pakai WAC saat ini (existing — gambaran biaya material saja).</li>
            <li><strong>Loaded</strong> = COGS pakai loaded HPP per batch (Phase 3) — mencakup material + biaya produksi (listrik, buruh, dll) − produk samping NRV. Hanya tersedia untuk sale lines yang link ke batch.</li>
            <li><strong>Coverage</strong> = persentase line yang sudah link ke batch. 100% = semua line specific-id; 0% = belum ada batch pick.</li>
          </ul>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>Dari</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }} />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>Sampai</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }} />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>Basis Margin</label>
          <select value={basis} onChange={(e) => setBasis(e.target.value as MarginBasis)}
            className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }}>
            <option value="both">Material + Loaded (side-by-side)</option>
            <option value="material">Material only</option>
            <option value="loaded">Loaded only</option>
          </select>
        </div>
      </div>

      {/* Summary */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="card p-4">
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Total Pendapatan</p>
            <p className="text-lg font-bold mt-1" style={{ color: 'var(--color-text-primary)' }}>
              Rp {fmt(data.summary.totalRevenue)}
            </p>
          </div>
          {showMaterial && (
            <>
              <div className="card p-4">
                <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                  HPP Material (WAC)
                </p>
                <p className="text-lg font-bold mt-1" style={{ color: 'var(--color-text-primary)' }}>
                  Rp {fmt(data.summary.totalMaterialCogs)}
                </p>
              </div>
              <div className="card p-4">
                <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                  Margin Material
                </p>
                <p className={cn(
                  'text-lg font-bold mt-1',
                  data.summary.materialGrossProfit >= 0 ? 'text-green-600' : 'text-red-600',
                )}>
                  Rp {fmt(data.summary.materialGrossProfit)}
                  <span className="ml-1 text-xs">({data.summary.materialMarginPct}%)</span>
                </p>
              </div>
            </>
          )}
          {showLoaded && (
            <>
              <div className="card p-4 border-2 border-emerald-200 bg-emerald-50/40">
                <p className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                  <Calculator size={11} /> HPP Loaded
                </p>
                <p className="text-lg font-bold mt-1 text-emerald-900">
                  Rp {fmt(data.summary.totalLoadedCogs)}
                </p>
              </div>
              <div className="card p-4 border-2 border-emerald-200 bg-emerald-50/40">
                <p className="text-xs font-medium text-emerald-700">Margin Loaded</p>
                <p className={cn(
                  'text-lg font-bold mt-1',
                  data.summary.loadedGrossProfit >= 0 ? 'text-emerald-700' : 'text-red-600',
                )}>
                  Rp {fmt(data.summary.loadedGrossProfit)}
                  <span className="ml-1 text-xs">({data.summary.loadedMarginPct}%)</span>
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="card p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Memuat...</div>
      ) : data && data.items.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Produk</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Pendapatan</th>
                  {showMaterial && <th className="text-right">HPP Material</th>}
                  {showMaterial && <th className="text-right">Margin Material</th>}
                  {showLoaded && <th className="text-right bg-emerald-50/30">HPP Loaded</th>}
                  {showLoaded && <th className="text-right bg-emerald-50/30">Margin Loaded</th>}
                  <th className="text-right">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.itemId}>
                    <td className="font-mono text-xs">{item.itemCode}</td>
                    <td className="font-medium">{item.itemName}</td>
                    <td className="text-right tabular-nums">{fmt(item.totalQty)}</td>
                    <td className="text-right tabular-nums">{fmt(item.totalRevenue)}</td>
                    {showMaterial && <td className="text-right tabular-nums">{fmt(item.materialCogs)}</td>}
                    {showMaterial && (
                      <td className="text-right tabular-nums">
                        <span className={cn('inline-flex items-center gap-1',
                          item.materialMarginPct >= 20 ? 'text-green-600' : item.materialMarginPct >= 0 ? 'text-amber-600' : 'text-red-600',
                        )}>
                          {item.materialMarginPct >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                          {item.materialMarginPct}%
                        </span>
                        <div className="text-[10px] text-gray-400">{fmt(item.materialMargin)}</div>
                      </td>
                    )}
                    {showLoaded && (
                      <td className="text-right tabular-nums bg-emerald-50/30">
                        {fmt(item.loadedCogs)}
                      </td>
                    )}
                    {showLoaded && (
                      <td className="text-right tabular-nums bg-emerald-50/30">
                        <span className={cn('inline-flex items-center gap-1',
                          item.loadedMarginPct >= 20 ? 'text-green-600' : item.loadedMarginPct >= 0 ? 'text-amber-600' : 'text-red-600',
                        )}>
                          {item.loadedMarginPct >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                          {item.loadedMarginPct}%
                        </span>
                        <div className="text-[10px] text-gray-400">{fmt(item.loadedMargin)}</div>
                      </td>
                    )}
                    <td className="text-right">
                      <span className={cn('badge text-xs',
                        item.coveragePct === 100 ? 'badge-green' : item.coveragePct >= 50 ? 'badge-yellow' : 'badge-gray',
                      )}>
                        {item.coveragePct}% ({item.linesWithBatch}/{item.totalLines})
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
          Tidak ada data penjualan di periode ini.
        </div>
      )}
    </div>
  );
}
