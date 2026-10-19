/** Queue summary strip around the shared <ApprovalPanel/>; counts reuse its cached responses. */
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Clock3, Hourglass, RotateCcw } from 'lucide-react';
import { cap } from '@/lib/permissions';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  approvalRequestsKey,
  fetchApprovalRequests,
  formatQueueCount,
  oldestWaitingDays,
  type ApprovalQueueStatus,
} from './approval-queue';

const DOC_TYPE = 'ProductionRun';

function useQueue(status: ApprovalQueueStatus) {
  return useQuery({
    queryKey: approvalRequestsKey(DOC_TYPE, status),
    queryFn: () => fetchApprovalRequests(DOC_TYPE, status),
    refetchInterval: 30_000,
  });
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Clock3;
  label: string;
  value: ReactNode;
  tone?: 'warning' | 'danger';
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-3 sm:px-4">
      <span
        className={cn(
          'hidden size-9 shrink-0 items-center sm:flex justify-center rounded-md',
          tone === 'danger'
            ? 'bg-danger-subtle text-danger-text'
            : tone === 'warning'
              ? 'bg-warning-subtle text-warning-text'
              : 'bg-primary-subtle text-primary-subtle-foreground',
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="line-clamp-2 text-xs text-muted-foreground sm:truncate">{label}</p>
        <p className="num font-heading text-lg font-semibold leading-6 text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function ProductionApprovalView({ children }: { children: ReactNode }) {
  const { t } = useTranslation('approvals');
  const pending = useQueue('Pending');
  const revision = useQueue('NeedsRevision');
  const pendingRows = pending.data ?? [];
  const oldest = oldestWaitingDays(pendingRows);
  const decider = cap('approval.decide');

  return (
    <div className="space-y-4">
      <section
        aria-label={t('productionQueue.summaryLabel')}
        className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-card shadow-[var(--shadow-1)]"
      >
        <Metric
          icon={Hourglass}
          label={decider ? t('productionQueue.awaitingDecision') : t('productionQueue.yourPending')}
          value={pending.data ? formatQueueCount(pendingRows.length) : '—'}
          tone={pendingRows.length > 0 ? 'warning' : undefined}
        />
        <Metric
          icon={RotateCcw}
          label={t('productionQueue.needsRevision')}
          value={revision.data ? formatQueueCount(revision.data.length) : '—'}
        />
        <Metric
          icon={Clock3}
          label={t('productionQueue.oldest')}
          value={pendingRows.length === 0 ? '—' : oldest === 0 ? t('productionQueue.today') : t('productionQueue.days', { count: oldest, value: formatNumber(oldest) })}
          tone={oldest >= 3 ? 'danger' : undefined}
        />
      </section>
      {children}
    </div>
  );
}
