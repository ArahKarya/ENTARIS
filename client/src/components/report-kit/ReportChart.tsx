import { useId, useState, type ReactNode } from 'react';
import { Table2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { shapePath, type SeriesStyle } from './chart-series';

/** Legend swatch: the real dash + marker of the series. */
export function SeriesSwatch({ style }: { style: SeriesStyle }) {
  return (
    <svg width="34" height="14" viewBox="0 0 34 14" aria-hidden className="shrink-0">
      <line x1="1" y1="7" x2="33" y2="7" stroke={style.color} strokeWidth={style.width} strokeDasharray={style.dash} />
      <path d={shapePath(style.shape, 3.5)} transform="translate(17,7)" fill={style.color} stroke="var(--card)" strokeWidth={1} />
    </svg>
  );
}

export interface ChartLegendItem {
  name: string;
  style: SeriesStyle;
  /** Visible value, e.g. "rata-rata 78,2%". */
  value?: string;
}

export interface ChartFigureProps {
  title: string;
  /** Visible caption with the key values (also the chart's accessible name). */
  summary: string;
  legend?: ReadonlyArray<ChartLegendItem>;
  /** Data table with the same values; revealed by "Tampilkan tabel". */
  table: ReactNode;
  /** The chart itself (hidden from assistive tech: table + caption carry the information). */
  children: ReactNode;
  className?: string;
}

/**
 * Accessible chart wrapper: <figure> with visible figcaption (key values),
 * a legend that shows dash + marker + value, and a data-table toggle.
 */
export function ChartFigure({ title, summary, legend, table, children, className }: ChartFigureProps) {
  const { t } = useTranslation('reports');
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();
  return (
    <figure className={cn('m-0', className)} aria-label={title}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <figcaption className="min-w-0 text-xs text-muted-foreground max-sm:basis-full sm:flex-1">{summary}</figcaption>
        <Button
          variant="outline"
          size="sm"
          className="no-print max-sm:h-11"
          aria-expanded={showTable}
          aria-controls={tableId}
          onClick={() => setShowTable((v) => !v)}
        >
          <Table2 aria-hidden />
          {showTable ? t('kit.chart.hideTable') : t('kit.chart.showTable')}
        </Button>
      </div>
      <div aria-hidden>{children}</div>
      {legend && legend.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-foreground" aria-label={t('kit.chart.legend')}>
          {legend.map((item) => (
            <li key={item.name} className="flex items-center gap-2">
              <SeriesSwatch style={item.style} />
              <span className="font-medium">{item.name}</span>
              {item.value && <span className="num text-muted-foreground">{item.value}</span>}
            </li>
          ))}
        </ul>
      )}
      <div id={tableId} className={cn('mt-3', !showTable && 'hidden')}>
        {showTable && table}
      </div>
    </figure>
  );
}
