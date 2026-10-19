import { formatRupiah } from '@/lib/format';

/** Token-driven chart styling (light + dark via CSS variables). */
export const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
] as const;

export const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 11 } as const;
export const GRID_STROKE = 'var(--border)';

export const TOOLTIP_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  fontSize: 12,
  color: 'var(--foreground)',
} as const;

/** Axis tick for IDR amounts: 0, 5 jt, 1,2 M (id) / 0, 5 M, 1.2 B (en). Units follow the UI language. */
export function compactIdrTick(v: number): string {
  if (v === 0) return '0';
  return formatRupiah(v, { compact: true, symbol: false });
}
