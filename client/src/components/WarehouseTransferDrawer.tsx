import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { X, Repeat, Calendar, Package, Loader2, XCircle, FileDown, AlertTriangle, ArrowRight, Truck } from 'lucide-react';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { formatDate } from '../lib/formatters';
import { ConfirmDialog } from './ConfirmDialog';
import WarehouseTransferPDF from '../lib/pdf/WarehouseTransferPDF';
import { useCompanyPDF } from '../lib/pdf/useCompanyPDF';

interface Props {
  transferId: string | null;
  onClose: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  Submitted: { label: 'Submitted', badge: 'badge badge-blue' },
  Cancelled: { label: 'Dibatalkan', badge: 'badge badge-red' },
};

function getUserRole(): string | null {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null')?.role ?? null;
  } catch { return null; }
}

const WarehouseTransferDrawer: React.FC<Props> = ({ transferId, onClose }) => {
  const company = useCompanyPDF();
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const userRole = useMemo(() => getUserRole(), []);
  const canCancel = userRole === 'Admin' || userRole === 'Accountant';

  const { data: doc, isLoading } = useQuery({
    queryKey: ['stock-transfer-detail', transferId],
    queryFn: async () => {
      const res = await api.get(`/stock-transfers/${transferId}`);
      return res.data;
    },
    enabled: !!transferId,
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.patch(`/stock-transfers/${transferId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['stock-transfer-detail', transferId] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      toast.success('Transfer dibatalkan. Stok dikembalikan ke gudang asal.');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal membatalkan transfer.'),
  });

  const markPrintedMutation = useMutation({
    mutationFn: () => api.post(`/stock-transfers/${transferId}/mark-printed`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-transfer-detail', transferId] });
    },
  });

  if (!transferId) return null;

  const status: string = doc?.status ?? 'Submitted';
  const sc = STATUS_CONFIG[status] ?? STATUS_CONFIG.Submitted;
  const items: any[] = doc?.items ?? [];

  const pdfDoc = doc ? (
    <WarehouseTransferPDF
      transferNumber={doc.transferNumber}
      date={doc.date}
      fromWarehouseName={doc.fromWarehouse?.name ?? '—'}
      toWarehouseName={doc.toWarehouse?.name ?? '—'}
      nomorMobil={doc.nomorMobil}
      driverName={doc.driverName}
      recipientName={doc.recipientName}
      notes={doc.notes}
      items={items.map((it: any) => ({
        code: it.item?.code ?? null,
        name: it.item?.name ?? '—',
        qty: Number(it.quantity),
        unit: it.item?.unit ?? '',
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

  const pdfFileName = doc ? `${doc.transferNumber}.pdf` : 'sjg.pdf';

  return (
    <>
      <div className={cn('fixed inset-0 z-40 bg-black/30', !transferId && 'pointer-events-none opacity-0')} onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[100vw] sm:max-w-2xl bg-white shadow-2xl flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Repeat size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{isLoading ? 'Memuat...' : doc?.transferNumber}</h2>
              <p className="text-xs text-gray-400">Surat Jalan Antar Gudang (SJG)</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {doc && <span className={cn(sc.badge)}>{sc.label}</span>}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64"><Loader2 className="w-7 h-7 animate-spin text-blue-500" /></div>
          ) : !doc ? (
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Transfer tidak ditemukan.</div>
          ) : (
            <>
              {/* Route */}
              <div className="px-6 py-5 border-b border-gray-100 bg-blue-50/40">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-widest mb-3 flex items-center gap-1">
                  <Truck size={10} /> Rute Transfer
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 p-3 bg-white rounded-lg border border-blue-200">
                    <p className="text-[10px] text-blue-600 uppercase tracking-widest mb-1">Gudang Asal</p>
                    <p className="text-sm font-semibold text-gray-900">{doc.fromWarehouse?.name ?? '—'}</p>
                    {doc.fromWarehouse?.location && <p className="text-xs text-gray-400 mt-0.5">{doc.fromWarehouse.location}</p>}
                  </div>
                  <ArrowRight size={24} className="text-blue-600 shrink-0" />
                  <div className="flex-1 p-3 bg-white rounded-lg border border-blue-200">
                    <p className="text-[10px] text-blue-600 uppercase tracking-widest mb-1">Gudang Tujuan</p>
                    <p className="text-sm font-semibold text-gray-900">{doc.toWarehouse?.name ?? '—'}</p>
                    {doc.toWarehouse?.location && <p className="text-xs text-gray-400 mt-0.5">{doc.toWarehouse.location}</p>}
                  </div>
                </div>
              </div>

              <div className="px-6 py-5 grid grid-cols-2 gap-6 border-b border-gray-100">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Calendar size={10} /> Info Pengiriman
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-gray-400">Tanggal</p>
                      <p className="text-xs font-medium text-gray-800">{formatDate(doc.date)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">No. Mobil</p>
                      <p className="text-xs font-medium text-gray-800 font-mono uppercase">{doc.nomorMobil || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Supir</p>
                      <p className="text-xs font-medium text-gray-800">{doc.driverName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Penerima</p>
                      <p className="text-xs font-medium text-gray-800">{doc.recipientName || '—'}</p>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Audit</p>
                  <div className="space-y-1.5">
                    <div>
                      <p className="text-xs text-gray-400">Dibuat oleh</p>
                      <p className="text-xs font-medium text-gray-800">{doc.user?.fullName ?? '—'}</p>
                    </div>
                    {doc.printedAt && (
                      <div>
                        <p className="text-xs text-gray-400">Dicetak terakhir</p>
                        <p className="text-xs font-medium text-gray-800">{formatDate(doc.printedAt)}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="px-6 py-4 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                  <Package size={10} /> Items ({items.length})
                </p>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase">
                        <th className="text-left px-3 py-2.5 w-8">#</th>
                        <th className="text-left px-3 py-2.5 w-20">Kode</th>
                        <th className="text-left px-3 py-2.5">Nama</th>
                        <th className="text-right px-3 py-2.5 w-24">Qty</th>
                        <th className="text-center px-3 py-2.5 w-16">Sat</th>
                        <th className="text-left px-3 py-2.5">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it: any, idx: number) => (
                        <tr key={it.id ?? idx} className={cn('border-b border-gray-50 last:border-0', idx % 2 === 1 && 'bg-gray-50/50')}>
                          <td className="px-3 py-2.5 text-center text-xs text-gray-300">{idx + 1}</td>
                          <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{it.item?.code ?? '—'}</td>
                          <td className="px-3 py-2.5"><p className="text-sm font-medium text-gray-800">{it.item?.name ?? '—'}</p></td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs font-medium text-gray-800">
                            {Number(it.quantity).toLocaleString('id-ID', { maximumFractionDigits: 3 })}
                          </td>
                          <td className="px-3 py-2.5 text-center text-xs text-gray-500">{it.item?.unit ?? ''}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{it.description || <span className="text-gray-300">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {doc.notes && (
                <div className="px-6 py-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Catatan</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{doc.notes}</p>
                </div>
              )}

              {status === 'Cancelled' && (
                <div className="mx-6 mb-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-red-600 text-xs">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>Transfer ini sudah dibatalkan. Stok telah dikembalikan ke gudang asal.</span>
                </div>
              )}
            </>
          )}
        </div>

        {doc && (
          <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/40 flex items-center justify-end gap-2 flex-wrap">
            {pdfDoc && (
              <PDFDownloadLink document={pdfDoc} fileName={pdfFileName}>
                {({ loading }) => (
                  <button
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-50"
                    disabled={loading}
                    onClick={() => {
                      if (!loading) markPrintedMutation.mutate();
                    }}
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                    {loading ? 'Membuat...' : 'Cetak SJG'}
                  </button>
                )}
              </PDFDownloadLink>
            )}
            {status === 'Submitted' && canCancel && (
              <button
                onClick={() => setConfirmCancel(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50"
              >
                <XCircle size={14} /> Batalkan Transfer
              </button>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Batalkan Transfer Stok"
        message={`Batalkan transfer ${doc?.transferNumber ?? ''}? Stok akan dikembalikan ke gudang asal.`}
        confirmLabel="Ya, Batalkan"
        variant="danger"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => { cancelMutation.mutate(); setConfirmCancel(false); }}
      />
    </>
  );
};

export default WarehouseTransferDrawer;
