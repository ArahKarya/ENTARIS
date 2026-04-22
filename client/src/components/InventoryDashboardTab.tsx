import React, { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Package, CheckCircle, AlertTriangle, ArrowLeftRight, Loader2,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import {
  BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { formatRupiah } from '../lib/formatters';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_STOCK_KG = 20_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardMetrics {
  totalItems: number;
  activeItems: number;
  lowStockCount: number;
  movementsThisMonth: number;
}

interface InventoryItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: string | null;
  currentStock: number | string;
  minimumStock: number | string;
  isActive: boolean;
}

interface MovementTrendRaw {
  month: string;
  inQty: number;
  outQty: number;
  adjInQty: number;
  adjOutQty: number;
  netChange: number;
}

interface RecentMovement {
  id: string;
  date: string;
  item: { name: string; unit: string; code: string };
  movementType: 'In' | 'Out' | 'AdjustmentIn' | 'AdjustmentOut';
  quantity: number;
  totalValue: number | null;
}

interface ProductionStats {
  totalRuns: number;
  thisMonthRuns: number;
  avgYield: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtNum = (val: number | string, decimals = 0) =>
  Number(val).toLocaleString('id-ID', { maximumFractionDigits: decimals });

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function useIsDark(): boolean {
  const check = useCallback(() => {
    const html = document.documentElement;
    return html.classList.contains('dark') || html.getAttribute('data-theme') === 'dark';
  }, []);

  const [dark, setDark] = useState(check);

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(check()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => observer.disconnect();
  }, [check]);

  return dark;
}

const movementBadge: Record<string, { label: string; cls: string }> = {
  In: { label: 'Masuk', cls: 'badge badge-green' },
  Out: { label: 'Keluar', cls: 'badge badge-red' },
  AdjustmentIn: { label: 'Adj+', cls: 'badge badge-blue' },
  AdjustmentOut: { label: 'Adj−', cls: 'badge badge-orange' },
};

function stockStatus(current: number): { label: string; color: string; bgColor: string } {
  const pct = (current / MIN_STOCK_KG) * 100;
  if (current <= 0) return { label: 'Habis', color: 'text-red-700', bgColor: 'bg-red-100 dark:bg-red-900/40' };
  if (pct <= 50) return { label: 'Kritis', color: 'text-red-600', bgColor: 'bg-red-50 dark:bg-red-900/30' };
  if (pct <= 100) return { label: 'Menipis', color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-900/30' };
  if (pct <= 200) return { label: 'Normal', color: 'text-green-600', bgColor: 'bg-green-50 dark:bg-green-900/30' };
  return { label: 'Surplus', color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-900/30' };
}

function stockBarColor(current: number): string {
  const pct = (current / MIN_STOCK_KG) * 100;
  if (current <= 0) return '#dc2626';
  if (pct <= 50) return '#ef4444';
  if (pct <= 100) return '#f59e0b';
  if (pct <= 200) return '#22c55e';
  return '#3b82f6';
}

function stockBarWidth(current: number): number {
  return Math.min(100, Math.round((current / (MIN_STOCK_KG * 3)) * 100));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  bgClass: string;
  iconClass: string;
  loading: boolean;
  subtitle?: string;
}

function KpiCard({ title, value, icon: Icon, bgClass, iconClass, loading, subtitle }: KpiCardProps) {
  return (
    <div className="border rounded-xl p-5" style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
          {title}
        </span>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', bgClass)}>
          <Icon size={16} className={iconClass} />
        </div>
      </div>
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
      ) : (
        <>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function InventoryDashboardTab() {
  const isDark = useIsDark();
  const chartGrid = isDark ? '#334155' : '#f3f4f6';
  const chartTick = isDark ? '#94a3b8' : '#9ca3af';
  const chartTooltipBg = isDark ? '#1e293b' : '#fff';
  const chartTooltipBorder = isDark ? '#475569' : '#e5e7eb';

  // --- Queries ---
  const { data: metrics, isLoading: metricsLoading } = useQuery<DashboardMetrics>({
    queryKey: ['warehouse-metrics'],
    queryFn: () => api.get('/inventory/dashboard/metrics').then(r => r.data),
  });

  const { data: itemsRaw, isLoading: itemsLoading } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => api.get('/inventory/items').then(r => r.data),
  });
  const allItems: InventoryItem[] = Array.isArray(itemsRaw)
    ? itemsRaw
    : (itemsRaw?.data ?? []);
  const activeItems = allItems.filter(i => i.isActive);

  const { data: trendData, isLoading: trendLoading } = useQuery({
    queryKey: ['warehouse-movement-trend'],
    queryFn: async () => {
      const r = await api.get<MovementTrendRaw[]>('/inventory/dashboard/movement-trend');
      return r.data.map(d => {
        const [, m] = d.month.split('-');
        return {
          month: MONTH_NAMES[parseInt(m, 10) - 1] ?? d.month,
          masuk: d.inQty + d.adjInQty,
          keluar: d.outQty + d.adjOutQty,
          net: d.netChange,
        };
      });
    },
  });

  const { data: recentMovements, isLoading: movementsLoading } = useQuery<RecentMovement[]>({
    queryKey: ['warehouse-recent-movements'],
    queryFn: () => api.get('/inventory/dashboard/recent-movements').then(r => r.data),
  });

  const { data: prodStats, isLoading: prodLoading } = useQuery<ProductionStats>({
    queryKey: ['warehouse-production-stats'],
    queryFn: () => api.get('/inventory/dashboard/production-stats').then(r => r.data),
  });

  // --- Derived data ---
  const totalStockKg = activeItems.reduce((sum, i) => sum + Number(i.currentStock), 0);
  const lowStockItems = activeItems.filter(i => Number(i.currentStock) < MIN_STOCK_KG);
  const criticalItems = activeItems.filter(i => Number(i.currentStock) <= MIN_STOCK_KG * 0.5);

  // Sort for stock overview: lowest stock first
  const sortedItems = [...activeItems].sort((a, b) => Number(b.currentStock) - Number(a.currentStock));

  // Chart data for stock per item
  const stockChartData = [...activeItems]
    .sort((a, b) => Number(b.currentStock) - Number(a.currentStock))
    .slice(0, 15)
    .map(i => ({
      name: i.code,
      fullName: i.name,
      stock: Number(i.currentStock),
      min: MIN_STOCK_KG,
    }));

  return (
    <div className="space-y-5">
      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          title="Total Item"
          value={metrics?.totalItems ?? 0}
          icon={Package}
          bgClass="bg-blue-50 dark:bg-blue-900/30"
          iconClass="text-blue-600"
          loading={metricsLoading}
        />
        <KpiCard
          title="Total Stok"
          value={`${fmtNum(totalStockKg)} Kg`}
          icon={CheckCircle}
          bgClass="bg-green-50 dark:bg-green-900/30"
          iconClass="text-green-600"
          loading={itemsLoading}
          subtitle={`${activeItems.length} item aktif`}
        />
        <KpiCard
          title="Stok Menipis"
          value={lowStockItems.length}
          icon={AlertTriangle}
          bgClass="bg-amber-50 dark:bg-amber-900/30"
          iconClass="text-amber-600"
          loading={itemsLoading}
          subtitle={`< ${fmtNum(MIN_STOCK_KG)} Kg`}
        />
        <KpiCard
          title="Stok Kritis"
          value={criticalItems.length}
          icon={AlertTriangle}
          bgClass="bg-red-50 dark:bg-red-900/30"
          iconClass="text-red-600"
          loading={itemsLoading}
          subtitle={`< ${fmtNum(MIN_STOCK_KG / 2)} Kg`}
        />
        <KpiCard
          title="Gerakan Bulan Ini"
          value={metrics?.movementsThisMonth ?? 0}
          icon={ArrowLeftRight}
          bgClass="bg-purple-50 dark:bg-purple-900/30"
          iconClass="text-purple-600"
          loading={metricsLoading}
        />
      </div>

      {/* ─── Stock Level Overview ─── */}
      <div className="border rounded-xl p-5" style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Status Stok Semua Item
          </h2>
          <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800" style={{ color: 'var(--color-text-muted)' }}>
            Stok Min: {fmtNum(MIN_STOCK_KG)} Kg
          </span>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          Perbandingan stok saat ini terhadap batas minimum {fmtNum(MIN_STOCK_KG)} Kg per item.
        </p>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mb-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" /> Habis/Kritis (&le;50%)</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" /> Menipis (50-100%)</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" /> Normal (100-200%)</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" /> Surplus (&gt;200%)</span>
        </div>

        {itemsLoading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="animate-spin" size={24} style={{ color: 'var(--color-text-muted)' }} />
          </div>
        ) : sortedItems.length === 0 ? (
          <div className="py-12 text-center" style={{ color: 'var(--color-text-muted)' }}>
            <Package size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs">Belum ada item persediaan</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: 'var(--color-text-muted)' }}>
                  <th className="text-left font-medium pb-2 pl-1">Kode</th>
                  <th className="text-left font-medium pb-2">Nama Item</th>
                  <th className="text-right font-medium pb-2">Stok Saat Ini</th>
                  <th className="text-right font-medium pb-2">Min ({fmtNum(MIN_STOCK_KG)})</th>
                  <th className="font-medium pb-2 w-36 text-center">Level</th>
                  <th className="text-center font-medium pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map(item => {
                  const current = Number(item.currentStock);
                  const pct = MIN_STOCK_KG > 0 ? Math.round((current / MIN_STOCK_KG) * 100) : 0;
                  const status = stockStatus(current);
                  const trend = current > MIN_STOCK_KG
                    ? TrendingUp
                    : current > 0
                      ? TrendingDown
                      : Minus;

                  return (
                    <tr key={item.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                      <td className="py-2.5 pl-1">
                        <span className="font-mono bg-gray-50 dark:bg-gray-800 px-1.5 py-0.5 rounded text-xs" style={{ color: 'var(--color-text-primary)' }}>
                          {item.code}
                        </span>
                      </td>
                      <td className="py-2.5 font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {item.name}
                        {item.category && (
                          <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800" style={{ color: 'var(--color-text-muted)' }}>
                            {item.category}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-right tabular-nums font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        {fmtNum(current, 1)} <span className="font-normal text-xs" style={{ color: 'var(--color-text-muted)' }}>{item.unit}</span>
                      </td>
                      <td className="py-2.5 text-right tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                        {fmtNum(MIN_STOCK_KG)}
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${stockBarWidth(current)}%`,
                                backgroundColor: stockBarColor(current),
                              }}
                            />
                          </div>
                          <span className="text-xs tabular-nums w-8 text-right font-medium" style={{ color: 'var(--color-text-muted)' }}>
                            {pct}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 text-center">
                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', status.bgColor, status.color)}>
                          {React.createElement(trend, { size: 10 })}
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Chart: Stock per Item ─── */}
      {stockChartData.length > 0 && (
        <div className="border rounded-xl p-5" style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
            Perbandingan Stok vs Minimum ({fmtNum(MIN_STOCK_KG)} Kg)
          </h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockChartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartGrid} />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: chartTick, fontSize: 10 }}
                  tickFormatter={v => fmtNum(v)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: chartTick, fontSize: 10 }}
                  width={70}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartTooltipBg,
                    border: `1px solid ${chartTooltipBorder}`,
                    borderRadius: '8px',
                    fontSize: 12,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    color: isDark ? '#e2e8f0' : '#1e293b',
                  }}
                  formatter={(value, name) => {
                    if (name === 'stock') return [`${fmtNum(Number(value))} Kg`, 'Stok Saat Ini'];
                    return [`${fmtNum(Number(value))} Kg`, 'Minimum'];
                  }}
                  labelFormatter={(label) => {
                    const item = stockChartData.find(d => d.name === label);
                    return item?.fullName ?? label;
                  }}
                />
                <Bar dataKey="stock" radius={[0, 4, 4, 0]} barSize={16}>
                  {stockChartData.map((entry, idx) => (
                    <Cell key={idx} fill={stockBarColor(entry.stock)} />
                  ))}
                </Bar>
                {/* Reference line for minimum stock */}
                <Line
                  dataKey="min"
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  type="step"
                  legendType="none"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <span className="flex items-center gap-1.5">
              <span className="w-8 h-0.5 border-t-2 border-dashed border-red-500 inline-block" />
              Batas Minimum ({fmtNum(MIN_STOCK_KG)} Kg)
            </span>
          </div>
        </div>
      )}

      {/* ─── Row: Trend + Production + Recent ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Movement Trend Chart */}
        <div className="lg:col-span-2 border rounded-xl p-5" style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Tren Pergerakan Stok (6 Bulan)
            </h2>
            <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" /> Masuk
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" /> Keluar
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" /> Net
              </span>
            </div>
          </div>
          <div className="h-56">
            {trendLoading ? (
              <div className="py-12 flex items-center justify-center">
                <Loader2 className="animate-spin" size={24} style={{ color: 'var(--color-text-muted)' }} />
              </div>
            ) : !trendData || trendData.length === 0 ? (
              <div className="py-12 text-center" style={{ color: 'var(--color-text-muted)' }}>
                <p className="text-xs">Belum ada data pergerakan</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartGrid} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: chartTick, fontSize: 11 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: chartTick, fontSize: 11 }} tickFormatter={v => fmtNum(v)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: chartTooltipBg, border: `1px solid ${chartTooltipBorder}`, borderRadius: '8px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', color: isDark ? '#e2e8f0' : '#1e293b' }}
                    formatter={(value, name) => {
                      const labels: Record<string, string> = { masuk: 'Masuk', keluar: 'Keluar', net: 'Net Change' };
                      return [fmtNum(Number(value)), labels[String(name)] ?? String(name)];
                    }}
                  />
                  <Bar dataKey="masuk" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="keluar" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="net" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Production Stats */}
        <div className="border rounded-xl p-5" style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
            Statistik Produksi
          </h2>
          {prodLoading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="animate-spin" size={24} style={{ color: 'var(--color-text-muted)' }} />
            </div>
          ) : !prodStats ? (
            <div className="py-12 text-center" style={{ color: 'var(--color-text-muted)' }}>
              <Package size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">Belum ada data produksi</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                  Total Produksi
                </span>
                <p className="text-2xl font-semibold tabular-nums mt-0.5" style={{ color: 'var(--color-text-primary)' }}>
                  {fmtNum(prodStats.totalRuns)}
                </p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                  Produksi Bulan Ini
                </span>
                <p className="text-2xl font-semibold tabular-nums mt-0.5" style={{ color: 'var(--color-text-primary)' }}>
                  {fmtNum(prodStats.thisMonthRuns)}
                </p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                  Rata-rata Yield
                </span>
                <p className="text-2xl font-semibold tabular-nums mt-0.5" style={{ color: 'var(--color-text-primary)' }}>
                  {Number(prodStats.avgYield).toFixed(1)}%
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Recent Movements ─── */}
      <div className="border rounded-xl p-5" style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
          Gerakan Stok Terkini
        </h2>
        {movementsLoading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="animate-spin" size={24} style={{ color: 'var(--color-text-muted)' }} />
          </div>
        ) : !recentMovements || recentMovements.length === 0 ? (
          <div className="py-12 text-center" style={{ color: 'var(--color-text-muted)' }}>
            <ArrowLeftRight size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs">Belum ada gerakan stok</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: 'var(--color-text-muted)' }}>
                  <th className="text-left font-medium pb-2">Tanggal</th>
                  <th className="text-left font-medium pb-2">Item</th>
                  <th className="text-center font-medium pb-2">Tipe</th>
                  <th className="text-right font-medium pb-2">Kuantitas</th>
                  <th className="text-right font-medium pb-2">Nilai</th>
                </tr>
              </thead>
              <tbody>
                {recentMovements.map(mov => {
                  const badge = movementBadge[mov.movementType] ?? { label: mov.movementType, cls: 'badge' };
                  return (
                    <tr key={mov.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                      <td className="py-2 whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
                        {format(new Date(mov.date), 'dd MMM yyyy', { locale: idLocale })}
                      </td>
                      <td className="py-2 font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        <span className="font-mono text-xs bg-gray-50 dark:bg-gray-800 px-1 py-0.5 rounded mr-1.5">
                          {mov.item?.code}
                        </span>
                        {mov.item?.name ?? '-'}
                      </td>
                      <td className="py-2 text-center">
                        <span className={badge.cls}>{badge.label}</span>
                      </td>
                      <td className="py-2 text-right tabular-nums font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {fmtNum(mov.quantity)} <span className="font-normal text-xs" style={{ color: 'var(--color-text-muted)' }}>{mov.item?.unit}</span>
                      </td>
                      <td className="py-2 text-right tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                        {mov.totalValue != null ? formatRupiah(Number(mov.totalValue)) : '\u2014'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
