import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/shared';
import { formatMoney } from './payment-request';
import { MoneyInput } from './MoneyInput';
import { linesTotal, newLine, type DraftLine } from './lines';

interface LinesEditorProps {
  lines: DraftLine[];
  onChange: (lines: DraftLine[]) => void;
  error?: string;
}

/** Editable expense lines with a running total (stacked cards on mobile, a grid on desktop). */
export function LinesEditor({ lines, onChange, error }: LinesEditorProps) {
  const { t } = useTranslation('finance');
  const update = (key: string, patch: Partial<DraftLine>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => onChange(lines.filter((l) => l.key !== key));

  return (
    <div className="space-y-3">
      <div className="hidden grid-cols-[minmax(0,1fr)_10rem_11rem_2.25rem] gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
        <span>{t('linesEditor.description')}</span>
        <span>{t('linesEditor.expenseDate')}</span>
        <span className="text-right">{t('linesEditor.amount')}</span>
        <span className="sr-only">{t('linesEditor.remove')}</span>
      </div>
      <ol className="space-y-2">
        {lines.map((l, i) => (
          <li
            key={l.key}
            className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-card p-3 md:grid-cols-[minmax(0,1fr)_10rem_11rem_2.25rem] md:items-center md:border-0 md:bg-transparent md:p-0"
          >
            <Input
              aria-label={t('linesEditor.rowDescription', { n: i + 1 })}
              placeholder={t('linesEditor.descriptionPlaceholder')}
              value={l.description}
              maxLength={500}
              onChange={(e) => update(l.key, { description: e.target.value })}
              className="col-span-2 md:col-span-1"
            />
            <div>
              <label htmlFor={`${l.key}-date`} className="sr-only">
                {t('linesEditor.rowDate', { n: i + 1 })}
              </label>
              <DateInput id={`${l.key}-date`} value={l.expenseDate} onChange={(v) => update(l.key, { expenseDate: v })} />
            </div>
            <MoneyInput aria-label={t('linesEditor.rowAmount', { n: i + 1 })} value={l.amount} onChange={(v) => update(l.key, { amount: v })} />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('linesEditor.rowRemove', { n: i + 1 })}
              onClick={() => remove(l.key)}
              disabled={lines.length === 1}
              className="col-span-2 justify-self-end md:col-span-1"
            >
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, newLine()])} disabled={lines.length >= 100}>
          <Plus aria-hidden />
          {t('linesEditor.addRow')}
        </Button>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t('linesEditor.total')} <span className="num ml-2 text-lg font-semibold text-foreground">{formatMoney(linesTotal(lines))}</span>
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
