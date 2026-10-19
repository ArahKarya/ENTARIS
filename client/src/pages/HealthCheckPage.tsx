/**
 * Data integrity checks (/health-check). A fix is previewed before it is POSTed; fixes mutate
 * ledger data, so they are shown only with audit:edit (the server gates the POST the same way).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronDown, ListChecks, Play, Wrench, XCircle, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import api from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, EmptyState, LoadingState, PageHeader, StatCard } from '@/components/shared';

type CheckStatus = 'ok' | 'warning' | 'error';

interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
  count: number;
  details?: Record<string, unknown>[];
  fixable: boolean;
}

interface HealthData {
  status: CheckStatus;
  checks: CheckResult[];
}

interface PreviewData {
  check: string;
  description: string;
  warning?: string;
  count: number;
  details: Record<string, unknown>[];
}

interface CheckInfo {
  title: string;
  /** What the automatic fix changes, stated up front in the confirmation. */
  fixKey?: string;
  fixEffect?: string;
}

type CheckKey = 'aleSync' | 'balanceDrift' | 'unbalancedJournals' | 'orphanAle' | 'stockMismatch' | 'warehouseDrift';

/** Server check name → `auth:healthCheck.checks.<key>` and the fix endpoint key. */
const CHECKS: Record<string, { key: CheckKey; fixKey?: string }> = {
  'ALE vs JournalItem Sync': { key: 'aleSync', fixKey: 'ale-sync' },
  'Account Balance Drift': { key: 'balanceDrift', fixKey: 'account-balance-drift' },
  'Unbalanced Journal Entries': { key: 'unbalancedJournals' },
  'Orphan ALE Entries': { key: 'orphanAle', fixKey: 'orphan-ale' },
  'Stock vs Movement Mismatch': { key: 'stockMismatch' },
  'Drift Stok per Gudang': { key: 'warehouseDrift' },
};

/** Translated title and fix text for a server check (unknown checks keep the server name). */
function checkInfo(name: string): CheckInfo {
  const known = CHECKS[name];
  if (!known) return { title: name };
  const title = i18n.t(`healthCheck.checks.${known.key}.title`, { ns: 'auth' });
  if (!known.fixKey) return { title };
  return {
    title,
    fixKey: known.fixKey,
    fixEffect: i18n.t(`healthCheck.fixEffects.${known.key as 'aleSync' | 'balanceDrift' | 'orphanAle'}`, { ns: 'auth' }),
  };
}

/** Label: `auth:healthCheck.status.<status>`. */
const STATUS: Record<CheckStatus, { icon: LucideIcon; className: string }> = {
  ok: { icon: CheckCircle2, className: 'text-success-text' },
  warning: { icon: AlertTriangle, className: 'text-warning-text' },
  error: { icon: XCircle, className: 'text-danger-text' },
};

const PREVIEW_ROWS = 50;

function StatusLabel({ status, className }: { status: CheckStatus; className?: string }) {
  const { t } = useTranslation('auth');
  const meta = STATUS[status];
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', meta.className, className)}>
      <Icon className="size-4 shrink-0" aria-hidden />
      {t(`healthCheck.status.${status}`)}
    </span>
  );
}

