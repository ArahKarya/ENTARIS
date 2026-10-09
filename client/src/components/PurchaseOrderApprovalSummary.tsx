import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatRupiah } from '@/lib/format';
import { paymentTermLabel } from '@/lib/purchaseOrderCalc';
import { LoadingState } from '@/components/shared';

type Num = number | string;

interface PoSummary {
  poNumber: string;
  date: string;
  supplier?: { name: string } | null;
  warehouse?: { code: string; name: string } | null;
  paymentTermDays?: number | null;
  supplierQuoteRef?: string | null;
  terms?: string | null;
  notes?: string | null;
  otherCostsLabel?: string | null;
  items: Array<{ id: string; itemName: string; quantity: Num; unit: string; estimatedRate: Num; discount?: Num; taxPct?: Num; estimatedAmount: Num }>;
  totals?: { subtotal: number; discountTotal: number; taxTotal: number; otherCosts: number; grandTotal: number };
}

/** PO content for the approval dialog — the PO lives in the DB (status-based pending), not in the payload. */
export default function PurchaseOrderApprovalSummary({ poId }: { poId: string }) {
  const { data: po, isLoading, isError } = useQuery({
    queryKey: ['purchase-order-detail', poId],
    queryFn: async () => (await api.get<PoSummary>(`/purchase-orders/${poId}`)).data,
  });
  if (isLoading) return <LoadingState size="sm" className="py-6" label="Memuat PO…" />;
  if (isError || !po) return <p className="text-xs text-muted-foreground">PO tidak dapat dimuat (mungkin sudah dihapus).</p>;
  const t = po.totals;
  return (
    <div className="space-y-3 text-xs">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <div><span className="text-muted-foreground">Nomor:</span> <span className="font-mono text-foreground">{po.poNumber}</span></div>
        <div><span className="text-muted-foreground">Tanggal:</span> <span className="text-foreground">{po.date.slice(0, 10)}</span></div>
        <div><span className="text-muted-foreground">Supplier:</span> <span className="text-foreground">{po.supplier?.name ?? 'PO Umum'}</span></div>
        <div><span className="text-muted-foreground">Gudang:</span> <span className="text-foreground">{po.warehouse ? `${po.warehouse.code} · ${po.warehouse.name}` : '—'}</span></div>
        <div><span className="text-muted-foreground">Termin:</span> <span className="text-foreground">{paymentTermLabel(po.paymentTermDays)}</span></div>
        <div><span className="text-muted-foreground">No. Penawaran:</span> <span className="text-foreground">{po.supplierQuoteRef || '—'}</span></div>
        {po.terms && <div className="col-span-2"><span className="text-muted-foreground">Syarat:</span> <span className="text-foreground">{po.terms}</span></div>}
        {po.notes && <div className="col-span-2"><span className="text-muted-foreground">Catatan:</span> <span className="text-foreground">{po.notes}</span></div>}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[32rem]">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left">Item</th>
              <th className="px-2 py-1.5 text-right">Qty</th>
              <th className="px-2 py-1.5 text-right">Harga</th>
              <th className="px-2 py-1.5 text-right">Disk %</th>
              <th className="px-2 py-1.5 text-right">PPN %</th>
              <th className="px-2 py-1.5 text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map((it) => (
              <tr key={it.id} className="border-t border-border">
                <td className="px-2 py-1.5">{it.itemName}</td>
                <td className="px-2 py-1.5 text-right font-mono">{Number(it.quantity).toLocaleString('id-ID')} {it.unit}</td>
                <td className="px-2 py-1.5 text-right font-mono">{formatRupiah(Number(it.estimatedRate))}</td>
                <td className="px-2 py-1.5 text-right font-mono">{Number(it.discount ?? 0) || '—'}</td>
                <td className="px-2 py-1.5 text-right font-mono">{Number(it.taxPct ?? 0) || '—'}</td>
                <td className="px-2 py-1.5 text-right font-mono">{formatRupiah(Number(it.estimatedAmount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {t && (
        <dl className="ml-auto w-full sm:w-72 space-y-1">
          <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="font-mono">{formatRupiah(t.subtotal)}</dd></div>
          {t.discountTotal > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Diskon</dt><dd className="font-mono">− {formatRupiah(t.discountTotal)}</dd></div>}
          {t.taxTotal > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">PPN</dt><dd className="font-mono">{formatRupiah(t.taxTotal)}</dd></div>}
          {t.otherCosts > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">{po.otherCostsLabel || 'Biaya lain'}</dt><dd className="font-mono">{formatRupiah(t.otherCosts)}</dd></div>}
          <div className="flex justify-between border-t border-border pt-1 font-semibold"><dt>Grand Total</dt><dd className="font-mono">{formatRupiah(t.grandTotal)}</dd></div>
        </dl>
      )}
    </div>
  );
}
