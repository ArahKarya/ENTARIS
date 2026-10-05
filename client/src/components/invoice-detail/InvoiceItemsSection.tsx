/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped (same as the legacy drawer) */
/** Line items (+ linked Surat Jalan / STT banners) for InvoiceDetailDrawer. */
import { Package, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRupiah } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  TableRegion,
} from '@/components/sales-a/overlay-parts';

interface InvoiceItemsSectionProps {
  invoice: any;
  items: any[];
  isSales: boolean;
  hasPerItemPph: boolean;
  onCreateDO: () => void;
}

const sectionTitle = 'mb-3 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground';

function LinkedDocsBanner({ items, isSales, invoice, onCreateDO }: Omit<InvoiceItemsSectionProps, 'hasPerItemPph'>) {
  if (isSales) {
    const linkedDOs = Array.from(
      new Map(
        items
          .map((it: any) => it.deliveryOrderItem?.deliveryOrder)
          .filter((d: any) => d)
          .map((d: any) => [d.id, d]),
      ).values(),
    );
    if (linkedDOs.length > 0) {
      return (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary-subtle/50 p-2.5 text-xs">
          <Truck size={13} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <div className="flex-1">
            <p className="mb-0.5 font-semibold text-primary-subtle-foreground">
              Ditagihkan dari {linkedDOs.length === 1 ? 'Surat Jalan' : `${linkedDOs.length} Surat Jalan`}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {linkedDOs.map((d: any) => (
                <span key={d.id} className="rounded border border-primary/30 bg-card px-1.5 py-0.5 font-mono text-[11px] text-primary-subtle-foreground">
                  {d.doNumber}
                </span>
              ))}
            </div>
          </div>
        </div>
      );
    }
    // No DO yet. Offer to create one retroactively if invoice is active and
    // has at least one inventory line.
    const hasInventoryLine = items.some((it: any) => it.inventoryItemId);
    const canCreate = invoice && invoice.status !== 'Cancelled' && hasInventoryLine;
    if (!canCreate) return null;
    return (
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2.5 text-xs">
        <Truck size={13} className="shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex-1 text-muted-foreground">Invoice ini belum punya Surat Jalan.</span>
        <Button size="sm" className="max-sm:h-11" onClick={onCreateDO}>
          <Truck aria-hidden /> Buat Surat Jalan
        </Button>
      </div>
    );
  }

  // Purchase side: tampilkan STT/BPB asal barang.
  const linkedSTTs = Array.from(
    new Map(
      items
        .map((it: any) => it.goodsReceiptItem?.goodsReceipt)
        .filter((g: any) => g)
        .map((g: any) => [g.id, g]),
    ).values(),
  );
  if (linkedSTTs.length === 0) return null;
  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-success/30 bg-success-subtle/50 p-2.5 text-xs">
      <Truck size={13} className="mt-0.5 shrink-0 text-success-text" aria-hidden />
      <div className="flex-1">
        <p className="mb-0.5 font-semibold text-success-text">
          Barang diterima dari {linkedSTTs.length === 1 ? 'STT/BPB' : `${linkedSTTs.length} STT/BPB`}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {linkedSTTs.map((g: any) => (
            <span key={g.id} className="rounded border border-success/30 bg-card px-1.5 py-0.5 font-mono text-[11px] text-success-text">
              {g.sttNumber}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function InvoiceItemsSection({ invoice, items, isSales, hasPerItemPph, onCreateDO }: InvoiceItemsSectionProps) {
  const dash = <span className="text-muted-foreground">—</span>;
  return (
    <div className="border-b border-border px-6 py-4">
      <LinkedDocsBanner invoice={invoice} items={items} isSales={isSales} onCreateDO={onCreateDO} />
      <h3 className={sectionTitle}>
        <Package size={10} aria-hidden /> Daftar Barang / Jasa ({items.length} item)
      </h3>
      <TableRegion label="Daftar barang dan jasa invoice">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="w-8 px-4 py-2.5 text-left">#</th>
              <th scope="col" className="px-4 py-2.5 text-left">Nama</th>
              <th scope="col" className="w-16 px-3 py-2.5 text-right">Qty</th>
              <th scope="col" className="w-16 px-3 py-2.5 text-center">Satuan</th>
              <th scope="col" className="w-28 px-3 py-2.5 text-right">Harga</th>
              <th scope="col" className="w-16 px-3 py-2.5 text-right">Disk%</th>
              <th scope="col" className="w-16 px-3 py-2.5 text-right">PPN%</th>
              {hasPerItemPph && <th scope="col" className="w-16 px-3 py-2.5 text-right">PPh%</th>}
              <th scope="col" className="w-28 px-4 py-2.5 text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, idx: number) => (
              <tr key={item.id || idx} className={cn('border-b border-border last:border-0', idx % 2 === 1 && 'bg-muted/30')}>
                <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">{idx + 1}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-medium text-foreground">{item.itemName}</p>
                    {item.itemType === 'service' && (
                      <span className="inline-flex items-center rounded bg-info-subtle px-1.5 py-0.5 text-[10px] font-semibold text-info-text">Jasa</span>
                    )}
                    {item.deliveryOrderItem?.deliveryOrder?.doNumber && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-primary-subtle px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary-subtle-foreground">
                        <Truck size={8} aria-hidden /> {item.deliveryOrderItem.deliveryOrder.doNumber}
                      </span>
                    )}
                    {/* STT/BPB asal (purchase side) — supaya dari PI tahu barang ini diterima lewat STT nomor berapa. */}
                    {item.goodsReceiptItem?.goodsReceipt?.sttNumber && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-success-subtle px-1.5 py-0.5 font-mono text-[10px] font-semibold text-success-text">
                        <Truck size={8} aria-hidden /> {item.goodsReceiptItem.goodsReceipt.sttNumber}
                      </span>
                    )}
                  </div>
                  {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                  {!isSales && (item.kualitas || item.timbanganTruk || item.refaksi || item.nomorMobil) && (
                    <div className="mt-0.5 space-x-2 text-xs text-muted-foreground">
                      {item.nomorMobil && <span>Mobil: <span className="font-mono uppercase text-foreground">{item.nomorMobil}</span></span>}
                      {item.kualitas && <span>Kualitas: <span className="text-foreground">{item.kualitas}</span></span>}
                      {Number(item.timbanganTruk) > 0 && <span>Truk: {Number(item.timbanganTruk).toLocaleString('id-ID')} kg</span>}
                      {Number(item.refaksi) > 0 && <span className="text-warning-text">Refaksi: {Number(item.refaksi).toLocaleString('id-ID')} kg</span>}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right text-xs tabular-nums text-foreground">
                  {Number(item.quantity).toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{item.unit}</td>
                <td className="px-3 py-2.5 text-right text-xs tabular-nums text-foreground">{formatRupiah(Number(item.rate))}</td>
                <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                  {Number(item.discount) > 0 ? <span className="text-warning-text">{Number(item.discount)}%</span> : dash}
                </td>
                <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                  {Number(item.taxPct) > 0 ? <span className="text-info-text">{Number(item.taxPct)}%</span> : dash}
                </td>
                {hasPerItemPph && (
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                    {Number(item.pphPct) > 0 ? <span className="text-warning-text">{Number(item.pphPct)}%</span> : dash}
                  </td>
                )}
                <td className="px-4 py-2.5 text-right text-xs font-medium tabular-nums text-foreground">
                  {formatRupiah(Number(item.amount))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableRegion>
    </div>
  );
}
