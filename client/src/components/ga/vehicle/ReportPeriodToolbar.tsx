/** Period select (+ custom date range) for the fleet and vehicle reports. */
import { useId, type ReactNode } from 'react';
import { CalendarRange } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/shared';
import { cn } from '@/lib/utils';
import { REPORT_PRESETS, type ReportPeriod, type ReportPreset } from './fleet-report-model';

interface Props {
  period: ReportPeriod;
  onPresetChange: (p: ReportPreset) => void;
  onRangeChange: (startDate: string, endDate: string) => void;
  children?: ReactNode;
  className?: string;
}

export function ReportPeriodToolbar({ period, onPresetChange, onRangeChange, children, className }: Props) {
  const id = useId();
  return (
    <div role="group" aria-label="Periode laporan" className={cn('flex flex-wrap items-center gap-2', className)}>
      <label htmlFor={`${id}-p`} className="sr-only">
        Periode
      </label>
      <Select value={period.preset} onValueChange={(v) => onPresetChange(v as ReportPreset)}>
        <SelectTrigger id={`${id}-p`} className="w-full sm:w-52">
          <CalendarRange className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent>
          {REPORT_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {period.preset === 'custom' ? (
        <fieldset className="flex w-full items-center gap-1.5 sm:w-auto">
          <legend className="sr-only">Rentang tanggal</legend>
          <label htmlFor={`${id}-f`} className="sr-only">Dari tanggal</label>
          <DateInput id={`${id}-f`} value={period.startDate} max={period.endDate} onChange={(v) => v && onRangeChange(v, period.endDate)} className="min-w-0 flex-1 sm:w-36 sm:flex-none" />
          <span className="text-muted-foreground" aria-hidden>–</span>
          <label htmlFor={`${id}-t`} className="sr-only">Sampai tanggal</label>
          <DateInput id={`${id}-t`} value={period.endDate} min={period.startDate} onChange={(v) => v && onRangeChange(period.startDate, v)} className="min-w-0 flex-1 sm:w-36 sm:flex-none" />
        </fieldset>
      ) : (
        <span className="num text-sm text-muted-foreground">{period.rangeLabel}</span>
      )}
      {children && <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">{children}</div>}
    </div>
  );
}
