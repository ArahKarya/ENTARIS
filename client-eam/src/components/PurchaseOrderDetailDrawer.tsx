import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X, ClipboardList, User, Calendar, Package, Loader2, XCircle, AlertTriangle, PackageCheck } from 'lucide-react';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { formatDate, formatRupiah } from '../lib/formatters';
import { ConfirmDialog } from './ConfirmDialog';
import { cap } from '../lib/permissions';

interface Props {
  poId: string | null;
  onClose: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  Submitted: { label: 'Submitted', badge: 'badge badge-blue' },
  Cancelled: { label: 'Dibatalkan', badge: 'badge badge-red' },
};

const PurchaseOrderDetailDrawer: React.FC<Props> = ({ poId, onClose }) => {
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const isAdmin = cap('doc.cancel');

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

  if (!poId) return null;

  const status: string = doc?.status ?? 'Submitted';
  const sc = STATUS_CONFIG[status] ?? STATUS_CONFIG.Submitted;
  const items: any[] = doc?.items ?? [];
  const linkedSTTs: any[] = doc?.goodsReceipts ?? [];

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
            {doc && <span className={cn(sc.badge)}>{sc.label}</span>}
            {!doc?.partyId && doc && <span className="badge badge-purple text-xs">PO Umum</span>}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
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
                    <div className="col-span-2">
                      <p className="text-xs text-gray-400">Dibuat oleh</p>
                      <p className="text-xs font-medium text-gray-800">{doc.user?.fullName ?? '—'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                  <Package size={10} /> Items dipesan ({items.length}) — Estimasi: <span className="font-mono normal-case text-gray-700">{formatRupiah(Number(doc.totalEstimated))}</span>
                </p>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase">
                        <th className="text-left px-3 py-2.5 w-8">#</th>
                        <th className="text-left px-3 py-2.5">Item</th>
                        <th className="text-right px-3 py-2.5 w-20">Qty</th>
                        <th className="text-right px-3 py-2.5 w-20">Diterima</th>
                        <th className="text-center px-3 py-2.5 w-16">Sat</th>
                        <th className="text-right px-3 py-2.5 w-24">Est. Harga</th>
                        <th className="text-right px-3 py-2.5 w-28">Est. Subtotal</th>
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
                            <td className="px-3 py-2.5">
                              <p className="text-sm font-medium text-gray-800">{it.itemName}</p>
                              {it.description && <p className="text-xs text-gray-400">{it.description}</p>}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs font-medium text-gray-800">
                              {ordered.toLocaleString('id-ID', { maximumFractionDigits: 3 })}
                            </td>
                            <td className={cn('px-3 py-2.5 text-right font-mono text-xs font-medium', isFulfilled ? 'text-green-700' : received > 0 ? 'text-amber-600' : 'text-gray-300')}>
                              {received > 0 ? received.toLocaleString('id-ID', { maximumFractionDigits: 3 }) : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-center text-xs text-gray-500">{it.unit}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-700">
                              {Number(it.estimatedRate) > 0 ? formatRupiah(Number(it.estimatedRate)) : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-gray-800">
                              {Number(it.estimatedAmount) > 0 ? formatRupiah(Number(it.estimatedAmount)) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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

              {status === 'Cancelled' && (
                <div className="mx-6 mb-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-red-600 text-xs">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>PO ini sudah dibatalkan. STT yang sudah terbentuk tetap valid (barang sudah diterima).</span>
                </div>
              )}
            </>
          )}
        </div>

        {doc && status === 'Submitted' && isAdmin && (
          <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/40 flex items-center justify-end gap-2">
            <button onClick={() => setConfirmCancel(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50">
              <XCircle size={14} /> Batalkan PO
            </button>
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
    </>
  );
};

export default PurchaseOrderDetailDrawer;
