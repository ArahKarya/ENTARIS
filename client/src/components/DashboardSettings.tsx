import React from 'react';
import { X, BarChart3, Clock, Users, AlertTriangle, PieChart, PackageX, Package, ArrowLeftRight, Layers, Factory, TrendingUp, Wallet, Scale, Truck, Percent } from 'lucide-react';

export interface WidgetConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  enabled: boolean;
}

export const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'revenue-chart', name: 'Grafik Pendapatan', description: 'Area chart pendapatan vs beban 6 bulan terakhir', icon: BarChart3, enabled: true },
  { id: 'recent-activities', name: 'Aktivitas Terakhir', description: 'Transaksi pembayaran terbaru', icon: Clock, enabled: true },
  { id: 'top-customers', name: 'Pelanggan Teratas', description: 'Top 5 pelanggan berdasarkan total penjualan', icon: Users, enabled: true },
  { id: 'overdue-invoices', name: 'Invoice Jatuh Tempo', description: 'Daftar invoice yang sudah melewati tanggal jatuh tempo', icon: AlertTriangle, enabled: true },
  { id: 'expense-breakdown', name: 'Breakdown Beban', description: 'Distribusi beban bulan ini dalam bentuk pie chart', icon: PieChart, enabled: true },
  { id: 'stock-alert', name: 'Stok Alert', description: 'Item dengan stok di bawah batas minimum', icon: PackageX, enabled: true },
  { id: 'warehouse-kpi', name: 'KPI Gudang', description: 'Ringkasan total item, stok aktif, dan peringatan', icon: Package, enabled: true },
  { id: 'movement-trend', name: 'Tren Pergerakan Stok', description: 'Grafik masuk/keluar stok 6 bulan terakhir', icon: BarChart3, enabled: true },
  { id: 'category-distribution', name: 'Distribusi Kategori', description: 'Distribusi stok berdasarkan kategori', icon: Layers, enabled: true },
  { id: 'top-items', name: 'Item Stok Terbanyak', description: 'Top 10 item dengan stok terbanyak', icon: Package, enabled: true },
  { id: 'recent-movements', name: 'Gerakan Stok Terkini', description: '10 gerakan stok terakhir', icon: ArrowLeftRight, enabled: true },
  { id: 'production-stats', name: 'Statistik Produksi', description: 'Total produksi dan rata-rata yield', icon: Factory, enabled: true },
  { id: 'financial-ratios', name: 'Rasio Keuangan', description: 'Current ratio, debt-to-equity, dan debt-to-asset', icon: Scale, enabled: true },
  { id: 'monthly-profit', name: 'Tren Laba Bulanan', description: 'Grafik pendapatan vs beban 12 bulan terakhir', icon: TrendingUp, enabled: true },
  { id: 'cash-flow-summary', name: 'Arus Kas', description: 'Kas masuk, keluar, dan arus bersih bulan ini', icon: Wallet, enabled: true },
  { id: 'aging-summary', name: 'Ringkasan Aging', description: 'Aging piutang dan hutang per bucket', icon: Clock, enabled: true },
  { id: 'cash-position', name: 'Posisi Kas & Bank', description: 'Saldo per akun kas/bank dengan total', icon: Wallet, enabled: true },
  { id: 'top-vendors', name: 'Vendor Teratas', description: 'Top 5 vendor berdasarkan total pembelian', icon: Truck, enabled: true },
  { id: 'yield-trend', name: 'Tren Yield', description: 'Rata-rata yield produksi 6 bulan terakhir', icon: Percent, enabled: true },
  { id: 'cogs-backfill', name: 'COGS Pending Settle', description: 'Sales stok minus yang menunggu auto-koreksi COGS', icon: AlertTriangle, enabled: true },
];

interface DashboardSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  widgets: WidgetConfig[];
  onToggle: (id: string) => void;
}

const DashboardSettings: React.FC<DashboardSettingsProps> = ({ isOpen, onClose, widgets, onToggle }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="rounded-xl border shadow-xl w-full max-w-[calc(100vw-1rem)] sm:max-w-md"
        style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Konfigurasi Dashboard
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Pilih widget yang ingin ditampilkan
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={16} style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-96 overflow-y-auto">
          {widgets.map((w) => (
            <div
              key={w.id}
              className="flex items-center gap-3 p-3 rounded-lg border transition-colors"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                <w.icon size={16} style={{ color: 'var(--color-text-muted)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  {w.name}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {w.description}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={w.enabled}
                aria-label={`Toggle ${w.name}`}
                onClick={() => onToggle(w.id)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                  w.enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white border border-gray-300 shadow-sm transition-transform ${
                    w.enabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                  style={{ marginTop: '2px' }}
                />
              </button>
            </div>
          ))}
        </div>

        <div className="p-5 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <button onClick={onClose} className="btn-primary w-full justify-center text-sm">
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardSettings;
