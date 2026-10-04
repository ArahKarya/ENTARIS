import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, Loader2, AlertCircle, PackageCheck } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import SearchableSelect, { type SelectOption } from './SearchableSelect';
import Select from './Select';

const UNITS = ['Kg', 'Ton', 'Sak', 'Liter', 'Pcs', 'Box', 'Unit', 'Set', 'Meter'];

interface GRItem {
  id: string;
  inventoryItemId: string;
  warehouseId: string;
  itemName: string;
  quantity: number;
  unit: string;
  description: string;
  /** Set when the line was prefilled from a PO line (bumps its qtyReceived). */
  purchaseOrderItemId?: string;
}

const defaultItem = (): GRItem => ({
  id: crypto.randomUUID(),
  inventoryItemId: '',
  warehouseId: '',
  itemName: '',
  quantity: 0,
  unit: 'Kg',
  description: '',
});

/** PO (GET /purchase-orders/:id) to receive against — "Buat STT dari PO". */
export interface GoodsReceiptSourcePO {
  id: string;
  partyId: string | null;
  /** Destination warehouse of the PO — default for every prefilled line. */
  warehouseId?: string | null;
  items: Array<{
    id: string;
    inventoryItemId: string | null;
    itemName: string;
    unit: string;
    quantity: number | string;
    qtyReceived: number | string;
    description?: string | null;
  }>;
}

interface Props {
  onClose: () => void;
  /** Prefill supplier, PO and the PO's outstanding lines (remaining qty). */
  initialPurchaseOrder?: GoodsReceiptSourcePO | null;
}

/** Outstanding PO lines → STT lines (warehouse defaults to the PO destination). */
function itemsFromPO(po: GoodsReceiptSourcePO): GRItem[] {
  const lines = po.items
    .map((it) => ({ it, remaining: Number(it.quantity) - Number(it.qtyReceived ?? 0) }))
    .filter(({ remaining }) => remaining > 0)
    .map(({ it, remaining }) => ({
      ...defaultItem(),
      warehouseId: po.warehouseId ?? '',
      inventoryItemId: it.inventoryItemId ?? '',
      itemName: it.itemName,
      unit: it.unit,
      quantity: Math.round(remaining * 1000) / 1000,
      description: it.description ?? '',
      purchaseOrderItemId: it.id,
    }));
  return lines.length > 0 ? lines : [defaultItem()];
}

// Pull current logged-in user's full name from localStorage to auto-fill
// "Penerima". Staff yang buat STT = orang yang menerima barang fisik —
// tidak perlu ketik manual setiap kali.
function getCurrentUserName(): string {
  try {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    return u?.fullName ?? '';
  } catch {
    return '';
  }
}

