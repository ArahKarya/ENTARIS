import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trans, useTranslation } from 'react-i18next';
import { PDFDownloadLink } from '@react-pdf/renderer';
import {
  User, Calendar, Package, Loader2, XCircle, FileDown, FileText, Truck,
} from 'lucide-react';
import api from '../lib/api';
import { cn } from '@/lib/utils';
import { formatDate, formatNumber } from '@/lib/format';
import { buttonVariants, Button } from '@/components/ui/button';
import { ConfirmDialog, LoadingState, StatusBadge } from '@/components/shared';
import { DetailSheet } from './purchase-cash/DetailSheet';
import { Callout } from './purchase-cash/ErrorAlert';
import GoodsReceiptPDF from '../lib/pdf/GoodsReceiptPDF';
import { useCompanyPDF } from '../lib/pdf/useCompanyPDF';
import AttachmentUpload from './AttachmentUpload';
import AttachmentPreview from './AttachmentPreview';
import { cap } from '../lib/permissions';

interface Props {
  sttId: string | null;
  onClose: () => void;
}

const GoodsReceiptDetailDrawer: React.FC<Props> = ({ sttId, onClose }) => {
  const { t } = useTranslation('purchasing');
  const company = useCompanyPDF();
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Set when the cancel failed for insufficient stock: cap doc.cancel may force it with a reason.
  const [overrideMessage, setOverrideMessage] = useState<string | null>(null);

  const isAdmin = cap('doc.cancel');

  const { data: doc, isLoading } = useQuery({
    queryKey: ['goods-receipt-detail', sttId],
    queryFn: async () => {
      const res = await api.get(`/goods-receipts/${sttId}`);
      return res.data;
    },
    enabled: !!sttId,
  });

  const cancelMutation = useMutation({
    mutationFn: (override?: { allowNegativeStock: boolean; negativeStockReason: string }) =>
      api.post(`/goods-receipts/${sttId}/cancel`, override ?? {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goods-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['goods-receipt-detail', sttId] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      toast.success(t('receiptDetail.toastCancelled'));
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || t('receiptDetail.errorCancel');
      // Insufficient stock (goods already issued): offer a forced retry with a reason.
      if (/tidak mencukupi|stok/i.test(msg) && /tidak dapat membatalkan/i.test(msg)) {
        setOverrideMessage(msg);
        return;
      }
      toast.error(msg);
    },
  });

  const rawStatus: string = doc?.status ?? 'Submitted';
  const supplier = doc?.supplier ?? null;
  const items: any[] = doc?.items ?? [];
  const invoiceRef = doc?.invoice ?? null;
  const status: string = rawStatus === 'Submitted' && invoiceRef ? 'Invoiced' : rawStatus;

  const pdfDoc = doc ? (
    <GoodsReceiptPDF
      sttNumber={doc.sttNumber}
      date={doc.date}
      supplier={{
        name: supplier?.name ?? '—',
        address: supplier?.address ?? null,
        phone: supplier?.phone ?? null,
      }}
      poNumber={doc.purchaseOrder?.poNumber ?? null}
      nomorMobil={doc.nomorMobil}
      driverName={doc.driverName}
      recipientName={doc.recipientName}
      notes={doc.notes}
      items={items.map((it: any) => ({
        code: it.inventoryItem?.code ?? null,
        name: it.itemName,
        qty: Number(it.quantity),
        unit: it.unit,
        description: it.description,
      }))}
      company={{
        name: company.name,
        address: company.address,
        phone: company.phone,
        email: company.email,
        taxId: company.taxId,
        logoUrl: company.logoUrl,
      }}
    />
  ) : null;

  const pdfFileName = doc ? `${doc.sttNumber}.pdf` : 'stt.pdf';

  const dt = 'text-xs text-muted-foreground';
  const dd = 'text-xs font-medium text-foreground';
  const sectionTitle = 'mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground';
  const th = 'px-3 py-2.5 text-xs font-semibold uppercase text-muted-foreground';

  return (
    <>
      <DetailSheet
        open={!!sttId}
        onClose={onClose}
        size="lg"
        title={isLoading ? t('shared.loading') : doc?.sttNumber ?? t('receiptDetail.fallbackTitle')}
        description={t('receiptDetail.description')}
        badge={
          doc && (
            <>
              <StatusBadge status={status} docType="goods_receipt" />
              {doc.isCustomerOwned && (
                <StatusBadge status="customerOwned" docType="goods_receipt" label={t('receiptDetail.customerOwned')} />
              )}
              {doc.isLegacyBackfill && <StatusBadge status="legacy" tone="warning" label={t('receiptDetail.legacy')} dot={false} />}
            </>
          )
        }
        footer={
          doc && (
            <>
              {pdfDoc && (
                <PDFDownloadLink
                  document={pdfDoc}
                  fileName={pdfFileName}
                  className={cn(buttonVariants({ variant: 'outline' }), 'h-11 sm:h-9')}
                >
                  {({ loading }) => (
                    <>
                      {loading ? <Loader2 className="animate-spin" aria-hidden /> : <FileDown aria-hidden />}
                      {loading ? t('shared.generating') : t('shared.printPdf')}
                    </>
                  )}
                </PDFDownloadLink>
              )}
              {status === 'Submitted' && isAdmin && !doc.isLegacyBackfill && (
                <Button
                  variant="outline"
                  className="h-11 border-danger/40 text-danger-text sm:h-9"
                  onClick={() => setConfirmCancel(true)}
                >
                  <XCircle aria-hidden /> {t('receiptDetail.cancel')}
                </Button>
              )}
            </>
          )
        }
      >
        {isLoading ? (
          <LoadingState label={t('receiptDetail.loading')} />
        ) : !doc ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">{t('receiptDetail.notFound')}</div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-6 border-b border-border pb-5 sm:grid-cols-2">
              <section>
                <h3 className={sectionTitle}>
                  <User className="size-3" aria-hidden /> {t('receiptDetail.supplier')}
                </h3>
                <p className="text-sm font-semibold text-foreground">{supplier?.name ?? '—'}</p>
                {supplier?.phone && <p className="mt-0.5 text-xs text-muted-foreground">{supplier.phone}</p>}
                {supplier?.address && <p className="mt-0.5 text-xs text-muted-foreground">{supplier.address}</p>}
              </section>
              <section>
                <h3 className={sectionTitle}>
                  <Calendar className="size-3" aria-hidden /> {t('receiptDetail.receipt')}
                </h3>
                <dl className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className={dt}>{t('receiptDetail.date')}</dt>
                    <dd className={dd}>{formatDate(doc.date)}</dd>
                  </div>
                  <div>
                    <dt className={dt}>{t('receiptDetail.vehicleNo')}</dt>
                    <dd className={cn(dd, 'font-mono uppercase')}>{doc.nomorMobil || '—'}</dd>
                  </div>
                  <div>
                    <dt className={dt}>{t('receiptDetail.driver')}</dt>
                    <dd className={dd}>{doc.driverName || '—'}</dd>
                  </div>
                  <div>
                    <dt className={dt}>{t('receiptDetail.receivedBy')}</dt>
                    <dd className={dd}>{doc.recipientName || '—'}</dd>
                  </div>
                  {doc.purchaseOrder && (
                    <div className="col-span-2">
                      <dt className={dt}>{t('receiptDetail.poRef')}</dt>
                      <dd className="font-mono text-xs font-medium text-primary">{doc.purchaseOrder.poNumber}</dd>
                    </div>
                  )}
                  <div className="col-span-2">
                    <dt className={dt}>{t('receiptDetail.createdBy')}</dt>
                    <dd className={dd}>{doc.user?.fullName ?? '—'}</dd>
                  </div>
                </dl>
              </section>
            </div>

            {status === 'Invoiced' && invoiceRef && (
              <div className="flex items-center gap-2 rounded-lg bg-success-subtle px-3 py-2.5">
                <FileText className="size-4 text-success-text" aria-hidden />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">{t('receiptDetail.invoicedVia')}</p>
                  <p className="font-mono text-sm font-medium text-success-text">{invoiceRef.invoiceNumber}</p>
                </div>
              </div>
            )}

            <section>
              <h3 className={sectionTitle}>
                <Package className="size-3" aria-hidden /> {t('receiptDetail.itemsTitle', { count: items.length })}
              </h3>
              <div
                role="region"
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
                aria-label={t('receiptDetail.itemsTable')}
                className="overflow-x-auto rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <table className="w-full min-w-[34rem] text-sm">
                  <thead className="border-b border-border bg-muted">
                    <tr>
                      <th scope="col" className={cn(th, 'w-8 text-left')}>#</th>
                      <th scope="col" className={cn(th, 'text-left')}>{t('receiptDetail.columns.code')}</th>
                      <th scope="col" className={cn(th, 'text-left')}>{t('receiptDetail.columns.name')}</th>
                      <th scope="col" className={cn(th, 'text-left')}>{t('receiptDetail.columns.warehouse')}</th>
                      <th scope="col" className={cn(th, 'text-right')}>{t('receiptDetail.columns.qty')}</th>
                      <th scope="col" className={cn(th, 'text-center')}>{t('receiptDetail.columns.unit')}</th>
                      <th scope="col" className={cn(th, 'text-left')}>{t('receiptDetail.columns.description')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it: any, idx: number) => (
                      <tr key={it.id ?? idx} className="border-b border-border last:border-0">
                        <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{it.inventoryItem?.code ?? '—'}</td>
                        <td className="px-3 py-2.5 text-sm font-medium text-foreground">{it.itemName}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{it.warehouse?.name ?? '—'}</td>
                        <td className="num px-3 py-2.5 text-right text-xs font-medium text-foreground">
                          {formatNumber(Number(it.quantity), { maxDecimals: 3 })}
                        </td>
                        <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{it.unit}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{it.description || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h3 className={sectionTitle}>{t('receiptDetail.notes')}</h3>
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {doc.notes || <span className="italic text-muted-foreground">{t('receiptDetail.noNotes')}</span>}
              </p>
            </section>

            {/* Attachments — bukti jembatan timbang STT */}
            <section className="border-t border-border pt-4">
              <h3 className={sectionTitle}>{t('receiptDetail.attachments')}</h3>
              <AttachmentPreview referenceType="goods_receipt" referenceId={doc.id} />
              {status !== 'Cancelled' && (
                <div className="mt-2">
                  <AttachmentUpload referenceType="goods_receipt" referenceId={doc.id} />
                </div>
              )}
            </section>

            {status === 'Cancelled' && (
              <Callout tone="danger">{t('receiptDetail.cancelledNotice')}</Callout>
            )}

            {doc.isLegacyBackfill && (
              <Callout tone="warning" icon={<Truck className="mt-0.5 size-4 shrink-0" aria-hidden />}>
                <Trans
                  t={t}
                  i18nKey="receiptDetail.legacyNotice"
                  values={{ number: invoiceRef?.invoiceNumber ?? '' }}
                  components={{ strong: <strong /> }}
                />
              </Callout>
            )}
          </div>
        )}
      </DetailSheet>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        tone="danger"
        title={t('receiptDetail.confirmCancel.title')}
        description={t('receiptDetail.confirmCancel.description', { number: doc?.sttNumber ?? '' })}
        confirmLabel={t('receiptDetail.confirmCancel.confirm')}
        onConfirm={() => {
          cancelMutation.mutate(undefined);
        }}
      />

      <ConfirmDialog
        open={overrideMessage !== null}
        onOpenChange={(o) => !o && setOverrideMessage(null)}
        tone="danger"
        title={t('receiptDetail.forceCancel.title')}
        description={t('receiptDetail.forceCancel.description', { message: overrideMessage ?? '' })}
        confirmLabel={t('receiptDetail.forceCancel.confirm')}
        requireReason={{
          label: t('receiptDetail.forceCancel.reasonLabel'),
          minLength: 10,
          placeholder: t('receiptDetail.forceCancel.reasonPlaceholder'),
        }}
        onConfirm={(reason) => {
          cancelMutation.mutate({ allowNegativeStock: true, negativeStockReason: (reason ?? '').trim() });
        }}
      />
    </>
  );
};

export default GoodsReceiptDetailDrawer;
