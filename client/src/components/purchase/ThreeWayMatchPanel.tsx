/**
 * "Pencocokan PO–STT–Faktur" panel — advisory three-way match per invoice line.
 * Used live in PurchaseInvoiceModal (via useMatchPreview), in the PI detail
 * drawer (GET /purchase/invoices/:id → match) and in the PI approval dialog.
 */
import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  describeMatchLine,
  lineStatusMeta,
  overallStatusMeta,
  type MatchItemPayload,
  type MatchResult,
  type MatchTone,
} from './three-way-match';
import { useMatchPreview } from './useMatchPreview';

const TONE_CLASS: Record<MatchTone, string> = {
  success: 'bg-success-subtle text-success-text',
  warning: 'bg-warning-subtle text-warning-text',
  neutral: 'bg-neutral-subtle text-neutral-text',
};
const TONE_ICON = { success: CheckCircle2, warning: AlertTriangle, neutral: MinusCircle } as const;

function StatusPill({ label, tone }: { label: string; tone: MatchTone }) {
  const Icon = TONE_ICON[tone];
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-medium', TONE_CLASS[tone])}>
      <Icon size={12} aria-hidden />
      {label}
    </span>
  );
}

interface PanelProps {
  match: MatchResult | null | undefined;
  loading?: boolean;
  className?: string;
}

export function ThreeWayMatchPanel({ match, loading, className }: PanelProps) {
  const lines = useMemo(() => (match?.lines ?? []).filter((l) => l.status !== 'unlinked'), [match]);
  if (!match && !loading) return null;
  if (match && lines.length === 0) return null;
  const overall = match ? overallStatusMeta(match.status) : null;

  return (
    <section aria-label="Pencocokan PO–STT–Faktur" className={cn('rounded-lg border border-border bg-card p-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Pencocokan PO–STT–Faktur</h3>
        <div className="flex items-center gap-2">
          {loading && <Loader2 size={14} className="animate-spin text-muted-foreground" aria-label="Memuat pencocokan" />}
          {overall && <StatusPill label={overall.label} tone={overall.tone} />}
        </div>
      </div>
      {match && (
        <p className="mt-1 text-xs text-muted-foreground">
          Toleransi: qty {match.tolerance.qtyPct}% · harga {match.tolerance.pricePct}% dari harga PO (setelah diskon).
          Peringatan saja, tidak memblokir penyimpanan.
        </p>
      )}
      {lines.length > 0 && (
        <ul className="mt-2 divide-y divide-border">
          {lines.map((l) => {
            const meta = lineStatusMeta(l.status);
            const details = describeMatchLine(l);
            return (
              <li key={l.key} className="py-2 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{l.itemName || 'Item'}</p>
                    <p className="text-xs text-muted-foreground">
                      {[l.poNumber && `PO ${l.poNumber}`, l.sttNumber && `STT ${l.sttNumber}`].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <StatusPill label={meta.label} tone={meta.tone} />
                </div>
                {details.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-warning-text">
                    {details.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Panel fed by a payload (approval dialog). */
export function ThreeWayMatchPreview({ items, className }: { items: MatchItemPayload[] | null | undefined; className?: string }) {
  const q = useMatchPreview(items, 0);
  if (!(items ?? []).some((i) => i.goodsReceiptItemId)) return null;
  return <ThreeWayMatchPanel match={q.data} loading={q.isFetching} className={className} />;
}

export default ThreeWayMatchPanel;
