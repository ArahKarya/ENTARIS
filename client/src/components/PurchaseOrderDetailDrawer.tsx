import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trans, useTranslation } from 'react-i18next';
import {
  User, Calendar, Package, XCircle, PackageCheck,
  Printer, Pencil, Copy, Ban, Send, Trash2, Warehouse, ShieldCheck,
} from 'lucide-react';
import api from '../lib/api';
import { cn } from '@/lib/utils';
import { formatDate, formatRupiah, LOCALE } from '@/lib/format';
import { ConfirmDialog, LoadingState, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { DetailSheet } from './purchase-cash/DetailSheet';
import { Callout } from './purchase-cash/ErrorAlert';
import { can, cap } from '../lib/permissions';
import { usePurchaseOrderPdf } from '../lib/pdf/usePurchaseOrderPdf';
import { purchaseOrderActions, receiptProgress } from '../lib/purchaseOrderActions';
import type { PurchaseOrderSource } from './PurchaseOrderModal';
import type { GoodsReceiptSourcePO } from './GoodsReceiptModal';
import type { PurchaseOrderPDFData } from '../lib/pdf/PurchaseOrderPDF';
import { poDueDate } from '../lib/purchaseOrderCalc';

/** GET /purchase-orders/:id — fits every follow-up action (edit, duplicate, STT, PDF). */
export type PurchaseOrderDetail = PurchaseOrderSource & GoodsReceiptSourcePO & PurchaseOrderPDFData;

interface Props {
  poId: string | null;
  onClose: () => void;
  /** Open the STT modal prefilled from this PO ("Buat STT dari PO"). */
  onCreateReceipt?: (po: PurchaseOrderDetail) => void;
  onEdit?: (po: PurchaseOrderDetail) => void;
  onDuplicate?: (po: PurchaseOrderDetail) => void;
}

const qtyFmt = (n: number) => n.toLocaleString(LOCALE, { maximumFractionDigits: 3 });

/** Ordered / received / remaining for one PO line, with a labelled bar. */
function LineProgress({ ordered, received, unit }: { ordered: number; received: number; unit: string }) {
  const { t } = useTranslation('purchasing');
  const p = receiptProgress(ordered, received);
  return (
    <div className="mt-1.5">
      <div
        role="progressbar"
        aria-label={t('poDetail.progress.label')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p.percent}
        aria-valuetext={t('poDetail.progress.valueText', { received: qtyFmt(received), ordered: qtyFmt(ordered), unit })}
        className="h-1.5 w-full max-w-56 overflow-hidden rounded-sm bg-muted"
      >
        <div
          className={cn('h-full rounded-sm', p.done ? 'bg-success' : 'bg-warning')}
          style={{ width: `${p.percent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        <Trans
          t={t}
          i18nKey="poDetail.progress.received"
          values={{ received: qtyFmt(received), ordered: qtyFmt(ordered), unit }}
          components={{ num: <span className="num" /> }}
        />
        {' · '}
        {p.done ? (
          <span className="text-success-text">{t('poDetail.progress.complete')}</span>
        ) : (
          <Trans
            t={t}
            i18nKey="poDetail.progress.remaining"
            values={{ remaining: qtyFmt(p.remaining) }}
            components={{ num: <span className="num" /> }}
          />
        )}
        {' '}({p.percent}%)
      </p>
    </div>
  );
}

interface ApprovalHistoryRow {
  id: string;
  status: string;
  notes: string | null;
  createdAt: string;
  decidedAt: string | null;
  requester?: { fullName: string } | null;
  approver?: { fullName: string } | null;
  rejecter?: { fullName: string } | null;
}

/** Subtotal / diskon / PPN / biaya lain / grand total (from GET totals). */
function TotalsBreakdown({ totals, otherCostsLabel }: { totals: Record<string, number>; otherCostsLabel?: string | null }) {
  const { t } = useTranslation('purchasing');
  const row = (label: string, value: number, cls = '') => (
    <div className={cn('flex justify-between gap-4', cls)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="num">{formatRupiah(value)}</dd>
    </div>
  );
  return (
    <dl className="ml-auto mt-3 w-full sm:w-80 text-sm space-y-1" aria-label={t('poDetail.totals.label')}>
      {row(t('poDetail.totals.subtotal'), totals.subtotal)}
      {totals.discountTotal > 0 && row(t('poDetail.totals.discount'), -totals.discountTotal)}
      {totals.taxTotal > 0 && row(t('poDetail.totals.vat'), totals.taxTotal)}
      {totals.otherCosts > 0 && row(otherCostsLabel || t('poDetail.totals.otherCosts'), totals.otherCosts)}
      {row(t('poDetail.totals.grandTotal'), totals.grandTotal, 'border-t border-border pt-1.5 font-semibold text-foreground')}
    </dl>
  );
}

const PurchaseOrderDetailDrawer: React.FC<Props> = ({ poId, onClose, onCreateReceipt, onEdit, onDuplicate }) => {
  const { t } = useTranslation('purchasing');
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isAdmin = cap('doc.cancel');
  const { download: downloadPdf, busy: pdfBusy } = usePurchaseOrderPdf();

  const { data: doc, isLoading } = useQuery({
    queryKey: ['purchase-order-detail', poId],
    queryFn: async () => {
      const res = await api.get(`/purchase-orders/${poId}`);
      return res.data;
    },
    enabled: !!poId,
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/purchase-orders/${poId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-order-detail', poId] });
      toast.success(t('poDetail.toastCancelled'));
    },
    onError: (err: any) => toast.error(err.response?.data?.error || t('poDetail.errorCancel')),
  });

  const closeMutation = useMutation({
    mutationFn: (reason: string) => api.post(`/purchase-orders/${poId}/close`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-order-detail', poId] });
      toast.success(t('poDetail.toastClosed'));
      setConfirmClose(false);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error || t('poDetail.errorClose')),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    queryClient.invalidateQueries({ queryKey: ['purchase-order-detail', poId] });
    queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
  };

  const submitMutation = useMutation({
    mutationFn: async () => (await api.post(`/purchase-orders/${poId}/submit`)).data,
    onSuccess: (po: { approvalRequestId?: string | null }) => {
      refresh();
      toast.success(po?.approvalRequestId ? t('poDetail.toastSubmittedApproval') : t('poDetail.toastOrdered'));
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error || t('poDetail.errorSubmit')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/purchase-orders/${poId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast.success(t('poDetail.toastDeleted'));
      onClose();
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error || t('poDetail.errorDelete')),
  });

  const status: string = doc?.status ?? 'Submitted';
  const displayStatus: string = doc?.displayStatus ?? status;
  const approvals: ApprovalHistoryRow[] = doc?.approvals ?? [];
  const dueDate = doc ? poDueDate(doc.date, doc.paymentTermDays) : null;
  const items: any[] = doc?.items ?? [];
  const linkedSTTs: any[] = doc?.goodsReceipts ?? [];
  const acts = doc
    ? purchaseOrderActions(doc, {
        canEditPO: can('purchase_order', 'edit'),
        canReceive: can('goods_receipt', 'edit'),
        canClose: isAdmin,
        hasLinkedReceipts: linkedSTTs.length > 0,
      })
    : null;

  const sectionTitle = 'mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground';
  const dt = 'text-xs text-muted-foreground';
  const dd = 'text-xs font-medium text-foreground';
  const th = 'px-3 py-2.5 text-xs font-semibold uppercase text-muted-foreground';
  const actionBtn = 'h-11 sm:h-9';

  return (
    <>
      <DetailSheet
        open={!!poId}
        onClose={onClose}
        size="lg"
        title={isLoading ? t('shared.loading') : doc?.poNumber ?? t('poDetail.description')}
        description={t('poDetail.description')}
        badge={
          doc && (
            <>
              <StatusBadge status={displayStatus} docType="purchase_order" />
              {status === 'Submitted' && doc.receiptStatus && doc.receiptStatus !== 'Cancelled' && (
                <StatusBadge status={doc.receiptStatus} docType="purchase_order" />
              )}
              {!doc.partyId && <StatusBadge status="general" tone="primary" label={t('poDetail.generalPO')} dot={false} />}
            </>
          )
        }
        footer={
          doc && acts && (
            <>
              <Button variant="outline" className={actionBtn} onClick={() => downloadPdf(doc)} loading={pdfBusy}>
                {!pdfBusy && <Printer aria-hidden />} {t('poDetail.actions.print')}
              </Button>
              {acts.duplicate && onDuplicate && (
                <Button variant="outline" className={actionBtn} onClick={() => onDuplicate(doc)}>
                  <Copy aria-hidden /> {t('poDetail.actions.duplicate')}
                </Button>
              )}
              {acts.edit && onEdit && (
                <Button variant="outline" className={actionBtn} onClick={() => onEdit(doc)}>
                  <Pencil aria-hidden /> {t('poDetail.actions.edit')}
                </Button>
              )}
              {acts.close && (
                <Button variant="outline" className={actionBtn} onClick={() => setConfirmClose(true)}>
                  <Ban aria-hidden /> {t('poDetail.actions.close')}
                </Button>
              )}
              {acts.deleteDraft && (
                <Button
                  variant="outline"
                  className={cn(actionBtn, 'border-danger/40 text-danger-text')}
                  onClick={() => setConfirmDelete(true)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 aria-hidden /> {t('poDetail.actions.deleteDraft')}
                </Button>
              )}
              {acts.cancel && (
                <Button
                  variant="outline"
                  className={cn(actionBtn, 'border-danger/40 text-danger-text')}
                  onClick={() => setConfirmCancel(true)}
                >
                  <XCircle aria-hidden /> {t('poDetail.actions.cancel')}
                </Button>
              )}
              {acts.submit && (
                <Button className={actionBtn} onClick={() => submitMutation.mutate()} loading={submitMutation.isPending}>
                  {!submitMutation.isPending && <Send aria-hidden />} {t('poDetail.actions.submit')}
                </Button>
              )}
              {acts.receive && onCreateReceipt && (
                <Button className={actionBtn} onClick={() => onCreateReceipt(doc)}>
                  <PackageCheck aria-hidden /> {t('poDetail.actions.createReceipt')}
                </Button>
              )}
            </>
          )
        }
      >
        {isLoading ? (
          <LoadingState label={t('poDetail.loading')} />
        ) : !doc ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">{t('poDetail.notFound')}</div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-6 border-b border-border pb-5 sm:grid-cols-2">
              <section>
                <h3 className={sectionTitle}>
                  <User className="size-3" aria-hidden /> {t('poDetail.supplier')}
                </h3>
                {doc.supplier ? (
                  <>
                    <p className="text-sm font-semibold text-foreground">{doc.supplier.name}</p>
                    {doc.supplier.phone && <p className="mt-0.5 text-xs text-muted-foreground">{doc.supplier.phone}</p>}
                  </>
                ) : (
                  <p className="text-sm italic text-primary">{t('poDetail.generalPOHint')}</p>
                )}
              </section>
              <section>
                <h3 className={sectionTitle}>
                  <Calendar className="size-3" aria-hidden /> {t('poDetail.dates')}
                </h3>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <dt className={dt}>{t('poDetail.poDate')}</dt>
                    <dd className={dd}>{formatDate(doc.date)}</dd>
                  </div>
                  <div>
                    <dt className={dt}>{t('poDetail.expectedDelivery')}</dt>
                    <dd className={dd}>{doc.expectedDeliveryDate ? formatDate(doc.expectedDeliveryDate) : '—'}</dd>
                  </div>
                  <div>
                    <dt className={dt}>{t('poDetail.term')}</dt>
                    <dd className={dd}>{doc.paymentTermDays == null
                        ? '—'
                        : doc.paymentTermDays === 0
                          ? t('poTerm.cash')
                          : t('poTerm.days', { count: doc.paymentTermDays })}</dd>
                  </div>
                  <div>
                    <dt className={dt}>{t('poDetail.dueDate')}</dt>
                    <dd className={dd}>{dueDate ? formatDate(dueDate) : '—'}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className={dt}>{t('poDetail.createdBy')}</dt>
                    <dd className={dd}>{doc.user?.fullName ?? '—'}</dd>
                  </div>
                </dl>
              </section>
              <section>
                <h3 className={sectionTitle}>
                  <Warehouse className="size-3" aria-hidden /> {t('poDetail.warehouse')}
                </h3>
                <p className="text-sm text-foreground">{doc.warehouse ? `${doc.warehouse.code} · ${doc.warehouse.name}` : '—'}</p>
              </section>
              <section>
                <h3 className={sectionTitle}>{t('poDetail.supplierQuoteRef')}</h3>
                <p className="font-mono text-sm text-foreground">{doc.supplierQuoteRef || '—'}</p>
              </section>
            </div>

            {(displayStatus === 'PendingApproval' || doc.approvalStatus === 'Rejected' || approvals.length > 0) && (
              <section className="border-b border-border pb-4">
                <h3 className={sectionTitle}>
                  <ShieldCheck className="size-3" aria-hidden /> {t('poDetail.approval')}
                </h3>
                {displayStatus === 'PendingApproval' && (
                  <Callout tone="warning" className="mb-2 py-2 text-xs">
                    {t('poDetail.pendingApprovalNotice')}
                  </Callout>
                )}
                {doc.approvalStatus === 'Rejected' && (
                  <Callout tone="danger" className="mb-2 py-2 text-xs">
                    {doc.approvalNote ? (
                      <Trans
                        t={t}
                        i18nKey="poDetail.rejectedWithNote"
                        values={{ note: doc.approvalNote }}
                        components={{ b: <b /> }}
                      />
                    ) : (
                      t('poDetail.rejected')
                    )}
                  </Callout>
                )}
                <ul className="space-y-1.5">
                  {approvals.map((a) => {
                    const decider = a.approver?.fullName ?? a.rejecter?.fullName;
                    return (
                      <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-foreground">
                        <StatusBadge status={a.status} docType="approval" />
                        <span>{t('poDetail.requestedBy', { name: a.requester?.fullName ?? '—', date: formatDate(a.createdAt) })}</span>
                        {decider && a.decidedAt && <span>{t('poDetail.decidedBy', { name: decider, date: formatDate(a.decidedAt) })}</span>}
                        {a.notes && <span className="w-full text-muted-foreground">“{a.notes}”</span>}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section className="border-b border-border pb-4">
              <h3 className={sectionTitle}>
                <Package className="size-3" aria-hidden /> {t('poDetail.itemsTitle', { count: items.length })}
              </h3>
              <div
                role="region"
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
                aria-label={t('poDetail.itemsTable')}
                className="overflow-x-auto rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <table className="w-full min-w-[34rem] text-sm">
                  <thead className="border-b border-border bg-muted">
                    <tr>
                      <th scope="col" className={cn(th, 'w-8 text-left')}>#</th>
                      <th scope="col" className={cn(th, 'text-left')}>{t('poDetail.columns.item')}</th>
                      <th scope="col" className={cn(th, 'text-right')}>{t('poDetail.columns.qty')}</th>
                      <th scope="col" className={cn(th, 'text-right')}>{t('poDetail.columns.remaining')}</th>
                      <th scope="col" className={cn(th, 'text-right')}>{t('poDetail.columns.price')}</th>
                      <th scope="col" className={cn(th, 'text-right')}>{t('poDetail.columns.discountPct')}</th>
                      <th scope="col" className={cn(th, 'text-right')}>{t('poDetail.columns.vatPct')}</th>
                      <th scope="col" className={cn(th, 'text-right')}>{t('poDetail.columns.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it: any, idx: number) => {
                      const received = Number(it.qtyReceived ?? 0);
                      const ordered = Number(it.quantity);
                      const isFulfilled = received >= ordered;
                      return (
                        <tr key={it.id ?? idx} className="border-b border-border last:border-0">
                          <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{idx + 1}</td>
                          <td className="min-w-48 px-3 py-2.5">
                            <p className="text-sm font-medium text-foreground">{it.itemName}</p>
                            {it.description && <p className="text-xs text-muted-foreground">{it.description}</p>}
                            {status === 'Submitted' && <LineProgress ordered={ordered} received={received} unit={it.unit} />}
                          </td>
                          <td className="num whitespace-nowrap px-3 py-2.5 text-right text-xs font-medium text-foreground">
                            {qtyFmt(ordered)} <span className="font-sans text-muted-foreground">{it.unit}</span>
                          </td>
                          <td className={cn('num px-3 py-2.5 text-right text-xs font-medium', isFulfilled ? 'text-success-text' : 'text-foreground')}>
                            {isFulfilled ? '0' : qtyFmt(ordered - received)}
                          </td>
                          <td className="num px-3 py-2.5 text-right text-xs text-foreground">
                            {Number(it.estimatedRate) > 0 ? formatRupiah(Number(it.estimatedRate)) : '—'}
                          </td>
                          <td className="num px-3 py-2.5 text-right text-xs text-foreground">{Number(it.discount ?? 0) > 0 ? Number(it.discount) : '—'}</td>
                          <td className="num px-3 py-2.5 text-right text-xs text-foreground">{Number(it.taxPct ?? 0) > 0 ? Number(it.taxPct) : '—'}</td>
                          <td className="num px-3 py-2.5 text-right text-xs font-semibold text-foreground">
                            {Number(it.estimatedAmount) > 0 ? formatRupiah(Number(it.estimatedAmount)) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {doc.totals && <TotalsBreakdown totals={doc.totals} otherCostsLabel={doc.otherCostsLabel} />}
            </section>

            {linkedSTTs.length > 0 && (
              <section className="rounded-lg bg-info-subtle p-3">
                <h3 className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-info-text">
                  <PackageCheck className="size-3" aria-hidden /> {t('poDetail.linkedReceipts', { count: linkedSTTs.length })}
                </h3>
                <ul className="space-y-1">
                  {linkedSTTs.map((s: any) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono text-info-text">{s.sttNumber}</span>
                      <span className="text-muted-foreground">{formatDate(s.date)}</span>
                      <StatusBadge status={s.invoiceId ? 'invoiced' : 'submitted'} docType="goods_receipt" />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className={sectionTitle}>{t('poDetail.notesTerms')}</h3>
              {doc.notes && <p className="mb-2 whitespace-pre-wrap text-sm text-foreground"><strong>{t('poDetail.notesLabel')}</strong> {doc.notes}</p>}
              {doc.terms && <p className="whitespace-pre-wrap text-sm text-foreground"><strong>{t('poDetail.termsLabel')}</strong> {doc.terms}</p>}
              {!doc.notes && !doc.terms && <p className="text-sm italic text-muted-foreground">{t('poDetail.noNotes')}</p>}
            </section>

            {doc.closedAt && status !== 'Cancelled' && (
              <Callout tone="neutral" icon={<Ban className="mt-0.5 size-4 shrink-0" aria-hidden />}>
                {t('poDetail.closedNotice', { date: formatDate(doc.closedAt) })}
                {doc.closeReason && <> {t('poDetail.closeReason', { reason: doc.closeReason })}</>}
              </Callout>
            )}

            {status === 'Cancelled' && (
              <Callout tone="danger">{t('poDetail.cancelledNotice')}</Callout>
            )}
          </div>
        )}
      </DetailSheet>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        tone="danger"
        title={t('poDetail.confirmCancel.title')}
        description={t('poDetail.confirmCancel.description', { number: doc?.poNumber ?? '' })}
        confirmLabel={t('poDetail.confirmCancel.confirm')}
        loading={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutateAsync()}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        tone="danger"
        title={t('poDetail.confirmDelete.title')}
        description={t('poDetail.confirmDelete.description', { number: doc?.poNumber ?? '' })}
        confirmLabel={t('poDetail.confirmDelete.confirm')}
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutateAsync()}
      />

      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title={t('poDetail.confirmClose.title', { number: doc?.poNumber ?? 'PO' })}
        description={t('poDetail.confirmClose.description')}
        confirmLabel={t('poDetail.confirmClose.confirm')}
        requireReason={{
          label: t('poDetail.confirmClose.reasonLabel'),
          placeholder: t('poDetail.confirmClose.reasonPlaceholder'),
          minLength: 5,
        }}
        loading={closeMutation.isPending}
        onConfirm={(reason) => closeMutation.mutateAsync(reason ?? '')}
      />
    </>
  );
};

export default PurchaseOrderDetailDrawer;
