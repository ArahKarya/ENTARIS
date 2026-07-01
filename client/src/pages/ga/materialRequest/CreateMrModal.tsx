import { useState } from 'react';
import { X, Loader2, Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import { toast } from 'sonner';
import SearchableSelect from '../../../components/SearchableSelect';
import {
  mrFieldClass as fieldClass,
  mrLabelClass as labelClass,
  apiErrorMessage,
  type MrItemDraft,
  type InventoryItemOpt,
} from './types';

interface AssetOpt {
  id: string;
  code: string;
  name: string;
}

/**
 * Modal buat Material Request. Dua mode:
 *  - Standalone: user pilih aset + isi item.
 *  - Dari Work Order (woContext diisi): aset terkunci dari WO, POST ke
 *    /from-work-order/:workOrderId.
 */
export function CreateMrModal({
  woContext,
  onClose,
}: {
  woContext?: { workOrderId: string; assetId: string | null; woCode: string };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const { data: assets = [] } = useQuery<AssetOpt[]>({
    queryKey: ['ga-assets-mr'],
    queryFn: async () => (await api.get('/ga/assets', { params: { limit: 500 } })).data,
    enabled: !woContext,
  });
  const { data: invItems = [] } = useQuery<InventoryItemOpt[]>({
    queryKey: ['ga-inventory-items-mr'],
    queryFn: async () => (await api.get('/ga/inventory/items')).data,
  });

  const [assetId, setAssetId] = useState<string>(woContext?.assetId ?? '');
  const [machineTarget, setMachineTarget] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<MrItemDraft[]>([
    { inventoryItemId: null, itemName: '', sku: '', uom: '', quantity: 1, notes: '' },
  ]);

  const updateItem = (idx: number, patch: Partial<MrItemDraft>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const addItem = () =>
    setItems((prev) => [...prev, { inventoryItemId: null, itemName: '', sku: '', uom: '', quantity: 1, notes: '' }]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  // Saat pilih item inventaris existing → autofill nama/sku/uom.
  const pickInventoryItem = (idx: number, itemId: string) => {
    if (!itemId) {
      updateItem(idx, { inventoryItemId: null });
      return;
    }
    const src = invItems.find((x) => x.id === itemId);
    updateItem(idx, {
      inventoryItemId: itemId,
      itemName: src?.name ?? '',
      sku: src?.sku ?? '',
      uom: src?.uom ?? '',
    });
  };

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        machineTarget: machineTarget || null,
        notes: notes || null,
        items: items.map((it) => ({
          inventoryItemId: it.inventoryItemId,
          itemName: it.itemName.trim(),
          sku: it.sku || null,
          uom: it.uom.trim(),
          quantity: Number(it.quantity),
          notes: it.notes || null,
        })),
      };
      if (woContext) {
        return api.post(`/ga/material-requests/from-work-order/${woContext.workOrderId}`, payload);
      }
      return api.post('/ga/material-requests', { ...payload, assetId: assetId || null });
    },
    onSuccess: () => {
      toast.success('Permintaan barang dibuat.');
      queryClient.invalidateQueries({ queryKey: ['ga-material-requests'] });
      if (woContext) queryClient.invalidateQueries({ queryKey: ['ga-work-order', woContext.workOrderId] });
      onClose();
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, 'Gagal membuat permintaan barang.')),
  });

  const submit = () => {
    for (const it of items) {
      if (!it.itemName.trim()) return toast.error('Setiap item wajib punya nama.');
      if (!it.uom.trim()) return toast.error(`Item "${it.itemName}" belum punya satuan (UOM).`);
      if (!(Number(it.quantity) > 0)) return toast.error(`Qty item "${it.itemName}" harus lebih dari 0.`);
    }
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="text-lg font-semibold text-gray-900">
            {woContext ? `Minta Sparepart — dari WO ${woContext.woCode}` : 'Buat Permintaan Barang (MR)'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!woContext && (
            <div>
              <label className={labelClass}>Aset Tujuan (opsional)</label>
              <SearchableSelect
                options={assets.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))}
                value={assetId}
                onChange={(v) => setAssetId(v)}
                placeholder="— Tanpa aset spesifik —"
                allowClear={true}
              />
            </div>
          )}
          <div>
            <label className={labelClass}>Mesin / Target (opsional)</label>
            <input
              className={fieldClass}
              value={machineTarget}
              onChange={(e) => setMachineTarget(e.target.value)}
              placeholder="Contoh: Dryer Timur, Genset 2"
            />
          </div>
          <div>
            <label className={labelClass}>Catatan (opsional)</label>
            <textarea className={fieldClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelClass + ' mb-0'}>Daftar Barang *</label>
              <button
                onClick={addItem}
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700"
              >
                <Plus size={14} /> Tambah baris
              </button>
            </div>
            <div className="space-y-3">
              {items.map((it, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Barang #{idx + 1}</span>
                    {items.length > 1 && (
                      <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Item Inventaris GA (opsional)</label>
                    <SearchableSelect
                      options={invItems.map((x) => ({ value: x.id, label: `${x.sku} — ${x.name}` }))}
                      value={it.inventoryItemId ?? ''}
                      onChange={(v) => pickInventoryItem(idx, v)}
                      placeholder="— Barang baru / freetext —"
                      allowClear={true}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className={labelClass}>Nama Barang *</label>
                      <input
                        className={fieldClass}
                        value={it.itemName}
                        onChange={(e) => updateItem(idx, { itemName: e.target.value })}
                        placeholder="Contoh: V-belt B-52"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>SKU (opsional)</label>
                      <input className={fieldClass} value={it.sku} onChange={(e) => updateItem(idx, { sku: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelClass}>Satuan (UOM) *</label>
                      <input
                        className={fieldClass}
                        value={it.uom}
                        onChange={(e) => updateItem(idx, { uom: e.target.value })}
                        placeholder="pcs, set, meter"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Qty *</label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className={fieldClass}
                        value={it.quantity}
                        onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Catatan item</label>
                      <input className={fieldClass} value={it.notes} onChange={(e) => updateItem(idx, { notes: e.target.value })} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">
              Batal
            </button>
            <button
              onClick={submit}
              disabled={mutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-50"
            >
              {mutation.isPending && <Loader2 size={14} className="animate-spin" />} Simpan MR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
