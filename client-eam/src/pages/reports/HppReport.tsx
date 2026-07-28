import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { cn } from '../../lib/utils';

interface HppItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  category: string;
  totalQty: number;
  totalRevenue: number;
  totalCogs: number;
  grossMargin: number;
  marginPct: number;
}

interface HppData {
  period: { start: string; end: string };
  items: HppItem[];
  summary: { totalRevenue: number; totalCogs: number; grossProfit: number; grossMarginPct: number };
}

const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 0 });

export default function HppReport() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().substring(0, 10));

  const { data, isLoading } = useQuery<HppData>({
    queryKey: ['report-hpp', startDate, endDate],
    queryFn: async () => {
      const res = await api.get('/reports/hpp', { params: { startDate, endDate } });
      return res.data;
    },
  });

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/reports" className="p-1.5 hover:bg-gray-100 rounded-lg" style={{ color: 'var(--color-text-muted)' }}>
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          Laporan HPP per Produk
        </h1>
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
      </div>

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="card p-4">
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Total Pendapatan</p>
            <p className="text-lg font-bold mt-1" style={{ color: 'var(--color-text-primary)' }}>Rp {fmt(data.summary.totalRevenue)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Total HPP</p>
            <p className="text-lg font-bold mt-1" style={{ color: 'var(--color-text-primary)' }}>Rp {fmt(data.summary.totalCogs)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Laba Kotor</p>
            <p className={cn('text-lg font-bold mt-1', data.summary.grossProfit >= 0 ? 'text-green-600' : 'text-red-600')}>
              Rp {fmt(data.summary.grossProfit)}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Margin Kotor</p>
            <p className={cn('text-lg font-bold mt-1', data.summary.grossMarginPct >= 0 ? 'text-green-600' : 'text-red-600')}>
              {data.summary.grossMarginPct}%
            </p>
          </div>
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
                  <th>Kategori</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Pendapatan</th>
                  <th className="text-right">HPP</th>
                  <th className="text-right">Laba Kotor</th>
                  <th className="text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.itemId}>
                    <td className="font-mono text-xs">{item.itemCode}</td>
                    <td className="font-medium">{item.itemName}</td>
                    <td><span className="badge badge-gray">{item.category}</span></td>
                    <td className="text-right tabular-nums">{fmt(item.totalQty)}</td>
                    <td className="text-right tabular-nums">{fmt(item.totalRevenue)}</td>
                    <td className="text-right tabular-nums">{fmt(item.totalCogs)}</td>
                    <td className={cn('text-right tabular-nums font-medium', item.grossMargin >= 0 ? 'text-green-600' : 'text-red-600')}>
                      {fmt(item.grossMargin)}
                    </td>
                    <td className="text-right">
                      <span className={cn('inline-flex items-center gap-1', item.marginPct >= 20 ? 'text-green-600' : item.marginPct >= 0 ? 'text-amber-600' : 'text-red-600')}>
                        {item.marginPct >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {item.marginPct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Tidak ada data penjualan di periode ini.</div>
      )}
    </div>
  );
}
