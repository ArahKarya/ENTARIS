import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { formatRupiah, LOCALE } from '@/lib/format';
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
  const { t } = useTranslation('approvals');
  const { data: po, isLoading, isError } = useQuery({
    queryKey: ['purchase-order-detail', poId],
    queryFn: async () => (await api.get<PoSummary>(`/purchase-orders/${poId}`)).data,
  });
  if (isLoading) return <LoadingState size="sm" className="py-6" label={t('poSummary.loading')} />;
  if (isError || !po) return <p className="text-xs text-muted-foreground">{t('poSummary.loadFailed')}</p>;
  const totals = po.totals;
  return (
    <div className="space-y-3 text-xs">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <div><span className="text-muted-foreground">{t('poSummary.number')}</span> <span className="font-mono text-foreground">{po.poNumber}</span></div>
        <div><span className="text-muted-foreground">{t('poSummary.date')}</span> <span className="text-foreground">{po.date.slice(0, 10)}</span></div>
        <div><span className="text-muted-foreground">{t('poSummary.supplier')}</span> <span className="text-foreground">{po.supplier?.name ?? t('poSummary.generalPo')}</span></div>
        <div><span className="text-muted-foreground">{t('poSummary.warehouse')}</span> <span className="text-foreground">{po.warehouse ? `${po.warehouse.code} · ${po.warehouse.name}` : '—'}</span></div>
        <div><span className="text-muted-foreground">{t('poSummary.paymentTerm')}</span> <span className="text-foreground">{paymentTermLabel(po.paymentTermDays)}</span></div>
        <div><span className="text-muted-foreground">{t('poSummary.quoteRef')}</span> <span className="text-foreground">{po.supplierQuoteRef || '—'}</span></div>
        {po.terms && <div className="col-span-2"><span className="text-muted-foreground">{t('poSummary.terms')}</span> <span className="text-foreground">{po.terms}</span></div>}
        {po.notes && <div className="col-span-2"><span className="text-muted-foreground">{t('poSummary.notes')}</span> <span className="text-foreground">{po.notes}</span></div>}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[32rem]">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left">{t('poSummary.columns.item')}</th>
              <th className="px-2 py-1.5 text-right">{t('poSummary.columns.qty')}</th>
              <th className="px-2 py-1.5 text-right">{t('poSummary.columns.price')}</th>
              <th className="px-2 py-1.5 text-right">{t('poSummary.columns.discount')}</th>
              <th className="px-2 py-1.5 text-right">{t('poSummary.columns.vat')}</th>
              <th className="px-2 py-1.5 text-right">{t('poSummary.columns.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map((it) => (
              <tr key={it.id} className="border-t border-border">
                <td className="px-2 py-1.5">{it.itemName}</td>
                <td className="px-2 py-1.5 text-right font-mono">{Number(it.quantity).toLocaleString(LOCALE)} {it.unit}</td>
                <td className="px-2 py-1.5 text-right font-mono">{formatRupiah(Number(it.estimatedRate))}</td>
                <td className="px-2 py-1.5 text-right font-mono">{Number(it.discount ?? 0) || '—'}</td>
                <td className="px-2 py-1.5 text-right font-mono">{Number(it.taxPct ?? 0) || '—'}</td>
                <td className="px-2 py-1.5 text-right font-mono">{formatRupiah(Number(it.estimatedAmount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totals && (
        <dl className="ml-auto w-full sm:w-72 space-y-1">
          <div className="flex justify-between"><dt className="text-muted-foreground">{t('poSummary.subtotal')}</dt><dd className="font-mono">{formatRupiah(totals.subtotal)}</dd></div>
          {totals.discountTotal > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">{t('poSummary.discount')}</dt><dd className="font-mono">− {formatRupiah(totals.discountTotal)}</dd></div>}
          {totals.taxTotal > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">{t('poSummary.vat')}</dt><dd className="font-mono">{formatRupiah(totals.taxTotal)}</dd></div>}
          {totals.otherCosts > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">{po.otherCostsLabel || t('poSummary.otherCosts')}</dt><dd className="font-mono">{formatRupiah(totals.otherCosts)}</dd></div>}
          <div className="flex justify-between border-t border-border pt-1 font-semibold"><dt>{t('poSummary.grandTotal')}</dt><dd className="font-mono">{formatRupiah(totals.grandTotal)}</dd></div>
        </dl>
      )}
    </div>
  );
}
