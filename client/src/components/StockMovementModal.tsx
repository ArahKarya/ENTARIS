import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import SearchableSelect from './SearchableSelect';
import type { SelectOption } from './SearchableSelect';
import WarehousePicker from './WarehousePicker';

interface StockMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  editMovement?: any | null;
}

const today = () => new Date().toISOString().split('T')[0];

const defaultForm = {
  date: today(),
  itemId: '',
  warehouseId: '',
  movementType: 'In' as 'In' | 'Out' | 'AdjustmentIn' | 'AdjustmentOut',
  quantity: '',
  unitCost: '',
  offsetAccountId: '',
  referenceType: '',
  referenceNumber: '',
  notes: '',
};

export function StockMovementModal({ isOpen, onClose, editMovement }: StockMovementModalProps) {
  const [form, setForm] = useState({ ...defaultForm, date: today() });
  const [error, setError] = useState('');
  const queryClient = useQueryClient();
  const isEdit = !!editMovement;

  // Reset form on open / populate when editing
  useEffect(() => {
    if (isOpen) {
      if (editMovement) {
        setForm({
          date: editMovement.date ? new Date(editMovement.date).toISOString().split('T')[0] : today(),
          itemId: editMovement.itemId || '',
          warehouseId: editMovement.warehouseId || '',
          movementType: editMovement.movementType || 'In',
          quantity: editMovement.quantity != null ? String(Number(editMovement.quantity)) : '',
          unitCost: editMovement.unitCost != null ? String(Number(editMovement.unitCost)) : '',
          offsetAccountId: editMovement.offsetAccountId || '',
          referenceType: editMovement.referenceType || '',
          referenceNumber: editMovement.referenceNumber || '',
          notes: editMovement.notes || '',
        });
      } else {
        setForm({ ...defaultForm, date: today() });
      }
      setError('');
    }
  }, [isOpen, editMovement]);

  // Escape key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Sertakan warehouseId supaya currentStock tiap item = stok di gudang yang
  // dipilih (bukan total). Tanpa gudang terpilih → tampil total seperti biasa.
  const { data: itemsRaw } = useQuery({
    queryKey: ['inventory-items-active', form.warehouseId],
    queryFn: () =>
      api.get('/inventory/items', {
        params: { isActive: 'true', ...(form.warehouseId ? { warehouseId: form.warehouseId } : {}) },
      }).then(r => r.data.data ?? r.data),
    enabled: isOpen,
  });
  const items: any[] = itemsRaw ?? [];

  const { data: coaData } = useQuery({
    queryKey: ['coa-flat'],
    queryFn: () => api.get('/coa/flat').then(r => r.data),
    enabled: isOpen,
  });
  const nonGroupAccounts = (coaData ?? []).filter((a: any) => !a.isGroup);

  const selectedItem = items.find((i: any) => i.id === form.itemId);

  const itemOptions = useMemo((): SelectOption[] =>
    items.map((i: any) => ({ value: i.id, label: `${i.code} — ${i.name} (${i.unit})` })),
    [items],
  );

  const accountOptions = useMemo((): SelectOption[] =>
    nonGroupAccounts.map((a: any) => ({ value: a.id, label: `${a.accountNumber} — ${a.name}` })),
    [nonGroupAccounts],
  );

  const qty = Number(form.quantity) || 0;
  const unitCost = Number(form.unitCost) || 0;
  const totalValue = qty * unitCost;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-items-active'] });
    queryClient.invalidateQueries({ queryKey: ['coa'] });
    queryClient.invalidateQueries({ queryKey: ['journals'] });
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/inventory/movements', data),
    onSuccess: () => {
      invalidateAll();
      toast.success('Gerakan stok berhasil dicatat.');
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || 'Gagal mencatat gerakan stok.';
      setError(msg);
      toast.error(msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.put(`/inventory/movements/${editMovement?.id}`, data),
    onSuccess: () => {
      invalidateAll();
      toast.success('Gerakan stok berhasil diperbarui.');
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || 'Gagal mengupdate gerakan stok.';
      setError(msg);
      toast.error(msg);
    },
  });

  const mutation = isEdit ? updateMutation : createMutation;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const payload: any = {
      date: form.date,
      movementType: form.movementType,
      quantity: Number(form.quantity),
      unitCost: unitCost,
      offsetAccountId: form.offsetAccountId || undefined,
      referenceType: form.referenceType || undefined,
      referenceNumber: form.referenceNumber || undefined,
      notes: form.notes || undefined,
    };

    if (!isEdit) {
      payload.itemId = form.itemId;
      payload.warehouseId = form.warehouseId || undefined;
    }

    mutation.mutate(payload);
  };

  if (!isOpen) return null;

  const isProductionLinked = editMovement?.referenceType === 'ProductionRun';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="movement-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
    >
      <div className="rounded-xl w-full max-w-[calc(100vw-1rem)] sm:max-w-lg shadow-2xl flex flex-col max-h-[95vh] overflow-hidden" style={{ backgroundColor: 'var(--color-bg-primary)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 id="movement-modal-title" className="text-base font-semibold text-gray-900">
            {isEdit ? 'Edit Gerakan Stok' : 'Catat Gerakan Stok'}
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

            {isProductionLinked && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-700 text-sm">
                <AlertCircle size={15} />
                <span>Gerakan stok dari proses produksi tidak dapat diedit langsung.</span>
              </div>
            )}

            {/* Tanggal */}
            <div>
              <label htmlFor="mov-date" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Tanggal <span className="text-red-500">*</span>
              </label>
              <input
                id="mov-date"
                type="date"
                required
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                disabled={isProductionLinked}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            {/* Item — read-only during edit */}
            <div>
              <label htmlFor="mov-item" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Item <span className="text-red-500">*</span>
              </label>
              {isEdit ? (
                <input
                  type="text"
                  readOnly
                  value={editMovement?.item ? `${editMovement.item.code} — ${editMovement.item.name} (${editMovement.item.unit})` : ''}
                  className="w-full border border-gray-100 rounded-lg py-2 px-3 text-sm text-gray-500 bg-gray-50 cursor-not-allowed"
                />
              ) : (
                <SearchableSelect
                  options={itemOptions}
                  value={form.itemId}
                  onChange={(v) => setForm(f => ({ ...f, itemId: v }))}
                  placeholder="— Pilih Item —"
                />
              )}
            </div>

            {/* Gudang — read-only saat edit (gudang tidak bisa dipindah lewat edit) */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                Gudang
              </label>
              {isEdit ? (
                <input
                  type="text"
                  readOnly
                  value={editMovement?.warehouse?.name ?? '—'}
                  className="w-full border border-gray-100 rounded-lg py-2 px-3 text-sm text-gray-500 bg-gray-50 cursor-not-allowed"
                />
              ) : (
                <WarehousePicker
                  value={form.warehouseId}
                  onChange={(v) => setForm(f => ({ ...f, warehouseId: v }))}
                  autoDefault
                />
              )}
            </div>

            {/* Tipe Gerakan */}
            <div>
              <label htmlFor="mov-type" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Tipe Gerakan <span className="text-red-500">*</span>
              </label>
              <select
                id="mov-type"
                required
                value={form.movementType}
                onChange={e => setForm(f => ({ ...f, movementType: e.target.value as typeof form.movementType }))}
                disabled={isProductionLinked}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="In">Masuk (In)</option>
                <option value="Out">Keluar (Out)</option>
                <option value="AdjustmentIn">Penyesuaian Naik (AdjustmentIn)</option>
                <option value="AdjustmentOut">Penyesuaian Turun (AdjustmentOut)</option>
              </select>
            </div>

            {/* Kuantitas */}
            <div>
              <label htmlFor="mov-qty" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Kuantitas <span className="text-red-500">*</span>
              </label>
              <input
                id="mov-qty"
                type="number"
                required
                min={0.001}
                step="any"
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                disabled={isProductionLinked}
                placeholder="0"
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:bg-gray-50 disabled:text-gray-400"
              />
              {(selectedItem || editMovement?.item) && (
                <p className="text-xs text-gray-400 mt-1">
                  {!isEdit && form.warehouseId ? 'Stok di gudang ini' : 'Stok saat ini'}: {Number((selectedItem || editMovement?.item)?.currentStock ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 3 })} {(selectedItem || editMovement?.item)?.unit}
                </p>
              )}
            </div>

            {/* Harga Satuan */}
            <div>
              <label htmlFor="mov-unit-cost" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Harga Satuan
              </label>
              <input
                id="mov-unit-cost"
                type="number"
                min={0}
                step="any"
                value={form.unitCost}
                onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))}
                disabled={isProductionLinked}
                placeholder="0"
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            {/* Total Nilai (read-only) */}
            <div>
              <label htmlFor="mov-total" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Total Nilai
              </label>
              <input
                id="mov-total"
                type="text"
                readOnly
                value={totalValue.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                className="w-full border border-gray-100 rounded-lg py-2 px-3 text-sm text-gray-500 bg-gray-50 cursor-not-allowed"
              />
            </div>

            {/* Akun Lawan */}
            <div>
              <label htmlFor="mov-offset-account" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Akun Lawan {totalValue > 0 && <span className="text-red-500">*</span>}
                <span className="ml-1.5 text-xs font-normal text-blue-500">Untuk posting ke COA</span>
              </label>
              <SearchableSelect
                options={accountOptions}
                value={form.offsetAccountId}
                onChange={(v) => setForm(f => ({ ...f, offsetAccountId: v }))}
                placeholder="— Pilih Akun Lawan —"
                disabled={isProductionLinked}
              />
              {totalValue > 0 && !form.offsetAccountId && (
                <p className="text-xs text-amber-600 mt-1">
                  Pilih akun lawan agar nilai stok tercatat di COA.
                </p>
              )}
            </div>

            {/* Tipe Referensi */}
            <div>
              <label htmlFor="mov-ref-type" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Tipe Referensi
              </label>
              <select
                id="mov-ref-type"
                value={form.referenceType}
                onChange={e => setForm(f => ({ ...f, referenceType: e.target.value, referenceNumber: '' }))}
                disabled={isProductionLinked}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">— Tidak Ada —</option>
                <option value="PurchaseInvoice">Invoice Pembelian</option>
                <option value="SalesInvoice">Invoice Penjualan</option>
              </select>
            </div>

            {/* Nomor Referensi */}
            {form.referenceType && (
              <div>
                <label htmlFor="mov-ref-number" className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Nomor Referensi
                </label>
                <input
                  id="mov-ref-number"
                  type="text"
                  value={form.referenceNumber}
                  onChange={e => setForm(f => ({ ...f, referenceNumber: e.target.value }))}
                  disabled={isProductionLinked}
                  placeholder="Nomor dokumen referensi"
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>
            )}

            {/* Catatan */}
            <div>
              <label htmlFor="mov-notes" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Catatan
              </label>
              <textarea
                id="mov-notes"
                rows={3}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                disabled={isProductionLinked}
                placeholder="Catatan opsional tentang gerakan stok ini"
                className="w-full border border-gray-200 rounded-lg py-2.5 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
              />
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
            {!isProductionLinked && (
              <button
                type="submit"
                disabled={mutation.isPending}
                className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : isEdit ? 'Simpan Perubahan' : 'Simpan Gerakan'}
              </button>
            )}
          </div>
        </form>

      </div>
    </div>
  );
}
