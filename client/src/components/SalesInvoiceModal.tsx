import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Plus, Trash2, Loader2, AlertCircle, ChevronDown, Paperclip, FileText, Image as ImageIcon, Truck, ChevronRight } from 'lucide-react';
import { formatRupiah } from '../lib/formatters';
import SearchableSelect, { type SelectOption } from './SearchableSelect';
import WarehousePicker from './WarehousePicker';
import BatchPicker from './BatchPicker';


interface InvoiceItem {
  id: string;
  itemName: string;
  itemType: 'product' | 'service';
  inventoryItemId: string;
  warehouseId: string;       // sumber gudang stock-out (product only)
  serviceItemId: string;
  accountId: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  discount: number; // percent
  taxPct: number;   // PPN % per item
  pphPct: number;   // PPh % per item
  deliveryOrderItemId?: string | null;
  deliveryOrderNumber?: string;
  // Phase 5: optional batch picker. When set, the server locks COGS to the
  // batch's unit cost (specific identification) instead of WAC.
  sourceMovementId?: string;
}

interface PendingDOItem {
  id: string;
  deliveryOrderId: string;
  inventoryItemId: string;
  warehouseId: string;
  itemName: string;
  quantity: number;
  unit: string;
  description: string | null;
  inventoryItem?: { id: string; name: string; code: string; unit: string } | null;
  // Harga jual & diskon dari baris SO (DO digenerate dari SO).
  salesOrderItem?: { rate: number | string; discount: number | string } | null;
}

interface PendingDO {
  id: string;
  doNumber: string;
  date: string;
  items: PendingDOItem[];
  // No. PO pelanggan / No. SO utk auto-isi referensi invoice.
  salesOrder?: { soNumber: string; customerRefNo: string | null } | null;
}

const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const UNITS = ['Kg', 'Ton', 'Sak', 'Liter', 'Pcs', 'Box', 'Unit', 'Set', 'Meter', 'Jasa'];

const defaultItem = (): InvoiceItem => ({
  id: crypto.randomUUID(), itemName: '', itemType: 'product', inventoryItemId: '', warehouseId: '', serviceItemId: '', accountId: '', description: '', quantity: 1, unit: 'Kg', rate: 0, discount: 0, taxPct: 0, pphPct: 0, deliveryOrderItemId: null, deliveryOrderNumber: undefined, sourceMovementId: '',
});

const SalesInvoiceModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  prefillFromDO?: { doId: string; partyId: string } | null;
}> = ({ isOpen, onClose, prefillFromDO }) => {
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(() => new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
  const [partyId, setPartyId] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('Net 30');
  const [customerRefNo, setCustomerRefNo] = useState(''); // No. PO / Penawaran pelanggan

  const calcDueDate = (baseDate: string, term: string): string => {
    const days = term === 'Cash' ? 0 : parseInt(term.replace('Net ', ''), 10) || 30;
    const d = new Date(baseDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };
  const [potongan, setPotongan] = useState(0);     // deduction amount
  const [biayaLain, setBiayaLain] = useState(0);   // extra charge amount
  const [labelPotongan, setLabelPotongan] = useState('Potongan');
  const [labelBiaya, setLabelBiaya] = useState('Biaya Lain');
  const [items, setItems] = useState<InvoiceItem[]>([defaultItem()]);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [fromDOMode, setFromDOMode] = useState(false);
  const [selectedDOIds, setSelectedDOIds] = useState<string[]>([]);
  const [expandedDOIds, setExpandedDOIds] = useState<string[]>([]);

  const queryClient = useQueryClient();

  const { data: parties } = useQuery({
    queryKey: ['parties-customers'],
    queryFn: async () => {
      const res = await api.get('/parties?type=Customer');
      return res.data.data ?? res.data;
    }
  });

  const { data: inventoryItems } = useQuery({
    queryKey: ['inventory-items-active'],
    queryFn: async () => {
      const res = await api.get('/inventory/items');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((i: any) => i.isActive !== false);
    },
  });

  const { data: serviceItems } = useQuery({
    queryKey: ['service-items-active'],
    queryFn: async () => {
      const res = await api.get('/service-items?isActive=true');
      return res.data.data ?? res.data;
    },
  });

  const { data: pendingDOs } = useQuery<PendingDO[]>({
    queryKey: ['delivery-orders-pending', partyId],
    queryFn: async () => {
      if (!partyId) return [];
      const res = await api.get(`/delivery-orders/pending?partyId=${partyId}`);
      return res.data.data ?? res.data;
    },
    enabled: fromDOMode && !!partyId,
  });

  const selectedParty = parties?.find((p: any) => p.id === partyId);
  const isWapu = !!selectedParty?.isWapu;

  // Auto-zero tax_pct for all lines when WAPU customer is picked.
  // Pemerintah/BUMN WAPU memungut PPN sendiri ke kas negara — tagihan kita
  // tidak include PPN. (Bulog Indramayu adalah contoh.)
  React.useEffect(() => {
    if (isWapu) {
      setItems((prev) => prev.map((it) => (it.taxPct > 0 ? { ...it, taxPct: 0 } : it)));
    }
  }, [isWapu]);

  // Deep-link dari Surat Jalan (/sales?fromDO=…): set pelanggan + mode "dari DO",
  // lalu auto-pilih DO-nya saat daftar pending termuat (efek di bawah).
  const [autoSelectDOId, setAutoSelectDOId] = useState<string | null>(null);
  React.useEffect(() => {
    if (isOpen && prefillFromDO) {
      setPartyId(prefillFromDO.partyId);
      setFromDOMode(true);
      setAutoSelectDOId(prefillFromDO.doId);
    }
  }, [isOpen, prefillFromDO]);

  const inventoryOptions = useMemo<SelectOption[]>(
    () =>
      (inventoryItems ?? []).map((inv: any) => ({
        value: inv.id,
        label: `${inv.code} — ${inv.name} (${inv.currentStock} ${inv.unit})`,
      })),
    [inventoryItems],
  );

  const serviceOptions = useMemo<SelectOption[]>(
    () =>
      (serviceItems ?? []).map((svc: any) => ({
        value: svc.id,
        label: `${svc.code} — ${svc.name} (${svc.unit})`,
      })),
    [serviceItems],
  );

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/sales/invoices', data);
      const invoice = res.data;
      if (stagedFiles.length > 0 && invoice?.id) {
        const fd = new FormData();
        fd.append('referenceType', 'sales_invoice');
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
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
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
      setTerms('Net 30');
      setCustomerRefNo('');
      setPotongan(0);
      setBiayaLain(0);
      setLabelPotongan('Potongan');
      setLabelBiaya('Biaya Lain');
      setItems([defaultItem()]);
      setAllowNegativeStock(false);
      setStagedFiles([]);
      setError('');
      setFromDOMode(false);
      setSelectedDOIds([]);
      setExpandedDOIds([]);
      queryClient.invalidateQueries({ queryKey: ['delivery-orders'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-orders-pending'] });
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal menyimpan invoice.')
  });

  const addItem = () => setItems([...items, defaultItem()]);
  const updateItem = (i: number, field: keyof InvoiceItem, value: any) => {
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
  const selectServiceItem = (idx: number, serviceId: string) => {
    const svc = serviceItems?.find((s: any) => s.id === serviceId);
    const next = [...items];
    if (svc) {
      next[idx] = {
        ...next[idx],
        serviceItemId: serviceId,
        itemName: svc.name,
        unit: svc.unit || 'Jasa',
        rate: svc.defaultRate ? Number(svc.defaultRate) : next[idx].rate,
        accountId: svc.accountId || '',
      };
    } else {
      next[idx] = { ...next[idx], serviceItemId: '', itemName: '', accountId: '' };
    }
    setItems(next);
  };
  const toggleItemType = (idx: number, newType: 'product' | 'service') => {
    const next = [...items];
    next[idx] = {
      ...next[idx],
      itemType: newType,
      inventoryItemId: '',
      serviceItemId: '',
      accountId: '',
      itemName: '',
      unit: newType === 'service' ? 'Jasa' : 'Kg',
      rate: 0,
    };
    setItems(next);
  };

  const toggleDOSelection = (doId: string) => {
    const doc = pendingDOs?.find((d) => d.id === doId);
    if (!doc) return;

    if (selectedDOIds.includes(doId)) {
      // Deselect → remove all rows linked to this DO
      setSelectedDOIds(selectedDOIds.filter((id) => id !== doId));
      const itemIdsToRemove = new Set(doc.items.map((it) => it.id));
      const remaining = items.filter(
        (row) => !row.deliveryOrderItemId || !itemIdsToRemove.has(row.deliveryOrderItemId),
      );
      setItems(remaining.length > 0 ? remaining : [defaultItem()]);
    } else {
      // Select → push DO items as invoice rows
      setSelectedDOIds([...selectedDOIds, doId]);
      const newRows: InvoiceItem[] = doc.items.map((doi) => ({
        id: crypto.randomUUID(),
        itemName: doi.itemName || doi.inventoryItem?.name || '',
        itemType: 'product',
        inventoryItemId: doi.inventoryItemId,
        warehouseId: doi.warehouseId,
        serviceItemId: '',
        accountId: '',
        description: doi.description ?? '',
        quantity: Number(doi.quantity) || 0,
        unit: doi.unit,
        // Harga jual & diskon diturunkan dari SO (via salesOrderItem) agar tak
        // perlu ketik ulang; tetap bisa diedit di tabel.
        rate: Number(doi.salesOrderItem?.rate) || 0,
        discount: Number(doi.salesOrderItem?.discount) || 0,
        taxPct: 0,
        pphPct: 0,
        deliveryOrderItemId: doi.id,
        deliveryOrderNumber: doc.doNumber,
      }));
      // Drop any default empty row when adding first DO
      const base = items.filter(
        (row) => row.deliveryOrderItemId || row.itemName || row.inventoryItemId || row.serviceItemId,
      );
      setItems([...base, ...newRows]);
      // Auto-isi No. PO/SO di invoice (bila belum diisi manual): PO pelanggan
      // dari SO; kalau SO tak punya No. PO, pakai No. SO.
      if (!customerRefNo.trim()) {
        const ref = doc.salesOrder?.customerRefNo?.trim() || doc.salesOrder?.soNumber || '';
        if (ref) setCustomerRefNo(ref);
      }
    }
  };

  // Auto-pilih DO saat deep-link dari Surat Jalan, begitu daftar pending termuat.
  React.useEffect(() => {
    if (!autoSelectDOId) return;
    if (pendingDOs?.some((d) => d.id === autoSelectDOId) && !selectedDOIds.includes(autoSelectDOId)) {
      toggleDOSelection(autoSelectDOId);
      setAutoSelectDOId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSelectDOId, pendingDOs]);

  const toggleDOExpanded = (doId: string) => {
    setExpandedDOIds(
      expandedDOIds.includes(doId)
        ? expandedDOIds.filter((id) => id !== doId)
        : [...expandedDOIds, doId],
    );
  };

  const removeItemAt = (idx: number) => {
    const target = items[idx];
    if (target?.deliveryOrderItemId) {
      // If this is the last row tied to its DO, also unselect the DO.
      const targetDONumber = target.deliveryOrderNumber;
      const remainingRowsForDO = items.filter(
        (row, i) => i !== idx && row.deliveryOrderNumber === targetDONumber,
      );
      if (remainingRowsForDO.length === 0 && targetDONumber) {
        const matchingDO = pendingDOs?.find((d) => d.doNumber === targetDONumber);
        if (matchingDO) {
          setSelectedDOIds(selectedDOIds.filter((id) => id !== matchingDO.id));
        }
      }
    }
    const next = items.filter((_, i) => i !== idx);
    setItems(next.length > 0 ? next : [defaultItem()]);
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

  const lineTotal = (item: InvoiceItem) => {
    const base = item.quantity * item.rate;
    return base - (base * (item.discount / 100));
  };
  const lineTax = (item: InvoiceItem) => lineTotal(item) * (item.taxPct / 100);
  const linePph = (item: InvoiceItem) => lineTotal(item) * (item.pphPct / 100);
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const taxAmount = items.reduce((s, it) => s + lineTax(it), 0);
  const pphAmount = items.reduce((s, it) => s + linePph(it), 0);
  const grandTotal = subtotal + taxAmount - pphAmount - potongan + biayaLain;
  // Sum quantities only for rows that share a unit so the figure stays
  // meaningful (mixing Kg + Pcs would be misleading).
  const totalQtyByUnit = items.reduce<Record<string, number>>((acc, it) => {
    if (!it.itemName || !it.quantity) return acc;
    const u = it.unit || 'Pcs';
    acc[u] = (acc[u] ?? 0) + it.quantity;
    return acc;
  }, {});

  // Policy (2026-05): inventory item HARUS via Surat Jalan. Direct-sale
  // dari invoice di-tolak backend, jadi lebih baik kasih guidance + cegah
  // submit dari client supaya tidak ke-throw error pertama kali.
  const orphanInventoryLines = items.filter(
    (i) => i.itemType === 'product' && i.inventoryItemId && !i.deliveryOrderItemId,
  );
  const hasOrphanInventory = orphanInventoryLines.length > 0;

  const canSubmit = partyId && items.some(i => i.itemName) && grandTotal >= 0 && !mutation.isPending
    && !hasOrphanInventory;

  if (!isOpen) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="sales-modal-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onKeyDown={(e: React.KeyboardEvent) => e.key === "Escape" && onClose()}>
      <div className="rounded-xl w-full max-w-[calc(100vw-1rem)] lg:max-w-5xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden" style={{ backgroundColor: 'var(--color-bg-primary)' }}>

        {/* ── HEADER BAR ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 id="sales-modal-title" className="text-base font-semibold text-gray-900">Invoice Penjualan Baru</h2>
            <p className="text-xs text-gray-400 mt-0.5">Draft • belum disimpan</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* ── BODY ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Top meta section */}
          <div className="p-6 grid grid-cols-2 gap-8 border-b border-gray-100">

            {/* LEFT — Bill To */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Tagihkan Kepada</p>
              <div className="mb-2">
                <SearchableSelect
                  options={(parties ?? []).map((p: any) => ({
                    value: p.id,
                    label: p.phone ? `${p.name} · ${p.phone}` : p.name,
                  }))}
                  value={partyId}
                  onChange={(v) => {
                    setPartyId(v);
                    // Switching customer → reset any DO selections (DOs are scoped to a party).
                    if (selectedDOIds.length > 0 || items.some((i) => i.deliveryOrderItemId)) {
                      setSelectedDOIds([]);
                      setExpandedDOIds([]);
                      setItems([defaultItem()]);
                    }
                  }}
                  placeholder="— Pilih / cari pelanggan —"
                  aria-label="Pilih pelanggan"
                />
              </div>
              {selectedParty && (
                <div className="text-xs text-gray-500 space-y-0.5 mt-1 pl-1">
                  {selectedParty.email && <p>{selectedParty.email}</p>}
                  {selectedParty.phone && <p>{selectedParty.phone}</p>}
                  {selectedParty.address && <p className="text-gray-400">{selectedParty.address}</p>}
                </div>
              )}
              {isWapu && (
                <div className="mt-2 p-2 bg-amber-50/70 border border-amber-100 rounded-lg flex items-start gap-2">
                  <span className="text-amber-700 font-semibold text-xs">⚠ WAPU</span>
                  <p className="text-xs text-amber-700 leading-snug">
                    Customer ini Wajib Pungut — PPN dipungut sendiri oleh customer ke kas negara.
                    Semua baris item akan otomatis PPN 0%.
                  </p>
                </div>
              )}
            </div>

            {/* RIGHT — Invoice details */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Tanggal Invoice</label>
                <input type="date" value={invoiceDate} onChange={e => { setInvoiceDate(e.target.value); setDueDate(calcDueDate(e.target.value, terms)); }}
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Jatuh Tempo</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Termin Pembayaran</label>
                <select value={terms} onChange={e => { setTerms(e.target.value); setDueDate(calcDueDate(invoiceDate, e.target.value)); }}
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {['Cash', 'Net 7', 'Net 14', 'Net 30', 'Net 60'].map(t => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">No. Referensi PO / Penawaran (opsional)</label>
                <input
                  type="text"
                  value={customerRefNo}
                  onChange={(e) => setCustomerRefNo(e.target.value)}
                  placeholder="mis. PO-2026-001 atau QO-202604-0012"
                  maxLength={100}
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-gray-400 mt-1">Akan dicetak di invoice sebagai referensi pembeli. PPN & PPh diatur per baris item.</p>
              </div>
            </div>
          </div>

          {/* ── FROM-DO TOGGLE + PICKER ── */}
          {partyId && (
            <div className="px-6 pt-5 pb-2 border-b border-gray-100">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={fromDOMode}
                  onChange={(e) => {
                    setFromDOMode(e.target.checked);
                    setItems([defaultItem()]);
                    setSelectedDOIds([]);
                    setExpandedDOIds([]);
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <Truck size={14} className="text-blue-600" />
                <span className="font-medium">Dari Surat Jalan</span>
                <span className="text-xs text-gray-400">(Surat Jalan sudah dikirim sebelumnya)</span>
              </label>

              {fromDOMode && (
                <div className="mt-3 space-y-2">
                  {(pendingDOs?.length ?? 0) === 0 ? (
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 italic">
                      Tidak ada surat jalan terbuka untuk pelanggan ini.
                    </div>
                  ) : (
                    pendingDOs!.map((doc) => {
                      const isSelected = selectedDOIds.includes(doc.id);
                      const isExpanded = expandedDOIds.includes(doc.id);
                      return (
                        <div
                          key={doc.id}
                          className={`border rounded-lg transition-colors ${
                            isSelected ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-3 px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleDOSelection(doc.id)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <Truck size={14} className="text-blue-600 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-mono font-medium text-gray-900">{doc.doNumber}</span>
                                <span className="text-xs text-gray-400">
                                  {new Date(doc.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </span>
                                <span className="text-xs text-gray-500">• {doc.items.length} item</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleDOExpanded(doc.id)}
                              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-0.5 shrink-0"
                            >
                              <ChevronRight
                                size={12}
                                className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              />
                              {isExpanded ? 'Tutup' : 'Lihat detail'}
                            </button>
                          </div>
                          {isExpanded && (
                            <div className="border-t border-gray-100 px-3 py-2 bg-gray-50/50">
                              <ul className="space-y-1 text-xs text-gray-600">
                                {doc.items.map((it) => (
                                  <li key={it.id} className="flex items-baseline gap-2">
                                    <span className="text-gray-400">•</span>
                                    <span className="flex-1">
                                      {it.itemName}
                                      {it.inventoryItem?.code && (
                                        <span className="text-gray-400"> · {it.inventoryItem.code}</span>
                                      )}
                                    </span>
                                    <span className="font-mono tabular-nums text-gray-700">
                                      {Number(it.quantity).toLocaleString('id-ID', { maximumFractionDigits: 3 })} {it.unit}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── ITEMS TABLE ── */}
          <div className="px-6 pt-5 pb-4">
            {fromDOMode && items.some((i) => i.deliveryOrderItemId) && (
              <div className="mb-3 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-start gap-2">
                <Truck size={13} className="mt-0.5 shrink-0" />
                <span>
                  Item ditarik dari Surat Jalan terpilih. Stok tidak akan dikurangi lagi saat invoice dikirim — COGS pakai biaya per unit yang dikunci di Surat Jalan.
                </span>
              </div>
            )}
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Daftar Barang / Jasa</p>
              <button onClick={addItem} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
                <Plus size={13} /> Tambah Baris
              </button>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 960 }}>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-4 py-3 w-8">#</th>
                    <th className="text-left px-4 py-3 min-w-[220px] max-w-[280px]">Nama Barang / Jasa</th>
                    <th className="text-center px-3 py-3 w-28 min-w-[112px]">Qty</th>
                    <th className="text-left px-3 py-3 w-24">Satuan</th>
                    <th className="text-right px-3 py-3 w-36 min-w-[130px]">Harga Satuan</th>
                    <th className="text-right px-3 py-3 w-20">Diskon %</th>
                    <th className="text-right px-3 py-3 w-20">PPN %</th>
                    <th className="text-right px-3 py-3 w-20">PPh %</th>
                    <th className="text-right px-4 py-3 w-36 min-w-[130px]">Jumlah</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.id} className={`group border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors ${item.deliveryOrderItemId ? 'bg-blue-50/30' : ''}`}>
                      <td className="px-4 py-3 text-center text-xs text-gray-300 font-medium">{idx + 1}</td>
                      <td className="px-4 py-3">
                        {item.deliveryOrderItemId ? (
                          <>
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono font-medium rounded-md bg-blue-100 text-blue-700">
                                <Truck size={11} /> {item.deliveryOrderNumber || 'DO'}
                              </span>
                            </div>
                            <div className="text-sm font-medium text-gray-800">{item.itemName}</div>
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => updateItem(idx, 'description', e.target.value)}
                              placeholder="Keterangan baris (opsional)..."
                              className="w-full mt-1 bg-transparent text-xs text-gray-500 border-none focus:ring-0 focus:outline-none p-0 placeholder:text-gray-400"
                            />
                          </>
                        ) : (
                        <>
                        {/* Item type toggle */}
                        <div className="flex items-center gap-1 mb-1.5">
                          <button
                            type="button"
                            onClick={() => item.itemType !== 'product' && toggleItemType(idx, 'product')}
                            className={`px-2 py-0.5 text-xs font-medium rounded-md transition-colors ${
                              item.itemType === 'product'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-gray-100 text-gray-400 hover:text-gray-600'
                            }`}
                          >
                            Barang
                          </button>
                          <button
                            type="button"
                            onClick={() => item.itemType !== 'service' && toggleItemType(idx, 'service')}
                            className={`px-2 py-0.5 text-xs font-medium rounded-md transition-colors ${
                              item.itemType === 'service'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-gray-100 text-gray-400 hover:text-gray-600'
                            }`}
                          >
                            Jasa
                          </button>
                        </div>

                        {item.itemType === 'product' ? (
                          <>
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
                                onChange={e => updateItem(idx, 'itemName', e.target.value)}
                                placeholder="Atau ketik nama barang manual..."
                                className="w-full bg-transparent text-xs text-gray-500 border-none focus:ring-0 focus:outline-none p-0 placeholder:text-gray-400 mb-1"
                              />
                            )}
                            <div className="mt-1">
                              <WarehousePicker
                                value={item.warehouseId}
                                onChange={(v) => updateItem(idx, 'warehouseId', v)}
                                size="sm"
                                placeholder="Pilih gudang sumber..."
                              />
                            </div>
                            {/* Phase 5: batch picker (optional, hybrid FIFO/specific-id) */}
                            {item.inventoryItemId && item.warehouseId && !item.deliveryOrderItemId && (
                              <div className="mt-1">
                                <label className="text-[10px] text-gray-400 block mb-0.5">
                                  Batch (opsional — default WAC)
                                </label>
                                <BatchPicker
                                  itemId={item.inventoryItemId}
                                  warehouseId={item.warehouseId}
                                  value={item.sourceMovementId ?? ''}
                                  onChange={(id) => updateItem(idx, 'sourceMovementId', id as any)}
                                />
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <SearchableSelect
                              options={serviceOptions}
                              value={item.serviceItemId}
                              onChange={(v) => selectServiceItem(idx, v)}
                              placeholder="— Pilih Layanan —"
                              className="mb-1"
                            />
                            {!item.serviceItemId && (
                              <input
                                type="text"
                                value={item.itemName}
                                onChange={e => updateItem(idx, 'itemName', e.target.value)}
                                placeholder="Atau ketik nama jasa manual..."
                                className="w-full bg-transparent text-xs text-gray-500 border-none focus:ring-0 focus:outline-none p-0 placeholder:text-gray-400"
                              />
                            )}
                          </>
                        )}
                        </>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                          min={1}
                          readOnly={!!item.deliveryOrderItemId}
                          className={`w-full bg-transparent text-sm text-center font-mono border-none focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                            item.deliveryOrderItemId ? 'text-gray-500 cursor-not-allowed' : 'text-gray-800'
                          }`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        {item.deliveryOrderItemId ? (
                          <span className="text-sm text-gray-500">{item.unit}</span>
                        ) : (
                          <div className="relative">
                            <select
                              value={item.unit}
                              onChange={e => updateItem(idx, 'unit', e.target.value)}
                              className="w-full bg-transparent text-sm text-gray-600 border-none focus:ring-0 focus:outline-none p-0 appearance-none cursor-pointer pr-4"
                            >
                              {UNITS.map(u => <option key={u}>{u}</option>)}
                            </select>
                            <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <input
                          type="number"
                          value={item.rate || ''}
                          onChange={e => updateItem(idx, 'rate', Number(e.target.value))}
                          placeholder="0"
                          className="w-full bg-transparent text-sm text-gray-800 text-right font-mono border-none focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <input
                          type="number"
                          value={item.discount || ''}
                          onChange={e => updateItem(idx, 'discount', Math.min(100, Number(e.target.value)))}
                          placeholder="0"
                          min={0} max={100}
                          className="w-full bg-transparent text-sm text-gray-600 text-right font-mono border-none focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <input
                          type="number"
                          value={item.taxPct || ''}
                          onChange={e => updateItem(idx, 'taxPct', Math.max(0, Math.min(100, Number(e.target.value))))}
                          placeholder="0"
                          min={0} max={100}
                          className="w-full bg-transparent text-sm text-blue-600 text-right font-mono border-none focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <input
                          type="number"
                          value={item.pphPct || ''}
                          onChange={e => updateItem(idx, 'pphPct', Math.max(0, Math.min(100, Number(e.target.value))))}
                          placeholder="0"
                          min={0} max={100}
                          className="w-full bg-transparent text-sm text-orange-600 text-right font-mono border-none focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono text-sm font-medium text-gray-900 tabular-nums">
                          {formatRupiah(lineTotal(item))}
                        </span>
                      </td>
                      <td className="pr-3 py-3 text-center">
                        {items.length > 1 && (
                          <button onClick={() => removeItemAt(idx)}
                            className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
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

          {/* ── SUMMARY + NOTES ── */}
          <div className="px-6 pb-6 grid grid-cols-2 gap-8 items-start">

            {/* Notes / Terms */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Catatan untuk Pelanggan</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Misal: Terima kasih atas kepercayaan Anda. Pembayaran via transfer ke rekening BCA..."
                rows={4}
                className="w-full border border-gray-200 rounded-lg py-2.5 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-400"
              />
            </div>

            {/* Totals */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div className="space-y-2.5">
                {/* Total Qty (per unit) */}
                {Object.keys(totalQtyByUnit).length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total Qty</span>
                    <span className="font-mono text-gray-800 tabular-nums">
                      {Object.entries(totalQtyByUnit)
                        .map(([u, q]) => `${q.toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${u}`)
                        .join(' · ')}
                    </span>
                  </div>
                )}

                {/* Subtotal */}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-mono text-gray-800 tabular-nums">{formatRupiah(subtotal)}</span>
                </div>

                {/* PPN (total per-item) */}
                {taxAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">PPN (per item)</span>
                    <span className="font-mono text-gray-800 tabular-nums">+ {formatRupiah(taxAmount)}</span>
                  </div>
                )}

                {/* PPh (total per-item) */}
                {pphAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">PPh (per item)</span>
                    <span className="font-mono text-orange-600 tabular-nums">− {formatRupiah(pphAmount)}</span>
                  </div>
                )}

                {/* Potongan */}
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="text"
                    value={labelPotongan}
                    onChange={e => setLabelPotongan(e.target.value)}
                    className="flex-1 bg-transparent border-none text-gray-500 text-sm focus:ring-0 focus:outline-none p-0 min-w-0"
                    placeholder="Label potongan..."
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-gray-400 text-xs">−</span>
                    <input
                      type="number"
                      value={potongan || ''}
                      onChange={e => setPotongan(Math.max(0, Number(e.target.value)))}
                      placeholder="0"
                      className="w-28 text-right font-mono text-red-500 bg-transparent border-none focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none tabular-nums"
                    />
                  </div>
                </div>

                {/* Biaya Lain */}
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="text"
                    value={labelBiaya}
                    onChange={e => setLabelBiaya(e.target.value)}
                    className="flex-1 bg-transparent border-none text-gray-500 text-sm focus:ring-0 focus:outline-none p-0 min-w-0"
                    placeholder="Label biaya lain..."
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-gray-400 text-xs">+</span>
                    <input
                      type="number"
                      value={biayaLain || ''}
                      onChange={e => setBiayaLain(Math.max(0, Number(e.target.value)))}
                      placeholder="0"
                      className="w-28 text-right font-mono text-gray-700 bg-transparent border-none focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none tabular-nums"
                    />
                  </div>
                </div>

                {/* Grand Total */}
                <div className="border-t border-gray-200 pt-2.5 flex justify-between items-baseline">
                  <span className="text-sm font-semibold text-gray-700">Total</span>
                  <span className="text-2xl font-bold text-blue-600 font-mono tabular-nums">{formatRupiah(grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Policy 2026-05: barang keluar HANYA via Surat Jalan */}
          {hasOrphanInventory && (
            <div className="mx-6 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              <div className="flex items-start gap-2 mb-1.5">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Item inventori harus via Surat Jalan</p>
                  <p className="text-xs text-red-700 mt-0.5">
                    Sejak 20 Mei 2026, stok keluar wajib lewat Surat Jalan (DO). Invoice = tagihan saja.
                    Berikut item yg masih direct-sale di invoice ini:
                  </p>
                  <ul className="mt-1.5 ml-1 list-disc list-inside text-xs space-y-0.5">
                    {orphanInventoryLines.map((l) => (
                      <li key={l.id}>
                        <span className="font-medium">{l.itemName}</span>
                        <span className="text-red-600"> — belum link ke Surat Jalan</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs mt-2">
                    <strong>Solusi:</strong> buat <span className="font-semibold">Surat Jalan</span> dulu di menu Penjualan → Surat Jalan,
                    lalu kembali ke sini dan pilih dari daftar <span className="font-semibold">Pending Surat Jalan</span> di atas.
                    Atau hapus baris item inventory di sini dan ganti dengan service / akun bebas.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ATTACHMENTS */}
          <div className="px-6 pb-4">
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
              ? `Total: ${formatRupiah(grandTotal)}`
              : hasOrphanInventory
                ? 'Item inventori harus via Surat Jalan — lihat peringatan di atas.'
                : 'Lengkapi pelanggan dan minimal 1 item untuk melanjutkan'}
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary">Batal</button>
            <button
              onClick={() => mutation.mutate({
                date: invoiceDate, dueDate, partyId, notes, terms,
                customerRefNo: customerRefNo || null,
                potongan, biayaLain, labelPotongan, labelBiaya,
                allowNegativeStock,
                items: items.map(i => ({
                  ...i,
                  itemType: i.itemType,
                  inventoryItemId: i.inventoryItemId || null,
                  warehouseId: i.itemType === 'product' ? (i.warehouseId || null) : null,
                  serviceItemId: i.serviceItemId || null,
                  accountId: i.accountId || null,
                  taxPct: i.taxPct,
                  pphPct: i.pphPct,
                  deliveryOrderItemId: i.deliveryOrderItemId ?? null,
                  sourceMovementId: i.sourceMovementId || null,
                })),
              })}
              disabled={!canSubmit}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : 'Simpan Invoice'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SalesInvoiceModal;
