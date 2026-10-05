import React from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Field } from '@/components/shared/field';
import { DateInput } from '@/components/shared/date-input';

import { computePresetRange, type PeriodPreset } from './dashboardPeriod';
export type { PeriodPreset };

export interface PeriodRange {
  preset: PeriodPreset;
  startDate: string;
  endDate: string;
}

const PRESET_LABELS: Record<PeriodPreset, string> = {
  thisMonth: 'Bulan Ini',
  lastMonth: 'Bulan Lalu',
  thisQuarter: 'Kuartal Ini',
  ytd: 'Tahun Berjalan (YTD)',
  last12Months: '12 Bulan Terakhir',
  all: 'Seluruh Periode',
  custom: 'Kustom',
};

interface Props {
  value: PeriodRange;
  onChange: (r: PeriodRange) => void;
}

const DashboardPeriodFilter: React.FC<Props> = ({ value, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const [customStart, setCustomStart] = React.useState(value.startDate);
  const [customEnd, setCustomEnd] = React.useState(value.endDate);

  React.useEffect(() => {
    setCustomStart(value.startDate);
    setCustomEnd(value.endDate);
  }, [value.startDate, value.endDate]);

  const handlePreset = (preset: PeriodPreset) => {
    if (preset === 'custom') {
      onChange({ preset, startDate: customStart, endDate: customEnd });
      return;
    }
    const { startDate, endDate } = computePresetRange(preset);
    onChange({ preset, startDate, endDate });
    setOpen(false);
  };

  const applyCustom = () => {
    onChange({ preset: 'custom', startDate: customStart, endDate: customEnd });
    setOpen(false);
  };

  const label = value.preset === 'custom'
    ? `${value.startDate} → ${value.endDate}`
    : PRESET_LABELS[value.preset];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`Periode: ${label}`}
        className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
      >
        <Calendar size={14} className="text-muted-foreground" aria-hidden />
        <span>{label}</span>
        <ChevronDown size={14} className="text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-0 p-2">
        <div className="space-y-0.5">
          {(Object.keys(PRESET_LABELS) as PeriodPreset[]).filter(p => p !== 'custom').map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => handlePreset(p)}
              aria-pressed={value.preset === p}
              className={`min-h-11 w-full rounded px-2 py-1.5 text-left text-xs transition-colors sm:min-h-8 ${
                value.preset === p ? 'bg-accent font-semibold text-foreground' : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>
        <div className="mt-2 border-t border-border pt-2">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Kustom</div>
          <div className="space-y-2">
            <Field label="Dari tanggal">
              {(c) => <DateInput id={c.id} value={customStart} onChange={setCustomStart} />}
            </Field>
            <Field label="Sampai tanggal">
              {(c) => <DateInput id={c.id} value={customEnd} onChange={setCustomEnd} />}
            </Field>
            <Button type="button" size="sm" onClick={applyCustom} className="w-full">
              Terapkan
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DashboardPeriodFilter;
