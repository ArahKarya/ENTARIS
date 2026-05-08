import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Plus, Trash2, Loader2, AlertCircle, Paperclip, FileText, Image as ImageIcon } from 'lucide-react';
import { formatRupiah } from '../lib/formatters';

// Rice-mill purchase invoice item.
// Flow: timbanganTruk (info only) → refaksi (kg deducted) → timbanganDiterima (net received)
// → rate → ppn/pph → potonganItem → hargaAkhir.
type ItemType = 'material' | 'service';

interface InvoiceItem {
  id: string;
  itemType: ItemType;          // 'material' = bahan baku w/ timbangan; 'service' = jasa/biaya
  itemName: string;
  inventoryItemId: string;
  description: string;
  unit: string;
  kualitas: string;
  refaksi: number;            // kg, optional (material only)
  timbanganTruk: number;       // kg, informational only (material only)
  timbanganDiterima: number;   // kg (material) atau qty (service) — selalu jadi quantity
  rate: number;                // harga per kg (material) atau total harga per unit (service)
  taxPct: number;              // PPN % per item
  pphPct: number;              // PPh % per item
  potonganItem: number;        // IDR per item
  nomorMobil: string;          // plat nomor mobil (material only, optional)
}

const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const defaultItem = (type: ItemType = 'material'): InvoiceItem => ({
  id: crypto.randomUUID(),
  itemType: type,
  itemName: '',
  inventoryItemId: '',
  description: '',
  unit: type === 'service' ? 'pcs' : 'Kg',
  kualitas: '',
  refaksi: 0,
  timbanganTruk: 0,
  timbanganDiterima: type === 'service' ? 1 : 0,
  rate: 0,
  taxPct: 0,
  pphPct: 0,
  potonganItem: 0,
  nomorMobil: '',
});

// Per-item calc — mirrors server/src/services/purchaseInvoiceCalc.ts
// so the UI total matches what the backend will persist.
interface LineCalc {
  effectiveQty: number;
  subtotal: number;
  ppn: number;
  pph: number;
  hargaAkhir: number;
}

const computeLine = (item: InvoiceItem): LineCalc => {
  const qty = item.timbanganDiterima > 0 ? item.timbanganDiterima : 0;
  const subtotal = Math.round(qty * item.rate * 100) / 100;
  const ppn = Math.round(subtotal * (item.taxPct / 100) * 100) / 100;
  const pph = Math.round(subtotal * (item.pphPct / 100) * 100) / 100;
  const hargaAkhir = Math.round((subtotal + ppn - pph - item.potonganItem) * 100) / 100;
  return { effectiveQty: qty, subtotal, ppn, pph, hargaAkhir };
};

interface PurchaseInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** When provided, modal opens with these values prefilled (re-create after cancel). */
  prefill?: {
    date?: string;
    dueDate?: string;
    partyId?: string;
    notes?: string;
    biayaLain?: number;
    items?: InvoiceItem[];
  } | null;
}

