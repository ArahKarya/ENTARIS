/** Status chip + payment progress for InvoiceDetailDrawer. */
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRupiah } from '@/lib/format';
import { StatusBadge } from '@/components/shared';

interface InvoiceStatusProgressProps {
  isSales: boolean;
  status: string;
  isOverdue: boolean;
  paidAmount: number;
  grandTotal: number;
  paidPct: number;
  outstanding: number;
  paidFromCash: number;
  paidFromDeposit: number;
}

export function InvoiceStatusProgress({
  isSales,
  status,
  isOverdue,
  paidAmount,
  grandTotal,
  paidPct,
  outstanding,
  paidFromCash,
  paidFromDeposit,
}: InvoiceStatusProgressProps) {
  return (
    <div className="border-b border-border px-6 pb-4 pt-5">
      <div className="mb-3 flex items-center justify-between">
        <StatusBadge status={status} docType={isSales ? 'sales_invoice' : 'purchase_invoice'} />
        {isOverdue && (
          <span className="inline-flex items-center gap-1 rounded-sm bg-danger-subtle px-2 py-0.5 text-xs font-medium text-danger-text">
            <AlertTriangle size={11} aria-hidden /> Lewat jatuh tempo
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Pembayaran</span>
          <span className="font-medium tabular-nums text-foreground">
            {formatRupiah(paidAmount)} / {formatRupiah(grandTotal)}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Persentase terbayar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(paidPct, 100)}
          className="h-2 w-full overflow-hidden rounded-sm bg-muted"
        >
          <div
            className={cn('h-full rounded-sm transition-all', paidPct >= 100 ? 'bg-success' : paidPct > 0 ? 'bg-warning' : 'bg-border')}
            style={{ width: `${Math.min(paidPct, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{paidPct}% terbayar</span>
          {outstanding > 0 && <span className="font-medium text-danger-text">Sisa: {formatRupiah(outstanding)}</span>}
        </div>
        {(paidFromCash > 0 || paidFromDeposit > 0) && (
          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
            {paidFromCash > 0 && (
              <span>Tunai/Bank: <span className="tabular-nums text-foreground">{formatRupiah(paidFromCash)}</span></span>
            )}
            {paidFromDeposit > 0 && (
              <span>Uang Muka: <span className="tabular-nums text-foreground">{formatRupiah(paidFromDeposit)}</span></span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
