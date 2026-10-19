import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { TRAVEL_CATEGORIES, TRAVEL_CATEGORY_LABEL, formatMoney, type TravelCategory } from './payment-request';
import { totalsByCategory } from './lines';

type CategoryAmount = { category: TravelCategory | null; amount: number | null };

interface PlanVsActualProps {
  planned: readonly CategoryAmount[];
  actual: readonly CategoryAmount[];
  className?: string;
}

/** Rencana vs realisasi per travel category, with the overall difference. */
export function PlanVsActual({ planned, actual, className }: PlanVsActualProps) {
  const { t } = useTranslation('finance');
  const plan = totalsByCategory(planned);
  const real = totalsByCategory(actual);
  const rows = TRAVEL_CATEGORIES.filter((c) => (plan.get(c) ?? 0) > 0 || (real.get(c) ?? 0) > 0);
  const planTotal = [...plan.values()].reduce((s, v) => s + v, 0);
  const realTotal = [...real.values()].reduce((s, v) => s + v, 0);
  const diffClass = (d: number) => (d > 0 ? 'text-danger' : d < 0 ? 'text-success-text' : 'text-muted-foreground');
  const diffText = (d: number) => (d === 0 ? '—' : `${d > 0 ? '+' : '—'}${formatMoney(Math.abs(d))}`);

  return (
    // Scrollable region must be keyboard-focusable (axe: scrollable-region-focusable).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div role="region" aria-label={t('planVsActual.label')} tabIndex={0} className={cn('relative overflow-x-auto rounded-lg border border-border', className)}>
      <table className="w-full min-w-[26rem] text-sm">
        <caption className="sr-only">{t('planVsActual.caption')}</caption>
        <thead>
          <tr className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-3 py-2 text-left font-medium">{t('planVsActual.category')}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t('planVsActual.planned')}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t('planVsActual.actual')}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t('planVsActual.difference')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((c) => {
            const p = plan.get(c) ?? 0;
            const r = real.get(c) ?? 0;
            return (
              <tr key={c}>
                <th scope="row" className="px-3 py-2 text-left font-normal text-foreground">{TRAVEL_CATEGORY_LABEL[c]}</th>
                <td className="num px-3 py-2 text-right text-muted-foreground">{formatMoney(p)}</td>
                <td className="num px-3 py-2 text-right text-foreground">{formatMoney(r)}</td>
                <td className={cn('num px-3 py-2 text-right', diffClass(r - p))}>{diffText(Math.round((r - p) * 100) / 100)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/30 font-semibold">
            <th scope="row" className="px-3 py-2 text-left">{t('planVsActual.total')}</th>
            <td className="num px-3 py-2 text-right">{formatMoney(planTotal)}</td>
            <td className="num px-3 py-2 text-right">{formatMoney(realTotal)}</td>
            <td className={cn('num px-3 py-2 text-right', diffClass(realTotal - planTotal))}>{diffText(Math.round((realTotal - planTotal) * 100) / 100)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
