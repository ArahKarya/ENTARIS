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
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--foreground)',
} as const;

/** Axis tick for IDR amounts: 0, 5jt, 1,2M … */
export function compactIdrTick(v: number): string {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}${+(abs / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${sign}${+(abs / 1e9).toFixed(1)}M`;
  if (abs >= 1e6) return `${sign}${+(abs / 1e6).toFixed(1)}jt`;
  if (abs >= 1e3) return `${sign}${Math.round(abs / 1e3)}rb`;
  return `${sign}${abs}`;
}
