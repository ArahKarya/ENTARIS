/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped (same as the legacy drawer) */
/** Totals block (+ deductions net) for InvoiceDetailDrawer. */
import { cn } from '@/lib/utils';
import { formatRupiah } from '@/lib/format';
import type { DeductionsSummary } from '@/lib/invoiceDeductions';

interface InvoiceSummaryProps {
  invoice: any;
  totalQtyLabel: string;
  subtotal: number;
  taxAmount: number;
  hasPerItemTax: boolean;
  taxPct: number;
  pphAmount: number;
  potongan: number;
  biayaLain: number;
  grandTotal: number;
  deductions: DeductionsSummary;
  netAfterDeductions: number;
}

export function InvoiceSummary({
  invoice,
  totalQtyLabel,
  subtotal,
  taxAmount,
  hasPerItemTax,
  taxPct,
  pphAmount,
  potongan,
  biayaLain,
  grandTotal,
  deductions,
  netAfterDeductions,
}: InvoiceSummaryProps) {
  return (
    <div className="border-b border-border px-6 py-4">
      <div className="flex justify-end">
        <div className="w-full space-y-2 sm:w-72">
          {totalQtyLabel && (
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Total Qty</span>
              <span className="tabular-nums text-foreground">{totalQtyLabel}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums text-foreground">{formatRupiah(subtotal)}</span>
          </div>
          {taxAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{hasPerItemTax ? 'PPN (per item)' : `PPN ${taxPct}%`}</span>
              <span className="tabular-nums text-foreground">{formatRupiah(taxAmount)}</span>
            </div>
          )}
          {pphAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-warning-text">PPh (per item)</span>
              <span className="tabular-nums text-warning-text">− {formatRupiah(pphAmount)}</span>
            </div>
          )}
          {potongan > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-danger-text">{invoice.labelPotongan || 'Potongan'}</span>
              <span className="tabular-nums text-danger-text">({formatRupiah(potongan)})</span>
            </div>
          )}
          {biayaLain > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{invoice.labelBiaya || 'Biaya Lain'}</span>
              <span className="tabular-nums text-foreground">{formatRupiah(biayaLain)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-border pt-2">
            <span className="text-sm font-semibold text-foreground">Grand Total</span>
            <span
              className={cn(
                'tabular-nums',
                deductions.total > 0 ? 'text-sm text-muted-foreground line-through' : 'text-lg font-bold text-primary',
              )}
            >
              {formatRupiah(grandTotal)}
            </span>
          </div>
          {deductions.total > 0 && (
            <>
              <div className="space-y-0.5 pt-1">
                {deductions.byAccount.map((d) => (
                  <div key={d.accountNumber} className="flex justify-between text-xs">
                    <span className="text-warning-text">
                      {d.accountNumber} {d.label}
                    </span>
                    <span className="tabular-nums text-warning-text">({formatRupiah(d.total)})</span>
                  </div>
                ))}
              </div>
              <div className="-mx-2 flex items-baseline justify-between rounded border-t border-warning/30 bg-warning-subtle px-2 py-1.5 pt-2">
                <span className="text-sm font-semibold text-warning-text">Net Setelah Potongan</span>
                <span className="text-lg font-bold tabular-nums text-warning-text">{formatRupiah(netAfterDeductions)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
