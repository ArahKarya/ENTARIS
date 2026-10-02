import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Scale, Clock, ClipboardList, Banknote, ChevronRight, Receipt, BookOpen, Package, CreditCard, FileText, CalendarDays, Gauge } from 'lucide-react';

const reports = [
  {
    title: 'Laporan Harian',
    description: 'Ringkasan lengkap aktivitas penjualan, pembelian, produksi, keuangan, piutang, hutang, dan deposit.',
    icon: CalendarDays,
    path: '/reports/daily',
  },
  {
    title: 'Neraca Saldo',
    description: 'Verifikasi keseimbangan saldo debit dan kredit per akun.',
    icon: ClipboardList,
    path: '/reports/trial-balance',
  },
  {
    title: 'Laba Rugi',
    description: 'Ringkasan pendapatan dan beban untuk menghitung laba bersih.',
    icon: BarChart3,
    path: '/reports/profit-loss',
  },
  {
    title: 'Neraca',
    description: 'Posisi keuangan aset, liabilitas, dan ekuitas perusahaan.',
    icon: Scale,
    path: '/reports/balance-sheet',
  },
  {
    title: 'Aging Piutang',
    description: 'Analisis umur piutang pelanggan berdasarkan tanggal jatuh tempo.',
    icon: Clock,
    path: '/reports/aging-ar',
  },
  {
    title: 'Aging Hutang',
    description: 'Analisis umur hutang ke vendor berdasarkan tanggal jatuh tempo.',
    icon: Clock,
    path: '/reports/aging-ap',
  },
  {
    title: 'Arus Kas',
    description: 'Pergerakan kas dari aktivitas operasi, investasi, dan pendanaan.',
    icon: Banknote,
    path: '/reports/cash-flow',
  },
  {
    title: 'Buku Besar',
    description: 'Detail mutasi per akun dengan saldo berjalan (debit, kredit, saldo).',
    icon: BookOpen,
    path: '/reports/ledger-book',
  },
  {
    title: 'Laporan Pajak',
    description: 'Ringkasan PPN Keluaran, PPN Masukan, dan PPh berdasarkan periode.',
    icon: Receipt,
    path: '/reports/tax',
  },
  {
    title: 'HPP per Produk',
    description: 'Analisis Harga Pokok Penjualan per produk, margin, dan profitabilitas.',
    icon: Package,
    path: '/reports/hpp',
  },
  {
    title: 'Profitability per SKU (Loaded)',
    description: 'Margin side-by-side: Material WAC vs Loaded HPP (sudah include biaya produksi & NRV produk samping).',
    icon: Package,
    path: '/reports/profitability-per-sku',
  },
  {
    title: 'Modal Produksi per Periode',
    description: 'Modal bahan baku murni/kg (angka real pembelian) vs HPP GL/kg per jenis output & gudang, lengkap rendemen dan produk samping.',
    icon: Package,
    path: '/reports/production-cost-summary',
  },
  {
    title: 'Laporan OEE',
    description: 'Overall Equipment Effectiveness: Availability, Performance, Quality per mesin & shift, tren harian, dan Pareto downtime.',
    icon: Gauge,
    path: '/reports/oee',
  },
  {
    title: 'Jadwal Hutang',
    description: 'Daftar hutang berdasarkan jatuh tempo, status, dan prioritas pembayaran.',
    icon: CreditCard,
    path: '/reports/payable-schedule',
  },
  {
    title: 'Jadwal Piutang',
    description: 'Daftar piutang berdasarkan jatuh tempo dan status penagihan.',
    icon: FileText,
    path: '/reports/receivable-schedule',
  },
];

const Reports: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-5 pb-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Laporan Keuangan</h1>
        <p className="text-sm text-gray-500 mt-0.5">Pilih laporan yang ingin Anda lihat atau cetak.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((report) => (
          <button
            key={report.path}
            onClick={() => navigate(report.path)}
            className="bg-white border border-gray-200 rounded-xl p-5 text-left hover:border-blue-300 hover:shadow-sm transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                <report.icon size={18} className="text-gray-500 group-hover:text-blue-600 transition-colors" />
              </div>
              <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-400 transition-colors mt-1" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
              {report.title}
            </h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{report.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
};

export default Reports;
