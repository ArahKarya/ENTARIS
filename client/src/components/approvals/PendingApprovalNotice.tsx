import { Clock } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { StatusBadge } from '@/components/shared';

/** Badge for headers. */
export function PendingApprovalBadge() {
  const { t } = useTranslation('approvals');
  return <StatusBadge status="pending" label={t('pendingNotice.badge')} />;
}

/** Inline notice explaining why edit/revise is disabled. */
export function PendingApprovalNotice({ what }: { what: string }) {
  const { t } = useTranslation('approvals');
  return (
    <div role="status" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning-text">
      <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <Trans
          t={t}
          i18nKey="pendingNotice.message"
          values={{ what }}
          components={{ strong: <span className="font-medium" /> }}
        />
      </span>
    </div>
  );
}
