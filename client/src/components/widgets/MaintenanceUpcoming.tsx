import { Link } from 'react-router-dom';
import { CheckCircle2, Wrench } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { ScrollRegion } from '../dashboard-kit/ScrollRegion';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { useMaintenanceDashboard, type MaintenanceDueState } from './maintenanceData';

const CHIP: Record<MaintenanceDueState, { label: string; variant: 'danger' | 'warning' | 'info' | 'neutral' }> = {
  overdue: { label: 'Terlambat', variant: 'danger' },
  today: { label: 'Hari ini', variant: 'warning' },
  soon: { label: 'Minggu ini', variant: 'warning' },
  scheduled: { label: 'Terjadwal', variant: 'neutral' },
};

function daysText(daysLeft: number): string {
  if (daysLeft < 0) return `${-daysLeft} hari lalu`;
  if (daysLeft === 0) return 'hari ini';
  return `${daysLeft} hari lagi`;
}

/** "Pemeliharaan mendatang": the next due items across schedules, work orders, vehicle papers and documents. */
export default function MaintenanceUpcoming() {
  const { data, isLoading, isError, refetch } = useMaintenanceDashboard(true);
  const rows = data?.upcoming ?? [];

  return (
    <WidgetCard
      title="Pemeliharaan Mendatang"
      description="Jadwal, work order, dan masa berlaku terdekat"
      icon={Wrench}
      href="/ga/maintenance"
      hrefLabel="Pemeliharaan"
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && rows.length === 0}
      emptyIcon={CheckCircle2}
      emptyText="Tidak ada jadwal pemeliharaan mendatang"
    >
      <ScrollRegion label="Daftar pemeliharaan mendatang" className="max-h-80 overflow-y-auto">
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const chip = CHIP[r.state];
            return (
              <li key={r.key}>
                <Link
                  to={r.href}
                  className="flex min-h-11 items-center gap-3 rounded-sm py-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{r.assetName ?? r.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.kindLabel}
                      {r.assetName && r.title !== r.kindLabel ? ` · ${r.title}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 space-y-0.5 text-right">
                    <Badge variant={chip.variant}>{chip.label}</Badge>
                    <p className="num text-xs text-muted-foreground">
                      {formatDate(r.dueAt)} · {daysText(r.daysLeft)}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </ScrollRegion>
    </WidgetCard>
  );
}
