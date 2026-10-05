import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, BellRing, CheckCircle2, FileWarning, PackageX, ShieldCheck, Truck, Wrench, type LucideIcon } from 'lucide-react';
import api from '../../lib/api';
import { formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { ScrollRegion } from '../dashboard-kit/ScrollRegion';
import { useMaintenanceDashboard } from './maintenanceData';

interface OverdueItem {
  type: 'sales' | 'purchase';
  amount: number;
  daysOverdue: number;
}
interface StockAlertRow {
  status: string;
}
interface PendingDoRow {
  ageDays: number;
}
interface NegativeRow {
  id: string;
}

type Tone = 'danger' | 'warning' | 'info';

interface Row {
  key: string;
  icon: LucideIcon;
  tone: Tone;
  title: string;
  detail: string;
  href: string;
}

const TONE: Record<Tone, string> = {
  danger: 'bg-danger-subtle text-danger-text',
  warning: 'bg-warning-subtle text-warning-text',
  info: 'bg-info-subtle text-info-text',
};

const POLL_MS = 60_000;

interface Props {
  canFinance: boolean;
  canApprovals: boolean;
  /** Any EAM module (ga_maintenance / ga_vehicle / ga_documents) + widget enabled. */
  canMaintenance?: boolean;
}

/**
 * "Perlu perhatian": one prioritised list over data the dashboard already fetches
 * (same query keys as the individual widgets, so requests are shared via the cache).
 * Finance-only sources follow the same gating as their widgets.
 */
export default function AttentionList({ canFinance, canApprovals, canMaintenance = false }: Props) {
  const overdue = useQuery<OverdueItem[]>({
    queryKey: ['dashboard-overdue'],
    queryFn: async () => (await api.get('/dashboard/overdue')).data,
    enabled: canFinance,
  });
  const pendingDo = useQuery<PendingDoRow[]>({
    queryKey: ['dashboard-pending-do'],
    queryFn: async () => (await api.get('/dashboard/pending-do')).data,
    refetchInterval: POLL_MS,
    enabled: canFinance,
  });
  const stock = useQuery<StockAlertRow[]>({
    queryKey: ['dashboard-stock-alerts'],
    queryFn: async () => (await api.get('/dashboard/stock-alerts')).data,
  });
  const negative = useQuery<NegativeRow[]>({
    queryKey: ['dashboard-negative-stock'],
    queryFn: async () => (await api.get('/dashboard/negative-stock')).data,
    refetchInterval: POLL_MS,
  });
  const approvals = useQuery<unknown[]>({
    queryKey: ['dashboard-pending-approvals'],
    queryFn: async () => (await api.get('/approvals/requests', { params: { status: 'Pending' } })).data,
    enabled: canApprovals,
  });

  const maintenance = useMaintenanceDashboard(canMaintenance);

  const queries = [
    ...(canMaintenance ? [maintenance] : []),
    ...(canFinance ? [overdue, pendingDo] : []),
    stock,
    negative,
    ...(canApprovals ? [approvals] : []),
  ];
  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);

  const rows: Row[] = [];
  const ar = (overdue.data ?? []).filter((o) => o.type === 'sales');
  const ap = (overdue.data ?? []).filter((o) => o.type === 'purchase');
  if (ar.length > 0) {
    const oldest = Math.max(...ar.map((o) => o.daysOverdue));
    rows.push({
      key: 'ar',
      icon: FileWarning,
      tone: 'danger',
      title: `${ar.length} faktur penjualan jatuh tempo`,
      detail: `${formatRupiah(ar.reduce((s, o) => s + o.amount, 0), { compact: true })}, terlama ${oldest} hari`,
      href: '/reports/aging-ar',
    });
  }
  if (ap.length > 0) {
    const oldest = Math.max(...ap.map((o) => o.daysOverdue));
    rows.push({
      key: 'ap',
      icon: FileWarning,
      tone: 'warning',
      title: `${ap.length} faktur pembelian jatuh tempo`,
      detail: `${formatRupiah(ap.reduce((s, o) => s + o.amount, 0), { compact: true })}, terlama ${oldest} hari`,
      href: '/reports/aging-ap',
    });
  }
  const outOfStock = (stock.data ?? []).filter((s) => s.status === 'Habis').length;
  const low = (stock.data?.length ?? 0) - outOfStock;
  if ((stock.data?.length ?? 0) > 0) {
    rows.push({
      key: 'stock',
      icon: PackageX,
      tone: outOfStock > 0 ? 'danger' : 'warning',
      title: `${stock.data?.length ?? 0} item stok kritis`,
      detail: `${outOfStock} habis, ${low} di bawah minimum`,
      href: '/inventory',
    });
  }
  if ((negative.data?.length ?? 0) > 0) {
    rows.push({
      key: 'negative',
      icon: PackageX,
      tone: 'danger',
      title: `${negative.data?.length} item stok minus`,
      detail: 'Input produksi/penerimaan agar stok kembali positif',
      href: '/inventory',
    });
  }
  if ((pendingDo.data?.length ?? 0) > 0) {
    const old = (pendingDo.data ?? []).filter((d) => d.ageDays >= 5).length;
    rows.push({
      key: 'do',
      icon: Truck,
      tone: old > 0 ? 'warning' : 'info',
      title: `${pendingDo.data?.length} surat jalan belum difakturkan`,
      detail: old > 0 ? `${old} sudah 5 hari atau lebih` : 'Belum ada yang lewat 5 hari',
      href: '/delivery-orders',
    });
  }
  if ((approvals.data?.length ?? 0) > 0) {
    rows.push({
      key: 'approval',
      icon: ShieldCheck,
      tone: 'info',
      title: `${approvals.data?.length} pengajuan menunggu persetujuan`,
      detail: 'Buka kotak masuk persetujuan',
      href: '/approvals',
    });
  }

  for (const m of maintenance.data?.attention ?? []) {
    rows.push({
      key: m.key,
      icon: Wrench,
      tone: m.tone,
      title: m.title,
      detail: m.detail,
      href: m.href,
    });
  }

  return (
    <WidgetCard
      title="Perlu Perhatian"
      description="Hal yang butuh tindakan hari ini"
      icon={BellRing}
      isLoading={isLoading}
      isError={isError && rows.length === 0}
      onRetry={() => queries.forEach((q) => void q.refetch())}
      isEmpty={rows.length === 0}
      emptyIcon={CheckCircle2}
      emptyText="Tidak ada yang perlu ditindaklanjuti"
      minHeight={140}
    >
      <ScrollRegion label="Daftar hal yang perlu perhatian" className="max-h-[19rem] overflow-y-auto">
      <ul className="divide-y divide-border">
        {rows.map(({ key, icon: Icon, tone, title, detail, href }) => (
          <li key={key}>
            <Link
              to={href}
              className="flex min-h-11 items-center gap-3 rounded-sm py-2.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', TONE[tone])}>
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{title}</span>
                <span className="block truncate text-xs text-muted-foreground">{detail}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      </ScrollRegion>
    </WidgetCard>
  );
}
