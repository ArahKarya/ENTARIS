export type PeriodPreset =
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'ytd'
  | 'last12Months'
  | 'all'
  | 'custom';

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
