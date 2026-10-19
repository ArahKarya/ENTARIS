/** Period presets of the fleet report (URL: ?period=…&startDate=…&endDate=…). */
import { formatDateRange } from '@/lib/format';
import i18n from '@/i18n';

export type ReportPreset = 'last12' | 'ytd' | 'lastYear' | 'thisQuarter' | 'custom';
export const REPORT_PRESETS: ReadonlyArray<{ value: ReportPreset; label: string }> = [
  { value: 'last12', get label() { return i18n.t('eam:fleetPresets.last12'); } },
  { value: 'thisQuarter', get label() { return i18n.t('eam:fleetPresets.thisQuarter'); } },
  { value: 'ytd', get label() { return i18n.t('eam:fleetPresets.ytd'); } },
  { value: 'lastYear', get label() { return i18n.t('eam:fleetPresets.lastYear'); } },
  { value: 'custom', get label() { return i18n.t('eam:fleetPresets.custom'); } },
];
export const DEFAULT_REPORT_PRESET: ReportPreset = 'last12';

export interface ReportPeriod {
  preset: ReportPreset;
  startDate: string;
  endDate: string;
  rangeLabel: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Same default as the server: from the 1st of the month 11 months back to the end of this month. */
export function resolveReportPeriod(
  params: { period?: string | null; startDate?: string | null; endDate?: string | null },
  today: Date = new Date(),
): ReportPeriod {
  const y = today.getFullYear();
  const m = today.getMonth();
  let preset = (REPORT_PRESETS.find((p) => p.value === params.period)?.value ?? DEFAULT_REPORT_PRESET) as ReportPreset;
  let range: [string, string];
  if (preset === 'custom' && params.startDate && params.endDate && ISO.test(params.startDate) && ISO.test(params.endDate)) {
    range = [params.startDate, params.endDate].sort() as [string, string];
  } else {
    if (preset === 'custom') preset = DEFAULT_REPORT_PRESET;
    switch (preset) {
      case 'ytd':
        range = [iso(new Date(y, 0, 1)), iso(today)];
        break;
      case 'lastYear':
        range = [iso(new Date(y - 1, 0, 1)), iso(new Date(y - 1, 11, 31))];
        break;
      case 'thisQuarter':
        range = [iso(new Date(y, Math.floor(m / 3) * 3, 1)), iso(today)];
        break;
      default:
        range = [iso(new Date(y, m - 11, 1)), iso(new Date(y, m + 1, 0))];
    }
  }
  return { preset, startDate: range[0], endDate: range[1], rangeLabel: formatDateRange(range[0], range[1]) };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
/** "2026-10" → "Okt 26". */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1] ?? m} ${String(y).slice(2)}`;
}