const PurchaseInvoiceModal: React.FC<PurchaseInvoiceModalProps> = ({ isOpen, onClose, prefill }) => {
  const [invoiceDate, setInvoiceDate] = useState(() => prefill?.date ?? new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(() => prefill?.dueDate ?? new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
  const [partyId, setPartyId] = useState(prefill?.partyId ?? '');
  const [notes, setNotes] = useState(prefill?.notes ?? '');
  const [biayaLain, setBiayaLain] = useState(prefill?.biayaLain ?? 0);
  const [items, setItems] = useState<InvoiceItem[]>(prefill?.items && prefill.items.length > 0 ? prefill.items : [defaultItem()]);

  // Reset state when prefill changes (e.g. user edits a different invoice)
  React.useEffect(() => {
    if (isOpen && prefill) {
      setInvoiceDate(prefill.date ?? new Date().toISOString().split('T')[0]);
      setDueDate(prefill.dueDate ?? new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
      setPartyId(prefill.partyId ?? '');
      setNotes(prefill.notes ?? '');
      setBiayaLain(prefill.biayaLain ?? 0);
      if (prefill.items && prefill.items.length > 0) setItems(prefill.items);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, prefill]);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [error, setError] = useState('');

  const queryClient = useQueryClient();

  const { data: parties } = useQuery({
    queryKey: ['parties-suppliers'],
    queryFn: async () => {
      const res = await api.get('/parties?type=Supplier');
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

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/purchase/invoices', data);
      const invoice = res.data;
      // Upload staged attachments (best-effort; failures logged but not rolled back)
      if (stagedFiles.length > 0 && invoice?.id) {
        const fd = new FormData();
        fd.append('referenceType', 'purchase_invoice');
        fd.append('referenceId', invoice.id);
        for (const f of stagedFiles) fd.append('files', f);
        try {
          await api.post('/attachments/upload', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch (err) {
          console.warn('Upload lampiran gagal:', err);
        }
      }
      return invoice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      queryClient.invalidateQueries({ queryKey: ['attachments'] });
      setInvoiceDate(new Date().toISOString().split('T')[0]);
      setDueDate(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
      setPartyId('');
      setNotes('');
      setBiayaLain(0);
      setItems([defaultItem()]);
      setStagedFiles([]);
      setError('');
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal menyimpan invoice.'),
  });

  const addItem = () => setItems([...items, defaultItem('material')]);
  const addServiceItem = () => setItems([...items, defaultItem('service')]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof InvoiceItem, value: any) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: value };
    // Auto-derive timbanganDiterima when refaksi/timbanganTruk change
    if (field === 'timbanganTruk' || field === 'refaksi') {
      const truk = field === 'timbanganTruk' ? Number(value) : next[i].timbanganTruk;
      const ref = field === 'refaksi' ? Number(value) : next[i].refaksi;
      if (truk > 0) {
        next[i].timbanganDiterima = Math.max(0, truk - (ref || 0));
      }
    }
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid: File[] = [];
    for (const f of files) {
      if (!ALLOWED_MIME.includes(f.type)) {
        setError(`${f.name}: tipe file tidak didukung (JPG/PNG/WebP/PDF).`);
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        setError(`${f.name}: ukuran melebihi 5 MB.`);
        continue;
      }
      valid.push(f);
    }
    const merged = [...stagedFiles, ...valid].slice(0, MAX_ATTACHMENTS);
    setStagedFiles(merged);
    e.target.value = '';
  };
  const removeStagedFile = (idx: number) => setStagedFiles(stagedFiles.filter((_, i) => i !== idx));

  const lineCalcs = useMemo(() => items.map(computeLine), [items]);
  const subtotalItems = lineCalcs.reduce((s, c) => s + c.hargaAkhir, 0);
  const totalPpn = lineCalcs.reduce((s, c) => s + c.ppn, 0);
  const totalPph = lineCalcs.reduce((s, c) => s + c.pph, 0);
  const totalPotongan = items.reduce((s, i) => s + (i.potonganItem || 0), 0);
  const grandTotal = subtotalItems + biayaLain;
  // Sum effective quantity (timbanganDiterima) per unit so the total stays
  // meaningful when items use different units (Kg vs Sak vs Pcs).
  const totalQtyByUnit = items.reduce<Record<string, number>>((acc, it) => {
    const q = Number(it.timbanganDiterima ?? 0);
    if (!it.itemName || q <= 0) return acc;
    const u = it.unit || 'Kg';
    acc[u] = (acc[u] ?? 0) + q;
    return acc;
  }, {});
  // Every row must be valid; at least one row must produce value.
  // rate boleh negatif (baris jasa/biaya yang mengurangi tagihan), tapi tidak boleh 0.
  const allRowsValid = items.every(
    (i) => i.itemName.trim().length > 0 && i.rate !== 0 && i.timbanganDiterima > 0,
  );
  const canSubmit =
    partyId &&
    items.length > 0 &&
    allRowsValid &&
    grandTotal > 0 &&
    !mutation.isPending;

  if (!isOpen) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="purchase-modal-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-2 sm:p-4" onKeyDown={(e: React.KeyboardEvent) => e.key === 'Escape' && onClose()}>
      <div className="rounded-xl w-full max-w-[calc(100vw-0.5rem)] lg:max-w-6xl shadow-2xl flex flex-col max-h-[98vh] overflow-hidden" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
        {/* HEADER */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100">
          <div>
            <h2 id="purchase-modal-title" className="text-base font-semibold text-gray-900">Invoice Pembelian Baru</h2>
            <p className="text-xs text-gray-400 mt-0.5">Draft • belum disimpan</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto">
          {/* Meta */}
          <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 border-b border-gray-100">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Supplier / Pemasok</p>
              <select value={partyId} onChange={(e) => setPartyId(e.target.value)} className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2">
                <option value="">— Pilih Supplier —</option>
                {parties?.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {selectedParty && (
                <div className="text-xs text-gray-500 space-y-0.5 mt-1 pl-1">
                  {selectedParty.email && <p>{selectedParty.email}</p>}
                  {selectedParty.phone && <p>{selectedParty.phone}</p>}
                  {selectedParty.address && <p className="text-gray-400">{selectedParty.address}</p>}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Tanggal Invoice</label>
                <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Jatuh Tempo</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          {/* ITEMS — Desktop table */}
          <div className="px-4 sm:px-6 pt-5 pb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Daftar Barang</p>
              <div className="flex items-center gap-3">
                <button onClick={addItem} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
                  <Plus size={13} /> Tambah Bahan
                </button>
                <button onClick={addServiceItem} className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700">
                  <Plus size={13} /> Tambah Jasa/Biaya
                </button>
              </div>
            </div>

            {/* Desktop: horizontal scroll table */}
            <div className="hidden md:block border border-gray-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[1400px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-2 py-2 w-14">Tipe</th>
                    <th className="text-left px-2 py-2 min-w-[180px]">Item / Jasa</th>
                    <th className="text-left px-2 py-2 w-24">No. Mobil</th>
                    <th className="text-left px-2 py-2 w-32">Kualitas / Catatan</th>
                    <th className="text-right px-2 py-2 w-24">Refaksi (kg)</th>
                    <th className="text-right px-2 py-2 w-28">Timb. Truk (kg)</th>
                    <th className="text-right px-2 py-2 w-28">Qty / Diterima</th>
                    <th className="text-right px-2 py-2 w-28">Harga / unit</th>
                    <th className="text-right px-2 py-2 w-16">PPN %</th>
                    <th className="text-right px-2 py-2 w-16">PPh %</th>
                    <th className="text-right px-2 py-2 w-28">Potongan</th>
                    <th className="text-right px-2 py-2 w-32">Harga Akhir</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const calc = lineCalcs[idx];
                    const isService = item.itemType === 'service';
                    return (
                      <tr key={item.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/50 ${isService ? 'bg-emerald-50/30' : ''}`}>
                        <td className="px-2 py-2 text-center text-xs">
                          <span className={`inline-block px-1.5 py-0.5 rounded ${isService ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                            {isService ? 'Jasa' : 'Bahan'}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          {isService ? (
                            <input type="text" value={item.itemName} onChange={(e) => updateItem(idx, 'itemName', e.target.value)} placeholder="Biaya angkutan, jasa giling..." className="w-full bg-transparent text-xs text-gray-800 border-none focus:ring-0 focus:outline-none p-0 placeholder:text-gray-400" />
                          ) : (
                            <>
                              <select value={item.inventoryItemId} onChange={(e) => selectInventoryItem(idx, e.target.value)} className="w-full bg-transparent text-xs text-gray-800 border-none focus:ring-0 focus:outline-none p-0 cursor-pointer">
                                <option value="">— Pilih dari Stok —</option>
                                {inventoryItems?.map((inv: any) => (
                                  <option key={inv.id} value={inv.id}>{inv.code} — {inv.name}</option>
                                ))}
                              </select>
                              {!item.inventoryItemId && (
                                <input type="text" value={item.itemName} onChange={(e) => updateItem(idx, 'itemName', e.target.value)} placeholder="atau manual..." className="w-full bg-transparent text-xs text-gray-500 border-none focus:ring-0 focus:outline-none p-0 placeholder:text-gray-400" />
                              )}
                            </>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <input type="text" value={item.nomorMobil} onChange={(e) => updateItem(idx, 'nomorMobil', e.target.value)} placeholder={isService ? '—' : 'B 1234 ABC'} className="w-full bg-transparent text-xs text-gray-700 font-mono uppercase border-none focus:ring-0 focus:outline-none p-0 placeholder:text-gray-400 placeholder:normal-case" />
                        </td>
                        <td className="px-2 py-2">
                          {isService ? (
                            <input type="text" value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} placeholder="catatan..." className="w-full bg-transparent text-xs text-gray-700 border-none focus:ring-0 focus:outline-none p-0 placeholder:text-gray-400" />
                          ) : (
                            <input type="text" value={item.kualitas} onChange={(e) => updateItem(idx, 'kualitas', e.target.value)} placeholder="KA 18%..." className="w-full bg-transparent text-xs text-gray-700 border-none focus:ring-0 focus:outline-none p-0 placeholder:text-gray-400" />
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {isService ? (
                            <span className="text-xs text-gray-300">—</span>
                          ) : (
                            <input type="number" value={item.refaksi || ''} onChange={(e) => updateItem(idx, 'refaksi', Number(e.target.value))} placeholder="0" className="w-full bg-transparent text-xs text-amber-600 text-right font-mono border-none focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {isService ? (
                            <span className="text-xs text-gray-300">—</span>
                          ) : (
                            <input type="number" value={item.timbanganTruk || ''} onChange={(e) => updateItem(idx, 'timbanganTruk', Number(e.target.value))} placeholder="0" className="w-full bg-transparent text-xs text-gray-500 text-right font-mono border-none focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input type="number" value={item.timbanganDiterima || ''} onChange={(e) => updateItem(idx, 'timbanganDiterima', Number(e.target.value))} placeholder={isService ? '1' : '0'} className="w-full bg-transparent text-xs text-gray-900 font-semibold text-right font-mono border-none focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input type="number" value={item.rate || ''} onChange={(e) => updateItem(idx, 'rate', Number(e.target.value))} placeholder="0" className="w-full bg-transparent text-xs text-gray-800 text-right font-mono border-none focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input type="number" value={item.taxPct || ''} onChange={(e) => updateItem(idx, 'taxPct', Math.max(0, Math.min(100, Number(e.target.value))))} placeholder="0" className="w-full bg-transparent text-xs text-blue-600 text-right font-mono border-none focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input type="number" value={item.pphPct || ''} onChange={(e) => updateItem(idx, 'pphPct', Math.max(0, Math.min(100, Number(e.target.value))))} placeholder="0" className="w-full bg-transparent text-xs text-purple-600 text-right font-mono border-none focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input type="number" value={item.potonganItem || ''} onChange={(e) => updateItem(idx, 'potonganItem', Math.max(0, Number(e.target.value)))} placeholder="0" className="w-full bg-transparent text-xs text-red-500 text-right font-mono border-none focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <span className="font-mono text-xs font-medium text-gray-900 tabular-nums">{formatRupiah(calc.hargaAkhir)}</span>
                        </td>
                        <td className="pr-2 py-2 text-center">
                          {items.length > 1 && (
                            <button onClick={() => removeItem(idx)} className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: card per item */}
            <div className="md:hidden space-y-3">
              {items.map((item, idx) => {
                const calc = lineCalcs[idx];
                const isService = item.itemType === 'service';
                return (
                  <div key={item.id} className={`border rounded-xl p-3 space-y-2 ${isService ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200 bg-white'}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold uppercase px-1.5 py-0.5 rounded ${isService ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                        {isService ? 'Jasa / Biaya' : 'Bahan Baku'} #{idx + 1}
                      </span>
                      {items.length > 1 && (
                        <button onClick={() => removeItem(idx)} className="p-1 text-gray-400 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">{isService ? 'Nama Jasa/Biaya' : 'Jenis Barang'}</label>
                      {isService ? (
                        <input type="text" value={item.itemName} onChange={(e) => updateItem(idx, 'itemName', e.target.value)} placeholder="Biaya angkutan, jasa giling..." className="w-full border border-gray-200 rounded-lg py-2 px-2 text-sm" />
                      ) : (
                        <>
                          <select value={item.inventoryItemId} onChange={(e) => selectInventoryItem(idx, e.target.value)} className="w-full border border-gray-200 rounded-lg py-2 px-2 text-sm">
                            <option value="">— Pilih dari Stok —</option>
                            {inventoryItems?.map((inv: any) => (
                              <option key={inv.id} value={inv.id}>{inv.name}</option>
                            ))}
                          </select>
                          {!item.inventoryItemId && (
                            <input type="text" value={item.itemName} onChange={(e) => updateItem(idx, 'itemName', e.target.value)} placeholder="Nama manual..." className="w-full mt-1 border border-gray-200 rounded-lg py-2 px-2 text-sm" />
                          )}
                        </>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">No. Mobil</label>
                      <input type="text" value={item.nomorMobil} onChange={(e) => updateItem(idx, 'nomorMobil', e.target.value)} placeholder="B 1234 ABC" className="w-full border border-gray-200 rounded-lg py-2 px-2 text-sm font-mono uppercase" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">{isService ? 'Catatan' : 'Kualitas'}</label>
                      {isService ? (
                        <input type="text" value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} placeholder="catatan..." className="w-full border border-gray-200 rounded-lg py-2 px-2 text-sm" />
                      ) : (
                        <input type="text" value={item.kualitas} onChange={(e) => updateItem(idx, 'kualitas', e.target.value)} placeholder="KA 18%, bersih..." className="w-full border border-gray-200 rounded-lg py-2 px-2 text-sm" />
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {!isService && (
                        <>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Timb. Truk (kg)</label>
                            <input type="number" value={item.timbanganTruk || ''} onChange={(e) => updateItem(idx, 'timbanganTruk', Number(e.target.value))} className="w-full border border-gray-200 rounded-lg py-2 px-2 text-sm font-mono" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Refaksi (kg)</label>
                            <input type="number" value={item.refaksi || ''} onChange={(e) => updateItem(idx, 'refaksi', Number(e.target.value))} className="w-full border border-gray-200 rounded-lg py-2 px-2 text-sm font-mono text-amber-600" />
                          </div>
                        </>
                      )}
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-400 mb-1">{isService ? 'Jumlah *' : 'Timbangan Diterima (kg) *'}</label>
                        <input type="number" value={item.timbanganDiterima || ''} onChange={(e) => updateItem(idx, 'timbanganDiterima', Number(e.target.value))} className="w-full border border-gray-300 rounded-lg py-2 px-2 text-sm font-mono font-semibold" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">{isService ? 'Harga *' : 'Harga/kg *'}</label>
                        <input type="number" value={item.rate || ''} onChange={(e) => updateItem(idx, 'rate', Number(e.target.value))} className="w-full border border-gray-200 rounded-lg py-2 px-2 text-sm font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Potongan</label>
                        <input type="number" value={item.potonganItem || ''} onChange={(e) => updateItem(idx, 'potonganItem', Number(e.target.value))} className="w-full border border-gray-200 rounded-lg py-2 px-2 text-sm font-mono text-red-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">PPN %</label>
                        <input type="number" value={item.taxPct || ''} onChange={(e) => updateItem(idx, 'taxPct', Number(e.target.value))} className="w-full border border-gray-200 rounded-lg py-2 px-2 text-sm font-mono text-blue-600" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">PPh %</label>
                        <input type="number" value={item.pphPct || ''} onChange={(e) => updateItem(idx, 'pphPct', Number(e.target.value))} className="w-full border border-gray-200 rounded-lg py-2 px-2 text-sm font-mono text-purple-600" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                      <span className="text-xs text-gray-500">Harga Akhir</span>
                      <span className="text-sm font-bold text-gray-900 font-mono">{formatRupiah(calc.hargaAkhir)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ATTACHMENTS */}
          <div className="px-4 sm:px-6 pb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                <Paperclip size={12} /> Dokumen Pendukung
              </p>
              <label className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer">
                <Plus size={13} /> Tambah File
                <input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={handleFileSelect} className="hidden" />
              </label>
            </div>
            {stagedFiles.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Belum ada file. Max {MAX_ATTACHMENTS} file, 5 MB/file (JPG/PNG/PDF).</p>
            ) : (
              <div className="space-y-1.5">
                {stagedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-xs">
                    {f.type === 'application/pdf' ? <FileText size={14} className="text-red-500" /> : <ImageIcon size={14} className="text-blue-500" />}
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="text-gray-400">{(f.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => removeStagedFile(i)} className="text-gray-400 hover:text-red-500">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SUMMARY + NOTES */}
          <div className="px-4 sm:px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 items-start">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Catatan</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="No. PO, referensi..." rows={4} className="w-full border border-gray-200 rounded-lg py-2.5 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-400" />
            </div>
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div className="space-y-2 text-sm">
                {Object.keys(totalQtyByUnit).length > 0 && (
                  <div className="flex justify-between text-gray-600 text-xs font-medium">
                    <span>Total Qty</span>
                    <span className="font-mono tabular-nums">
                      {Object.entries(totalQtyByUnit)
                        .map(([u, q]) => `${q.toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${u}`)
                        .join(' · ')}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-gray-500 text-xs">
                  <span>Total PPN (info)</span>
                  <span className="font-mono tabular-nums">{formatRupiah(totalPpn)}</span>
                </div>
                <div className="flex justify-between text-gray-500 text-xs">
                  <span>Total PPh (info)</span>
                  <span className="font-mono tabular-nums">−{formatRupiah(totalPph)}</span>
                </div>
                <div className="flex justify-between text-gray-500 text-xs">
                  <span>Total Potongan</span>
                  <span className="font-mono tabular-nums text-red-500">−{formatRupiah(totalPotongan)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2">
                  <span className="text-gray-600">Subtotal Item</span>
                  <span className="font-mono tabular-nums text-gray-800">{formatRupiah(subtotalItems)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-gray-500">Biaya Lain</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-gray-400 text-xs">{biayaLain < 0 ? '−' : '+'}</span>
                    <input type="number" value={biayaLain || ''} onChange={(e) => setBiayaLain(Number(e.target.value) || 0)} placeholder="0" title="Boleh negatif untuk potong tagihan" className="w-28 text-right font-mono text-gray-700 bg-transparent border-none focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none tabular-nums" />
                  </div>
                </div>
                <div className="border-t border-gray-200 pt-2.5 flex justify-between items-baseline">
                  <span className="text-sm font-semibold text-gray-700">Total</span>
                  <span className="text-xl sm:text-2xl font-bold text-blue-600 font-mono tabular-nums">{formatRupiah(grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="mx-4 sm:mx-6 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={15} /> <span>{error}</span>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="px-4 sm:px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-2">
          <p className="text-xs text-gray-400 hidden sm:block">
            {canSubmit ? `Total: ${formatRupiah(grandTotal)}` : 'Lengkapi supplier & minimal 1 item'}
          </p>
          <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
            <button onClick={onClose} className="btn-secondary flex-1 sm:flex-none">Batal</button>
            <button
              onClick={() =>
                mutation.mutate({
                  date: invoiceDate,
                  dueDate,
                  partyId,
                  notes,
                  biayaLain,
                  items: items.map((i) => ({
                    itemName: i.itemName,
                    inventoryItemId: i.inventoryItemId || null,
                    description: i.description || null,
                    quantity: i.timbanganDiterima > 0 ? i.timbanganDiterima : 0,
                    unit: i.unit,
                    rate: i.rate,
                    discount: 0,
                    taxPct: i.taxPct,
                    pphPct: i.pphPct,
                    potonganItem: i.potonganItem,
                    kualitas: i.kualitas || null,
                    refaksi: i.refaksi || null,
                    timbanganTruk: i.timbanganTruk || null,
                    timbanganDiterima: i.timbanganDiterima || null,
                    nomorMobil: i.nomorMobil?.trim() || null,
                  })),
                })
              }
              disabled={!canSubmit}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed flex-1 sm:flex-none"
            >
              {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : 'Simpan Invoice'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PurchaseInvoiceModal;