function formatColumnName(key: string): string {
  return key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCellValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'number') {
    return Number.isInteger(val) ? formatNumber(val) : formatNumber(val, { decimals: 2 });
  }
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function DetailTable({ rows, caption }: { rows: Record<string, unknown>[]; caption: string }) {
  if (rows.length === 0) return null;
  const keys = Object.keys(rows[0]);
  return (
    // Focusable so keyboard users can scroll wide tables horizontally (axe scrollable-region-focusable).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div role="region" aria-label={caption} tabIndex={0} className="max-w-full overflow-x-auto rounded-md border border-border focus-visible:outline-2 focus-visible:outline-ring">
      <table className="w-full text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            {keys.map((k) => (
              <th key={k} scope="col" className="whitespace-nowrap px-3 py-2 text-left font-medium">
                {formatColumnName(k)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border">
              {keys.map((k) => (
                <td key={k} className="whitespace-nowrap px-3 py-1.5 text-foreground">
                  {formatCellValue(row[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HealthCheckPage() {
  const { t } = useTranslation(['auth', 'common']);
  const queryClient = useQueryClient();
  const canFix = can('audit', 'edit');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<{ key: string; info: CheckInfo } | null>(null);

  const healthQuery = useQuery<HealthData>({
    queryKey: ['health-check'],
    queryFn: async () => (await api.get('/health-check')).data.data,
  });

  const previewQuery = useQuery<PreviewData>({
    queryKey: ['health-check-preview', confirm?.key],
    queryFn: async () => (await api.get(`/health-check/preview/${confirm!.key}`)).data.data,
    enabled: !!confirm,
  });

  const fixMutation = useMutation({
    mutationFn: async (key: string) => (await api.post(`/health-check/fix/${key}`)).data.data as { message: string },
    onSuccess: (result) => {
      toast.success(result.message);
      queryClient.invalidateQueries({ queryKey: ['health-check'] });
    },
    onError: () => toast.error(t('healthCheck.fixFailed')),
  });

  const data = healthQuery.data;
  const checks = data?.checks ?? [];
  const counts = { ok: 0, warning: 0, error: 0 } as Record<CheckStatus, number>;
  for (const c of checks) counts[c.status] += 1;
  const issues = checks.reduce((sum, c) => sum + (c.status === 'ok' ? 0 : c.count), 0);
  const ranAt = healthQuery.dataUpdatedAt ? formatDateTime(healthQuery.dataUpdatedAt) : null;
  const loadingKpi = !data && !healthQuery.isError;

  const preview = previewQuery.data;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={t('healthCheck.title')}
        description={ranAt ? t('healthCheck.descriptionRan', { time: ranAt }) : t('healthCheck.description')}
        actions={
          <Button onClick={() => healthQuery.refetch()} loading={healthQuery.isFetching}>
            <Play aria-hidden />
            {t('healthCheck.run')}
          </Button>
        }
      />

      <section aria-label={t('healthCheck.summaryLabel')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('healthCheck.overall')}
          icon={ListChecks}
          loading={loadingKpi}
          value={data ? t(`healthCheck.status.${data.status}`) : '—'}
          hint={data ? t('healthCheck.passed', { ok: formatNumber(counts.ok), total: formatNumber(checks.length) }) : undefined}
        />
        <StatCard label={t('healthCheck.status.ok')} icon={CheckCircle2} loading={loadingKpi} value={data ? formatNumber(counts.ok) : '—'} />
        <StatCard
          label={t('healthCheck.status.warning')}
          icon={AlertTriangle}
          loading={loadingKpi}
          value={data ? formatNumber(counts.warning) : '—'}
        />
        <StatCard
          label={t('healthCheck.status.error')}
          icon={XCircle}
          loading={loadingKpi}
          value={data ? formatNumber(counts.error) : '—'}
          hint={data ? t('healthCheck.findings', { count: issues, formatted: formatNumber(issues) }) : undefined}
        />
      </section>

      {healthQuery.isLoading && <LoadingState label={t('healthCheck.loading')} />}
      {healthQuery.isError && !data && (
        <EmptyState
          kind="error"
          title={t('healthCheck.errorTitle')}
          description={t('healthCheck.errorDescription')}
          action={
            <Button size="sm" variant="outline" onClick={() => healthQuery.refetch()}>
              {t('common:actions.retry')}
            </Button>
          }
        />
      )}

      {data && (
        <ul aria-label={t('healthCheck.listLabel')} className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {checks.map((check) => {
            const info = checkInfo(check.name);
            const details = check.details ?? [];
            const isOpen = !!expanded[check.name];
            const panelId = `check-${check.name.replace(/\W+/g, '-')}`;
            const showFix = canFix && check.status !== 'ok' && check.fixable && !!info.fixKey;
            return (
              <li key={check.name} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <StatusLabel status={check.status} />
                      <h2 className="text-sm font-semibold text-foreground">{info.title}</h2>
                    </div>
                    <p className="break-words text-sm text-muted-foreground">{check.message}</p>
                    {check.status !== 'ok' && check.count > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {t('healthCheck.findings', { count: check.count, formatted: formatNumber(check.count) })}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {details.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        onClick={() => setExpanded((prev) => ({ ...prev, [check.name]: !prev[check.name] }))}
                      >
                        <ChevronDown className={cn('transition-transform', isOpen && 'rotate-180')} aria-hidden />
                        {isOpen ? t('healthCheck.hideDetail') : t('healthCheck.showDetail')}
                      </Button>
                    )}
                    {showFix && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirm({ key: info.fixKey!, info })}
                        disabled={fixMutation.isPending}
                      >
                        <Wrench aria-hidden />
                        {t('healthCheck.fix')}
                      </Button>
                    )}
                  </div>
                </div>
                {isOpen && details.length > 0 && (
                  <div id={panelId} className="mt-3">
                    <DetailTable rows={details} caption={t('healthCheck.detailCaption', { title: info.title })} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        tone="danger"
        title={confirm ? t('healthCheck.confirmTitle', { title: confirm.info.title }) : ''}
        description={confirm?.info.fixEffect}
        confirmLabel={t('healthCheck.confirmLabel')}
        loading={previewQuery.isLoading}
        onConfirm={() => fixMutation.mutateAsync(confirm!.key)}
      >
        <div className="max-h-[50dvh] min-w-0 space-y-3 overflow-y-auto text-sm">
          {previewQuery.isLoading && <p className="text-muted-foreground">{t('healthCheck.previewLoading')}</p>}
          {previewQuery.isError && <p className="text-danger-text">{t('healthCheck.previewFailed')}</p>}
          {preview && (
            <>
              <p className="font-medium text-foreground">{preview.description}</p>
              {preview.warning && (
                <p className="rounded-md bg-warning-subtle px-3 py-2 text-warning-text">{preview.warning}</p>
              )}
              <DetailTable rows={preview.details.slice(0, PREVIEW_ROWS)} caption={t('healthCheck.previewCaption')} />
              {preview.details.length > PREVIEW_ROWS && (
                <p className="text-xs text-muted-foreground">
                  {t('healthCheck.previewTruncated', {
                    shown: formatNumber(PREVIEW_ROWS),
                    total: formatNumber(preview.details.length),
                  })}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{t('healthCheck.auditNote')}</p>
            </>
          )}
        </div>
      </ConfirmDialog>
    </div>
  );
}
