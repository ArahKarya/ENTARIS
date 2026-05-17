import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, Loader2, AlertCircle, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import SearchableSelect, { type SelectOption } from './SearchableSelect';

const UNITS = ['Kg', 'Ton', 'Sak', 'Liter', 'Pcs', 'Box', 'Unit', 'Set', 'Meter'];

interface POItem {
  id: string;
  inventoryItemId: string;
  itemName: string;
  quantity: number;
  unit: string;
  estimatedRate: number;
  description: string;
}

const defaultItem = (): POItem => ({
  id: crypto.randomUUID(),
  inventoryItemId: '',
  itemName: '',
  quantity: 0,
  unit: 'Kg',
  estimatedRate: 0,
  description: '',
});

interface Props {
  onClose: () => void;
}

const PurchaseOrderModal: React.FC<Props> = ({ onClose }) => {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [partyId, setPartyId] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [items, setItems] = useState<POItem[]>([defaultItem()]);
  const [error, setError] = useState('');
  const [isUmum, setIsUmum] = useState(false);

  const { data: parties } = useQuery({
    queryKey: ['parties-suppliers'],
    queryFn: async () => {
      const res = await api.get('/parties?type=Supplier');
      return res.data.data ?? res.data;
    },
  });

  const { data: inventoryItems } = useQuery({
    queryKey: ['inventory-items-po'],
    queryFn: async () => {
      const res = await api.get('/inventory/items?limit=500');
      return res.data.data ?? res.data;
    },
  });

  const supplierOptions: SelectOption[] = (parties ?? []).map((p: any) => ({ value: p.id, label: p.name }));
  const itemOptions = (inventoryItems ?? []).map((i: any) => ({
    value: i.id,
    label: `${i.code} — ${i.name}`,
    meta: { unit: i.unit, name: i.name },
  }));

  const onItemPick = (idx: number, invId: string) => {
    const meta = itemOptions.find((o: any) => o.value === invId)?.meta;
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx
          ? {
              ...it,
              inventoryItemId: invId,
              itemName: meta?.name ?? it.itemName,
              unit: meta?.unit ?? it.unit,
            }
          : it,
      ),
    );
  };

  const updateItem = (idx: number, patch: Partial<POItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const addItem = () => setItems((prev) => [...prev, defaultItem()]);
  const removeItem = (idx: number) => setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  const grandTotal = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.estimatedRate) || 0), 0);

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/purchase-orders', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast.success('PO tersimpan.');
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal menyimpan PO.'),
  });

  const handleSubmit = () => {
    setError('');
    if (!date) return setError('Tanggal wajib diisi.');
    if (!isUmum && !partyId) return setError('Pilih supplier atau centang "PO Umum".');
    const validItems = items.filter((it) => it.itemName && it.quantity > 0);
    if (validItems.length === 0) return setError('Minimal satu item dengan qty > 0.');

    mutation.mutate({
      date,
      partyId: isUmum ? null : partyId,
      expectedDeliveryDate: expectedDeliveryDate || null,
      notes: notes.trim() || null,
      terms: terms.trim() || null,
      items: validItems.map((it) => ({
        inventoryItemId: it.inventoryItemId || null,
        itemName: it.itemName,
        quantity: Number(it.quantity),
        unit: it.unit,
        estimatedRate: Number(it.estimatedRate) || 0,
        description: it.description.trim() || null,
      })),
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-5xl bg-white rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <ClipboardList size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Buat Purchase Order (PO)</h2>
              <p className="text-xs text-gray-400">Pesanan pembelian ke supplier — tidak ada GL/stock impact</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Tanggal PO *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="input w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Tgl Kirim Diharapkan</label>
              <input type="date" value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} className="input w-full" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-purple-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isUmum}
                  onChange={(e) => {
                    setIsUmum(e.target.checked);
                    if (e.target.checked) setPartyId('');
                  }}
                  className="rounded border-purple-300 text-purple-600"
                />
                PO Umum (boleh dipenuhi supplier apa saja)
              </label>
            </div>
          </div>

          {!isUmum && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Supplier *</label>
              <SearchableSelect options={supplierOptions} value={partyId} onChange={setPartyId} placeholder="— Pilih Supplier —" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Catatan</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="input w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Terms / Syarat</label>
              <input type="text" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="mis. Net 30, FOB Pabrik" className="input w-full" />
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between">
              <span>Items dipesan ({items.length})</span>
              <span className="font-normal normal-case text-gray-400">
                Estimasi: <span className="font-mono font-semibold text-gray-700">Rp {grandTotal.toLocaleString('id-ID')}</span>
              </span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase">
                <tr>
                  <th className="text-left px-2 py-2 w-8">#</th>
                  <th className="text-left px-2 py-2">Item (opsional, untuk inventory)</th>
                  <th className="text-left px-2 py-2 w-40">Nama Item *</th>
                  <th className="text-right px-2 py-2 w-24">Qty *</th>
                  <th className="text-center px-2 py-2 w-20">Sat *</th>
                  <th className="text-right px-2 py-2 w-28">Est. Harga</th>
                  <th className="text-right px-2 py-2 w-28">Est. Subtotal</th>
                  <th className="text-left px-2 py-2 w-40">Keterangan</th>
                  <th className="px-2 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const subtotal = (Number(it.quantity) || 0) * (Number(it.estimatedRate) || 0);
                  return (
                    <tr key={it.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-2 py-2 text-center text-xs text-gray-300">{idx + 1}</td>
                      <td className="px-2 py-2">
                        <SearchableSelect
                          options={itemOptions}
                          value={it.inventoryItemId}
                          onChange={(v) => onItemPick(idx, v)}
                          placeholder="Pilih item (opsional)..."
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input type="text" value={it.itemName} onChange={(e) => updateItem(idx, { itemName: e.target.value })} className="input w-full text-xs" />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" step="0.001" value={it.quantity || ''}
                          onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                          className="input w-full text-right" />
                      </td>
                      <td className="px-2 py-2">
                        <select value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} className="input w-full text-xs">
                          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" step="0.01" value={it.estimatedRate || ''}
                          onChange={(e) => updateItem(idx, { estimatedRate: Number(e.target.value) })}
                          className="input w-full text-right" />
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-xs text-gray-700">
                        {subtotal > 0 ? `Rp ${subtotal.toLocaleString('id-ID')}` : '—'}
                      </td>
                      <td className="px-2 py-2">
                        <input type="text" value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} className="input w-full text-xs" />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button onClick={() => removeItem(idx)} disabled={items.length === 1} className="text-gray-300 hover:text-red-500 disabled:opacity-30">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-gray-100">
              <button onClick={addItem} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                <Plus size={12} /> Tambah baris
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />{error}
            </div>
          )}

          <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-lg text-xs text-blue-800">
            PO hanya planning — tidak ada GL/stock impact. Estimasi harga opsional. Saat barang datang, buat STT/BPB dari PO ini.
          </div>
        </div>

        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/40 flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-secondary" disabled={mutation.isPending}>Batal</button>
          <button onClick={handleSubmit} disabled={mutation.isPending} className="btn-primary flex items-center gap-1.5">
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <ClipboardList size={14} />}
            {mutation.isPending ? 'Menyimpan...' : 'Simpan PO'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PurchaseOrderModal;
