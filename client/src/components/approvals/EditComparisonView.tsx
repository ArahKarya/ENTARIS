/**
 * Before/after comparison for approval requests that MUTATE an existing
 * document ('ProductionRunEdit', 'PurchaseInvoiceRevisePrice'). Rows come
 * pre-computed from the server (comparison builder); changed rows carry a
 * "Berubah" label + icon so colour is never the only signal.
 */
import { ArrowRight, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { EMPTY_VALUE } from '@/lib/format';
import { formatComparisonValue, type ApprovalComparison } from './comparison';

interface Props {
  comparison: ApprovalComparison | null | undefined;
  loading: boolean;
  amountText: string;
  onViewTarget?: () => void;
}

export function EditComparisonView({ comparison, loading, amountText, onViewTarget }: Props) {
  const { t } = useTranslation('approvals');
  if (loading) return <p className="text-sm text-muted-foreground" role="status">{t('comparison.loading')}</p>;
  if (!comparison) {
    return (
      <p className="rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning-text">
        {t('comparison.unavailable')}
      </p>
    );
  }
  const changedCount = comparison.sections.reduce((s, sec) => s + sec.rows.filter((r) => r.changed).length, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t('comparison.changedDocument')}</p>
          <p className="font-medium text-foreground">
            <span className="num">{comparison.targetNumber ?? EMPTY_VALUE}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">{comparison.amountLabel}</p>
          <p className="num font-semibold text-foreground">{amountText}</p>
        </div>
        {onViewTarget && comparison.targetId && (
          <Button size="sm" variant="outline" onClick={onViewTarget} aria-label={t('comparison.openDocumentAria', { number: comparison.targetNumber ?? '' })}>
            <ExternalLink aria-hidden /> {t('comparison.openDocument')}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground" role="status">
        {changedCount > 0 ? t('comparison.changedCount', { count: changedCount }) : t('comparison.noChanges')} {t('comparison.appliedAfterApproval')}
      </p>
      {comparison.sections.map((sec) => (
        <section key={sec.title} aria-label={sec.title}>
          <h3 className="mb-1.5 text-xs font-semibold text-foreground">{sec.title}</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="px-2 sm:px-3">{t('comparison.columns.description')}</TableHead>
                  <TableHead className="w-[6.75rem] px-2 text-right sm:w-36 sm:px-3">{t('comparison.columns.current')}</TableHead>
                  <TableHead className="w-[6.75rem] px-2 text-right sm:w-36 sm:px-3">{t('comparison.columns.proposed')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sec.rows.map((r, i) => (
                  <TableRow key={`${r.label}-${i}`} className={cn(r.changed && 'bg-warning-subtle')}>
                    <TableCell className="whitespace-normal break-words px-2 text-sm sm:px-3">
                      {r.label}
                      {r.changed && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-sm border border-warning/40 px-1.5 text-[11px] font-medium text-warning-text">
                          <ArrowRight className="size-3" aria-hidden /> {t('comparison.changed')}
                        </span>
                      )}
                      {r.note && <span className="mt-0.5 block text-xs text-muted-foreground">{r.note}</span>}
                    </TableCell>
                    <TableCell className="num px-2 text-right text-sm sm:px-3">{formatComparisonValue(r.before, r.kind)}</TableCell>
                    <TableCell className={cn('num break-words px-2 text-right text-sm sm:px-3', r.changed && 'font-semibold')}>
                      {formatComparisonValue(r.after, r.kind)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}
    </div>
  );
}
