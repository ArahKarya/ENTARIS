import React from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

export type PeriodPreset =
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'ytd'
  | 'last12Months'
  | 'all'
  | 'custom';

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

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function computePresetRange(preset: PeriodPreset): { startDate: string; endDate: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case 'thisMonth': {
      return { startDate: toISO(new Date(y, m, 1)), endDate: toISO(new Date(y, m + 1, 0)) };
    }
    case 'lastMonth': {
      return { startDate: toISO(new Date(y, m - 1, 1)), endDate: toISO(new Date(y, m, 0)) };
    }
    case 'thisQuarter': {
      const qStart = Math.floor(m / 3) * 3;
      return { startDate: toISO(new Date(y, qStart, 1)), endDate: toISO(new Date(y, qStart + 3, 0)) };
    }
    case 'ytd': {
      return { startDate: toISO(new Date(y, 0, 1)), endDate: toISO(now) };
    }
    case 'last12Months': {
      return { startDate: toISO(new Date(y, m - 11, 1)), endDate: toISO(new Date(y, m + 1, 0)) };
    }
    case 'all': {
      return { startDate: '2020-01-01', endDate: toISO(new Date(y + 1, 11, 31)) };
    }
    default:
      return { startDate: toISO(new Date(y, m, 1)), endDate: toISO(now) };
  }
}

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
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card hover:bg-accent transition-colors text-xs font-medium text-foreground"
      >
        <Calendar size={14} className="text-muted-foreground" />
        <span>{label}</span>
        <ChevronDown size={14} className="text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-50 w-64 rounded-md border border-border bg-card shadow-md p-2">
            <div className="space-y-0.5">
              {(Object.keys(PRESET_LABELS) as PeriodPreset[]).filter(p => p !== 'custom').map((p) => (
                <button
                  key={p}
                  onClick={() => handlePreset(p)}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                    value.preset === p ? 'bg-accent font-semibold text-foreground' : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {PRESET_LABELS[p]}
                </button>
              ))}
            </div>
            <div className="border-t border-border mt-2 pt-2">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Kustom</div>
              <div className="space-y-1.5">
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="w-full border border-border bg-background rounded px-2 py-1 text-xs text-foreground"
                />
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="w-full border border-border bg-background rounded px-2 py-1 text-xs text-foreground"
                />
                <button
                  onClick={applyCustom}
                  className="w-full py-1.5 rounded text-xs font-medium text-white"
                  style={{ backgroundColor: 'var(--primary)' }}
                >
                  Terapkan
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DashboardPeriodFilter;
