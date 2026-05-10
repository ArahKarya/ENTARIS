import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Plus, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { formatRupiah } from '../lib/formatters';
import SearchableSelect, { type SelectOption } from './SearchableSelect';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { toast } from 'sonner';

interface QuotationItem {
  id: string;
  itemName: string;
  itemType: 'product' | 'service';
  inventoryItemId: string;
  serviceItemId: string;
  accountId: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  discount: number;
  taxPct: number;
  pphPct: number;
}

const UNITS = ['Kg', 'Ton', 'Sak', 'Liter', 'Pcs', 'Box', 'Unit', 'Set', 'Meter', 'Jasa'];

const defaultItem = (): QuotationItem => ({
  id: crypto.randomUUID(), itemName: '', itemType: 'product', inventoryItemId: '', serviceItemId: '',
  accountId: '', description: '', quantity: 1, unit: 'Kg', rate: 0, discount: 0, taxPct: 0, pphPct: 0,
});

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editTarget?: any | null;
  // Called after a NEW quotation is created (not on edit). Receives the
  // server response so the caller can run side-effects like linking an
  // inquiry → quotation. Awaited before the modal closes.
  onCreated?: (quotation: any) => void | Promise<void>;
}

const QuotationModal: React.FC<Props> = ({ isOpen, onClose, editTarget, onCreated }) => {
  const isEdit = Boolean(editTarget?.id);
  const today = new Date().toISOString().split('T')[0];
  const defaultValidUntil = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [validUntil, setValidUntil] = useState(defaultValidUntil);
  const [partyId, setPartyId] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('Penawaran berlaku 30 hari. Harga sewaktu-waktu dapat berubah setelah masa berlaku.');
  const [potongan, setPotongan] = useState(0);
  const [biayaLain, setBiayaLain] = useState(0);
  const [labelPotongan, setLabelPotongan] = useState('Potongan');
  const [labelBiaya, setLabelBiaya] = useState('Biaya Lain');
  const [items, setItems] = useState<QuotationItem[]>([defaultItem()]);
  const [error, setError] = useState('');

  useBodyScrollLock(isOpen);

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

  const { data: serviceItems } = useQuery({
    queryKey: ['service-items-active'],
    queryFn: async () => {
      const res = await api.get('/service-items?isActive=true');
      return res.data.data ?? res.data;
    },
  });

  // Default revenue accounts: 4.1 Penjualan (product), 4.2 Pendapatan Jasa (service)
  const { data: accounts } = useQuery({
    queryKey: ['coa-flat'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      return res.data.data ?? res.data;
    },
  });
  const defaultProductAccountId = useMemo(() => accounts?.find((a: any) => a.accountNumber === '4.1')?.id ?? '', [accounts]);
  const defaultServiceAccountId = useMemo(() => accounts?.find((a: any) => a.accountNumber === '4.2')?.id ?? '', [accounts]);

  // Hydrate form when editTarget changes
  useEffect(() => {
    if (!isOpen) return;
    if (editTarget?.id) {
      setDate(editTarget.date ? new Date(editTarget.date).toISOString().split('T')[0] : today);
      setValidUntil(editTarget.validUntil ? new Date(editTarget.validUntil).toISOString().split('T')[0] : defaultValidUntil);
      setPartyId(editTarget.partyId);
      setNotes(editTarget.notes ?? '');
      setTerms(editTarget.terms ?? '');
      setPotongan(Number(editTarget.potongan ?? 0));
      setBiayaLain(Number(editTarget.biayaLain ?? 0));
      setLabelPotongan(editTarget.labelPotongan ?? 'Potongan');
      setLabelBiaya(editTarget.labelBiaya ?? 'Biaya Lain');
      setItems(
        (editTarget.items ?? []).map((it: any) => ({
          id: crypto.randomUUID(),
          itemName: it.itemName ?? '',
          itemType: it.itemType ?? (it.serviceItemId ? 'service' : 'product'),
          inventoryItemId: it.inventoryItemId ?? '',
          serviceItemId: it.serviceItemId ?? '',
          accountId: it.accountId ?? '',
          description: it.description ?? '',
          quantity: Number(it.quantity ?? 0),
          unit: it.unit ?? 'Kg',
          rate: Number(it.rate ?? 0),
          discount: Number(it.discount ?? 0),
          taxPct: Number(it.taxPct ?? 0),
          pphPct: Number(it.pphPct ?? 0),
        })),
      );
    } else {
      setDate(today);
      setValidUntil(defaultValidUntil);
      setPartyId('');
      setNotes('');
      setPotongan(0);
      setBiayaLain(0);
      setLabelPotongan('Potongan');
      setLabelBiaya('Biaya Lain');
      setItems([defaultItem()]);
    }
    setError('');
  }, [isOpen, editTarget?.id]);

  const inventoryOptions = useMemo<SelectOption[]>(
    () =>
      (inventoryItems ?? []).map((inv: any) => ({
        value: inv.id,
        label: `${inv.code} — ${inv.name}`,
      })),
    [inventoryItems],
  );

  const serviceOptions = useMemo<SelectOption[]>(
    () =>
      (serviceItems ?? []).map((svc: any) => ({
        value: svc.id,
        label: `${svc.code} — ${svc.name}`,
      })),
    [serviceItems],
  );

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const url = isEdit ? `/quotations/${editTarget.id}` : '/quotations';
      const method = isEdit ? 'put' : 'post';
      const res = await api[method](url, data);
      return res.data;
    },
    onSuccess: async (data) => {
      toast.success(isEdit ? 'Penawaran berhasil diperbarui.' : 'Penawaran berhasil dibuat.');
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      if (!isEdit && onCreated) {
        try { await onCreated(data); } catch { /* caller handles its own toast */ }
      }
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error ?? 'Gagal menyimpan penawaran.'),
  });

  const updateItem = (i: number, field: keyof QuotationItem, value: any) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: value };
    setItems(next);
  };
  const addItem = () => setItems([...items, defaultItem()]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  const selectInventoryItem = (idx: number, id: string) => {
    const inv = inventoryItems?.find((i: any) => i.id === id);
    const next = [...items];
    if (inv) {
      next[idx] = {
        ...next[idx],
        inventoryItemId: id,
        itemName: inv.name,
        unit: inv.unit || 'Kg',
        accountId: next[idx].accountId || defaultProductAccountId,
      };
    } else {
      next[idx] = { ...next[idx], inventoryItemId: '', itemName: '' };
    }
    setItems(next);
  };

  const selectServiceItem = (idx: number, id: string) => {
    const svc = serviceItems?.find((s: any) => s.id === id);
    const next = [...items];
    if (svc) {
      next[idx] = {
        ...next[idx],
        serviceItemId: id,
        itemName: svc.name,
        unit: svc.unit || 'Jasa',
        rate: svc.defaultRate ? Number(svc.defaultRate) : next[idx].rate,
        accountId: svc.accountId || defaultServiceAccountId,
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
      accountId: newType === 'service' ? defaultServiceAccountId : defaultProductAccountId,
      itemName: '',
      unit: newType === 'service' ? 'Jasa' : 'Kg',
      rate: 0,
    };
    setItems(next);
  };

  const lineTotal = (it: QuotationItem) => {
    const base = it.quantity * it.rate;
    return base - (base * it.discount) / 100;
  };
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const taxAmount = items.reduce((s, it) => s + lineTotal(it) * (it.taxPct / 100), 0);
  const pphAmount = items.reduce((s, it) => s + lineTotal(it) * (it.pphPct / 100), 0);
  const grandTotal = subtotal + taxAmount - pphAmount - potongan + biayaLain;

  const canSubmit = partyId && items.some((i) => i.itemName) && grandTotal >= 0 && !mutation.isPending;

  const handleSubmit = () => {
    setError('');
    const validItems = items.filter((it) => it.itemName);
    if (validItems.length === 0) { setError('Tambahkan minimal satu item.'); return; }
    if (!partyId) { setError('Pilih pelanggan.'); return; }
    if (new Date(validUntil) < new Date(date)) { setError('Tanggal berlaku-sampai harus setelah tanggal penawaran.'); return; }
    for (const it of validItems) {
      if (!it.accountId) { setError(`Item "${it.itemName}" belum punya akun pendapatan.`); return; }
    }
    mutation.mutate({
      date,
      validUntil,
      partyId,
      notes: notes || null,
      terms: terms || null,
      potongan,
      biayaLain,
      labelPotongan: labelPotongan || null,
      labelBiaya: labelBiaya || null,
      items: validItems.map((it) => ({
        itemType: it.itemType,
        inventoryItemId: it.itemType === 'product' ? it.inventoryItemId || null : null,
        serviceItemId: it.itemType === 'service' ? it.serviceItemId || null : null,
        accountId: it.accountId,
        itemName: it.itemName,
        quantity: it.quantity,
        unit: it.unit,
        rate: it.rate,
        discount: it.discount,
        taxPct: it.taxPct,
        pphPct: it.pphPct,
        description: it.description || null,
      })),
    });
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quotation-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Escape' && onClose()}
    >
      <div
        className="rounded-xl w-full max-w-[calc(100vw-1rem)] lg:max-w-5xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-primary)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 id="quotation-modal-title" className="font-semibold text-foreground">
            {isEdit ? `Edit Penawaran ${editTarget?.quotationNumber ?? ''}` : 'Buat Penawaran Baru'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded" aria-label="Tutup"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Header info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tanggal</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Berlaku Sampai</label>
              <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Pelanggan</label>
              <SearchableSelect
                options={(parties ?? []).map((p: any) => ({ value: p.id, label: p.name }))}
                value={partyId}
                onChange={(v) => setPartyId(v)}
                placeholder="Pilih pelanggan..."
              />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-foreground">Item Penawaran</h4>
              <button type="button" onClick={addItem} className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
                <Plus size={12} /> Tambah baris
              </button>
            </div>
            <div className="space-y-3">
              {items.map((it, idx) => (
                <div key={it.id} className="rounded-lg border border-border p-3 bg-card/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
                      <button type="button"
                        onClick={() => toggleItemType(idx, 'product')}
                        className={`px-3 py-1 ${it.itemType === 'product' ? 'bg-blue-600 text-white' : 'bg-card text-muted-foreground hover:bg-accent'}`}>
                        Produk
                      </button>
                      <button type="button"
                        onClick={() => toggleItemType(idx, 'service')}
                        className={`px-3 py-1 ${it.itemType === 'service' ? 'bg-blue-600 text-white' : 'bg-card text-muted-foreground hover:bg-accent'}`}>
                        Jasa
                      </button>
                    </div>
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(idx)} className="p-1 text-red-500 hover:bg-red-50 rounded" aria-label="Hapus baris">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-12 md:col-span-5">
                      <label className="text-[11px] text-muted-foreground">Item</label>
                      {it.itemType === 'product' ? (
                        <SearchableSelect
                          options={inventoryOptions}
                          value={it.inventoryItemId}
                          onChange={(v) => selectInventoryItem(idx, v)}
                          placeholder="Pilih item / ketik nama bebas..."
                        />
                      ) : (
                        <SearchableSelect
                          options={serviceOptions}
                          value={it.serviceItemId}
                          onChange={(v) => selectServiceItem(idx, v)}
                          placeholder="Pilih jasa / ketik nama bebas..."
                        />
                      )}
                      {!it.inventoryItemId && !it.serviceItemId && (
                        <input
                          type="text"
                          placeholder="Atau ketik nama item bebas"
                          value={it.itemName}
                          onChange={(e) => updateItem(idx, 'itemName', e.target.value)}
                          className="w-full mt-1.5 px-2 py-1.5 text-xs border border-border rounded bg-card focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      )}
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className="text-[11px] text-muted-foreground">Qty</label>
                      <input type="number" min={0} value={it.quantity || ''}
                        onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value) || 0)}
                        className="w-full mt-1 px-2 py-1.5 text-xs border border-border rounded bg-card focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className="text-[11px] text-muted-foreground">Unit</label>
                      <select value={it.unit} onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                        className="w-full mt-1 px-2 py-1.5 text-xs border border-border rounded bg-card focus:outline-none focus:ring-1 focus:ring-blue-500">
                        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="col-span-4 md:col-span-3">
                      <label className="text-[11px] text-muted-foreground">Harga Satuan</label>
                      <input type="number" min={0} value={it.rate || ''}
                        onChange={(e) => updateItem(idx, 'rate', Number(e.target.value) || 0)}
                        className="w-full mt-1 px-2 py-1.5 text-xs border border-border rounded bg-card focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-4 md:col-span-2">
                      <label className="text-[11px] text-muted-foreground">Diskon %</label>
                      <input type="number" min={0} max={100} value={it.discount || ''}
                        onChange={(e) => updateItem(idx, 'discount', Math.min(100, Number(e.target.value) || 0))}
                        className="w-full mt-1 px-2 py-1.5 text-xs border border-border rounded bg-card focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className="text-[11px] text-muted-foreground">PPN %</label>
                      <input type="number" min={0} max={100} value={it.taxPct || ''}
                        onChange={(e) => updateItem(idx, 'taxPct', Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                        className="w-full mt-1 px-2 py-1.5 text-xs border border-border rounded bg-card focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className="text-[11px] text-muted-foreground">PPh %</label>
                      <input type="number" min={0} max={100} value={it.pphPct || ''}
                        onChange={(e) => updateItem(idx, 'pphPct', Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                        className="w-full mt-1 px-2 py-1.5 text-xs border border-border rounded bg-card focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="col-span-12 md:col-span-6 text-right flex items-end justify-end">
                      <span className="text-sm font-mono font-semibold text-foreground">{formatRupiah(lineTotal(it))}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Catatan</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Catatan tambahan untuk pelanggan..." />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Syarat &amp; Ketentuan</label>
                <textarea value={terms} onChange={(e) => setTerms(e.target.value)}
                  rows={3}
                  className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="bg-muted/40 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono tabular-nums">{formatRupiah(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">PPN</span>
                <span className="font-mono tabular-nums">{formatRupiah(taxAmount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">PPh</span>
                <span className="font-mono tabular-nums">−{formatRupiah(pphAmount)}</span></div>
              <div className="flex items-center gap-2">
                <input type="text" value={labelPotongan} onChange={(e) => setLabelPotongan(e.target.value)}
                  className="flex-1 px-2 py-1 text-xs border border-border rounded bg-card" />
                <input type="number" min={0} value={potongan || ''} onChange={(e) => setPotongan(Number(e.target.value) || 0)}
                  className="w-32 px-2 py-1 text-xs border border-border rounded bg-card text-right font-mono" />
              </div>
              <div className="flex items-center gap-2">
                <input type="text" value={labelBiaya} onChange={(e) => setLabelBiaya(e.target.value)}
                  className="flex-1 px-2 py-1 text-xs border border-border rounded bg-card" />
                <input type="number" value={biayaLain || ''} onChange={(e) => setBiayaLain(Number(e.target.value) || 0)}
                  className="w-32 px-2 py-1 text-xs border border-border rounded bg-card text-right font-mono" />
              </div>
              <div className="border-t border-border pt-2 flex justify-between font-bold">
                <span>Grand Total</span>
                <span className="text-lg text-blue-600 font-mono tabular-nums">{formatRupiah(grandTotal)}</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">
            {canSubmit ? `Total: ${formatRupiah(grandTotal)}` : 'Lengkapi pelanggan dan minimal 1 item.'}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              {isEdit ? 'Simpan Perubahan' : 'Simpan Draft'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuotationModal;
