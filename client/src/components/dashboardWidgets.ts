import type React from 'react';
import { BarChart3, Clock, Users, AlertTriangle, PieChart, PackageX, Package, ArrowLeftRight, Layers, Factory, TrendingUp, Wallet, Scale, Truck, Percent, Building2, CalendarClock, Trophy, Calculator, Wrench } from 'lucide-react';

export interface WidgetConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  enabled: boolean;
}

export const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'attention-list', name: 'Perlu Perhatian', description: 'Faktur jatuh tempo, stok kritis, surat jalan tertunda, dan persetujuan menunggu', icon: AlertTriangle, enabled: true },
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
  { id: 'maintenance', name: 'Pemeliharaan', description: 'Ringkasan terlambat, perlu perhatian, dan daftar pemeliharaan/masa berlaku mendatang (jadwal, work order, kendaraan, dokumen)', icon: Wrench, enabled: true },
  { id: 'upcoming-due', name: 'Segera Jatuh Tempo', description: 'Faktur penjualan/pembelian yang jatuh tempo dalam 14 hari', icon: CalendarClock, enabled: true },
  // ─── Aset Tetap ───
  { id: 'fixed-assets-kpi', name: 'KPI Aset Tetap', description: 'Total aset, harga perolehan, akumulasi penyusutan, nilai buku', icon: Building2, enabled: true },
  { id: 'fixed-assets-by-category', name: 'Aset per Kategori', description: 'Distribusi nilai buku aset tetap per kategori (pie chart)', icon: PieChart, enabled: true },
  { id: 'depreciation-due', name: 'Penyusutan Mendatang', description: 'Jadwal depresiasi bulan ini + 5 entry upcoming', icon: CalendarClock, enabled: true },
  { id: 'top-assets', name: 'Top 10 Aset', description: 'Aset tetap dengan nilai buku tertinggi', icon: Trophy, enabled: true },
  // ─── Sales lanjutan ───
  { id: 'profitability-per-sku', name: 'Profitabilitas per SKU', description: 'Top 10 SKU dengan margin material vs loaded HPP', icon: Calculator, enabled: true },
  // ─── Produksi lanjutan ───
  { id: 'production-deep-dive', name: 'Production Deep Dive', description: 'KPI run + tren yield + top input/output + best/worst + loaded HPP', icon: Factory, enabled: true },
];
