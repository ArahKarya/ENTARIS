import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, Loader2, AlertCircle, ChevronDown, Truck } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import SearchableSelect, { type SelectOption } from './SearchableSelect';
import WarehousePicker from './WarehousePicker';
import Select from './Select';

const UNITS = ['Kg', 'Ton', 'Sak', 'Liter', 'Pcs', 'Box', 'Unit', 'Set', 'Meter'];

interface DOItem {
  id: string;
  inventoryItemId: string;
  warehouseId: string;
  itemName: string;
  quantity: number;
  unit: string;
  description: string;
}

const defaultItem = (): DOItem => ({
  id: crypto.randomUUID(),
  inventoryItemId: '',
  warehouseId: '',
  itemName: '',
  quantity: 1,
  unit: 'Kg',
  description: '',
});

interface Props {
  onClose: () => void;
  /** Existing DO to edit. When provided, modal opens in edit mode: PUT /:id
   *  instead of POST /, pre-filled with the DO's current header + items. */
  editDO?: {
    id: string;
    doNumber: string;
    date: string;
    partyId: string;
    nomorMobil: string | null;
    driverName: string | null;
    recipientName: string | null;
    notes: string | null;
    items: Array<{
      id: string;
      inventoryItemId: string | null;
      warehouseId: string | null;
      itemName: string;
      quantity: number;
      unit: string;
      description: string | null;
    }>;
  };
}

