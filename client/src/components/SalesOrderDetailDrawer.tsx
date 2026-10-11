import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Pencil, Send, Ban, Truck, CheckCircle2, Download } from 'lucide-react';
import { LOCALE, formatRupiah, formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ConfirmDialog, DateInput, Field, LoadingState, StatusBadge } from '@/components/shared';
import {
  FormError,
  TableRegion,
} from '@/components/sales-a/overlay-parts';
import { numberInputClass } from '@/components/sales-a/overlay-classes';
import { toast } from 'sonner';
import AttachmentUpload from './AttachmentUpload';
import AttachmentPreview from './AttachmentPreview';
import { OptionSelect } from '@/components/sales-a/OptionSelect';
import { cap } from '@/lib/permissions';
import { pdf } from '@react-pdf/renderer';
import SalesOrderPDF from '../lib/pdf/SalesOrderPDF';
import { useCompanyPDF } from '../lib/pdf/useCompanyPDF';
import { mergeInvoicePdfWithAttachments } from '../lib/pdf/mergePdfWithAttachments';
import type { AttachmentRef } from '../lib/pdf/mergePdfWithAttachments';

interface Props {
  soId: string | null;
  onClose: () => void;
  onEdit: (so: any) => void;
}

const SalesOrderDetailDrawer: React.FC<Props> = ({ soId, onClose, onEdit }) => {
  const { t } = useTranslation('sales');
  const queryClient = useQueryClient();
  const company = useCompanyPDF();
  const [genDOOpen, setGenDOOpen] = useState(false);
  const [genItems, setGenItems] = useState<Record<string, number>>({});
  const [genWarehouseId, setGenWarehouseId] = useState('');
  const [genDate, setGenDate] = useState(new Date().toISOString().split('T')[0]);
  const [genNomorMobil, setGenNomorMobil] = useState('');
  const [genDriver, setGenDriver] = useState('');
  const [genRecipient, setGenRecipient] = useState('');
  const [genNotes, setGenNotes] = useState('');
  const [genAllowNeg, setGenAllowNeg] = useState(false);
  const [genNegReason, setGenNegReason] = useState('');
  const [genError, setGenError] = useState('');
  const canBypassNegativeStock = cap('inventory.negative_stock');
  // Uang muka (DP)
  const [dpOpen, setDpOpen] = useState(false);
  const [dpDate, setDpDate] = useState(new Date().toISOString().split('T')[0]);
  const [dpAmount, setDpAmount] = useState(0);
  const [dpAccountId, setDpAccountId] = useState('');
  const [dpNotes, setDpNotes] = useState('');
  const [dpError, setDpError] = useState('');

  const [cancelOpen, setCancelOpen] = useState(false);

  const { data: so, isLoading } = useQuery({
    queryKey: ['sales-order', soId],
    queryFn: async () => {
      const res = await api.get(`/sales-orders/${soId}`);
      return res.data;
    },
    enabled: Boolean(soId),
  });

  // Lampiran SO (PNG/PDF) untuk digabung ke PDF unduhan.
  const { data: attachments = [] } = useQuery({
    queryKey: ['so-attachments', soId],
    queryFn: async () => {
      const res = await api.get(`/attachments/sales_order/${soId}`);
      return (res.data.data ?? res.data) as Array<{ id: string; fileName: string; mimeType: string }>;
    },
    enabled: Boolean(soId),
  });

  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadPDF = async () => {
    if (!so) return;
    setIsDownloading(true);
    try {
      const soBlob = await pdf(<SalesOrderPDF so={so} company={company} />).toBlob();
      if (attachments.length === 0) {
        const url = URL.createObjectURL(soBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${so.soNumber}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
        return;
      }
      const refs: AttachmentRef[] = attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        mimeType: a.mimeType,
        fetchUrl: `/attachments/file/${a.id}`,
      }));
      const merged = await mergeInvoicePdfWithAttachments(soBlob, refs, {
        fetchBinary: async (url) => {
          const res = await api.get(url, { responseType: 'arraybuffer' });
          return res.data as ArrayBuffer;
        },
      });
      const url = URL.createObjectURL(merged);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${so.soNumber}_with_lampiran.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(t('salesOrderDetailDrawer.toast.pdfReady', { count: attachments.length }));
    } catch (err: any) {
      toast.error(err?.message || t('salesOrderDetailDrawer.toast.pdfFailed'));
    } finally {
      setIsDownloading(false);
    }
  };

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses-active'],
    queryFn: async () => {
      const res = await api.get('/warehouses');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((w: any) => w.isActive !== false);
    },
  });

  // Akun kas/bank untuk terima uang muka. Pakai /coa/flat (daftar datar) —
  // /coa mengembalikan tree (akun 1.1.x ada di children) sehingga filter
  // flat tak menemukan apa pun → dropdown kosong.
  const { data: cashAccounts } = useQuery({
    queryKey: ['cash-bank-accounts'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((a: any) => !a.isGroup && a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1'));
    },
  });

  const depositMut = useMutation({
    mutationFn: async () => {
      if (dpAmount <= 0) throw new Error(t('salesOrderDetailDrawer.deposit.errors.amountPositive'));
      if (!dpAccountId) throw new Error(t('salesOrderDetailDrawer.deposit.errors.accountRequired'));
      const res = await api.post('/payments', {
        date: dpDate,
        partyId: so.partyId,
        amount: dpAmount,
        paymentType: 'CustomerDeposit',
        accountId: dpAccountId,
        salesOrderId: soId,
        notes: dpNotes || t('salesOrderDetailDrawer.deposit.defaultNote', { number: so.soNumber }),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-order', soId] });
      queryClient.invalidateQueries({ queryKey: ['customer-deposits'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.success(t('salesOrderDetailDrawer.toast.depositReceived'));
      setDpOpen(false);
      setDpAmount(0);
      setDpNotes('');
      setDpError('');
    },
    onError: (err: any) => setDpError(err?.response?.data?.error || err?.message || t('salesOrderDetailDrawer.toast.depositFailed')),
  });

  useEffect(() => {
    if (so?.items) {
      // Initialize gen items to remaining qty per line
      const init: Record<string, number> = {};
      // Default qty kirim 0 — user isi sendiri (partial), jangan auto-penuh.
      so.items.forEach((it: any) => {
        init[it.id] = 0;
      });
      setGenItems(init);
    }
  // Reinitialise only when a different SO is shown, not on every refetch of the same SO.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [so?.id]);

  const submitMut = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/sales-orders/${soId}/submit`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      queryClient.invalidateQueries({ queryKey: ['sales-order', soId] });
      toast.success(t('salesOrderDetailDrawer.toast.submitted'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || t('salesOrderDetailDrawer.toast.submitFailed')),
  });

  const cancelMut = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/sales-orders/${soId}/cancel`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      queryClient.invalidateQueries({ queryKey: ['sales-order', soId] });
      toast.success(t('salesOrderDetailDrawer.toast.cancelled'));
      onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || t('salesOrderDetailDrawer.toast.cancelFailed')),
  });

  const genDOMut = useMutation({
    mutationFn: async () => {
      const items = Object.entries(genItems)
        .filter(([, qty]) => qty > 0)
        .map(([salesOrderItemId, quantity]) => ({
          salesOrderItemId,
          quantity,
          warehouseId: genWarehouseId || null,
        }));
      if (items.length === 0) throw new Error(t('salesOrderDetailDrawer.generateDo.errors.noItems'));
      if (!genWarehouseId) throw new Error(t('salesOrderDetailDrawer.generateDo.errors.warehouseRequired'));
      if (genAllowNeg && genNegReason.trim().length < 10) throw new Error(t('salesOrderDetailDrawer.generateDo.errors.reasonRequired'));
      const res = await api.post(`/sales-orders/${soId}/generate-do`, {
        date: genDate,
        nomorMobil: genNomorMobil || null,
        driverName: genDriver || null,
        recipientName: genRecipient || null,
        notes: genNotes || null,
        allowNegativeStock: genAllowNeg,
        negativeStockReason: genAllowNeg ? genNegReason.trim() : null,
        items,
      });
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      queryClient.invalidateQueries({ queryKey: ['sales-order', soId] });
      queryClient.invalidateQueries({ queryKey: ['delivery-orders'] });
      toast.success(t('salesOrderDetailDrawer.toast.doCreated', { number: data.doNumber }));
      setGenDOOpen(false);
      setGenError('');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || t('salesOrderDetailDrawer.toast.doFailed');
      setGenError(msg);
    },
  });

  if (!soId) return null;

  const canGenerateDO = so && (so.status === 'Submitted' || so.status === 'PartiallyDelivered');
  const canCancel = so && (so.status === 'Draft' || so.status === 'Submitted');
  const showFooter = so && (so.status === 'Draft' || canGenerateDO || canCancel);
  const metaLabel = 'text-muted-foreground';

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent size="lg">
          <SheetHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <SheetTitle>{t('salesOrderDetailDrawer.title')}</SheetTitle>
                <SheetDescription className="font-mono">{so ? so.soNumber : t('salesOrderDetailDrawer.loading')}</SheetDescription>
              </div>
              {so && so.status !== 'Cancelled' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="max-sm:h-11"
                  onClick={handleDownloadPDF}
                  loading={isDownloading}
                  title={attachments.length > 0 ? t('salesOrderDetailDrawer.pdf.titleWithAttachments', { count: attachments.length }) : t('salesOrderDetailDrawer.pdf.title')}
                >
                  {!isDownloading && <Download aria-hidden />}
                  {isDownloading ? t('salesOrderDetailDrawer.pdf.preparing') : (attachments.length > 0 ? t('salesOrderDetailDrawer.pdf.downloadWithCount', { count: attachments.length }) : t('salesOrderDetailDrawer.pdf.download'))}
                </Button>
              )}
            </div>
          </SheetHeader>

          <SheetBody>
            {isLoading ? (
              <LoadingState label={t('salesOrderDetailDrawer.loadingOrder')} />
            ) : !so ? (
              <div className="p-6 text-center text-muted-foreground">{t('salesOrderDetailDrawer.notFound')}</div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm"><span className={metaLabel}>{t('salesOrderDetailDrawer.meta.date')}</span> {formatDate(so.date)}</p>
                    {so.expectedDelivery && <p className="text-sm"><span className={metaLabel}>{t('salesOrderDetailDrawer.meta.expectedDelivery')}</span> {formatDate(so.expectedDelivery)}</p>}
                    <p className="text-sm"><span className={metaLabel}>{t('salesOrderDetailDrawer.meta.customer')}</span> <span className="font-medium">{so.customer?.name}</span></p>
                    {so.customerRefNo && <p className="text-sm"><span className={metaLabel}>{t('salesOrderDetailDrawer.meta.customerRef')}</span> {so.customerRefNo}</p>}
                    {so.quotation?.quotationNumber && (
                      <p className="text-sm"><span className={metaLabel}>{t('salesOrderDetailDrawer.meta.quotation')}</span> <span className="font-mono">{so.quotation.quotationNumber}</span></p>
                    )}
                    {so.notes && <p className="text-sm text-muted-foreground">{t('salesOrderDetailDrawer.meta.notes', { notes: so.notes })}</p>}
                  </div>
                  <StatusBadge status={so.status} docType="sales_order" />
                </div>

                <TableRegion label={t('salesOrderDetailDrawer.items.label')}>
                  <table className="min-w-[640px] w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-left text-xs">{t('salesOrderDetailDrawer.items.item')}</th>
                        <th scope="col" className="px-3 py-2 text-right text-xs">{t('salesOrderDetailDrawer.items.qty')}</th>
                        <th scope="col" className="px-3 py-2 text-right text-xs">{t('salesOrderDetailDrawer.items.delivered')}</th>
                        <th scope="col" className="px-3 py-2 text-right text-xs">{t('salesOrderDetailDrawer.items.remaining')}</th>
                        <th scope="col" className="px-3 py-2 text-right text-xs">{t('salesOrderDetailDrawer.items.rate')}</th>
                        <th scope="col" className="px-3 py-2 text-right text-xs">{t('salesOrderDetailDrawer.items.subtotal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {so.items?.map((it: any) => {
                        const remaining = Number(it.quantity) - Number(it.deliveredQty);
                        const over = remaining < -0.0001;
                        const fully = Math.abs(remaining) <= 0.0001;
                        return (
                          <tr key={it.id} className="border-t border-border">
                            <td className="px-3 py-2">
                              <p className="font-medium">{it.itemName}</p>
                              {it.inventoryItem && <p className="font-mono text-xs text-muted-foreground">{it.inventoryItem.code}</p>}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{Number(it.quantity).toLocaleString(LOCALE)} {it.unit}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{Number(it.deliveredQty).toLocaleString(LOCALE)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {over ? (
                                <span className="font-medium text-info-text" title={t('salesOrderDetailDrawer.items.overDeliveredTitle')}>
                                  {t('salesOrderDetailDrawer.items.overDelivered', { qty: Math.abs(remaining).toLocaleString(LOCALE) })}
                                </span>
                              ) : fully ? (
                                <span className="text-success-text">
                                  <CheckCircle2 size={12} className="inline" aria-hidden />
                                  <span className="sr-only">{t('salesOrderDetailDrawer.items.fullyDelivered')}</span>
                                </span>
                              ) : (
                                <span className="font-medium text-warning-text">{remaining.toLocaleString(LOCALE)}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(Number(it.rate))}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(Number(it.amount))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t border-border bg-muted/30">
                      <tr>
                        <td colSpan={5} className="px-3 py-2 text-right text-sm text-muted-foreground">{t('salesOrderDetailDrawer.totals.subtotal')}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(Number(so.subtotal))}</td>
                      </tr>
                      {Number(so.potongan) > 0 && (
                        <tr>
                          <td colSpan={5} className="px-3 py-2 text-right text-sm text-muted-foreground">{t('salesOrderDetailDrawer.totals.discount')}</td>
                          <td className="px-3 py-2 text-right tabular-nums">-{formatRupiah(Number(so.potongan))}</td>
                        </tr>
                      )}
                      {Number(so.taxPct) > 0 && (
                        <tr>
                          <td colSpan={5} className="px-3 py-2 text-right text-sm text-muted-foreground">{t('salesOrderDetailDrawer.totals.tax', { pct: so.taxPct })}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatRupiah((Number(so.subtotal) - Number(so.potongan)) * Number(so.taxPct) / 100)}</td>
                        </tr>
                      )}
                      {Number(so.biayaLain) > 0 && (
                        <tr>
                          <td colSpan={5} className="px-3 py-2 text-right text-sm text-muted-foreground">{t('salesOrderDetailDrawer.totals.otherCosts')}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(Number(so.biayaLain))}</td>
                        </tr>
                      )}
                      <tr className="border-t border-border">
                        <td colSpan={5} className="px-3 py-2 text-right font-semibold">{t('salesOrderDetailDrawer.totals.grandTotal')}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-primary">{formatRupiah(Number(so.grandTotal))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </TableRegion>

                {/* Panel Uang Muka (DP) */}
                {so.depositSummary && so.status !== 'Cancelled' && (
                  <section aria-label={t('salesOrderDetailDrawer.deposit.label')} className="space-y-2 rounded-lg border border-success/30 bg-success-subtle/40 p-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-success-text">{t('salesOrderDetailDrawer.deposit.title')}</h3>
                      {so.depositSummary.pct > 0 && (
                        <span className="rounded bg-success-subtle px-2 py-0.5 text-xs font-medium text-success-text">
                          {t('salesOrderDetailDrawer.deposit.pctOfTotal', { pct: so.depositSummary.pct })}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                      <div>
                        <p className="text-[11px] text-muted-foreground">{t('salesOrderDetailDrawer.deposit.received')}</p>
                        <p className="font-semibold tabular-nums text-success-text">{formatRupiah(so.depositSummary.received)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">{t('salesOrderDetailDrawer.deposit.applied')}</p>
                        <p className="tabular-nums">{formatRupiah(so.depositSummary.applied ?? 0)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">{t('salesOrderDetailDrawer.deposit.remaining')}</p>
                        <p className="font-semibold tabular-nums text-success-text">{formatRupiah(so.depositSummary.depositRemaining ?? so.depositSummary.received)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 border-t border-success/20 pt-2 text-sm">
                      <div>
                        <p className="text-[11px] text-muted-foreground">{t('salesOrderDetailDrawer.deposit.grandTotal')}</p>
                        <p className="tabular-nums">{formatRupiah(so.depositSummary.grandTotal)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">{t('salesOrderDetailDrawer.deposit.outstanding')}</p>
                        <p className="font-semibold tabular-nums">{formatRupiah(so.depositSummary.remaining)}</p>
                      </div>
                    </div>
                    {so.depositPayments?.length > 0 && (
                      <ul className="space-y-0.5 border-t border-success/20 pt-1.5 text-xs">
                        {so.depositPayments.map((p: any) => (
                          <li key={p.id} className="flex items-center justify-between gap-2">
                            <span className="font-mono text-muted-foreground">{p.paymentNumber} • {formatDate(p.date)}</span>
                            <span className="tabular-nums">{formatRupiah(Number(p.amount) - Number(p.refundedAmount))}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {so.status !== 'Draft' && !dpOpen && (
                      <Button variant="secondary" size="sm" className="max-sm:h-11" onClick={() => { setDpOpen(true); setDpError(''); }}>
                        {t('salesOrderDetailDrawer.deposit.receive')}
                      </Button>
                    )}
                    {dpOpen && (
                      <div className="space-y-2 border-t border-success/20 pt-2">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <Field label={t('salesOrderDetailDrawer.fields.date')}>
                            {(c) => <DateInput id={c.id} value={dpDate} onChange={setDpDate} />}
                          </Field>
                          <Field label={t('salesOrderDetailDrawer.deposit.amount')}>
                            <NumberInput value={dpAmount} onChange={(e) => setDpAmount(Number(e.target.value))} className={numberInputClass} min={0} />
                          </Field>
                        </div>
                        <Field label={t('salesOrderDetailDrawer.deposit.account')}>
                          {() => (
                            <OptionSelect
                              aria-label={t('salesOrderDetailDrawer.deposit.account')}
                              value={dpAccountId}
                              onChange={setDpAccountId}
                              emptyLabel={t('salesOrderDetailDrawer.deposit.accountPlaceholder')}
                              options={(cashAccounts ?? []).map((a: any) => ({ value: a.id, label: `${a.accountNumber} · ${a.name}` }))}
                            />
                          )}
                        </Field>
                        <FormError>{dpError}</FormError>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                          <Button variant="ghost" className="max-sm:h-11" onClick={() => { setDpOpen(false); setDpError(''); }} disabled={depositMut.isPending}>{t('salesOrderDetailDrawer.cancel')}</Button>
                          <Button className="max-sm:h-11" onClick={() => depositMut.mutate()} loading={depositMut.isPending}>
                            {depositMut.isPending ? t('salesOrderDetailDrawer.saving') : t('salesOrderDetailDrawer.deposit.save')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {so.deliveryOrders?.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">{t('salesOrderDetailDrawer.relatedDeliveryOrders')}</h3>
                    <ul className="space-y-1 text-sm">
                      {so.deliveryOrders.map((d: any) => (
                        <li key={d.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1.5">
                          <span className="font-mono text-xs">{d.doNumber}</span>
                          <span className="text-xs text-muted-foreground">{formatDate(d.date)} • <StatusBadge status={d.status} docType="delivery_order" dot={false} /></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Lampiran — PO pelanggan, kontrak, bukti, dll */}
                <div className="border-t border-border pt-3">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('salesOrderDetailDrawer.attachments')}
                  </h3>
                  <AttachmentPreview referenceType="sales_order" referenceId={so.id} />
                  {so.status !== 'Cancelled' && (
                    <div className="mt-2">
                      <AttachmentUpload referenceType="sales_order" referenceId={so.id} />
                    </div>
                  )}
                </div>

                {/* Generate DO inline panel */}
                {genDOOpen && canGenerateDO && (
                  <section aria-label={t('salesOrderDetailDrawer.generateDo.title')} className="space-y-3 rounded-lg border-2 border-primary/30 bg-primary-subtle/40 p-4">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <Truck size={14} aria-hidden /> {t('salesOrderDetailDrawer.generateDo.title')}
                    </h3>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <Field label={t('salesOrderDetailDrawer.fields.date')}>
                        {(c) => <DateInput id={c.id} value={genDate} onChange={setGenDate} />}
                      </Field>
                      <Field label={t('salesOrderDetailDrawer.generateDo.warehouse')} required>
                        {() => (
                          <OptionSelect
                            aria-label={t('salesOrderDetailDrawer.generateDo.warehouse')}
                            value={genWarehouseId}
                            onChange={setGenWarehouseId}
                            emptyLabel={t('salesOrderDetailDrawer.generateDo.warehousePlaceholder')}
                            options={(warehouses ?? []).map((w: any) => ({ value: w.id, label: w.name }))}
                          />
                        )}
                      </Field>
                      <Field label={t('salesOrderDetailDrawer.generateDo.vehicleNo')}>
                        <Input value={genNomorMobil} onChange={(e) => setGenNomorMobil(e.target.value)} autoComplete="off" />
                      </Field>
                    </div>
                    <Field label={t('salesOrderDetailDrawer.generateDo.driver')}>
                      <Input value={genDriver} onChange={(e) => setGenDriver(e.target.value)} autoComplete="off" />
                    </Field>
                    <Field label={t('salesOrderDetailDrawer.generateDo.recipient')}>
                      <Input value={genRecipient} onChange={(e) => setGenRecipient(e.target.value)} placeholder={t('salesOrderDetailDrawer.generateDo.recipientPlaceholder')} autoComplete="off" />
                    </Field>
                    <Field label={t('salesOrderDetailDrawer.generateDo.notes')}>
                      <Input value={genNotes} onChange={(e) => setGenNotes(e.target.value)} placeholder={t('salesOrderDetailDrawer.generateDo.optional')} autoComplete="off" />
                    </Field>
                    <TableRegion label={t('salesOrderDetailDrawer.generateDo.table.label')} className="bg-card">
                      <table className="min-w-[420px] w-full text-sm">
                        <thead className="bg-muted/40">
                          <tr>
                            <th scope="col" className="px-2 py-1 text-left text-xs">{t('salesOrderDetailDrawer.generateDo.table.item')}</th>
                            <th scope="col" className="px-2 py-1 text-right text-xs">{t('salesOrderDetailDrawer.generateDo.table.remaining')}</th>
                            <th scope="col" className="w-36 px-2 py-1 text-right text-xs">{t('salesOrderDetailDrawer.generateDo.table.qty')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {so.items?.map((it: any) => {
                            const remaining = Number(it.quantity) - Number(it.deliveredQty);
                            if (remaining <= 0) return null;
                            return (
                              <tr key={it.id} className="border-t border-border">
                                <td className="px-2 py-1.5">{it.itemName}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{remaining.toLocaleString(LOCALE)} {it.unit}</td>
                                <td className="px-2 py-1.5">
                                  <NumberInput
                                    aria-label={t('salesOrderDetailDrawer.generateDo.table.qtyFor', { name: it.itemName })}
                                    value={genItems[it.id] ? String(genItems[it.id]) : ''}
                                    onChange={(e) => setGenItems((prev) => ({ ...prev, [it.id]: Number(e.target.value) }))}
                                    className={numberInputClass}
                                    min={0}
                                    max={remaining}
                                    step="0.001"
                                    placeholder={t('salesOrderDetailDrawer.generateDo.table.max', { qty: remaining })}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </TableRegion>
                    {canBypassNegativeStock && (
                      <div className="space-y-1.5 rounded border border-warning/30 bg-warning-subtle p-2">
                        <label className="flex cursor-pointer items-start gap-2 text-xs text-warning-text max-sm:min-h-11">
                          <Checkbox className="mt-0.5" checked={genAllowNeg} onCheckedChange={(checked) => setGenAllowNeg(checked === true)} />
                          <span><strong>{t('salesOrderDetailDrawer.generateDo.override.label')}</strong> {t('salesOrderDetailDrawer.generateDo.override.text')}</span>
                        </label>
                        {genAllowNeg && (
                          <Field label={t('salesOrderDetailDrawer.generateDo.override.reason')} required>
                            <Textarea value={genNegReason} onChange={(e) => setGenNegReason(e.target.value)} placeholder={t('salesOrderDetailDrawer.generateDo.override.reasonPlaceholder')} className="text-xs" rows={2} />
                          </Field>
                        )}
                      </div>
                    )}
                    <FormError>{genError}</FormError>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                      <Button variant="ghost" className="max-sm:h-11" onClick={() => { setGenDOOpen(false); setGenError(''); }} disabled={genDOMut.isPending}>{t('salesOrderDetailDrawer.cancel')}</Button>
                      <Button className="max-sm:h-11" onClick={() => genDOMut.mutate()} loading={genDOMut.isPending}>
                        {genDOMut.isPending ? t('salesOrderDetailDrawer.generateDo.creating') : t('salesOrderDetailDrawer.generateDo.title')}
                      </Button>
                    </div>
                  </section>
                )}
              </div>
            )}
          </SheetBody>

          {showFooter && (
            <SheetFooter className="sm:justify-between">
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                {canCancel && (
                  <Button variant="ghost" className="text-danger-text max-sm:h-11" onClick={() => setCancelOpen(true)} disabled={cancelMut.isPending}>
                    <Ban aria-hidden /> {t('salesOrderDetailDrawer.cancelSo')}
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap [&>*:only-child]:col-span-2">
                {so.status === 'Draft' && (
                  <>
                    <Button variant="outline" className="max-sm:h-11" onClick={() => onEdit(so)}>
                      <Pencil aria-hidden /> {t('salesOrderDetailDrawer.edit')}
                    </Button>
                    <Button className="max-sm:h-11" onClick={() => submitMut.mutate()} loading={submitMut.isPending}>
                      {!submitMut.isPending && <Send aria-hidden />} {t('salesOrderDetailDrawer.submit')}
                    </Button>
                  </>
                )}
                {canGenerateDO && !genDOOpen && (
                  <Button className="max-sm:h-11" onClick={() => setGenDOOpen(true)}>
                    <Truck aria-hidden /> {t('salesOrderDetailDrawer.generateDo.title')}
                  </Button>
                )}
              </div>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        tone="danger"
        title={t('salesOrderDetailDrawer.confirmCancel.title')}
        description={so ? t('salesOrderDetailDrawer.confirmCancel.description', { number: so.soNumber }) : undefined}
        confirmLabel={t('salesOrderDetailDrawer.cancelSo')}
        cancelLabel={t('salesOrderDetailDrawer.confirmCancel.back')}
        loading={cancelMut.isPending}
        onConfirm={() => cancelMut.mutateAsync()}
      />
    </>
  );
};

export default SalesOrderDetailDrawer;
