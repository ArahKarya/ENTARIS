import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PDFDownloadLink } from '@react-pdf/renderer';
import {
  X, PackageCheck, User, Calendar, Package, Loader2, XCircle, FileDown, FileText, AlertTriangle, Truck,
} from 'lucide-react';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { formatDate } from '../lib/formatters';
import { ConfirmDialog } from './ConfirmDialog';
import GoodsReceiptPDF from '../lib/pdf/GoodsReceiptPDF';
import { useCompanyPDF } from '../lib/pdf/useCompanyPDF';

interface Props {
  sttId: string | null;
  onClose: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  Submitted: { label: 'Diterima', badge: 'badge badge-blue' },
  Invoiced: { label: 'Sudah Diinvoice', badge: 'badge badge-green' },
  Cancelled: { label: 'Dibatalkan', badge: 'badge badge-red' },
};

function getUserRole(): string | null {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null')?.role ?? null;
  } catch {
    return null;
  }
}

const GoodsReceiptDetailDrawer: React.FC<Props> = ({ sttId, onClose }) => {
  const company = useCompanyPDF();
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const userRole = useMemo(() => getUserRole(), []);
  const isAdmin = userRole === 'Admin';

  const { data: doc, isLoading } = useQuery({
    queryKey: ['goods-receipt-detail', sttId],
    queryFn: async () => {
      const res = await api.get(`/goods-receipts/${sttId}`);
      return res.data;
    },
    enabled: !!sttId,
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/goods-receipts/${sttId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goods-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['goods-receipt-detail', sttId] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      toast.success('STT dibatalkan. Stok dikembalikan + JV di-reverse.');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal membatalkan STT.'),
  });

  if (!sttId) return null;

  const rawStatus: string = doc?.status ?? 'Submitted';
  const supplier = doc?.supplier ?? null;
  const items: any[] = doc?.items ?? [];
  const invoiceRef = doc?.invoice ?? null;
  const status: string = rawStatus === 'Submitted' && invoiceRef ? 'Invoiced' : rawStatus;
  const sc = STATUS_CONFIG[status] ?? STATUS_CONFIG.Submitted;

  const totalValue = items.reduce(
    (s: number, it: any) => s + Number(it.quantity) * Number(it.lockedUnitCost),
    0,
  );

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

  return (
    <>
      <div className={cn('fixed inset-0 z-40 bg-black/30 transition-opacity', !sttId && 'pointer-events-none opacity-0')} onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[100vw] sm:max-w-2xl bg-white shadow-2xl flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <PackageCheck size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{isLoading ? 'Memuat...' : doc?.sttNumber}</h2>
              <p className="text-xs text-gray-400">Bukti Penerimaan Barang</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {doc && (
              <span className={cn(sc.badge, 'inline-flex items-center gap-1')}>{sc.label}</span>
            )}
            {doc?.isLegacyBackfill && (
              <span className="badge badge-amber inline-flex items-center gap-1 text-xs" title="Backfill otomatis dari PI legacy">
                Legacy
              </span>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400" aria-label="Tutup">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
            </div>
          ) : !doc ? (
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">STT tidak ditemukan.</div>
          ) : (
            <>
              <div className="px-6 py-5 grid grid-cols-2 gap-6 border-b border-gray-100">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <User size={10} /> Supplier
                  </p>
                  <p className="text-sm font-semibold text-gray-900">{supplier?.name ?? '—'}</p>
                  {supplier?.phone && <p className="text-xs text-gray-500 mt-0.5">{supplier.phone}</p>}
                  {supplier?.address && <p className="text-xs text-gray-400 mt-0.5">{supplier.address}</p>}
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Calendar size={10} /> Penerimaan
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
                      <p className="text-xs text-gray-400">Diterima oleh</p>
                      <p className="text-xs font-medium text-gray-800">{doc.recipientName || '—'}</p>
                    </div>
                    {doc.purchaseOrder && (
                      <div className="col-span-2">
                        <p className="text-xs text-gray-400">PO Ref</p>
                        <p className="text-xs font-mono font-medium text-purple-700">{doc.purchaseOrder.poNumber}</p>
                      </div>
                    )}
                    <div className="col-span-2">
                      <p className="text-xs text-gray-400">Dibuat oleh</p>
                      <p className="text-xs font-medium text-gray-800">{doc.user?.fullName ?? '—'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {status === 'Invoiced' && invoiceRef && (
                <div className="px-6 py-3 border-b border-gray-100 bg-green-50/40">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-green-600" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">Sudah ditagihkan via</p>
                      <p className="text-sm font-mono font-medium text-green-700">{invoiceRef.invoiceNumber}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="px-6 py-4 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                  <Package size={10} /> Daftar Barang ({items.length} item) — Total: <span className="font-mono normal-case text-gray-700">Rp {totalValue.toLocaleString('id-ID')}</span>
                </p>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase">
                        <th className="text-left px-3 py-2.5 w-8">#</th>
                        <th className="text-left px-3 py-2.5 w-20">Kode</th>
                        <th className="text-left px-3 py-2.5">Nama</th>
                        <th className="text-left px-3 py-2.5">Gudang</th>
                        <th className="text-right px-3 py-2.5 w-20">Qty</th>
                        <th className="text-center px-3 py-2.5 w-16">Sat</th>
                        <th className="text-right px-3 py-2.5 w-24">Cost</th>
                        <th className="text-right px-3 py-2.5 w-28">Subtotal</th>
                        <th className="text-left px-3 py-2.5">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it: any, idx: number) => (
                        <tr key={it.id ?? idx} className={cn('border-b border-gray-50 last:border-0', idx % 2 === 1 && 'bg-gray-50/50')}>
                          <td className="px-3 py-2.5 text-center text-xs text-gray-300">{idx + 1}</td>
                          <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{it.inventoryItem?.code ?? '—'}</td>
                          <td className="px-3 py-2.5"><p className="text-sm font-medium text-gray-800">{it.itemName}</p></td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{it.warehouse?.name ?? '—'}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs font-medium text-gray-800">
                            {Number(it.quantity).toLocaleString('id-ID', { maximumFractionDigits: 3 })}
                          </td>
                          <td className="px-3 py-2.5 text-center text-xs text-gray-500">{it.unit}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-700">
                            Rp {Number(it.lockedUnitCost).toLocaleString('id-ID')}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-gray-800">
                            Rp {(Number(it.quantity) * Number(it.lockedUnitCost)).toLocaleString('id-ID')}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">
                            {it.description || <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="px-6 py-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Catatan</p>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">
                  {doc.notes || <span className="text-gray-300 italic">Tidak ada catatan</span>}
                </p>
              </div>

              {status === 'Cancelled' && (
                <div className="mx-6 mb-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-red-600 text-xs">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>STT ini sudah dibatalkan. Stok telah dikembalikan + JV di-reverse.</span>
                </div>
              )}

              {doc.isLegacyBackfill && (
                <div className="mx-6 mb-4 p-3 bg-amber-50 border border-amber-100 rounded-lg flex items-start gap-2 text-amber-700 text-xs">
                  <Truck size={14} className="mt-0.5 shrink-0" />
                  <span>
                    STT ini adalah <strong>backfill otomatis dari PI {invoiceRef?.invoiceNumber}</strong>.
                    Stok asli tercatat via PI di flow lama. Untuk batalkan, batalkan PI-nya.
                  </span>
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
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors disabled:opacity-50"
                    disabled={loading}
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                    {loading ? 'Membuat...' : 'Cetak PDF'}
                  </button>
                )}
              </PDFDownloadLink>
            )}
            {status === 'Submitted' && isAdmin && !doc.isLegacyBackfill && (
              <button
                onClick={() => setConfirmCancel(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50"
                title="Cancel STT (Admin only)"
              >
                <XCircle size={14} /> Batalkan
              </button>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Batalkan STT"
        message={`Batalkan STT ${doc?.sttNumber ?? ''}? Stok akan dikembalikan + JV di-reverse. Tindakan tercatat di audit trail.`}
        confirmLabel="Ya, Batalkan"
        variant="danger"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => { cancelMutation.mutate(); setConfirmCancel(false); }}
      />
    </>
  );
};

export default GoodsReceiptDetailDrawer;
