import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, Truck, Package } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

interface InvoiceLine {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  inventoryItemId: string | null;
}

interface Props {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  items: InvoiceLine[];
  onClose: () => void;
  onSuccess?: () => void;
}

const today = () => new Date().toISOString().split('T')[0];

const DeliveryOrderFromInvoiceModal: React.FC<Props> = ({
  invoiceId, invoiceNumber, customerName, items, onClose, onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(today);
  const [nomorMobil, setNomorMobil] = useState('');
  const [driverName, setDriverName] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const inventoryLines = items.filter((it) => it.inventoryItemId);
  const skippedCount = items.length - inventoryLines.length;

  const mutation = useMutation({
    mutationFn: () => api.post(`/delivery-orders/from-invoice/${invoiceId}`, {
      date,
      nomorMobil: nomorMobil.trim() || null,
      driverName: driverName.trim() || null,
      recipientName: recipientName.trim() || null,
      notes: notes.trim() || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-orders'] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoice-detail', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      toast.success('Surat Jalan dibuat dan terhubung dengan invoice.');
      onSuccess?.();
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || 'Gagal membuat surat jalan.';
      setError(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!date) {
      setError('Tanggal pengiriman wajib diisi.');
      return;
    }
    if (inventoryLines.length === 0) {
      setError('Invoice ini tidak punya baris barang fisik untuk dikirim.');
      return;
    }
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Truck size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Buat Surat Jalan</h2>
              <p className="text-xs text-gray-400">
                Untuk invoice <span className="font-mono">{invoiceNumber}</span> — {customerName}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400" aria-label="Tutup">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-4 p-3 bg-amber-50/60 border border-amber-100 rounded-lg text-xs text-amber-800">
            Stok sudah dikurangi sejak invoice di-submit. Surat Jalan ini hanya untuk
            dokumen pengiriman fisik & cetakan supir — tidak menyentuh stok lagi.
          </div>

          {/* DO Meta */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Tanggal Pengiriman *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">No. Mobil</label>
              <input
                type="text"
                value={nomorMobil}
                onChange={(e) => setNomorMobil(e.target.value)}
                placeholder="Mis. B 1234 ABC"
                className="input w-full font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Nama Supir</label>
              <input
                type="text"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="Nama supir"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Penerima</label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Nama penerima"
                className="input w-full"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Catatan</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Catatan pengiriman (opsional)"
                className="input w-full"
              />
            </div>
          </div>

          {/* Items preview */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-1">
              <Package size={12} /> Barang dari invoice ({inventoryLines.length} item)
              {skippedCount > 0 && (
                <span className="ml-auto font-normal normal-case tracking-normal text-gray-400">
                  ({skippedCount} baris jasa diabaikan)
                </span>
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase">
                  <th className="text-left px-4 py-2 w-8">#</th>
                  <th className="text-left px-3 py-2">Nama Barang</th>
                  <th className="text-right px-3 py-2 w-24">Qty</th>
                  <th className="text-center px-3 py-2 w-16">Satuan</th>
                </tr>
              </thead>
              <tbody>
                {inventoryLines.map((it, idx) => (
                  <tr key={it.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2 text-center text-xs text-gray-300">{idx + 1}</td>
                    <td className="px-3 py-2 text-sm text-gray-800">{it.itemName}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-gray-700">
                      {Number(it.quantity).toLocaleString('id-ID', { maximumFractionDigits: 3 })}
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-gray-500">{it.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/40 flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-secondary" disabled={mutation.isPending}>
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending || inventoryLines.length === 0}
            className="btn-primary flex items-center gap-1.5 disabled:opacity-50"
          >
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
            {mutation.isPending ? 'Membuat...' : 'Buat Surat Jalan'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeliveryOrderFromInvoiceModal;
