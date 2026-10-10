import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  User, Calendar, Package, XCircle, PackageCheck,
  Printer, Pencil, Copy, Ban, Send, Trash2, Warehouse, ShieldCheck,
} from 'lucide-react';
import api from '../lib/api';
import { cn } from '@/lib/utils';
import { formatDate, formatRupiah } from '@/lib/format';
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
import { paymentTermLabel, poDueDate } from '../lib/purchaseOrderCalc';

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

const qtyFmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 3 });

/** Ordered / received / remaining for one PO line, with a labelled bar. */
function LineProgress({ ordered, received, unit }: { ordered: number; received: number; unit: string }) {
  const p = receiptProgress(ordered, received);
  return (
    <div className="mt-1.5">
      <div
        role="progressbar"
        aria-label="Progres penerimaan"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p.percent}
        aria-valuetext={`Diterima ${qtyFmt(received)} dari ${qtyFmt(ordered)} ${unit}`}
        className="h-1.5 w-full max-w-56 overflow-hidden rounded-sm bg-muted"
      >
        <div
          className={cn('h-full rounded-sm', p.done ? 'bg-success' : 'bg-warning')}
          style={{ width: `${p.percent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Diterima <span className="num">{qtyFmt(received)}</span> / <span className="num">{qtyFmt(ordered)}</span> {unit}
        {' · '}
        {p.done ? <span className="text-success-text">lengkap</span> : <>sisa <span className="num">{qtyFmt(p.remaining)}</span></>}
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
  const row = (label: string, value: number, cls = '') => (
    <div className={cn('flex justify-between gap-4', cls)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="num">{formatRupiah(value)}</dd>
    </div>
  );
  return (
    <dl className="ml-auto mt-3 w-full sm:w-80 text-sm space-y-1" aria-label="Rincian total PO">
      {row('Subtotal', totals.subtotal)}
      {totals.discountTotal > 0 && row('Diskon', -totals.discountTotal)}
      {totals.taxTotal > 0 && row('PPN', totals.taxTotal)}
      {totals.otherCosts > 0 && row(otherCostsLabel || 'Biaya lain', totals.otherCosts)}
      {row('Grand Total', totals.grandTotal, 'border-t border-border pt-1.5 font-semibold text-foreground')}
    </dl>
  );
}

const PurchaseOrderDetailDrawer: React.FC<Props> = ({ poId, onClose, onCreateReceipt, onEdit, onDuplicate }) => {
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
      toast.success('PO dibatalkan. STT yang sudah terbentuk tetap valid.');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal membatalkan PO.'),
  });

  const closeMutation = useMutation({
    mutationFn: (reason: string) => api.post(`/purchase-orders/${poId}/close`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-order-detail', poId] });
      toast.success('PO ditutup. Sisa qty tidak lagi diharapkan.');
      setConfirmClose(false);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error || 'Gagal menutup PO.'),
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
      toast.success(po?.approvalRequestId ? 'PO diajukan dan menunggu persetujuan.' : 'PO dipesan.');
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error || 'Gagal mengajukan PO.'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/purchase-orders/${poId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast.success('Draf PO dihapus.');
      onClose();
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error || 'Gagal menghapus draf PO.'),
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
        title={isLoading ? 'Memuat…' : doc?.poNumber ?? 'Purchase Order'}
        description="Purchase Order"
        badge={
          doc && (
            <>
              <StatusBadge status={displayStatus} docType="purchase_order" />
              {status === 'Submitted' && doc.receiptStatus && doc.receiptStatus !== 'Cancelled' && (
                <StatusBadge status={doc.receiptStatus} docType="purchase_order" />
              )}
              {!doc.partyId && <StatusBadge status="general" tone="primary" label="PO Umum" dot={false} />}
            </>
          )
        }
        footer={
          doc && acts && (
            <>
              <Button variant="outline" className={actionBtn} onClick={() => downloadPdf(doc)} loading={pdfBusy}>
                {!pdfBusy && <Printer aria-hidden />} Cetak / PDF
              </Button>
              {acts.duplicate && onDuplicate && (
                <Button variant="outline" className={actionBtn} onClick={() => onDuplicate(doc)}>
                  <Copy aria-hidden /> Duplikat
                </Button>
              )}
              {acts.edit && onEdit && (
                <Button variant="outline" className={actionBtn} onClick={() => onEdit(doc)}>
                  <Pencil aria-hidden /> Edit
                </Button>
              )}
              {acts.close && (
                <Button variant="outline" className={actionBtn} onClick={() => setConfirmClose(true)}>
                  <Ban aria-hidden /> Tutup PO
                </Button>
              )}
              {acts.deleteDraft && (
                <Button
                  variant="outline"
                  className={cn(actionBtn, 'border-danger/40 text-danger-text')}
                  onClick={() => setConfirmDelete(true)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 aria-hidden /> Hapus Draf
                </Button>
              )}
              {acts.cancel && (
                <Button
                  variant="outline"
                  className={cn(actionBtn, 'border-danger/40 text-danger-text')}
                  onClick={() => setConfirmCancel(true)}
                >
                  <XCircle aria-hidden /> Batalkan PO
                </Button>
              )}
              {acts.submit && (
                <Button className={actionBtn} onClick={() => submitMutation.mutate()} loading={submitMutation.isPending}>
                  {!submitMutation.isPending && <Send aria-hidden />} Ajukan
                </Button>
              )}
              {acts.receive && onCreateReceipt && (
                <Button className={actionBtn} onClick={() => onCreateReceipt(doc)}>
                  <PackageCheck aria-hidden /> Buat STT dari PO
                </Button>
              )}
            </>
          )
        }
      >
        {isLoading ? (
          <LoadingState label="Memuat pesanan pembelian…" />
        ) : !doc ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">PO tidak ditemukan.</div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-6 border-b border-border pb-5 sm:grid-cols-2">
              <section>
                <h3 className={sectionTitle}>
                  <User className="size-3" aria-hidden /> Supplier
                </h3>
                {doc.supplier ? (
                  <>
                    <p className="text-sm font-semibold text-foreground">{doc.supplier.name}</p>
                    {doc.supplier.phone && <p className="mt-0.5 text-xs text-muted-foreground">{doc.supplier.phone}</p>}
                  </>
                ) : (
                  <p className="text-sm italic text-primary">PO Umum: boleh dipenuhi supplier apa saja</p>
                )}
              </section>
              <section>
                <h3 className={sectionTitle}>
                  <Calendar className="size-3" aria-hidden /> Tanggal
                </h3>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <dt className={dt}>Tgl PO</dt>
                    <dd className={dd}>{formatDate(doc.date)}</dd>
                  </div>
                  <div>
                    <dt className={dt}>Tgl Kirim Diharapkan</dt>
                    <dd className={dd}>{doc.expectedDeliveryDate ? formatDate(doc.expectedDeliveryDate) : '—'}</dd>
                  </div>
                  <div>
                    <dt className={dt}>Termin</dt>
                    <dd className={dd}>{paymentTermLabel(doc.paymentTermDays)}</dd>
                  </div>
                  <div>
                    <dt className={dt}>Jatuh Tempo</dt>
                    <dd className={dd}>{dueDate ? formatDate(dueDate) : '—'}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className={dt}>Dibuat oleh</dt>
                    <dd className={dd}>{doc.user?.fullName ?? '—'}</dd>
                  </div>
                </dl>
              </section>
              <section>
                <h3 className={sectionTitle}>
                  <Warehouse className="size-3" aria-hidden /> Gudang Tujuan
                </h3>
                <p className="text-sm text-foreground">{doc.warehouse ? `${doc.warehouse.code} · ${doc.warehouse.name}` : '—'}</p>
              </section>
              <section>
                <h3 className={sectionTitle}>No. Penawaran Pemasok</h3>
                <p className="font-mono text-sm text-foreground">{doc.supplierQuoteRef || '—'}</p>
              </section>
            </div>

            {(displayStatus === 'PendingApproval' || doc.approvalStatus === 'Rejected' || approvals.length > 0) && (
              <section className="border-b border-border pb-4">
                <h3 className={sectionTitle}>
                  <ShieldCheck className="size-3" aria-hidden /> Persetujuan
                </h3>
                {displayStatus === 'PendingApproval' && (
                  <Callout tone="warning" className="mb-2 py-2 text-xs">
                    Menunggu persetujuan. PO belum dikirim ke supplier dan belum bisa dipakai untuk STT.
                  </Callout>
                )}
                {doc.approvalStatus === 'Rejected' && (
                  <Callout tone="danger" className="mb-2 py-2 text-xs">
                    Pengajuan ditolak{doc.approvalNote ? <>: <b>{doc.approvalNote}</b></> : '.'} Perbaiki draf lalu ajukan ulang.
                  </Callout>
                )}
                <ul className="space-y-1.5">
                  {approvals.map((a) => {
                    const decider = a.approver?.fullName ?? a.rejecter?.fullName;
                    return (
                      <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-foreground">
                        <StatusBadge status={a.status} docType="approval" />
                        <span>diajukan {a.requester?.fullName ?? '—'} · {formatDate(a.createdAt)}</span>
                        {decider && a.decidedAt && <span>· diputus {decider} · {formatDate(a.decidedAt)}</span>}
                        {a.notes && <span className="w-full text-muted-foreground">“{a.notes}”</span>}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section className="border-b border-border pb-4">
              <h3 className={sectionTitle}>
                <Package className="size-3" aria-hidden /> Items dipesan ({items.length})
              </h3>
              <div
                role="region"
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
                aria-label="Tabel item PO"
                className="overflow-x-auto rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <table className="w-full min-w-[34rem] text-sm">
                  <thead className="border-b border-border bg-muted">
                    <tr>
                      <th scope="col" className={cn(th, 'w-8 text-left')}>#</th>
                      <th scope="col" className={cn(th, 'text-left')}>Item</th>
                      <th scope="col" className={cn(th, 'text-right')}>Qty</th>
                      <th scope="col" className={cn(th, 'text-right')}>Sisa</th>
                      <th scope="col" className={cn(th, 'text-right')}>Harga</th>
                      <th scope="col" className={cn(th, 'text-right')}>Disk %</th>
                      <th scope="col" className={cn(th, 'text-right')}>PPN %</th>
                      <th scope="col" className={cn(th, 'text-right')}>Jumlah</th>
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
                  <PackageCheck className="size-3" aria-hidden /> STT/BPB terkait ({linkedSTTs.length})
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
              <h3 className={sectionTitle}>Catatan & Terms</h3>
              {doc.notes && <p className="mb-2 whitespace-pre-wrap text-sm text-foreground"><strong>Catatan:</strong> {doc.notes}</p>}
              {doc.terms && <p className="whitespace-pre-wrap text-sm text-foreground"><strong>Terms:</strong> {doc.terms}</p>}
              {!doc.notes && !doc.terms && <p className="text-sm italic text-muted-foreground">Tidak ada catatan</p>}
            </section>

            {doc.closedAt && status !== 'Cancelled' && (
              <Callout tone="neutral" icon={<Ban className="mt-0.5 size-4 shrink-0" aria-hidden />}>
                PO ditutup pada {formatDate(doc.closedAt)}. Sisa qty tidak lagi diharapkan.
                {doc.closeReason && <> Alasan: {doc.closeReason}</>}
              </Callout>
            )}

            {status === 'Cancelled' && (
              <Callout tone="danger">PO ini sudah dibatalkan. STT yang sudah terbentuk tetap valid (barang sudah diterima).</Callout>
            )}
          </div>
        )}
      </DetailSheet>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        tone="danger"
        title="Batalkan PO"
        description={`Batalkan PO ${doc?.poNumber ?? ''}? STT yang sudah terbentuk dari PO ini tetap valid. PO tidak dapat di-aktifkan lagi.`}
        confirmLabel="Ya, Batalkan"
        loading={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutateAsync()}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        tone="danger"
        title="Hapus Draf PO"
        description={`Hapus draf ${doc?.poNumber ?? ''}? Draf dihapus permanen; nomor PO ini tidak dipakai ulang.`}
        confirmLabel="Ya, Hapus"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutateAsync()}
      />

      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title={`Tutup ${doc?.poNumber ?? 'PO'}`}
        description="Sisa qty yang belum diterima tidak lagi diharapkan dan PO tidak muncul lagi di pilihan PO saat membuat STT. STT yang sudah ada tetap valid. Penutupan tidak bisa dibuka kembali."
        confirmLabel="Tutup PO"
        requireReason={{ label: 'Alasan penutupan', placeholder: 'mis. Pemasok tidak sanggup memenuhi sisa pesanan', minLength: 5 }}
        loading={closeMutation.isPending}
        onConfirm={(reason) => closeMutation.mutateAsync(reason ?? '')}
      />
    </>
  );
};

export default PurchaseOrderDetailDrawer;
