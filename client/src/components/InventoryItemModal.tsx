import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import Select from './Select';

interface InventoryItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  editItem: any | null;
}

const defaultForm = {
  code: '',
  name: '',
  unit: '',
  category: '',
  description: '',
  minimumStock: 0,
  accountId: '',
};

export function InventoryItemModal({ isOpen, onClose, editItem }: InventoryItemModalProps) {
  const [form, setForm] = useState({ ...defaultForm });
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  // Reset form whenever modal opens or editItem changes
  useEffect(() => {
    if (isOpen) {
      if (editItem) {
        setForm({
          code: editItem.code ?? '',
          name: editItem.name ?? '',
          unit: editItem.unit ?? '',
          category: editItem.category ?? '',
          description: editItem.description ?? '',
          minimumStock: Number(editItem.minimumStock) ?? 0,
          accountId: editItem.accountId ?? '',
        });
      } else {
        setForm({ ...defaultForm });
      }
      setError('');
    }
  }, [isOpen, editItem]);

  // Escape key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const { data: coaData } = useQuery({
    queryKey: ['coa-flat'],
    queryFn: () => api.get('/coa/flat').then(r => r.data),
    enabled: isOpen,
  });

  const assetAccounts = (coaData ?? []).filter(
    (a: any) => a.accountType === 'ASSET' && !a.isGroup
  );

  const mutation = useMutation({
    mutationFn: (data: any) =>
      editItem
        ? api.put(`/inventory/items/${editItem.id}`, data)
        : api.post('/inventory/items', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      toast.success('Item berhasil disimpan.');
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || 'Gagal menyimpan item.';
      setError(msg);
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    mutation.mutate({
      code: form.code,
      name: form.name,
      unit: form.unit,
      category: form.category || undefined,
      description: form.description || undefined,
      minimumStock: Number(form.minimumStock),
      accountId: form.accountId || undefined,
    });
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
    >
      <div className="rounded-xl w-full max-w-[calc(100vw-1rem)] sm:max-w-lg shadow-2xl flex flex-col max-h-[95vh] overflow-hidden" style={{ backgroundColor: 'var(--color-bg-primary)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 id="item-modal-title" className="text-base font-semibold text-gray-900">
            {editItem ? 'Edit Item Stok' : 'Tambah Item Stok'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-4">

            {/* Kode Item */}
            <div>
              <label htmlFor="item-code" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Kode Item <span className="text-red-500">*</span>
              </label>
              <input
                id="item-code"
                type="text"
                required
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder="Contoh: BBM-001"
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Nama Item */}
            <div>
              <label htmlFor="item-name" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Nama Item <span className="text-red-500">*</span>
              </label>
              <input
                id="item-name"
                type="text"
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nama item persediaan"
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Satuan */}
            <div>
              <label htmlFor="item-unit" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Satuan <span className="text-red-500">*</span>
              </label>
              <input
                id="item-unit"
                type="text"
                required
                value={form.unit}
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                placeholder="kg, sak, pcs, ton"
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Kategori */}
            <div>
              <label htmlFor="item-category" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Kategori
              </label>
              <input
                id="item-category"
                type="text"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="Bahan baku, produk jadi, dll."
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Deskripsi */}
            <div>
              <label htmlFor="item-description" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Deskripsi
              </label>
              <textarea
                id="item-description"
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Deskripsi opsional tentang item ini"
                className="w-full border border-gray-200 rounded-lg py-2.5 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-400"
              />
            </div>

            {/* Stok Minimum */}
            <div>
              <label htmlFor="item-min-stock" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Stok Minimum
              </label>
              <input
                id="item-min-stock"
                type="number"
                min={0}
                value={form.minimumStock}
                onChange={e => setForm(f => ({ ...f, minimumStock: Number(e.target.value) }))}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <p className="text-xs text-gray-400 mt-1">Peringatan stok menipis akan muncul jika stok di bawah nilai ini.</p>
            </div>

            {/* Akun Persediaan */}
            <div>
              <label htmlFor="item-account" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Akun Persediaan
              </label>
              <Select
                id="item-account"
                value={form.accountId}
                onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))}
                className="w-full"
              >
                <option value="">— Tidak Dipilih —</option>
                {assetAccounts.map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.accountNumber} — {a.name}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-gray-400 mt-1">Pilih akun aset untuk pencatatan GL otomatis saat gerakan stok.</p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                <AlertCircle size={15} />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">
              Batal
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : 'Simpan Item'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
