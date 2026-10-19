import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/shared';
import { cn } from '@/lib/utils';
import {
  AS_OF_PRESETS,
  RANGE_PRESETS,
  asOfForPreset,
  detectAsOfPreset,
  detectRangePreset,
  isIsoDate,
  isRangeValid,
  rangeForPreset,
  type DateRange,
} from './period';

type Props =
  | { mode: 'range'; value: DateRange; onChange: (range: DateRange) => void }
  | { mode: 'asOf'; value: string; onChange: (date: string) => void };

export type ReportFiltersProps = Props & {
  /** Extra controls (search, select…) rendered after the period. */
  children?: ReactNode;
  className?: string;
  /** Range mode only: adds a "Semua histori" chip that clears both dates (empty = no date filter). Pair with useReportRange({ startDate: '', endDate: '' }). */
  allowAll?: boolean;
};

const CHIP = 'max-sm:h-11';

/**
 * Period presets + custom dates. Presets apply immediately; "Kustom" reveals
 * date inputs that only apply on "Terapkan" (so half-typed dates never fire a query).
 */
export function ReportFilters(props: ReportFiltersProps) {
  const { t } = useTranslation('reports');
  const { children, className, allowAll } = props;
  const isRange = props.mode === 'range';
  const current = isRange ? props.value : null;
  const currentKey = isRange ? `${current!.startDate}|${current!.endDate}` : (props.value as string);

  const today = new Date();
  const isAll = !!allowAll && isRange && !current!.startDate && !current!.endDate;
  const active: string = isAll ? 'all' : isRange ? detectRangePreset(props.value as DateRange, today) : detectAsOfPreset(props.value as string, today);
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(() =>
    isRange ? (props.value as DateRange) : { startDate: props.value as string, endDate: props.value as string },
  );
  const [prevKey, setPrevKey] = useState(currentKey);
  if (prevKey !== currentKey) {
    setPrevKey(currentKey);
    setDraft(isRange ? (props.value as DateRange) : { startDate: props.value as string, endDate: props.value as string });
  }

  const showCustom = customOpen || active === 'custom';
  const draftValid = isRange ? isRangeValid(draft) : isIsoDate(draft.startDate);
  const dirty = isRange ? currentKey !== `${draft.startDate}|${draft.endDate}` : draft.startDate !== props.value;

  const choose = (id: string) => {
    setCustomOpen(false);
    if (props.mode === 'range') props.onChange(rangeForPreset(id as (typeof RANGE_PRESETS)[number]['id']));
    else props.onChange(asOfForPreset(id as (typeof AS_OF_PRESETS)[number]['id']));
  };

  const apply = () => {
    if (!draftValid) return;
    if (props.mode === 'range') props.onChange(draft);
    else props.onChange(draft.startDate);
  };

  const presets = isRange ? RANGE_PRESETS : AS_OF_PRESETS;

  return (
    <section aria-label={t('kit.filters.label')} className={cn('no-print flex flex-col gap-3', className)} data-no-print>
      <div role="group" aria-label={isRange ? t('kit.filters.choosePeriod') : t('kit.filters.chooseAsOf')} className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <Button
            key={p.id}
            size="sm"
            className={CHIP}
            variant={active === p.id && !customOpen ? 'primary' : 'outline'}
            aria-pressed={active === p.id && !customOpen}
            onClick={() => choose(p.id)}
          >
            {t(p.labelKey)}
          </Button>
        ))}
        {allowAll && isRange && (
          <Button
            size="sm"
            className={CHIP}
            variant={isAll && !customOpen ? 'primary' : 'outline'}
            aria-pressed={isAll && !customOpen}
            onClick={() => {
              setCustomOpen(false);
              if (props.mode === 'range') props.onChange({ startDate: '', endDate: '' });
            }}
          >
            {t('kit.filters.allHistory')}
          </Button>
        )}
        <Button
          size="sm"
          className={CHIP}
          variant={showCustom ? 'primary' : 'outline'}
          aria-pressed={showCustom}
          onClick={() => setCustomOpen(true)}
        >
          {t('kit.filters.custom')}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {showCustom && (
          <>
            {isRange && (
              <div className="grid gap-1.5">
                <Label htmlFor="report-start">{t('kit.filters.startDate')}</Label>
                <DateInput
                  id="report-start"
                  className="w-40 max-sm:w-[calc(50%-0.375rem)] max-sm:min-w-36"
                  value={draft.startDate}
                  onChange={(v) => setDraft((d) => ({ ...d, startDate: v }))}
                />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="report-end">{isRange ? t('kit.filters.endDate') : t('kit.filters.asOfDate')}</Label>
              <DateInput
                id="report-end"
                className="w-40 max-sm:min-w-36"
                value={isRange ? draft.endDate : draft.startDate}
                onChange={(v) => setDraft((d) => (isRange ? { ...d, endDate: v } : { startDate: v, endDate: v }))}
              />
            </div>
            <Button className="max-sm:h-11" onClick={apply} disabled={!draftValid || !dirty}>
              {t('kit.filters.apply')}
            </Button>
            {isRange && !draftValid && draft.startDate && draft.endDate && (
              <p role="alert" className="basis-full text-xs text-danger-text">
                {t('kit.filters.invalidRange')}
              </p>
            )}
          </>
        )}
        {children}
      </div>
    </section>
  );
}
