import type { ReactElement } from 'react';

/** Marker shapes: series differ by shape + dash pattern, never by colour alone. */
export type SeriesShape = 'circle' | 'square' | 'triangle' | 'diamond';

export interface SeriesStyle {
  /** CSS colour from the chart tokens (adapts to dark mode). */
  color: string;
  /** SVG stroke-dasharray, undefined = solid. */
  dash?: string;
  shape: SeriesShape;
  width: number;
}

/** Four distinguishable line styles using --chart-* tokens (contrast checked in both themes). */
export const SERIES_STYLES: ReadonlyArray<SeriesStyle> = [
  { color: 'var(--chart-1)', shape: 'circle', width: 3 },
  { color: 'var(--chart-3)', dash: '7 3', shape: 'square', width: 2 },
  { color: 'var(--chart-4)', dash: '2 3', shape: 'triangle', width: 2 },
  { color: 'var(--chart-2)', dash: '9 3 2 3', shape: 'diamond', width: 2 },
];

/** Axis/grid/tooltip props shared by report charts (tokens only). */
export const CHART_AXIS_TICK = { fontSize: 11, fill: 'var(--muted-foreground)' } as const;
export const CHART_GRID_STROKE = 'var(--border)';
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'var(--popover)',
  color: 'var(--popover-foreground)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  fontSize: 12,
} as const;

export function shapePath(shape: SeriesShape, r: number): string {
  switch (shape) {
    case 'square':
      return `M${-r},${-r}h${2 * r}v${2 * r}h${-2 * r}z`;
    case 'triangle':
      return `M0,${-r * 1.2}L${r * 1.15},${r * 0.9}L${-r * 1.15},${r * 0.9}z`;
    case 'diamond':
      return `M0,${-r * 1.3}L${r * 1.3},0L0,${r * 1.3}L${-r * 1.3},0z`;
    default:
      return `M${-r},0a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0z`;
  }
}

/** Recharts `dot` renderer drawing the series marker (filled, with a card-coloured halo for contrast). */
export function seriesDot(style: SeriesStyle, radius = 3.5) {
  return function SeriesDot(props: { cx?: number; cy?: number; index?: number }): ReactElement<SVGElement> {
    const { cx, cy, index } = props;
    if (typeof cx !== 'number' || typeof cy !== 'number') return <g key={`d-${index}`} />;
    return (
      <path
        key={`d-${index}`}
        d={shapePath(style.shape, radius)}
        transform={`translate(${cx},${cy})`}
        fill={style.color}
        stroke="var(--card)"
        strokeWidth={1}
      />
    );
  };
}

