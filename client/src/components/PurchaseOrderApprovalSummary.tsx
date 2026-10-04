import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { formatRupiah } from '@/lib/format';
import { paymentTermLabel } from '@/lib/purchaseOrderCalc';

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
  if (isLoading) return <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Memuat PO" /></div>;
  if (isError || !po) return <p className="text-xs text-muted-foreground">PO tidak dapat dimuat (mungkin sudah dihapus).</p>;
  const t = po.totals;
  return (
    <div className="space-y-3 text-xs">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <div><span className="text-gray-500">Nomor:</span> <span className="font-mono text-gray-800">{po.poNumber}</span></div>
        <div><span className="text-gray-500">Tanggal:</span> <span className="text-gray-800">{po.date.slice(0, 10)}</span></div>
        <div><span className="text-gray-500">Supplier:</span> <span className="text-gray-800">{po.supplier?.name ?? 'PO Umum'}</span></div>
        <div><span className="text-gray-500">Gudang:</span> <span className="text-gray-800">{po.warehouse ? `${po.warehouse.code} — ${po.warehouse.name}` : '—'}</span></div>
        <div><span className="text-gray-500">Termin:</span> <span className="text-gray-800">{paymentTermLabel(po.paymentTermDays)}</span></div>
        <div><span className="text-gray-500">No. Penawaran:</span> <span className="text-gray-800">{po.supplierQuoteRef || '—'}</span></div>
        {po.terms && <div className="col-span-2"><span className="text-gray-500">Syarat:</span> <span className="text-gray-800">{po.terms}</span></div>}
        {po.notes && <div className="col-span-2"><span className="text-gray-500">Catatan:</span> <span className="text-gray-800">{po.notes}</span></div>}
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[32rem]">
          <thead className="bg-gray-50 text-gray-500">
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
              <tr key={it.id} className="border-t border-gray-100">
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
          <div className="flex justify-between"><dt className="text-gray-500">Subtotal</dt><dd className="font-mono">{formatRupiah(t.subtotal)}</dd></div>
          {t.discountTotal > 0 && <div className="flex justify-between"><dt className="text-gray-500">Diskon</dt><dd className="font-mono">− {formatRupiah(t.discountTotal)}</dd></div>}
          {t.taxTotal > 0 && <div className="flex justify-between"><dt className="text-gray-500">PPN</dt><dd className="font-mono">{formatRupiah(t.taxTotal)}</dd></div>}
          {t.otherCosts > 0 && <div className="flex justify-between"><dt className="text-gray-500">{po.otherCostsLabel || 'Biaya lain'}</dt><dd className="font-mono">{formatRupiah(t.otherCosts)}</dd></div>}
          <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold"><dt>Grand Total</dt><dd className="font-mono">{formatRupiah(t.grandTotal)}</dd></div>
        </dl>
      )}
    </div>
  );
}