const DeliveryOrderModal: React.FC<Props> = ({ onClose, editDO }) => {
  const today = new Date().toISOString().split('T')[0];
  const isEdit = !!editDO;

  const [date, setDate] = useState(() => editDO ? editDO.date.slice(0, 10) : today);
  const [partyId, setPartyId] = useState(() => editDO?.partyId ?? '');
  const [nomorMobil, setNomorMobil] = useState(() => editDO?.nomorMobil ?? '');
  const [driverName, setDriverName] = useState(() => editDO?.driverName ?? '');
  const [recipientName, setRecipientName] = useState(() => editDO?.recipientName ?? '');
  const [notes, setNotes] = useState(() => editDO?.notes ?? '');
  const [items, setItems] = useState<DOItem[]>(() =>
    editDO
      ? editDO.items.map((it) => ({
          id: crypto.randomUUID(),
          inventoryItemId: it.inventoryItemId ?? '',
          warehouseId: it.warehouseId ?? '',
          itemName: it.itemName,
          quantity: Number(it.quantity),
          unit: it.unit,
          description: it.description ?? '',
        }))
      : [defaultItem()],
  );
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [negativeStockReason, setNegativeStockReason] = useState('');
  const isAdmin = (() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null')?.role === 'Admin'; } catch { return false; }
  })();
  const [error, setError] = useState('');

  const queryClient = useQueryClient();

  const { data: parties } = useQuery({
    queryKey: ['parties-customers'],
    queryFn: async () => {
      const res = await api.get('/parties?type=Customer');
      return res.data.data ?? res.data;
    },
  });

  const { data: inventoryItems } = useQuery({
    queryKey: ['inventory-items-active'],
    queryFn: async () => {
      const res = await api.get('/inventory/items');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((i: any) => i.isActive !== false);
    },
  });

  const selectedParty = parties?.find((p: any) => p.id === partyId);

  const partyOptions = useMemo<SelectOption[]>(
    () => (parties ?? []).map((p: any) => ({ value: p.id, label: p.name })),
    [parties],
  );

  const inventoryOptions = useMemo<SelectOption[]>(
    () =>
      (inventoryItems ?? []).map((inv: any) => ({
        value: inv.id,
        label: `${inv.code} — ${inv.name} (${inv.currentStock} ${inv.unit})`,
      })),
    [inventoryItems],
  );

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = isEdit
        ? await api.put(`/delivery-orders/${editDO!.id}`, data)
        : await api.post('/delivery-orders', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success(
        isEdit
          ? `${editDO!.doNumber} berhasil diperbarui. Stok lama dikembalikan, stok baru dikeluarkan.`
          : 'Surat jalan berhasil dibuat. Stok dikeluarkan dari gudang.',
      );
      queryClient.invalidateQueries({ queryKey: ['delivery-orders'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-order-detail'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items-active'] });
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || (isEdit ? 'Gagal mengedit surat jalan.' : 'Gagal menyimpan surat jalan.')),
  });

  const addItem = () => setItems([...items, defaultItem()]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof DOItem, value: any) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: value };
    setItems(next);
  };
  const selectInventoryItem = (idx: number, inventoryId: string) => {
    const inv = inventoryItems?.find((i: any) => i.id === inventoryId);
    const next = [...items];
    if (inv) {
      next[idx] = { ...next[idx], inventoryItemId: inventoryId, itemName: inv.name, unit: inv.unit || 'Kg' };
    } else {
      next[idx] = { ...next[idx], inventoryItemId: '', itemName: '' };
    }
    setItems(next);
  };

  // Total qty per unit (don't sum across different units — meaningless).
  const totalQtyByUnit = items.reduce<Record<string, number>>((acc, it) => {
    if (!it.itemName || !it.quantity) return acc;
    const u = it.unit || 'Pcs';
    acc[u] = (acc[u] ?? 0) + Number(it.quantity);
    return acc;
  }, {});

  // Detect stock shortages so the user can opt-in to allow negative stock.
  const stockShortages = (() => {
    const qtyByItem = new Map<string, number>();
    for (const it of items) {
      if (!it.inventoryItemId) continue;
      qtyByItem.set(it.inventoryItemId, (qtyByItem.get(it.inventoryItemId) ?? 0) + (Number(it.quantity) || 0));
    }
    const out: { id: string; name: string; unit: string; available: number; needed: number }[] = [];
    qtyByItem.forEach((needed, id) => {
      const inv = inventoryItems?.find((i: any) => i.id === id);
      if (!inv) return;
      const available = Number(inv.currentStock);
      if (available < needed) {
        out.push({ id, name: inv.name, unit: inv.unit || '', available, needed });
      }
    });
    return out;
  })();
  const hasShortage = stockShortages.length > 0;

  // Product line must have a warehouse so backend can decrement stock.
  const hasMissingWarehouse = items.some(
    (i) => i.inventoryItemId && !i.warehouseId,
  );
  const validItems = items.filter((i) => i.itemName && Number(i.quantity) > 0);
  const canSubmit =
    !!partyId &&
    validItems.length > 0 &&
    !hasMissingWarehouse &&
    (!hasShortage || allowNegativeStock) &&
    !mutation.isPending;

  const handleSubmit = () => {
    setError('');
    if (!partyId) { setError('Pilih pelanggan.'); return; }
    if (validItems.length === 0) { setError('Tambahkan minimal satu item dengan qty > 0.'); return; }
    if (hasMissingWarehouse) { setError('Pilih gudang sumber untuk setiap baris barang dari stok.'); return; }
    if (allowNegativeStock && negativeStockReason.trim().length < 10) {
      setError('Alasan bypass stok minus wajib diisi (minimal 10 karakter).');
      return;
    }

    mutation.mutate({
      date,
      partyId,
      nomorMobil: nomorMobil.trim() || null,
      driverName: driverName.trim() || null,
      recipientName: recipientName.trim() || null,
      notes: notes.trim() || null,
      allowNegativeStock,
      negativeStockReason: allowNegativeStock ? negativeStockReason.trim() : null,
      items: validItems.map((i) => ({
        inventoryItemId: i.inventoryItemId || null,
        warehouseId: i.warehouseId || null,
        itemName: i.itemName,
        quantity: Number(i.quantity),
        unit: i.unit,
        description: i.description.trim() || null,
      })),
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="do-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Escape' && onClose()}
    >
      <div
        className="rounded-xl w-full max-w-[calc(100vw-1rem)] lg:max-w-4xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-primary)' }}
      >
        {/* ── HEADER ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Truck size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 id="do-modal-title" className="text-base font-semibold text-gray-900">
                {isEdit ? `Edit ${editDO!.doNumber}` : 'Buat Surat Jalan'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Dokumen pengiriman fisik • stok keluar saat disimpan</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors" aria-label="Tutup">
            <X size={18} />
          </button>
        </div>

        {/* ── BODY ── */}
        <div className="flex-1 overflow-y-auto">
          {/* HEADER section */}
          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 border-b border-gray-100">
            {/* LEFT — Customer */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Pelanggan</p>
              <SearchableSelect
                options={partyOptions}
                value={partyId}
                onChange={setPartyId}
                placeholder="— Pilih Pelanggan —"
              />
              {selectedParty && (
                <div className="text-xs text-gray-500 space-y-0.5 mt-2 pl-1">
                  {selectedParty.phone && <p>{selectedParty.phone}</p>}
                  {selectedParty.address && <p className="text-gray-400">{selectedParty.address}</p>}
                </div>
              )}
            </div>

            {/* RIGHT — DO meta */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Tanggal</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">No. Mobil</label>
                <input
                  type="text"
                  value={nomorMobil}
                  onChange={(e) => setNomorMobil(e.target.value)}
                  placeholder="mis. B 1234 ABC"
                  maxLength={30}
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm uppercase text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Supir</label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="Nama supir"
                  maxLength={100}
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Penerima (opsional)</label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Nama penerima di lokasi tujuan"
                  maxLength={100}
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* ── ITEMS ── */}
          <div className="px-6 pt-5 pb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Daftar Barang</p>
              <button onClick={addItem} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
                <Plus size={13} /> Tambah Baris
              </button>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 760 }}>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-4 py-3 w-8">#</th>
                    <th className="text-left px-4 py-3 min-w-[260px]">Nama Barang</th>
                    <th className="text-center px-3 py-3 w-24 min-w-[96px]">Qty</th>
                    <th className="text-left px-3 py-3 w-24">Satuan</th>
                    <th className="text-left px-3 py-3 min-w-[160px]">Keterangan</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.id} className="group border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-center text-xs text-gray-300 font-medium">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <SearchableSelect
                          options={inventoryOptions}
                          value={item.inventoryItemId}
                          onChange={(v) => selectInventoryItem(idx, v)}
                          placeholder="— Pilih dari Stok Gudang —"
                          className="mb-1"
                        />
                        {!item.inventoryItemId && (
                          <input
                            type="text"
                            value={item.itemName}
                            onChange={(e) => updateItem(idx, 'itemName', e.target.value)}
                            placeholder="Atau ketik nama barang manual..."
                            className="w-full bg-transparent text-xs text-gray-500 border-none focus:ring-0 focus:outline-none p-0 placeholder:text-gray-400 mb-1"
                          />
                        )}
                        {item.inventoryItemId && (
                          <div className="mt-1">
                            <WarehousePicker
                              value={item.warehouseId}
                              onChange={(v) => updateItem(idx, 'warehouseId', v)}
                              size="sm"
                              placeholder="Pilih gudang sumber..."
                            />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                          min={0}
                          className="w-full bg-transparent text-sm text-gray-800 text-center font-mono border-none focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="relative">
                          <Select
                            value={item.unit}
                            onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                            className="w-full"
                          >
                            {UNITS.map((u) => <option key={u}>{u}</option>)}
                          </Select>
                          <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateItem(idx, 'description', e.target.value)}
                          placeholder="Catatan baris..."
                          className="w-full bg-transparent text-xs text-gray-500 border-none focus:ring-0 focus:outline-none p-0 placeholder:text-gray-300"
                        />
                      </td>
                      <td className="pr-3 py-3 text-center">
                        {items.length > 1 && (
                          <button
                            onClick={() => removeItem(idx)}
                            className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                            aria-label="Hapus baris"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── SUMMARY (qty per unit) + NOTES ── */}
          <div className="px-6 pb-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Catatan</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Misal: dititipkan ke pos satpam..."
                rows={3}
                className="w-full border border-gray-200 rounded-lg py-2.5 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-400"
              />
            </div>

            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Ringkasan Qty</p>
              {Object.keys(totalQtyByUnit).length === 0 ? (
                <p className="text-xs text-gray-400 italic">Belum ada barang.</p>
              ) : (
                <div className="space-y-1.5">
                  {Object.entries(totalQtyByUnit).map(([u, q]) => (
                    <div key={u} className="flex justify-between text-sm">
                      <span className="text-gray-500">Total {u}</span>
                      <span className="font-mono text-gray-800 tabular-nums">
                        {q.toLocaleString('id-ID', { maximumFractionDigits: 3 })} {u}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-gray-400 italic mt-3">
                Surat jalan tidak mencatat rupiah — invoice menyusul setelah pengiriman.
              </p>
            </div>
          </div>

          {hasShortage && (
            <div className="mx-6 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
              <div className="flex items-start gap-2 mb-2">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Stok tidak mencukupi untuk:</p>
                  <ul className="mt-1 ml-1 list-disc list-inside text-xs space-y-0.5">
                    {stockShortages.map((s) => (
                      <li key={s.id}>
                        <span className="font-medium">{s.name}</span>: tersedia {s.available.toLocaleString('id-ID', { maximumFractionDigits: 3 })} {s.unit}, dibutuhkan {s.needed.toLocaleString('id-ID', { maximumFractionDigits: 3 })} {s.unit}
                        <span className="text-amber-600"> (kurang {(s.needed - s.available).toLocaleString('id-ID', { maximumFractionDigits: 3 })})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {!isAdmin && (
                <p className="text-xs text-amber-700 mt-2 pl-5">
                  Submit akan ditolak — buat produksi/transfer/penerimaan untuk
                  item ini dulu, atau kurangi qty di Surat Jalan.
                </p>
              )}
              {isAdmin && (
                <div className="mt-2 pl-5 space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={allowNegativeStock}
                      onChange={(e) => setAllowNegativeStock(e.target.checked)}
                      className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-amber-900">
                      <strong>Admin override:</strong> izinkan stok minus (produksi/penerimaan akan menyusul). Audit log akan dicatat.
                    </span>
                  </label>
                  {allowNegativeStock && (
                    <textarea
                      value={negativeStockReason}
                      onChange={(e) => setNegativeStockReason(e.target.value)}
                      placeholder="Alasan bypass (min 10 karakter): contoh 'Produksi 50 ton sedang berjalan, akan diinput sore ini'"
                      className="w-full text-xs border border-amber-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      rows={2}
                      required
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mx-6 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={15} /> <span>{error}</span>
            </div>
          )}
        </div>

        {/* ── FOOTER ACTIONS ── */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {canSubmit
              ? 'Siap disimpan. Stok akan dikeluarkan dari gudang.'
              : hasMissingWarehouse
                ? 'Pilih gudang sumber untuk setiap baris barang dari stok.'
                : !partyId
                  ? 'Pilih pelanggan dan tambahkan minimal 1 item.'
                  : 'Lengkapi minimal 1 item dengan qty > 0.'}
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary">Batal</button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : 'Simpan Surat Jalan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeliveryOrderModal;
