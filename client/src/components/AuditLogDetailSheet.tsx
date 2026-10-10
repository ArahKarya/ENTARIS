/**
 * Detail sheet for one audit entry (Jejak Audit, ?log=<id>): who, when (relative
 * + absolute), what, and a field-by-field before/after diff of the stored JSON.
 * Values are rendered as stored — the server redacts secrets at write time.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/lib/format';
import {
  auditActionLabel,
  auditActionTone,
  diffAuditValues,
  formatAuditValue,
  formatRelativeTime,
  type DiffChange,
  type DiffRow,
} from '@/lib/auditDiff';
import { cn } from '@/lib/utils';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { LoadingState, StatusBadge } from '@/components/shared';

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValues: unknown;
  newValues: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user?: { fullName: string; email: string } | null;
}

interface AuditLogDetailSheetProps {
  open: boolean;
  log: AuditLogEntry | null;
  loading?: boolean;
  error?: boolean;
  onClose: () => void;
}

const CHANGE_CLASS: Record<DiffChange, string> = {
  added: 'text-success-text',
  removed: 'text-danger-text',
  changed: 'text-info-text',
  unchanged: 'text-muted-foreground',
};

function Detail({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

function Value({ value, tone }: { value: unknown; tone?: 'old' | 'new' }) {
  if (value === undefined) return <span className="text-muted-foreground">—</span>;
  return (
    <pre
      className={cn(
        'whitespace-pre-wrap break-all rounded px-1.5 py-0.5 font-mono text-xs',
        tone === 'old' && 'bg-danger-subtle text-danger-text',
        tone === 'new' && 'bg-success-subtle text-success-text',
      )}
    >
      {formatAuditValue(value)}
    </pre>
  );
}

function DiffList({ rows }: { rows: DiffRow[] }) {
  const { t } = useTranslation('settings');
  const changed = rows.filter((r) => r.change !== 'unchanged');
  const unchanged = rows.filter((r) => r.change === 'unchanged');
  const item = (r: DiffRow) => {
    return (
      <li key={r.key} className="space-y-1.5 border-b border-border py-3 last:border-b-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 break-all font-mono text-xs font-medium text-foreground">{r.key}</span>
          <span className={cn('shrink-0 text-xs font-medium', CHANGE_CLASS[r.change])}>{t(`auditLog.change.${r.change}`)}</span>
        </div>
        {r.change === 'changed' ? (
          <div className="grid gap-1.5 sm:grid-cols-2">
            <div className="min-w-0">
              <span className="sr-only">{t('auditLog.before')}: </span>
              <p aria-hidden className="mb-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{t('auditLog.before')}</p>
              <Value value={r.before} tone="old" />
            </div>
            <div className="min-w-0">
              <span className="sr-only">{t('auditLog.after')}: </span>
              <p aria-hidden className="mb-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{t('auditLog.after')}</p>
              <Value value={r.after} tone="new" />
            </div>
          </div>
        ) : (
          <Value
            value={r.change === 'removed' ? r.before : r.after}
            tone={r.change === 'added' ? 'new' : r.change === 'removed' ? 'old' : undefined}
          />
        )}
      </li>
    );
  };

  return (
    <div className="space-y-3">
      {changed.length > 0 ? (
        <ul className="rounded-md border border-border px-3">{changed.map(item)}</ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t('auditLog.noChanges')}</p>
      )}
      {unchanged.length > 0 && (
        <details className="rounded-md border border-border px-3 py-2">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {t('auditLog.unchangedCount', { count: unchanged.length })}
          </summary>
          <ul>{unchanged.map(item)}</ul>
        </details>
      )}
    </div>
  );
}

export default function AuditLogDetailSheet({ open, log, loading, error, onClose }: AuditLogDetailSheetProps) {
  const { t } = useTranslation('settings');
  const rows = log ? diffAuditValues(log.oldValues, log.newValues) : [];
  const hasBefore = log ? log.oldValues !== null && log.oldValues !== undefined : false;
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent size="md">
        <SheetHeader>
          <SheetTitle>{log ? `${auditActionLabel(log.action)} · ${log.entityType}` : t('auditLog.detailTitle')}</SheetTitle>
          <SheetDescription>
            {log ? `${formatRelativeTime(log.createdAt)} · ${formatDateTime(log.createdAt)}` : t('auditLog.loadingEntry')}
          </SheetDescription>
        </SheetHeader>
        {/* Focusable so the scrollable body works by keyboard (no other focusable content inside). */}
        <SheetBody className="space-y-6" role="region" aria-label={t('auditLog.bodyLabel')} tabIndex={0}>
          {loading && <LoadingState label={t('auditLog.loading')} />}
          {error && !log && <p className="text-sm text-danger-text">{t('auditLog.notFound')}</p>}
          {log && (
            <>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Detail label={t('auditLog.fields.action')}>
                  <StatusBadge label={auditActionLabel(log.action)} tone={auditActionTone(log.action)} />{' '}
                  <span className="font-mono text-xs text-muted-foreground">{log.action}</span>
                </Detail>
                <Detail label={t('auditLog.fields.time')}>
                  <time dateTime={log.createdAt}>{formatDateTime(log.createdAt)}</time>
                  <span className="block text-xs text-muted-foreground">{formatRelativeTime(log.createdAt)}</span>
                </Detail>
                <Detail label={t('auditLog.fields.user')}>
                  {log.user?.fullName ?? '—'}
                  {log.user?.email && <span className="block text-xs text-muted-foreground">{log.user.email}</span>}
                </Detail>
                <Detail label={t('auditLog.fields.entity')}>{log.entityType}</Detail>
                <Detail label={t('auditLog.fields.entityId')}>
                  <span className="break-all font-mono text-xs">{log.entityId}</span>
                </Detail>
                <Detail label={t('auditLog.fields.ipAddress')}>
                  <span className="font-mono text-xs">{log.ipAddress ?? '—'}</span>
                </Detail>
                {log.userAgent && (
                  <Detail label={t('auditLog.fields.userAgent')} className="sm:col-span-2">
                    <span className="break-all text-xs text-muted-foreground">{log.userAgent}</span>
                  </Detail>
                )}
              </dl>

              <section aria-labelledby="audit-diff-title" className="space-y-2">
                <h3 id="audit-diff-title" className="text-sm font-semibold text-foreground">
                  {t('auditLog.valueChanges')}
                </h3>
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('auditLog.noValues')}</p>
                ) : hasBefore ? (
                  <DiffList rows={rows} />
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {log.action === 'CREATE'
                        ? t('auditLog.createdValues')
                        : t('auditLog.noPreviousValues')}
                    </p>
                    <dl className="rounded-md border border-border px-3">
                      {rows.map((r) => (
                        <div key={r.key} className="space-y-1 border-b border-border py-2.5 last:border-b-0">
                          <dt className="break-all font-mono text-xs font-medium text-foreground">{r.key}</dt>
                          <dd>
                            <Value value={r.after} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </>
                )}
                <p className="text-xs text-muted-foreground">
                  {t('auditLog.secretsMasked')}
                </p>
              </section>
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