const GoodsReceiptModal: React.FC<Props> = ({ onClose, initialPurchaseOrder = null }) => {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [partyId, setPartyId] = useState(initialPurchaseOrder?.partyId ?? '');
  const [purchaseOrderId, setPurchaseOrderId] = useState(initialPurchaseOrder?.id ?? '');
  const [nomorMobil, setNomorMobil] = useState('');
  const [driverName, setDriverName] = useState('');
  // Read-only — derived dari user login. setRecipientName tidak dipakai
  // tapi tetap di-keep untuk konsistensi useState pattern.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [recipientName, _setRecipientName] = useState(() => getCurrentUserName());
  const [notes, setNotes] = useState('');
  const [isCustomerOwned, setIsCustomerOwned] = useState(false);
  const [items, setItems] = useState<GRItem[]>(() =>
    initialPurchaseOrder ? itemsFromPO(initialPurchaseOrder) : [defaultItem()],
  );
  const [error, setError] = useState('');

  const { data: parties } = useQuery({
    queryKey: ['parties-suppliers'],
    queryFn: async () => {
      const res = await api.get('/parties?type=Supplier');
      return res.data.data ?? res.data;
    },
  });

  const { data: inventoryItems } = useQuery({
    queryKey: ['inventory-items-gr'],
    queryFn: async () => {
      const res = await api.get('/inventory/items?limit=500');
      return res.data.data ?? res.data;
    },
  });

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses-active'],
    queryFn: async () => {
      const res = await api.get('/warehouses');
      const all = res.data.data ?? res.data;
      return (all as any[]).filter((w: any) => w.isActive);
    },
  });

  const { data: openPOs } = useQuery({
    queryKey: ['purchase-orders-open', partyId],
    queryFn: async () => {
      // Phase 4 will implement /purchase-orders. For now empty.
      try {
        // open=1 leaves out short-closed POs ("Tutup PO"); closedAt check is a fallback.
        const res = await api.get('/purchase-orders?status=Submitted&open=1&limit=100');
        const all = res.data.data ?? res.data;
        return (all as any[]).filter((po: any) => !po.closedAt && (!po.partyId || po.partyId === partyId));
      } catch {
        return [];
      }
    },
    enabled: !!partyId,
  });

  const supplierOptions: SelectOption[] = (parties ?? []).map((p: any) => ({ value: p.id, label: p.name }));

  const poOptions: SelectOption[] = [
    { value: '', label: '— Tanpa PO (Standalone) —' },
    ...((openPOs ?? []).map((po: any) => ({
      value: po.id,
      label: `${po.poNumber}${po.partyId ? '' : ' (PO Umum)'}`,
    })) as SelectOption[]),
  ];

  const itemOptions = (inventoryItems ?? []).map((i: any) => ({
    value: i.id,
    label: `${i.code} — ${i.name}`,
    meta: { unit: i.unit, avgCost: Number(i.averageCost ?? 0), name: i.name },
  }));

  const warehouseOptions: SelectOption[] = (warehouses ?? []).map((w: any) => ({ value: w.id, label: w.name }));

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

  const updateItem = (idx: number, patch: Partial<GRItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const addItem = () => setItems((prev) => [...prev, defaultItem()]);
  const removeItem = (idx: number) =>
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/goods-receipts', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goods-receipts'] });
      // STT linked to a PO bumps its qtyReceived → receipt status changes.
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-order-detail'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      toast.success('STT/BPB tersimpan. Stok masuk ke gudang.');
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal menyimpan STT.'),
  });

  const handleSubmit = () => {
    setError('');
    if (!partyId) return setError('Supplier wajib dipilih.');
    if (!date) return setError('Tanggal wajib diisi.');
    const validItems = items.filter((it) => it.inventoryItemId && it.warehouseId && it.quantity > 0);
    if (validItems.length === 0) return setError('Minimal satu item dengan qty > 0 dan gudang terpilih.');

    mutation.mutate({
      date,
      partyId,
      purchaseOrderId: isCustomerOwned ? null : (purchaseOrderId || null),
      isCustomerOwned,
      nomorMobil: nomorMobil.trim() || null,
      driverName: driverName.trim() || null,
      recipientName: recipientName.trim() || null,
      notes: notes.trim() || null,
      items: validItems.map((it) => ({
        inventoryItemId: it.inventoryItemId,
        warehouseId: it.warehouseId,
        itemName: it.itemName,
        quantity: Number(it.quantity),
        unit: it.unit,
        // Harga di-set di PI nanti. Backend pakai averageCost saat ini sebagai
        // provisional cost untuk JE accrual + weighted average.
        lockedUnitCost: 0,
        description: it.description.trim() || null,
        // Only keep the PO-line link while the STT still points at that PO.
        purchaseOrderItemId:
          it.purchaseOrderItemId && !isCustomerOwned && purchaseOrderId === initialPurchaseOrder?.id
            ? it.purchaseOrderItemId
            : null,
      })),
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-5xl bg-white rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <PackageCheck size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Buat BPB / Surat Tanda Terima</h2>
              <p className="text-xs text-gray-400">Penerimaan barang dari supplier — stok masuk + accrual hutang</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Tanggal *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="input w-full" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Supplier *</label>
              <SearchableSelect options={supplierOptions} value={partyId} onChange={setPartyId} placeholder="— Pilih Supplier —" />
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer group rounded-lg border border-teal-100 bg-teal-50/60 px-3 py-2.5">
            <input
              type="checkbox"
              checked={isCustomerOwned}
              onChange={(e) => { setIsCustomerOwned(e.target.checked); if (e.target.checked) setPurchaseOrderId(''); }}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span>
              <span className="text-sm font-medium text-teal-800 group-hover:text-teal-900">Barang Titipan Pelanggan (Jasa Repros)</span>
              <span className="block text-xs text-teal-600 mt-0.5">
                Barang milik pelanggan untuk diproses ulang — hanya kuantitas yang dicatat, tanpa nilai persediaan/hutang,
                dan tidak bisa dijadikan Invoice Pembelian. Tagih jasanya lewat Invoice Penjualan (baris jasa).
              </span>
            </span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">PO (opsional)</label>
              {isCustomerOwned ? (
                <input type="text" value="— Tidak berlaku untuk barang titipan —" disabled className="input w-full text-gray-400" />
              ) : (
                <SearchableSelect options={poOptions} value={purchaseOrderId} onChange={setPurchaseOrderId} placeholder="— Tanpa PO —" />
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">No. Mobil</label>
              <input type="text" value={nomorMobil} onChange={(e) => setNomorMobil(e.target.value)} placeholder="Mis. B 1234 ABC" className="input w-full font-mono uppercase" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Supir</label>
              <input type="text" value={driverName} onChange={(e) => setDriverName(e.target.value)} className="input w-full" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Penerima (Internal) <span className="text-gray-400 font-normal">— otomatis dari akun login</span>
              </label>
              <input
                type="text"
                value={recipientName}
                readOnly
                className="input w-full bg-gray-50 text-gray-600 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Catatan</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="input w-full" />
            </div>
          </div>

          {/* Items — harga & subtotal tidak ditampilkan di STT. Harga
              akan diisi nanti saat invoice pembelian dibuat dari STT ini. */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-widest">
              Items diterima ({items.length})
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase">
                <tr>
                  <th className="text-left px-2 py-2 w-8">#</th>
                  <th className="text-left px-2 py-2">Item</th>
                  <th className="text-left px-2 py-2 w-40">Gudang</th>
                  <th className="text-right px-2 py-2 w-28">Qty</th>
                  <th className="text-center px-2 py-2 w-20">Satuan</th>
                  <th className="text-left px-2 py-2">Keterangan</th>
                  <th className="px-2 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={it.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-2 py-2 text-center text-xs text-gray-300">{idx + 1}</td>
                    <td className="px-2 py-2">
                      <SearchableSelect
                        options={itemOptions}
                        value={it.inventoryItemId}
                        onChange={(v) => onItemPick(idx, v)}
                        placeholder="Pilih item..."
                      />
                    </td>
                    <td className="px-2 py-2">
                      <SearchableSelect
                        options={warehouseOptions}
                        value={it.warehouseId}
                        onChange={(v) => updateItem(idx, { warehouseId: v })}
                        placeholder="Gudang..."
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="0.001"
                        value={it.quantity || ''}
                        onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                        className="input w-full text-right"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Select
                        value={it.unit}
                        onChange={(e) => updateItem(idx, { unit: e.target.value })}
                        className="w-full"
                      >
                        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </Select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        value={it.description}
                        onChange={(e) => updateItem(idx, { description: e.target.value })}
                        placeholder="mis. mobil B 123 ABC, kualitas A, dll"
                        className="input w-full text-xs"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() => removeItem(idx)}
                        disabled={items.length === 1}
                        className="text-gray-300 hover:text-red-500 disabled:opacity-30"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
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
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="p-3 bg-amber-50/60 border border-amber-100 rounded-lg text-xs text-amber-800">
            <strong>Catatan:</strong> STT hanya mencatat qty barang yang diterima.
            Harga aktual akan diinput saat invoice pembelian dibuat dari STT ini.
            Sementara harga belum ada, sistem pakai averageCost item saat ini sebagai provisional cost.
          </div>
        </div>

        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/40 flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-secondary" disabled={mutation.isPending}>Batal</button>
          <button onClick={handleSubmit} disabled={mutation.isPending} className="btn-primary flex items-center gap-1.5">
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />}
            {mutation.isPending ? 'Menyimpan...' : 'Simpan STT'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GoodsReceiptModal;
