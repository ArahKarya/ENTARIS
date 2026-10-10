import { Link } from 'react-router-dom';
import { CheckCircle2, Wrench } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { tEam } from '@/components/ga/eam-i18n';
import { Badge } from '@/components/ui/badge';
import { ScrollRegion } from '../dashboard-kit/ScrollRegion';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { useMaintenanceDashboard, type MaintenanceDueState, type MaintenanceKind } from './maintenanceData';
import { useTranslation } from 'react-i18next';

const CHIP: Record<MaintenanceDueState, 'danger' | 'warning' | 'info' | 'neutral'> = {
  overdue: 'danger',
  today: 'warning',
  soon: 'warning',
  scheduled: 'neutral',
};

function daysText(daysLeft: number): string {
  if (daysLeft < 0) return tEam('upcomingWidget.daysAgo', { count: -daysLeft });
  if (daysLeft === 0) return tEam('upcomingWidget.today');
  return tEam('upcomingWidget.inDays', { count: daysLeft });
}

/** Server sends Indonesian kind labels; translate the fixed ones (tax labels vary by type, kept as sent). */
function kindText(kind: MaintenanceKind, fallback: string): string {
  return kind === 'vehicleTax' ? fallback : tEam(`upcomingWidget.kind.${kind}`);
}

/** "Pemeliharaan mendatang": the next due items across schedules, work orders, vehicle papers and documents. */
export default function MaintenanceUpcoming() {
  const { t } = useTranslation('eam');
  const { data, isLoading, isError, refetch } = useMaintenanceDashboard(true);
  const rows = data?.upcoming ?? [];

  return (
    <WidgetCard
      title={t('upcomingWidget.title')}
      description={t('upcomingWidget.description')}
      icon={Wrench}
      href="/ga/maintenance"
      hrefLabel={t('upcomingWidget.link')}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && rows.length === 0}
      emptyIcon={CheckCircle2}
      emptyText={t('upcomingWidget.empty')}
    >
      <ScrollRegion label={t('upcomingWidget.listLabel')} className="max-h-80 overflow-y-auto">
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            return (
              <li key={r.key}>
                <Link
                  to={r.href}
                  className="flex min-h-11 items-center gap-3 rounded-sm py-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{r.assetName ?? r.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {kindText(r.kind, r.kindLabel)}
                      {r.assetName && r.title !== r.kindLabel ? ` · ${r.title}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 space-y-0.5 text-right">
                    <Badge variant={CHIP[r.state]}>{t(`upcomingWidget.state.${r.state}`)}</Badge>
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
