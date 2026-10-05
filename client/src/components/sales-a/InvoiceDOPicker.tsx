/**
 * "Dari Surat Jalan" toggle + pending delivery-order picker for the sales
 * invoice form. State and selection logic stay in SalesInvoiceModal.
 */
import { ChevronRight, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { Checkbox } from '@/components/ui/checkbox';

export interface PendingDOItem {
  id: string;
  deliveryOrderId: string;
  inventoryItemId: string;
  warehouseId: string;
  itemName: string;
  quantity: number;
  unit: string;
  description: string | null;
  inventoryItem?: { id: string; name: string; code: string; unit: string } | null;
  // Harga jual & diskon dari baris SO (DO digenerate dari SO).
  salesOrderItem?: { rate: number | string; discount: number | string } | null;
}

export interface PendingDO {
  id: string;
  doNumber: string;
  date: string;
  items: PendingDOItem[];
  // No. PO pelanggan / No. SO utk auto-isi referensi invoice.
  salesOrder?: { soNumber: string; customerRefNo: string | null } | null;
}

interface InvoiceDOPickerProps {
  fromDOMode: boolean;
  onToggleMode: (checked: boolean) => void;
  pendingDOs: PendingDO[] | undefined;
  selectedDOIds: string[];
  expandedDOIds: string[];
  onToggleSelect: (doId: string) => void;
  onToggleExpand: (doId: string) => void;
}

export function InvoiceDOPicker({
  fromDOMode,
  onToggleMode,
  pendingDOs,
  selectedDOIds,
  expandedDOIds,
  onToggleSelect,
  onToggleExpand,
}: InvoiceDOPickerProps) {
  return (
    <div className="border-b border-border px-6 pb-3 pt-5">
      {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- wraps a Checkbox (button role) */}
      <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-foreground max-sm:min-h-11">
        <Checkbox checked={fromDOMode} onCheckedChange={(checked) => onToggleMode(checked === true)} />
        <Truck size={14} className="text-primary" aria-hidden />
        <span className="font-medium">Dari Surat Jalan</span>
        <span className="text-xs text-muted-foreground">(Surat Jalan sudah dikirim sebelumnya)</span>
      </label>

      {fromDOMode && (
        <div className="mt-3 space-y-2">
          {(pendingDOs?.length ?? 0) === 0 ? (
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs italic text-muted-foreground">
              Tidak ada surat jalan terbuka untuk pelanggan ini.
            </p>
          ) : (
            pendingDOs!.map((doc) => {
              const isSelected = selectedDOIds.includes(doc.id);
              const isExpanded = expandedDOIds.includes(doc.id);
              const detailId = `do-detail-${doc.id}`;
              return (
                <div
                  key={doc.id}
                  className={cn('rounded-lg border transition-colors', isSelected ? 'border-primary/40 bg-primary-subtle/40' : 'border-border bg-card')}
                >
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <Checkbox
                      aria-label={`Pilih surat jalan ${doc.doNumber}`}
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect(doc.id)}
                    />
                    <Truck size={14} className="shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-medium text-foreground">{doc.doNumber}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(doc.date)}</span>
                        <span className="text-xs text-muted-foreground">• {doc.items.length} item</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-controls={detailId}
                      onClick={() => onToggleExpand(doc.id)}
                      className="flex shrink-0 items-center gap-0.5 rounded px-1 text-xs text-muted-foreground hover:text-foreground max-sm:min-h-11"
                    >
                      <ChevronRight size={12} aria-hidden className={cn('transition-transform', isExpanded && 'rotate-90')} />
                      {isExpanded ? 'Tutup' : 'Lihat detail'}
                    </button>
                  </div>
                  {isExpanded && (
                    <div id={detailId} className="border-t border-border bg-muted/30 px-3 py-2">
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {doc.items.map((it) => (
                          <li key={it.id} className="flex items-baseline gap-2">
                            <span aria-hidden>•</span>
                            <span className="flex-1">
                              {it.itemName}
                              {it.inventoryItem?.code && <span> · {it.inventoryItem.code}</span>}
                            </span>
                            <span className="tabular-nums text-foreground">
                              {Number(it.quantity).toLocaleString('id-ID', { maximumFractionDigits: 3 })} {it.unit}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
