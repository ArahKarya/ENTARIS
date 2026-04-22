import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { toast } from 'sonner';
import SearchableSelect from './SearchableSelect';
import type { SelectOption } from './SearchableSelect';

interface LineItem {
  itemId: string;
  quantity: string;
}

interface OutputLineItem {
  itemId: string;
  quantity: string;
  unitPrice: string;
  isByProduct: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: any[];
  editRun?: any | null;
}

const today = () => new Date().toISOString().split('T')[0];

export function ProductionRunModal({ isOpen, onClose, items, editRun }: Props) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(today());
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [inputs, setInputs] = useState<LineItem[]>([{ itemId: '', quantity: '' }]);
  const [outputs, setOutputs] = useState<OutputLineItem[]>([{ itemId: '', quantity: '', unitPrice: '', isByProduct: false }]);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Reset form when opened (prefill if editing)
  useEffect(() => {
    if (isOpen) {
      if (editRun) {
        const runItems = editRun.items ?? [];
        const inputItems = runItems.filter((i: any) => i.lineType === 'Input');
        const outputItems = runItems.filter((i: any) => i.lineType === 'Output' || i.lineType === 'ByProduct');
        setDate(editRun.date ? new Date(editRun.date).toISOString().split('T')[0] : today());
        setReferenceNumber(editRun.referenceNumber ?? '');
        setNotes(editRun.notes ?? '');
        setInputs(inputItems.length > 0
          ? inputItems.map((i: any) => ({ itemId: i.itemId ?? i.item?.id ?? '', quantity: String(Number(i.quantity)) }))
          : [{ itemId: '', quantity: '' }]
        );
        setOutputs(outputItems.length > 0
          ? outputItems.map((o: any) => ({
              itemId: o.itemId ?? o.item?.id ?? '',
              quantity: String(Number(o.quantity)),
              unitPrice: o.unitPrice != null && Number(o.unitPrice) > 0 ? String(Number(o.unitPrice)) : '',
              isByProduct: o.isByProduct || o.lineType === 'ByProduct',
            }))
          : [{ itemId: '', quantity: '', unitPrice: '', isByProduct: false }]
        );
      } else {
        setDate(today());
        setReferenceNumber('');
        setNotes('');
        setInputs([{ itemId: '', quantity: '' }]);
        setOutputs([{ itemId: '', quantity: '', unitPrice: '', isByProduct: false }]);
      }
      setAllowNegativeStock(false);
      setErrors([]);
      setIsSubmitting(false);
    }
  }, [isOpen, editRun]);

  // Escape key handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && !isSubmitting) onClose();
  }, [isSubmitting, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  const itemOptions = useMemo((): SelectOption[] =>
    items.filter((i: any) => i.isActive !== false).map((i: any) => ({
      value: i.id,
      label: `${i.code} — ${i.name}`,
    })),
    [items],
  );

  if (!isOpen) return null;

  // Helpers
  const getItemById = (id: string) => items.find(i => i.id === id);

  const updateInput = (idx: number, field: keyof LineItem, value: string) => {
    setInputs(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };
  const updateOutput = (idx: number, field: string, value: string | boolean) => {
    setOutputs(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };
  const addInput = () => setInputs(prev => [...prev, { itemId: '', quantity: '' }]);
  const removeInput = (idx: number) => setInputs(prev => prev.filter((_, i) => i !== idx));
  const addOutput = () => setOutputs(prev => [...prev, { itemId: '', quantity: '', unitPrice: '', isByProduct: false }]);
  const removeOutput = (idx: number) => setOutputs(prev => prev.filter((_, i) => i !== idx));

  // Yield calculation: total main output / total input
  const totalInputQty = inputs.reduce((s, r) => s + (parseFloat(r.quantity) || 0), 0);
  const totalMainOutputQty = outputs
    .filter(o => !o.isByProduct)
    .reduce((s, r) => s + (parseFloat(r.quantity) || 0), 0);
  const yieldPct = totalInputQty > 0 && totalMainOutputQty > 0
    ? ((totalMainOutputQty / totalInputQty) * 100).toFixed(1)
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    const errs: string[] = [];
    if (!date) errs.push('Tanggal wajib diisi.');
    const validInputs = inputs.filter(i => i.itemId && i.quantity && parseFloat(i.quantity) > 0);
    const validOutputs = outputs.filter(o => o.itemId && o.quantity && parseFloat(o.quantity) > 0);
    if (validInputs.length === 0) errs.push('Minimal satu item input.');
    if (validOutputs.length === 0) errs.push('Minimal satu item output.');
    if (errs.length) { setErrors(errs); return; }

    setIsSubmitting(true);
    try {
      const payload = {
        date,
        notes: notes || null,
        referenceNumber: referenceNumber || null,
        inputs: validInputs.map(i => ({ itemId: i.itemId, quantity: parseFloat(i.quantity) })),
        outputs: validOutputs.map(o => ({
          itemId: o.itemId,
          quantity: parseFloat(o.quantity),
          unitPrice: o.unitPrice ? parseFloat(o.unitPrice) : null,
          isByProduct: o.isByProduct,
        })),
        allowNegativeStock,
      };

      if (editRun) {
        await api.put(`/inventory/production-runs/${editRun.id}`, payload);
      } else {
        await api.post('/inventory/production-runs', payload);
      }
      queryClient.invalidateQueries({ queryKey: ['production-runs'] });
      queryClient.invalidateQueries({ queryKey: ['production-run-detail'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      toast.success(editRun ? 'Proses produksi berhasil diperbarui.' : 'Proses produksi berhasil dicatat.');
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || (editRun ? 'Gagal mengedit proses produksi.' : 'Gagal mencatat proses produksi.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="production-modal-title"
        className="bg-white rounded-2xl shadow-xl w-full max-w-[calc(100vw-1rem)] sm:max-w-md lg:max-w-2xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 id="production-modal-title" className="text-base font-semibold text-gray-900">
            {editRun ? `Edit ${editRun.runNumber}` : 'Proses Produksi'}
          </h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-4 space-y-5">
            {errors.length > 0 && (
              <ul className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 space-y-1">
                {errors.map((e, i) => <li key={i}>{'\u2022'} {e}</li>)}
              </ul>
            )}

            {/* Basic info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Tanggal <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Referensi (No. PI / Opsional)
                </label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={e => setReferenceNumber(e.target.value)}
                  placeholder="Misal: PI-202603-0001"
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Catatan</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Keterangan tambahan..."
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Inputs */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Bahan Input</h3>
                <button
                  type="button"
                  onClick={addInput}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  <Plus size={13} /> Tambah Input
                </button>
              </div>
              <div className="space-y-2">
                {inputs.map((row, idx) => {
                  const item = getItemById(row.itemId);
                  return (
                    <div key={idx} className="flex gap-2 items-start">
                      <div className="flex-1">
                        <SearchableSelect
                          options={itemOptions}
                          value={row.itemId}
                          onChange={(v) => updateInput(idx, 'itemId', v)}
                          placeholder="— Pilih Item —"
                        />
                        {item && (
                          <p className="text-xs text-gray-400 mt-0.5 ml-1">
                            Stok: {Number(item.currentStock).toLocaleString('id-ID', { maximumFractionDigits: 3 })} {item.unit}
                          </p>
                        )}
                      </div>
                      <div className="w-36 flex gap-1 items-center">
                        <input
                          type="number"
                          value={row.quantity}
                          onChange={e => updateInput(idx, 'quantity', e.target.value)}
                          placeholder="Qty"
                          min="0.001"
                          step="0.001"
                          className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {item && <span className="text-xs text-gray-400 whitespace-nowrap">{item.unit}</span>}
                      </div>
                      {inputs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeInput(idx)}
                          className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Outputs */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Hasil Output</h3>
                <button
                  type="button"
                  onClick={addOutput}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  <Plus size={13} /> Tambah Output
                </button>
              </div>
              <div className="space-y-3">
                {outputs.map((row, idx) => {
                  const item = getItemById(row.itemId);
                  const qty = parseFloat(row.quantity) || 0;
                  const price = parseFloat(row.unitPrice) || 0;
                  const rPct = totalInputQty > 0 && qty > 0 && !row.isByProduct
                    ? ((qty / totalInputQty) * 100).toFixed(1)
                    : null;
                  return (
                    <div key={idx} className={`border rounded-lg p-2.5 space-y-2 ${row.isByProduct ? 'border-amber-200 bg-amber-50/50' : 'border-gray-100 bg-gray-50/50'}`}>
                      <div className="flex gap-2 items-start">
                        <div className="flex-1">
                          <SearchableSelect
                            options={itemOptions}
                            value={row.itemId}
                            onChange={(v) => updateOutput(idx, 'itemId', v)}
                            placeholder="— Pilih Item —"
                          />
                        </div>
                        <div className="w-28 flex gap-1 items-center">
                          <input
                            type="number"
                            value={row.quantity}
                            onChange={e => updateOutput(idx, 'quantity', e.target.value)}
                            placeholder="Qty"
                            min="0.001"
                            step="0.001"
                            className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          {item && <span className="text-xs text-gray-400 whitespace-nowrap">{item.unit}</span>}
                        </div>
                        {rPct !== null && (
                          <div className="flex items-center px-2 py-2 bg-green-50 rounded-lg min-w-[46px] text-center">
                            <span className="text-xs font-semibold text-green-700">{rPct}%</span>
                          </div>
                        )}
                        {row.isByProduct && (
                          <div className="flex items-center px-2 py-2 bg-amber-100 rounded-lg">
                            <span className="text-xs font-semibold text-amber-700">Samping</span>
                          </div>
                        )}
                        {outputs.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeOutput(idx)}
                            className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                      {/* HPP / Unit Price row + By-product toggle */}
                      <div className="flex items-center gap-2 pl-0.5">
                        <label className="text-xs text-gray-400 font-medium whitespace-nowrap">HPP/kg (Rp)</label>
                        <input
                          type="number"
                          value={row.unitPrice}
                          onChange={e => updateOutput(idx, 'unitPrice', e.target.value)}
                          placeholder="Harga per unit"
                          min="0"
                          className="w-36 border border-gray-200 rounded-lg py-1.5 px-2.5 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        {price > 0 && qty > 0 && (
                          <span className="text-xs text-gray-400 font-mono">
                            = Rp {(price * qty).toLocaleString('id-ID')}
                          </span>
                        )}
                        <label className="ml-auto flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={row.isByProduct}
                            onChange={e => updateOutput(idx, 'isByProduct', e.target.checked)}
                            className="rounded border-gray-300 text-amber-500 focus:ring-amber-500 w-3.5 h-3.5"
                          />
                          <span className="text-xs text-gray-500 font-medium whitespace-nowrap">Produk Samping</span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Yield summary */}
            {yieldPct !== null && (
              <div className="bg-blue-50 rounded-lg px-4 py-3 text-sm text-blue-800">
                <span className="font-semibold">Yield: </span>
                {yieldPct}%
                <span className="text-blue-600 ml-1">
                  ({totalMainOutputQty.toLocaleString('id-ID', { maximumFractionDigits: 3 })}
                  {' / '}
                  {totalInputQty.toLocaleString('id-ID', { maximumFractionDigits: 3 })}
                  {' '}
                  {getItemById(inputs[0]?.itemId)?.unit ?? 'Kg'})
                </span>
                {outputs.some(o => o.isByProduct && parseFloat(o.quantity) > 0) && (
                  <span className="text-amber-700 ml-2 text-xs">
                    (produk samping tidak dihitung)
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100">
            <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer max-w-md">
              <input
                type="checkbox"
                checked={allowNegativeStock}
                onChange={(e) => setAllowNegativeStock(e.target.checked)}
                className="rounded mt-0.5"
              />
              <span>
                Izinkan stok minus
                <span className="block text-[11px] text-gray-400">
                  Untuk input/edit produksi backdate saat stok bahan baku sudah habis karena sales/produksi lain.
                </span>
              </span>
            </label>
            <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn-secondary"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary min-w-[120px]"
            >
              {isSubmitting ? 'Menyimpan...' : editRun ? 'Simpan Perubahan' : 'Simpan Produksi'}
            </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
