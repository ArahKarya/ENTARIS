import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  X, ClipboardList, User, Calendar, Package, Loader2, XCircle, AlertTriangle, PackageCheck,
  Printer, Pencil, Copy, Ban, Send, Trash2, Warehouse, ShieldCheck,
} from 'lucide-react';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { formatDate, formatRupiah } from '../lib/formatters';
import { ConfirmDialog } from './ConfirmDialog';
import { ConfirmDialog as ReasonDialog, StatusBadge } from '@/components/shared';
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
        className="h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-gray-200"
      >
        <div
          className={cn('h-full rounded-full', p.done ? 'bg-green-600' : 'bg-amber-500')}
          style={{ width: `${p.percent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Diterima <span className="font-mono">{qtyFmt(received)}</span> / <span className="font-mono">{qtyFmt(ordered)}</span> {unit}
        {' · '}
        {p.done ? <span className="text-green-700">lengkap</span> : <>sisa <span className="font-mono">{qtyFmt(p.remaining)}</span></>}
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
      <dt className="text-gray-600">{label}</dt>
      <dd className="font-mono">{formatRupiah(value)}</dd>
    </div>
  );
  return (
    <dl className="ml-auto mt-3 w-full sm:w-80 text-sm space-y-1" aria-label="Rincian total PO">
      {row('Subtotal', totals.subtotal)}
      {totals.discountTotal > 0 && row('Diskon', -totals.discountTotal)}
      {totals.taxTotal > 0 && row('PPN', totals.taxTotal)}
      {totals.otherCosts > 0 && row(otherCostsLabel || 'Biaya lain', totals.otherCosts)}
      {row('Grand Total', totals.grandTotal, 'border-t border-gray-200 pt-1.5 font-semibold text-gray-900')}
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
      toast.success(po?.approvalRequestId ? 'PO diajukan — menunggu persetujuan.' : 'PO dipesan.');
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

  if (!poId) return null;

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

  return (
    <>
      <div className={cn('fixed inset-0 z-40 bg-black/30', !poId && 'pointer-events-none opacity-0')} onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[100vw] sm:max-w-2xl bg-white shadow-2xl flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <ClipboardList size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{isLoading ? 'Memuat...' : doc?.poNumber}</h2>
              <p className="text-xs text-gray-400">Purchase Order</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {doc && <StatusBadge status={displayStatus} docType="purchase_order" />}
            {status === 'Submitted' && doc?.receiptStatus && doc.receiptStatus !== 'Cancelled' && (
              <StatusBadge status={doc.receiptStatus} docType="purchase_order" />
            )}
            {!doc?.partyId && doc && <span className="badge badge-purple text-xs">PO Umum</span>}
            <button onClick={onClose} aria-label="Tutup detail" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64"><Loader2 className="w-7 h-7 animate-spin text-blue-500" /></div>
          ) : !doc ? (
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">PO tidak ditemukan.</div>
          ) : (
            <>
              <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-gray-100">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <User size={10} /> Supplier
                  </p>
                  {doc.supplier ? (
                    <>
                      <p className="text-sm font-semibold text-gray-900">{doc.supplier.name}</p>
                      {doc.supplier.phone && <p className="text-xs text-gray-500 mt-0.5">{doc.supplier.phone}</p>}
                    </>
                  ) : (
                    <p className="text-sm italic text-purple-600">PO Umum — boleh dipenuhi supplier apa saja</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Calendar size={10} /> Tanggal
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-gray-400">Tgl PO</p>
                      <p className="text-xs font-medium text-gray-800">{formatDate(doc.date)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Tgl Kirim Diharapkan</p>
                      <p className="text-xs font-medium text-gray-800">
                        {doc.expectedDeliveryDate ? formatDate(doc.expectedDeliveryDate) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Termin</p>
                      <p className="text-xs font-medium text-gray-800">{paymentTermLabel(doc.paymentTermDays)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Jatuh Tempo</p>
                      <p className="text-xs font-medium text-gray-800">{dueDate ? formatDate(dueDate) : '—'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-gray-400">Dibuat oleh</p>
                      <p className="text-xs font-medium text-gray-800">{doc.user?.fullName ?? '—'}</p>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Warehouse size={10} aria-hidden /> Gudang Tujuan
                  </p>
                  <p className="text-sm text-gray-800">{doc.warehouse ? `${doc.warehouse.code} — ${doc.warehouse.name}` : '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">No. Penawaran Pemasok</p>
                  <p className="text-sm font-mono text-gray-800">{doc.supplierQuoteRef || '—'}</p>
                </div>
              </div>

              {(displayStatus === 'PendingApproval' || doc.approvalStatus === 'Rejected' || approvals.length > 0) && (
                <div className="px-6 py-4 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <ShieldCheck size={10} aria-hidden /> Persetujuan
                  </p>
                  {displayStatus === 'PendingApproval' && (
                    <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Menunggu persetujuan — PO belum dikirim ke supplier dan belum bisa dipakai untuk STT.
                    </p>
                  )}
                  {doc.approvalStatus === 'Rejected' && (
                    <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                      Pengajuan ditolak{doc.approvalNote ? <>: <b>{doc.approvalNote}</b></> : '.'} Perbaiki draf lalu ajukan ulang.
                    </p>
                  )}
                  <ul className="space-y-1.5">
                    {approvals.map((a) => {
                      const decider = a.approver?.fullName ?? a.rejecter?.fullName;
                      return (
                        <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-700">
                          <StatusBadge status={a.status} docType="approval" />
                          <span>diajukan {a.requester?.fullName ?? '—'} · {formatDate(a.createdAt)}</span>
                          {decider && a.decidedAt && <span>· diputus {decider} · {formatDate(a.decidedAt)}</span>}
                          {a.notes && <span className="w-full text-gray-500">“{a.notes}”</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div className="px-6 py-4 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                  <Package size={10} /> Items dipesan ({items.length})
                </p>
                <div className="border border-gray-200 rounded-xl overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase">
                        <th className="text-left px-3 py-2.5 w-8">#</th>
                        <th className="text-left px-3 py-2.5">Item</th>
                        <th className="text-right px-3 py-2.5 w-20">Qty</th>
                        <th className="text-right px-3 py-2.5 w-20">Sisa</th>
                        <th className="text-right px-3 py-2.5 w-24">Harga</th>
                        <th className="text-right px-3 py-2.5 w-14">Disk %</th>
                        <th className="text-right px-3 py-2.5 w-14">PPN %</th>
                        <th className="text-right px-3 py-2.5 w-28">Jumlah</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it: any, idx: number) => {
                        const received = Number(it.qtyReceived ?? 0);
                        const ordered = Number(it.quantity);
                        const isFulfilled = received >= ordered;
                        return (
                          <tr key={it.id ?? idx} className={cn('border-b border-gray-50 last:border-0', idx % 2 === 1 && 'bg-gray-50/50')}>
                            <td className="px-3 py-2.5 text-center text-xs text-gray-300">{idx + 1}</td>
                            <td className="px-3 py-2.5 min-w-48">
                              <p className="text-sm font-medium text-gray-800">{it.itemName}</p>
                              {it.description && <p className="text-xs text-gray-400">{it.description}</p>}
                              {status === 'Submitted' && <LineProgress ordered={ordered} received={received} unit={it.unit} />}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs font-medium text-gray-800 whitespace-nowrap">
                              {ordered.toLocaleString('id-ID', { maximumFractionDigits: 3 })} <span className="font-sans text-gray-500">{it.unit}</span>
                            </td>
                            <td className={cn('px-3 py-2.5 text-right font-mono text-xs font-medium', isFulfilled ? 'text-green-700' : 'text-gray-800')}>
                              {isFulfilled ? '0' : qtyFmt(ordered - received)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-700">
                              {Number(it.estimatedRate) > 0 ? formatRupiah(Number(it.estimatedRate)) : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-700">{Number(it.discount ?? 0) > 0 ? Number(it.discount) : '—'}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-700">{Number(it.taxPct ?? 0) > 0 ? Number(it.taxPct) : '—'}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-gray-800">
                              {Number(it.estimatedAmount) > 0 ? formatRupiah(Number(it.estimatedAmount)) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {doc.totals && <TotalsBreakdown totals={doc.totals} otherCostsLabel={doc.otherCostsLabel} />}
              </div>

              {linkedSTTs.length > 0 && (
                <div className="px-6 py-4 border-b border-gray-100 bg-blue-50/40">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <PackageCheck size={10} /> STT/BPB terkait ({linkedSTTs.length})
                  </p>
                  <div className="space-y-1">
                    {linkedSTTs.map((s: any) => (
                      <div key={s.id} className="flex items-center justify-between text-xs">
                        <span className="font-mono text-blue-700">{s.sttNumber}</span>
                        <span className="text-gray-500">{formatDate(s.date)}</span>
                        <span className={cn('badge text-xs', s.invoiceId ? 'badge-green' : 'badge-blue')}>
                          {s.invoiceId ? 'Sudah Diinvoice' : 'Diterima'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="px-6 py-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Catatan & Terms</p>
                {doc.notes && <p className="text-sm text-gray-600 whitespace-pre-wrap mb-2"><strong>Catatan:</strong> {doc.notes}</p>}
                {doc.terms && <p className="text-sm text-gray-600 whitespace-pre-wrap"><strong>Terms:</strong> {doc.terms}</p>}
                {!doc.notes && !doc.terms && <p className="text-gray-300 italic text-sm">Tidak ada catatan</p>}
              </div>

              {doc.closedAt && status !== 'Cancelled' && (
                <div className="mx-6 mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-start gap-2 text-gray-700 text-xs">
                  <Ban size={14} className="mt-0.5 shrink-0" />
                  <span>
                    PO ditutup pada {formatDate(doc.closedAt)} — sisa qty tidak lagi diharapkan.
                    {doc.closeReason && <> Alasan: {doc.closeReason}</>}
                  </span>
                </div>
              )}

              {status === 'Cancelled' && (
                <div className="mx-6 mb-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-red-600 text-xs">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>PO ini sudah dibatalkan. STT yang sudah terbentuk tetap valid (barang sudah diterima).</span>
                </div>
              )}
            </>
          )}
        </div>

        {doc && acts && (
          <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/40 flex flex-wrap items-center justify-end gap-2">
            <button onClick={() => downloadPdf(doc)} disabled={pdfBusy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-60">
              {pdfBusy ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} Cetak / PDF
            </button>
            {acts.duplicate && onDuplicate && (
              <button onClick={() => onDuplicate(doc)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-100">
                <Copy size={14} /> Duplikat
              </button>
            )}
            {acts.edit && onEdit && (
              <button onClick={() => onEdit(doc)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-100">
                <Pencil size={14} /> Edit
              </button>
            )}
            {acts.close && (
              <button onClick={() => setConfirmClose(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-100">
                <Ban size={14} /> Tutup PO
              </button>
            )}
            {acts.deleteDraft && (
              <button onClick={() => setConfirmDelete(true)} disabled={deleteMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-700 hover:bg-red-50">
                <Trash2 size={14} aria-hidden /> Hapus Draf
              </button>
            )}
            {acts.submit && (
              <button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
                {submitMutation.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Send size={14} aria-hidden />} Ajukan
              </button>
            )}
            {acts.cancel && (
              <button onClick={() => setConfirmCancel(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50">
                <XCircle size={14} /> Batalkan PO
              </button>
            )}
            {acts.receive && onCreateReceipt && (
              <button onClick={() => onCreateReceipt(doc)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700">
                <PackageCheck size={14} /> Buat STT dari PO
              </button>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Batalkan PO"
        message={`Batalkan PO ${doc?.poNumber ?? ''}? STT yang sudah terbentuk dari PO ini tetap valid. PO tidak dapat di-aktifkan lagi.`}
        confirmLabel="Ya, Batalkan"
        variant="danger"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => { cancelMutation.mutate(); setConfirmCancel(false); }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Hapus Draf PO"
        message={`Hapus draf ${doc?.poNumber ?? ''}? Draf dihapus permanen; nomor PO ini tidak dipakai ulang.`}
        confirmLabel="Ya, Hapus"
        variant="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => { deleteMutation.mutate(); setConfirmDelete(false); }}
      />

      <ReasonDialog
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
