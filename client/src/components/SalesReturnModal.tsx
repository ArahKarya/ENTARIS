import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatRupiah, formatDate } from '@/lib/format';
import { PickerSelect } from '@/components/sales-a/PickerSelect';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { DateInput, Field } from '@/components/shared';
import {
  FooterButton,
  FormDialogBody,
  FormDialogFooter,
  FormDialogHeader,
  TableRegion,
} from '@/components/sales-a/overlay-parts';
import { formDialogClass, numberInputClass } from '@/components/sales-a/overlay-classes';

interface Props {
  open: boolean;
  onClose: () => void;
  prefillInvoiceId?: string | null;
}

interface EligibleLine {
  salesInvoiceItemId: string;
  itemName: string;
  isInventory: boolean;
  warehouseName: string | null;
  unit: string;
  rate: number;
  discount: number;
  taxPct: number;
  quantity: number;
  alreadyReturned: number;
  remaining: number;
}

interface LineState {
  qty: string;
  restock: boolean;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function SalesReturnModal({ open, onClose, prefillInvoiceId }: Props) {
  const { t } = useTranslation('sales');
  const queryClient = useQueryClient();
  const [invoiceId, setInvoiceId] = useState<string>('');
  const [date, setDate] = useState(todayStr());
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Record<string, LineState>>({});

  useEffect(() => {
    if (open) {
      setInvoiceId(prefillInvoiceId || '');
      setDate(todayStr());
      setReason('');
      setLines({});
    }
  }, [open, prefillInvoiceId]);

  // Daftar invoice yang bisa diretur (Submitted/PartiallyPaid/Paid/Overdue).
  const { data: invoiceList } = useQuery({
    queryKey: ['sales-invoices', 'for-return'],
    queryFn: async () => {
      const r = await api.get('/sales/invoices?limit=500');
      return (r.data?.data ?? []) as any[];
    },
    enabled: open,
  });
  const returnableInvoices = useMemo(
    () => (invoiceList ?? []).filter((i) => ['Submitted', 'PartiallyPaid', 'Paid', 'Overdue'].includes(i.status)),
    [invoiceList],
  );

  const { data: eligible, isLoading: eligibleLoading } = useQuery({
    queryKey: ['sales-return-eligible', invoiceId],
    queryFn: async () => {
      const r = await api.get(`/sales-returns/eligible/${invoiceId}`);
      return r.data as { invoice: any; lines: EligibleLine[] };
    },
    enabled: open && !!invoiceId,
  });

  const setLine = (id: string, patch: Partial<LineState>) =>
    setLines((prev) => {
      const cur = prev[id] ?? { qty: '', restock: true };
      return { ...prev, [id]: { ...cur, ...patch } };
    });

  // Ringkasan nilai retur (mengikuti perhitungan server: qty*rate*(1-disc) + pajak).
  const summary = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const ln of eligible?.lines ?? []) {
      const st = lines[ln.salesInvoiceItemId];
      const qty = Number(st?.qty ?? 0);
      if (!qty) continue;
      const amount = qty * ln.rate * (1 - ln.discount / 100);
      subtotal += amount;
      tax += amount * (ln.taxPct / 100);
    }
    const total = subtotal + tax;
    const outstanding = Number(eligible?.invoice?.outstanding ?? 0);
    const arReduce = Math.min(total, outstanding);
    const credit = total - arReduce;
    return { subtotal, tax, total, arReduce, credit };
  }, [lines, eligible]);

  const mutation = useMutation({
    mutationFn: async () => {
      const items = (eligible?.lines ?? [])
        .map((ln) => {
          const st = lines[ln.salesInvoiceItemId];
          const qty = Number(st?.qty ?? 0);
          if (!qty) return null;
          return {
            salesInvoiceItemId: ln.salesInvoiceItemId,
            quantity: qty,
            restock: ln.isInventory ? st?.restock !== false : false,
          };
        })
        .filter(Boolean);
      if (items.length === 0) throw new Error(t('salesReturnModal.errors.noLines'));
      const r = await api.post('/sales-returns', { salesInvoiceId: invoiceId, date, reason: reason || null, items });
      return r.data;
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['sales-returns'] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      if (res?.pendingApproval) toast.success(t('salesReturnModal.toast.pendingApproval'));
      else toast.success(t('salesReturnModal.toast.created'));
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || t('salesReturnModal.toast.createFailed'));
    },
  });

  const hasInvalidQty = (eligible?.lines ?? []).some((ln) => {
    const qty = Number(lines[ln.salesInvoiceItemId]?.qty ?? 0);
    return qty > ln.remaining + 1e-9;
  });

  // Retur boleh disimpan kalau ada minimal 1 qty terisi > 0, walau nilainya
  // Rp0 (mis. item titipan pelanggan dengan rate 0 — retur qty-only, tanpa
  // pengaruh nilai piutang/kredit, hanya mengembalikan stok fisik).
  const hasQty = Object.values(lines).some((ln) => Number(ln.qty || 0) > 0);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !mutation.isPending && onClose()}>
      <DialogContent className={`${formDialogClass} sm:max-w-4xl`}>
        <FormDialogHeader>
          <DialogTitle>{t('salesReturnModal.title')}</DialogTitle>
          <DialogDescription>{t('salesReturnModal.description')}</DialogDescription>
        </FormDialogHeader>

        <FormDialogBody>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('salesReturnModal.fields.invoice')} required>
              {() => (
                <PickerSelect
                  aria-label={t('salesReturnModal.fields.invoice')}
                  placeholder={t('salesReturnModal.fields.invoicePlaceholder')}
                  value={invoiceId}
                  onChange={(v) => { setInvoiceId(v); setLines({}); }}
                  options={returnableInvoices.map((i) => ({
                    value: i.id,
                    label: `${i.invoiceNumber} · ${i.customer?.name} · ${formatDate(i.date)} · ${i.status}`,
                  }))}
                />
              )}
            </Field>
            <Field label={t('salesReturnModal.fields.date')} required>
              {(control) => <DateInput id={control.id} value={date} onChange={setDate} />}
            </Field>
          </div>

          {eligible?.invoice && (
            <p className="text-sm text-muted-foreground">
              {t('salesReturnModal.outstanding')}{' '}
              <span className="font-medium tabular-nums text-foreground">{formatRupiah(Number(eligible.invoice.outstanding))}</span>
              {' · '}{t('salesReturnModal.total')} <span className="tabular-nums">{formatRupiah(Number(eligible.invoice.grandTotal))}</span>
            </p>
          )}

          {invoiceId && (
            <TableRegion label={t('salesReturnModal.table.label')}>
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th scope="col" className="px-3 py-2">{t('salesReturnModal.table.item')}</th>
                    <th scope="col" className="px-3 py-2 text-right">{t('salesReturnModal.table.sold')}</th>
                    <th scope="col" className="px-3 py-2 text-right">{t('salesReturnModal.table.remaining')}</th>
                    <th scope="col" className="px-3 py-2 text-right">{t('salesReturnModal.table.returnQty')}</th>
                    <th scope="col" className="px-3 py-2 text-center">{t('salesReturnModal.table.restock')}</th>
                  </tr>
                </thead>
                <tbody>
                  {eligibleLoading && (
                    <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">{t('salesReturnModal.loading')}</td></tr>
                  )}
                  {(eligible?.lines ?? []).map((ln) => {
                    const st = lines[ln.salesInvoiceItemId];
                    const qty = Number(st?.qty ?? 0);
                    const invalid = qty > ln.remaining + 1e-9;
                    const disabled = ln.remaining <= 0;
                    const errId = `ret-err-${ln.salesInvoiceItemId}`;
                    return (
                      <tr key={ln.salesInvoiceItemId} className="border-t border-border">
                        <td className="px-3 py-2">
                          <div className="font-medium">{ln.itemName}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatRupiah(ln.rate)}/{ln.unit}
                            {ln.discount > 0 ? ` · ${t('salesReturnModal.table.discount', { value: ln.discount })}` : ''}
                            {ln.taxPct > 0 ? ` · ${t('salesReturnModal.table.tax', { value: ln.taxPct })}` : ''}
                            {ln.warehouseName ? ` · ${ln.warehouseName}` : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{ln.quantity} {ln.unit}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{ln.remaining} {ln.unit}</td>
                        <td className="px-3 py-2 text-right">
                          <NumberInput
                            min={0} max={ln.remaining} step="any" disabled={disabled}
                            aria-label={t('salesReturnModal.table.returnQtyFor', { name: ln.itemName })}
                            aria-invalid={invalid || undefined}
                            aria-describedby={invalid ? errId : undefined}
                            className={`${numberInputClass} ml-auto w-28 ${invalid ? 'border-danger' : ''}`}
                            value={st?.qty ?? ''}
                            onChange={(e) => setLine(ln.salesInvoiceItemId, { qty: e.target.value })}
                          />
                          {invalid && (
                            <p id={errId} role="alert" className="mt-1 text-xs font-medium text-danger-text">
                              {t('salesReturnModal.table.max', { qty: ln.remaining, unit: ln.unit })}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {ln.isInventory ? (
                            <Checkbox
                              aria-label={t('salesReturnModal.table.restockFor', { name: ln.itemName })}
                              checked={st?.restock !== false}
                              onCheckedChange={(checked) => setLine(ln.salesInvoiceItemId, { restock: checked === true })}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableRegion>
          )}

          {invoiceId && (
            <Field label={t('salesReturnModal.fields.reason')}>
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('salesReturnModal.fields.reasonPlaceholder')}
              />
            </Field>
          )}

          {(summary.total > 0 || hasQty) && (
            <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
              {summary.total > 0 ? (
                <>
                  <div className="flex justify-between"><span>{t('salesReturnModal.summary.subtotal')}</span><span className="tabular-nums">{formatRupiah(summary.subtotal)}</span></div>
                  {summary.tax > 0 && <div className="flex justify-between"><span>{t('salesReturnModal.summary.tax')}</span><span className="tabular-nums">{formatRupiah(summary.tax)}</span></div>}
                  <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>{t('salesReturnModal.summary.total')}</span><span className="tabular-nums">{formatRupiah(summary.total)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>↳ {t('salesReturnModal.summary.arReduce')}</span><span className="tabular-nums">{formatRupiah(summary.arReduce)}</span></div>
                  {summary.credit > 0 && <div className="flex justify-between text-muted-foreground"><span>↳ {t('salesReturnModal.summary.credit')}</span><span className="tabular-nums">{formatRupiah(summary.credit)}</span></div>}
                </>
              ) : (
                <div className="text-muted-foreground">{t('salesReturnModal.summary.qtyOnly')}</div>
              )}
            </div>
          )}
        </FormDialogBody>

        <FormDialogFooter>
          <FooterButton variant="ghost" onClick={onClose} disabled={mutation.isPending}>{t('salesReturnModal.cancel')}</FooterButton>
          <FooterButton
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={(summary.total <= 0 && !hasQty) || hasInvalidQty}
          >
            {mutation.isPending ? t('salesReturnModal.saving') : t('salesReturnModal.save')}
          </FooterButton>
        </FormDialogFooter>
      </DialogContent>
    </Dialog>
  );
}
