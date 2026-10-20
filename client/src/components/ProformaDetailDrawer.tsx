import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Loader2, Send, FileCheck2, Download, Edit3, Trash2, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { formatRupiah, formatDate } from '@/lib/format';
import { can } from '@/lib/permissions';
import { Button, buttonVariants } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ConfirmDialog, LoadingState, StatusBadge } from '@/components/shared';
import { cn } from '@/lib/utils';
import { TableRegion } from '@/components/sales-a/overlay-parts';
import { PDFDownloadLink } from '@react-pdf/renderer';
import ProformaInvoicePDF from '../lib/pdf/ProformaInvoicePDF';
import { useCompanyPDF } from '../lib/pdf/useCompanyPDF';

interface ApiErr { response?: { data?: { error?: string } } }
interface ProformaItemRow {
  id: string; itemName: string; itemType?: string; inventoryItemId?: string | null; serviceItemId?: string | null;
  accountId?: string | null; description?: string | null; quantity: number | string; unit?: string | null;
  rate: number | string; discount?: number | string | null; taxPct?: number | string | null; pphPct?: number | string | null;
  amount: number | string;
}

interface Props {
  proformaId: string | null;
  onClose: () => void;
  onEdit?: (p: unknown) => void;
}

const ProformaDetailDrawer: React.FC<Props> = ({ proformaId, onClose, onEdit }) => {
  const { t } = useTranslation('sales');
  const isOpen = proformaId !== null;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const company = useCompanyPDF();
  const canEdit = can('proforma_invoice', 'edit');
  const [confirmAction, setConfirmAction] = useState<null | 'send' | 'cancel' | 'delete' | 'convert'>(null);

  const { data: p, isLoading } = useQuery({
    queryKey: ['proforma-invoice', proformaId],
    queryFn: async () => (await api.get(`/proforma-invoices/${proformaId}`)).data,
    enabled: isOpen,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['proforma-invoices'] });
    queryClient.invalidateQueries({ queryKey: ['proforma-invoice', proformaId] });
  };

  const sendMut = useMutation({
    mutationFn: () => api.patch(`/proforma-invoices/${proformaId}/send`),
    onSuccess: () => { toast.success(t('proformaDetailDrawer.toast.sent')); invalidate(); },
    onError: (e: ApiErr) => toast.error((e.response?.data?.error ?? t('proformaDetailDrawer.errors.sendFailed'))),
  });
  const cancelMut = useMutation({
    mutationFn: () => api.patch(`/proforma-invoices/${proformaId}/cancel`),
    onSuccess: () => { toast.success(t('proformaDetailDrawer.toast.cancelled')); invalidate(); },
    onError: (e: ApiErr) => toast.error((e.response?.data?.error ?? t('proformaDetailDrawer.errors.cancelFailed'))),
  });
  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/proforma-invoices/${proformaId}`),
    onSuccess: () => { toast.success(t('proformaDetailDrawer.toast.deleted')); invalidate(); onClose(); },
    onError: (e: ApiErr) => toast.error((e.response?.data?.error ?? t('proformaDetailDrawer.errors.deleteFailed'))),
  });

  // Invoice dibuat lewat jalur resmi /sales/invoices (GL satu pintu), lalu ditautkan ke proforma.
  const convertMut = useMutation({
    mutationFn: async () => {
      const p2 = (await api.get(`/proforma-invoices/${proformaId}/convert-payload`)).data;
      const today = new Date().toISOString().split('T')[0];
      const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
      const note = t('proformaDetailDrawer.convertedFromNote', { number: p2.proformaNumber });
      const inv = (
        await api.post('/sales/invoices', {
          date: today,
          dueDate,
          partyId: p2.partyId,
          customerRefNo: p2.customerRefNo ?? undefined,
          items: p2.items.map((it: ProformaItemRow) => ({
            itemType: it.itemType, inventoryItemId: it.inventoryItemId, serviceItemId: it.serviceItemId, accountId: it.accountId,
            itemName: it.itemName, quantity: it.quantity, unit: it.unit, rate: it.rate, discount: it.discount,
            taxPct: it.taxPct, pphPct: it.pphPct, description: it.description,
          })),
          potongan: p2.potongan,
          biayaLain: p2.biayaLain,
          labelPotongan: p2.labelPotongan,
          labelBiaya: p2.labelBiaya,
          terms: p2.terms,
          notes: p2.notes ? `${p2.notes}\n\n${note}` : note,
          allowNegativeStock: false,
        })
      ).data;
      await api.post(`/proforma-invoices/${proformaId}/link`, { salesInvoiceId: inv.id });
      return { invoice: inv, depositPaid: Number(p2.depositPaid ?? 0) };
    },
    onSuccess: ({ invoice, depositPaid }) => {
      toast.success(t('proformaDetailDrawer.toast.invoiceCreated', { number: invoice.invoiceNumber }));
      if (depositPaid > 0) toast.info(t('proformaDetailDrawer.toast.applyDeposit', { amount: formatRupiah(depositPaid) }), { duration: 10000 });
      invalidate();
      ['sales-invoices', 'parties', 'coa'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      onClose();
      navigate('/sales');
    },
    onError: (e: ApiErr) => toast.error((e.response?.data?.error ?? t('proformaDetailDrawer.errors.convertFailed'))),
  });

  if (!isOpen) return null;
  const footBtn = 'max-sm:h-11';
  const pay = p?.payment as { target: number; paid: number; remaining: number; paidPct: number } | undefined;
  const display: string | undefined = p?.displayStatus;
  const canConvert = canEdit && p?.status === 'Sent';
  const canCancel = canEdit && p && ['Sent'].includes(p.status);

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent size="md">
          <SheetHeader>
            <SheetTitle>{t('proformaDetailDrawer.title')}</SheetTitle>
            <SheetDescription className="font-mono">{p ? p.proformaNumber : t('proformaDetailDrawer.loading')}</SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-4">
            {isLoading || !p ? (
              <LoadingState label={t('proformaDetailDrawer.loadingProforma')} />
            ) : (
              <>
                <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">{t('proformaDetailDrawer.fields.status')}</span>
                    <StatusBadge status={display ?? p.status} docType="proforma_invoice" />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t('proformaDetailDrawer.fields.date')}</span>
                    <span className="font-medium text-foreground">{formatDate(p.date)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t('proformaDetailDrawer.fields.validUntil')}</span>
                    <span className="font-medium text-foreground">{formatDate(p.validUntil)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">{t('proformaDetailDrawer.fields.customer')}</span>
                    <span className="font-medium text-foreground">{p.customer?.name}</span>
                  </div>
                  {p.customerRefNo && (
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{t('proformaDetailDrawer.fields.customerRef')}</span>
                      <span className="font-medium text-foreground">{p.customerRefNo}</span>
                    </div>
                  )}
                  {p.quotation && (
                    <div className="flex items-center justify-between border-t border-border pt-1 text-xs">
                      <span className="text-muted-foreground">{t('proformaDetailDrawer.fields.quotation')}</span>
                      <span className="font-mono text-foreground">{p.quotation.quotationNumber}</span>
                    </div>
                  )}
                  {p.salesOrder && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{t('proformaDetailDrawer.fields.salesOrder')}</span>
                      <span className="font-mono text-foreground">{p.salesOrder.soNumber}</span>
                    </div>
                  )}
                  {p.salesInvoice && (
                    <div className="flex items-center justify-between border-t border-border pt-1 text-xs">
                      <span className="text-muted-foreground">{t('proformaDetailDrawer.fields.salesInvoice')}</span>
                      <span className="font-mono text-success-text">{p.salesInvoice.invoiceNumber}</span>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold text-foreground">{t('proformaDetailDrawer.items.title')}</h4>
                  <TableRegion label={t('proformaDetailDrawer.items.tableLabel')}>
                    <table className="w-full min-w-[420px] text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th scope="col" className="px-2 py-1.5 text-left">{t('proformaDetailDrawer.items.item')}</th>
                          <th scope="col" className="px-2 py-1.5 text-right">{t('proformaDetailDrawer.items.qty')}</th>
                          <th scope="col" className="px-2 py-1.5 text-right">{t('proformaDetailDrawer.items.price')}</th>
                          <th scope="col" className="px-2 py-1.5 text-right">{t('proformaDetailDrawer.items.total')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {((p.items ?? []) as ProformaItemRow[]).map((it) => (
                          <tr key={it.id} className="border-b border-border/50">
                            <td className="px-2 py-1.5">
                              <p className="font-medium text-foreground">{it.itemName}</p>
                              {it.description && <p className="text-[11px] text-muted-foreground">{it.description}</p>}
                            </td>
                            <td className="px-2 text-right tabular-nums">{Number(it.quantity)} {it.unit}</td>
                            <td className="px-2 text-right tabular-nums">{formatRupiah(Number(it.rate))}</td>
                            <td className="px-2 text-right font-semibold tabular-nums">{formatRupiah(Number(it.amount))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableRegion>
                </div>

                <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">{t('proformaDetailDrawer.summary.subtotal')}</span>
                    <span className="tabular-nums">{formatRupiah(Number(p.subtotal))}</span></div>
                  {Number(p.potongan) > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">{p.labelPotongan ?? t('proformaDetailDrawer.summary.discount')}</span>
                      <span className="tabular-nums">−{formatRupiah(Number(p.potongan))}</span></div>
                  )}
                  {Number(p.biayaLain) !== 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">{p.labelBiaya ?? t('proformaDetailDrawer.summary.otherCosts')}</span>
                      <span className="tabular-nums">{formatRupiah(Number(p.biayaLain))}</span></div>
                  )}
                  <div className="flex justify-between border-t border-border pt-1 font-bold">
                    <span>{t('proformaDetailDrawer.summary.grandTotal')}</span>
                    <span className="tabular-nums text-primary">{formatRupiah(Number(p.grandTotal))}</span>
                  </div>
                </div>

                {pay && (
                  <div className="space-y-1 rounded-lg border border-border p-3 text-sm" data-testid="proforma-payment">
                    <div className="flex justify-between"><span className="text-muted-foreground">{t('proformaDetailDrawer.payment.billed')}</span>
                      <span className="tabular-nums">{formatRupiah(pay.target)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">{t('proformaDetailDrawer.payment.paid', { pct: pay.paidPct })}</span>
                      <span className="tabular-nums text-success-text">{formatRupiah(pay.paid)}</span></div>
                    <div className="flex justify-between border-t border-border pt-1 font-semibold">
                      <span>{t('proformaDetailDrawer.payment.remaining')}</span>
                      <span className="tabular-nums">{formatRupiah(pay.remaining)}</span>
                    </div>
                    {(p.deposits ?? []).length > 0 && (
                      <p className="pt-1 text-[11px] text-muted-foreground">
                        {(p.deposits as { paymentNumber: string }[]).map((d) => d.paymentNumber).join(', ')}
                      </p>
                    )}
                    {p.status === 'Sent' && pay.remaining > 0 && (
                      <p className="pt-1 text-[11px] text-muted-foreground">{t('proformaDetailDrawer.payment.howTo')}</p>
                    )}
                  </div>
                )}

                {(p.notes || p.terms) && (
                  <div className="space-y-2 text-xs">
                    {p.notes && (
                      <div>
                        <p className="mb-1 font-semibold text-foreground">{t('proformaDetailDrawer.fields.notes')}</p>
                        <p className="whitespace-pre-line text-muted-foreground">{p.notes}</p>
                      </div>
                    )}
                    {p.terms && (
                      <div>
                        <p className="mb-1 font-semibold text-foreground">{t('proformaDetailDrawer.fields.terms')}</p>
                        <p className="whitespace-pre-line text-muted-foreground">{p.terms}</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </SheetBody>

          {p && (
            <SheetFooter className="flex-wrap sm:justify-between">
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                {canEdit && p.status === 'Draft' && (
                  <Button variant="ghost" className={cn('text-danger-text', footBtn)} onClick={() => setConfirmAction('delete')}>
                    <Trash2 aria-hidden /> {t('proformaDetailDrawer.actions.delete')}
                  </Button>
                )}
                {canCancel && (
                  <Button variant="ghost" className={cn('text-danger-text', footBtn)} onClick={() => setConfirmAction('cancel')} disabled={cancelMut.isPending}>
                    <Ban aria-hidden /> {t('proformaDetailDrawer.actions.cancel')}
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap [&>*:only-child]:col-span-2">
                <PDFDownloadLink
                  document={<ProformaInvoicePDF proforma={{ ...p, status: display ?? p.status, paid: pay?.paid ?? 0 }} company={company} />}
                  fileName={`${p.proformaNumber}.pdf`}
                  className={cn(buttonVariants({ variant: 'outline', size: 'md' }), footBtn)}
                >
                  {({ loading }) => (
                    <>
                      {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
                      PDF
                    </>
                  )}
                </PDFDownloadLink>

                {canEdit && p.status === 'Draft' && (
                  <>
                    <Button variant="outline" className={footBtn} onClick={() => onEdit?.(p)}>
                      <Edit3 aria-hidden /> {t('proformaDetailDrawer.actions.edit')}
                    </Button>
                    <Button className={footBtn} onClick={() => setConfirmAction('send')} disabled={sendMut.isPending}>
                      <Send aria-hidden /> {t('proformaDetailDrawer.actions.send')}
                    </Button>
                  </>
                )}

                {canConvert && (
                  <Button className={footBtn} onClick={() => setConfirmAction('convert')} loading={convertMut.isPending}>
                    {!convertMut.isPending && <FileCheck2 aria-hidden />}
                    {t('proformaDetailDrawer.actions.convertToInvoice')}
                  </Button>
                )}
              </div>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmAction === 'send'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={t('proformaDetailDrawer.confirm.send.title')}
        description={t('proformaDetailDrawer.confirm.send.description', { number: p?.proformaNumber ?? '' })}
        confirmLabel={t('proformaDetailDrawer.confirm.send.confirm')}
        loading={sendMut.isPending}
        onConfirm={() => sendMut.mutateAsync()}
      />
      <ConfirmDialog
        open={confirmAction === 'convert'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={t('proformaDetailDrawer.confirm.convert.title')}
        description={
          pay && pay.paid > 0
            ? t('proformaDetailDrawer.confirm.convert.descriptionWithDeposit', { amount: formatRupiah(pay.paid) })
            : t('proformaDetailDrawer.confirm.convert.description')
        }
        confirmLabel={t('proformaDetailDrawer.confirm.convert.confirm')}
        loading={convertMut.isPending}
        onConfirm={() => convertMut.mutateAsync()}
      />
      <ConfirmDialog
        open={confirmAction === 'cancel'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        tone="danger"
        title={t('proformaDetailDrawer.confirm.cancel.title')}
        description={t('proformaDetailDrawer.confirm.cancel.description')}
        confirmLabel={t('proformaDetailDrawer.confirm.cancel.confirm')}
        loading={cancelMut.isPending}
        onConfirm={() => cancelMut.mutateAsync()}
      />
      <ConfirmDialog
        open={confirmAction === 'delete'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        tone="danger"
        title={t('proformaDetailDrawer.confirm.delete.title')}
        description={t('proformaDetailDrawer.confirm.delete.description')}
        confirmLabel={t('proformaDetailDrawer.confirm.delete.confirm')}
        loading={deleteMut.isPending}
        onConfirm={() => deleteMut.mutateAsync()}
      />
    </>
  );
};

export default ProformaDetailDrawer;
