import React, { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  BarChart3,
  BookOpen,
  Banknote,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
  Gauge,
  Package,
  Receipt,
  Scale,
  Search,
  Truck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { getRoute } from '@/app/routes';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { focusRing } from '@/components/ui/styles';
import { Input } from '@/components/ui/input';
import { EmptyState, PageHeader } from '@/components/shared';

interface ReportEntry {
  path: string;
  description: string;
  icon: LucideIcon;
}

interface ReportGroup {
  id: string;
  title: string;
  reports: readonly ReportEntry[];
}

// Judul kartu = label registry rute (sama dengan H1 halaman tujuan).
const GROUPS: readonly ReportGroup[] = [
  {
    id: 'keuangan',
    title: 'Keuangan',
    reports: [
      { path: '/reports/daily', icon: CalendarDays, description: 'Ringkasan lengkap aktivitas penjualan, pembelian, produksi, keuangan, piutang, hutang, dan deposit.' },
      { path: '/reports/trial-balance', icon: ClipboardList, description: 'Verifikasi keseimbangan saldo debit dan kredit per akun.' },
      { path: '/reports/profit-loss', icon: BarChart3, description: 'Ringkasan pendapatan dan beban untuk menghitung laba bersih.' },
      { path: '/reports/balance-sheet', icon: Scale, description: 'Posisi keuangan aset, liabilitas, dan ekuitas perusahaan.' },
      { path: '/reports/cash-flow', icon: Banknote, description: 'Pergerakan kas dari aktivitas operasi, investasi, dan pendanaan.' },
      { path: '/reports/ledger-book', icon: BookOpen, description: 'Detail mutasi per akun dengan saldo berjalan (debit, kredit, saldo).' },
      { path: '/reports/tax', icon: Receipt, description: 'Ringkasan PPN Keluaran, PPN Masukan, dan PPh berdasarkan periode.' },
    ],
  },
  {
    id: 'penjualan',
    title: 'Penjualan & Piutang',
    reports: [
      { path: '/reports/aging-ar', icon: Clock, description: 'Analisis umur piutang pelanggan berdasarkan tanggal jatuh tempo.' },
      { path: '/reports/receivable-schedule', icon: FileText, description: 'Daftar piutang berdasarkan jatuh tempo dan status penagihan.' },
      { path: '/reports/profitability-per-sku', icon: Package, description: 'Margin side-by-side: Material WAC vs Loaded HPP (sudah include biaya produksi & NRV produk samping).' },
    ],
  },
  {
    id: 'pembelian',
    title: 'Pembelian & Hutang',
    reports: [
      { path: '/reports/aging-ap', icon: Clock, description: 'Analisis umur hutang ke vendor berdasarkan tanggal jatuh tempo.' },
      { path: '/reports/payable-schedule', icon: CreditCard, description: 'Daftar hutang berdasarkan jatuh tempo, status, dan prioritas pembayaran.' },
      { path: '/reports/po-outstanding', icon: Truck, description: 'Sisa pesanan pembelian yang belum diterima per item, nilai sisa, dan PO terlambat.' },
      { path: '/reports/supplier-performance', icon: Award, description: 'Ketepatan kirim, lead time, fill rate, dan selisih harga faktur vs PO per pemasok.' },
    ],
  },
  {
    id: 'produksi',
    title: 'Produksi & Persediaan',
    reports: [
      { path: '/reports/hpp', icon: Package, description: 'Analisis Harga Pokok Penjualan per produk, margin, dan profitabilitas.' },
      { path: '/reports/production-cost-summary', icon: Package, description: 'Modal bahan baku murni/kg (angka real pembelian) vs HPP GL/kg per jenis output & gudang, lengkap rendemen dan produk samping.' },
      { path: '/reports/oee', icon: Gauge, description: 'Overall Equipment Effectiveness: Availability, Performance, Quality per mesin & shift, tren harian, dan Pareto downtime.' },
    ],
  },
];

interface Card extends ReportEntry {
  label: string;
  haystack: string;
}

/** Cards a user may open, with the registry label and searchable text. */
function buildGroups(query: string): { group: ReportGroup; cards: Card[] }[] {
  const q = query.trim().toLowerCase();
  return GROUPS.map((group) => ({
    group,
    cards: group.reports.flatMap<Card>((report) => {
      const route = getRoute(report.path);
      if (!route) return [];
      if (route.module && !can(route.module)) return [];
      const label = route.label;
      const haystack = [label, report.description, group.title, ...(route.keywords ?? [])].join(' ').toLowerCase();
      return q && !haystack.includes(q) ? [] : [{ ...report, label, haystack }];
    }),
  })).filter((entry) => entry.cards.length > 0);
}

const Reports: React.FC = () => {
  const [query, setQuery] = useState('');
  const searchId = useId();
  const groups = useMemo(() => buildGroups(query), [query]);
  const total = groups.reduce((sum, g) => sum + g.cards.length, 0);

  return (
    <div className="space-y-6 pb-8">
      <PageHeader title="Semua Laporan" description="Pilih laporan yang ingin Anda lihat atau cetak." />

      <div role="search" aria-label="Pencarian laporan" className="relative w-full sm:max-w-sm">
        <label htmlFor={searchId} className="sr-only">Cari laporan</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari laporan, mis. pajak, piutang, OEE"
          autoComplete="off"
          className="pl-9 pr-9 max-sm:h-11 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Hapus pencarian"
            className={cn('absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground', focusRing)}
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      <p className="sr-only" role="status">{total} laporan ditemukan</p>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            kind={query ? 'no-results' : 'empty'}
            title={query ? 'Laporan tidak ditemukan' : 'Belum ada laporan yang dapat diakses'}
            description={query ? 'Coba kata kunci lain.' : 'Hubungi administrator untuk meminta akses.'}
            compact
          />
        </div>
      ) : (
        groups.map(({ group, cards }) => (
          <section key={group.id} aria-labelledby={`grp-${group.id}`} className="space-y-3">
            <h2 id={`grp-${group.id}`} className="text-sm font-semibold text-muted-foreground">
              {group.title}
            </h2>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {cards.map((card) => (
                <li key={card.path}>
                  <Link
                    to={card.path}
                    className={cn(
                      'group flex h-full min-h-11 items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-1)] transition-colors hover:border-primary hover:bg-muted/40',
                      focusRing,
                    )}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:bg-primary-subtle group-hover:text-primary-subtle-foreground">
                      <card.icon className="size-[18px]" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{card.label}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{card.description}</span>
                    </span>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
};

export default Reports;
