import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PDFDownloadLink } from '@react-pdf/renderer';
import {
  X, Truck, User, Calendar, Package, Loader2, XCircle, FileDown, FileText, ExternalLink, AlertTriangle, Pencil,
} from 'lucide-react';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { formatDate } from '../lib/formatters';
import { ConfirmDialog } from './ConfirmDialog';
import DeliveryOrderPDF from '../lib/pdf/DeliveryOrderPDF';
import { useCompanyPDF } from '../lib/pdf/useCompanyPDF';
import DeliveryOrderModal from './DeliveryOrderModal';

interface Props {
  doId: string | null;
  onClose: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  Submitted: { label: 'Diserahkan', badge: 'badge badge-blue' },
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

const DeliveryOrderDetailDrawer: React.FC<Props> = ({ doId, onClose }) => {
  const company = useCompanyPDF();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const userRole = useMemo(() => getUserRole(), []);
  const isAdmin = userRole === 'Admin';
  const canEdit = userRole === 'Admin' || userRole === 'Accountant';
  const [editOpen, setEditOpen] = useState(false);

  const { data: doc, isLoading } = useQuery({
    queryKey: ['delivery-order-detail', doId],
    queryFn: async () => {
      const res = await api.get(`/delivery-orders/${doId}`);
      return res.data.data ?? res.data;
    },
    enabled: !!doId,
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/delivery-orders/${doId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-orders'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-order-detail', doId] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      toast.success('Surat jalan dibatalkan. Stok dikembalikan ke gudang.');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal membatalkan surat jalan.'),
  });

  if (!doId) return null;

  const status: string = doc?.status ?? 'Submitted';
  const sc = STATUS_CONFIG[status] ?? STATUS_CONFIG.Submitted;
  const customer = doc?.customer ?? doc?.party ?? null;
  const items: any[] = doc?.items ?? [];
  const invoiceRef = doc?.salesInvoice ?? doc?.invoice ?? null;

  const pdfDoc = doc ? (
    <DeliveryOrderPDF
      doNumber={doc.doNumber}
      date={doc.date}
      status={status}
      customer={{
        name: customer?.name ?? '—',
        address: customer?.address ?? null,
        phone: customer?.phone ?? null,
      }}
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

  const pdfFileName = doc ? `${doc.doNumber}.pdf` : 'surat-jalan.pdf';

  const handleBuatInvoiceHint = () => {
    toast.info('Buka menu Penjualan → Invoice Penjualan → Buat Invoice → toggle "Dari Surat Jalan" untuk menarik DO ini.', {
      duration: 6000,
    });
  };

  const handleLihatInvoice = () => {
    if (invoiceRef?.id) {
      // Sales invoices page reads ?invoice=<id> to auto-open the drawer (if supported).
      // Fallback: just navigate to the list.
      navigate(`/sales?invoice=${invoiceRef.id}`);
    } else {
      navigate('/sales');
    }
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 transition-opacity" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[100vw] sm:max-w-2xl bg-white shadow-2xl flex flex-col animate-slide-in-right">
        {/* ── HEADER ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Truck size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {isLoading ? 'Memuat...' : doc?.doNumber}
              </h2>
              <p className="text-xs text-gray-400">Surat Jalan</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {doc && (
              <span className={cn(sc.badge, 'inline-flex items-center gap-1')}>{sc.label}</span>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors" aria-label="Tutup">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── BODY ── */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
            </div>
          ) : !doc ? (
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
              Surat jalan tidak ditemukan.
            </div>
          ) : (
            <>
              {/* Info Grid */}
              <div className="px-6 py-5 grid grid-cols-2 gap-6 border-b border-gray-100">
                {/* Customer */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <User size={10} /> Pelanggan
                  </p>
                  <p className="text-sm font-semibold text-gray-900">{customer?.name ?? '—'}</p>
                  {customer?.phone && <p className="text-xs text-gray-500 mt-0.5">{customer.phone}</p>}
                  {customer?.address && <p className="text-xs text-gray-400 mt-0.5">{customer.address}</p>}
                </div>

                {/* Meta */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Calendar size={10} /> Informasi Pengiriman
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
                    <div className="col-span-2">
                      <p className="text-xs text-gray-400">Dibuat oleh</p>
                      <p className="text-xs font-medium text-gray-800">{doc.user?.fullName ?? doc.createdBy ?? '—'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Invoice ref (if Invoiced) */}
              {status === 'Invoiced' && invoiceRef && (
                <div className="px-6 py-3 border-b border-gray-100 bg-green-50/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-green-600" />
                      <div>
                        <p className="text-xs text-gray-500">Sudah ditagihkan via invoice</p>
                        <p className="text-sm font-mono font-medium text-green-700">{invoiceRef.invoiceNumber}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleLihatInvoice}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
                    >
                      Lihat Invoice <ExternalLink size={11} />
                    </button>
                  </div>
                </div>
              )}

              {/* Items */}
              <div className="px-6 py-4 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                  <Package size={10} /> Daftar Barang ({items.length} item)
                </p>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        <th className="text-left px-3 py-2.5 w-8">#</th>
                        <th className="text-left px-3 py-2.5 w-20">Kode</th>
                        <th className="text-left px-3 py-2.5">Nama</th>
                        <th className="text-left px-3 py-2.5">Gudang</th>
                        <th className="text-right px-3 py-2.5 w-20">Qty</th>
                        <th className="text-center px-3 py-2.5 w-16">Satuan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it: any, idx: number) => (
                        <tr key={it.id ?? idx} className={cn('border-b border-gray-50 last:border-0', idx % 2 === 1 && 'bg-gray-50/50')}>
                          <td className="px-3 py-2.5 text-center text-xs text-gray-300">{idx + 1}</td>
                          <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{it.inventoryItem?.code ?? '—'}</td>
                          <td className="px-3 py-2.5">
                            <p className="text-sm font-medium text-gray-800">{it.itemName}</p>
                            {it.description && <p className="text-xs text-gray-400">{it.description}</p>}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{it.warehouse?.name ?? '—'}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs font-medium text-gray-800">
                            {Number(it.quantity).toLocaleString('id-ID', { maximumFractionDigits: 3 })}
                          </td>
                          <td className="px-3 py-2.5 text-center text-xs text-gray-500">{it.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Notes */}
              <div className="px-6 py-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Catatan</p>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">
                  {doc.notes || <span className="text-gray-300 italic">Tidak ada catatan</span>}
                </p>
              </div>

              {status === 'Cancelled' && (
                <div className="mx-6 mb-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-red-600 text-xs">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>Surat jalan ini sudah dibatalkan. Stok telah dikembalikan ke gudang. Dokumen disimpan untuk jejak audit.</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── FOOTER ACTIONS ── */}
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

            {status === 'Submitted' && (
              <>
                {canEdit && (
                  <button
                    onClick={() => setEditOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-colors"
                    title="Edit surat jalan (nomor & tanggal dipertahankan)"
                  >
                    <Pencil size={14} /> Edit
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => setConfirmCancel(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                    title="Hanya Admin yang bisa membatalkan surat jalan"
                  >
                    <XCircle size={14} /> Batalkan
                  </button>
                )}
                <button
                  onClick={handleBuatInvoiceHint}
                  className="btn-primary"
                >
                  Buat Invoice
                </button>
              </>
            )}

            {status === 'Invoiced' && (
              <button onClick={handleLihatInvoice} className="btn-primary">
                <ExternalLink size={14} /> Lihat Invoice
              </button>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Batalkan Surat Jalan"
        message={`Batalkan surat jalan ${doc?.doNumber ?? ''}? Stok akan dikembalikan ke gudang asal. Tindakan ini tercatat di audit trail.`}
        confirmLabel="Ya, Batalkan"
        variant="danger"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => { cancelMutation.mutate(); setConfirmCancel(false); }}
      />

      {editOpen && doc && (
        <DeliveryOrderModal
          onClose={() => setEditOpen(false)}
          editDO={{
            id: doc.id,
            doNumber: doc.doNumber,
            date: doc.date,
            partyId: doc.partyId ?? customer?.id ?? '',
            nomorMobil: doc.nomorMobil ?? null,
            driverName: doc.driverName ?? null,
            recipientName: doc.recipientName ?? null,
            notes: doc.notes ?? null,
            items: items.map((it: any) => ({
              id: it.id,
              inventoryItemId: it.inventoryItemId ?? null,
              warehouseId: it.warehouseId ?? null,
              itemName: it.itemName,
              quantity: Number(it.quantity),
              unit: it.unit,
              description: it.description ?? null,
            })),
          }}
        />
      )}
    </>
  );
};

export default DeliveryOrderDetailDrawer;
