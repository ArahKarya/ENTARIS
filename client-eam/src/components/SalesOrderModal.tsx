import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Plus, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { formatRupiah } from '../lib/formatters';
import SearchableSelect from './SearchableSelect';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { toast } from 'sonner';
import Select from './Select';

interface SOItem {
  id: string;
  inventoryItemId: string;
  itemName: string;
  quantity: number;
  unit: string;
  rate: number;
  discount: number;
  description: string;
}

const UNITS = ['Kg', 'Ton', 'Sak', 'Liter', 'Pcs', 'Box', 'Unit', 'Set', 'Meter', 'Jasa'];

const defaultItem = (): SOItem => ({
  id: crypto.randomUUID(),
  inventoryItemId: '',
  itemName: '',
  quantity: 1,
  unit: 'Kg',
  rate: 0,
  discount: 0,
  description: '',
});

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editTarget?: any | null;
}

const SalesOrderModal: React.FC<Props> = ({ isOpen, onClose, editTarget }) => {
  const isEdit = Boolean(editTarget?.id);
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [partyId, setPartyId] = useState('');
  const [customerRefNo, setCustomerRefNo] = useState('');
  const [notes, setNotes] = useState('');
  const [potongan, setPotongan] = useState(0);
  const [biayaLain, setBiayaLain] = useState(0);
  const [taxPct, setTaxPct] = useState(0);
  const [items, setItems] = useState<SOItem[]>([defaultItem()]);
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

  useEffect(() => {
    if (!isOpen) return;
    if (editTarget) {
      setDate(editTarget.date ? new Date(editTarget.date).toISOString().split('T')[0] : today);
      setExpectedDelivery(editTarget.expectedDelivery ? new Date(editTarget.expectedDelivery).toISOString().split('T')[0] : '');
      setPartyId(editTarget.partyId || '');
      setCustomerRefNo(editTarget.customerRefNo || '');
      setNotes(editTarget.notes || '');
      setPotongan(Number(editTarget.potongan) || 0);
      setBiayaLain(Number(editTarget.biayaLain) || 0);
      setTaxPct(Number(editTarget.taxPct) || 0);
      if (editTarget.items?.length) {
        setItems(editTarget.items.map((it: any) => ({
          id: crypto.randomUUID(),
          inventoryItemId: it.inventoryItemId || '',
          itemName: it.itemName || '',
          quantity: Number(it.quantity) || 1,
          unit: it.unit || 'Kg',
          rate: Number(it.rate) || 0,
          discount: Number(it.discount) || 0,
          description: it.description || '',
        })));
      } else {
        setItems([defaultItem()]);
      }
    } else {
      setDate(today);
      setExpectedDelivery('');
      setPartyId('');
      setCustomerRefNo('');
      setNotes('');
      setPotongan(0);
      setBiayaLain(0);
      setTaxPct(0);
      setItems([defaultItem()]);
    }
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editTarget?.id]);

  const partyOptions = useMemo(
    () => (parties || []).map((p: any) => ({ value: p.id, label: p.name, subtitle: p.code })),
    [parties],
  );

  const itemOptions = useMemo(
    () => (inventoryItems || []).map((i: any) => ({ value: i.id, label: i.name, subtitle: i.code })),
    [inventoryItems],
  );

  const computeAmount = (qty: number, rate: number, disc: number) => {
    const gross = qty * rate;
    return Math.round(gross * (1 - disc / 100) * 100) / 100;
  };

  const totals = useMemo(() => {
    const subtotal = items.reduce((s, it) => s + computeAmount(it.quantity, it.rate, it.discount), 0);
    const afterDisc = Math.max(0, subtotal - potongan);
    const tax = afterDisc * (taxPct / 100);
    const grandTotal = afterDisc + tax + biayaLain;
    return { subtotal, tax, grandTotal };
  }, [items, potongan, biayaLain, taxPct]);

  const updateItem = (id: string, patch: Partial<SOItem>) => {
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const onPickInventory = (rowId: string, invId: string) => {
    const inv = inventoryItems?.find((i: any) => i.id === invId);
    if (!inv) return;
    updateItem(rowId, {
      inventoryItemId: invId,
      itemName: inv.name,
      unit: inv.unit || 'Kg',
    });
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        date,
        expectedDelivery: expectedDelivery || null,
        partyId,
        customerRefNo: customerRefNo || null,
        notes: notes || null,
        potongan,
        biayaLain,
        taxPct,
        items: items.map((it) => ({
          inventoryItemId: it.inventoryItemId || null,
          itemName: it.itemName,
          quantity: it.quantity,
          unit: it.unit,
          rate: it.rate,
          discount: it.discount,
          amount: computeAmount(it.quantity, it.rate, it.discount),
          description: it.description || null,
        })),
      };
      if (isEdit) {
        const res = await api.put(`/sales-orders/${editTarget.id}`, payload);
        return res.data;
      }
      const res = await api.post('/sales-orders', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      toast.success(isEdit ? 'Sales Order ter-update' : 'Sales Order dibuat (Draft)');
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Gagal menyimpan.';
      setError(msg);
    },
  });

  const handleSubmit = () => {
    setError('');
    if (!partyId) { setError('Pelanggan wajib dipilih.'); return; }
    if (items.length === 0) { setError('Minimal satu item.'); return; }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.itemName) { setError(`Baris ${i + 1}: nama item wajib diisi.`); return; }
      if (it.quantity <= 0) { setError(`Baris ${i + 1}: qty harus > 0.`); return; }
    }
    mutation.mutate();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-5xl my-8 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">{isEdit ? 'Edit Sales Order' : 'Buat Sales Order'}</h2>
            <p className="text-xs text-muted-foreground">Komitmen jual ke pelanggan (Draft → Submitted)</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent" aria-label="Tutup">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tanggal</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input w-full mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Target Pengiriman</label>
              <input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} className="input w-full mt-1" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Pelanggan *</label>
              <SearchableSelect
                value={partyId}
                onChange={setPartyId}
                options={partyOptions}
                placeholder="Pilih pelanggan..."
                className="mt-1"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">No. Referensi PO Pelanggan</label>
              <input type="text" value={customerRefNo} onChange={(e) => setCustomerRefNo(e.target.value)} className="input w-full mt-1" placeholder="Opsional" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Catatan</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="input w-full mt-1" placeholder="Opsional" />
            </div>
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-xs">Item</th>
                    <th className="text-right px-3 py-2 font-medium text-xs w-24">Qty</th>
                    <th className="text-left px-3 py-2 font-medium text-xs w-20">Unit</th>
                    <th className="text-right px-3 py-2 font-medium text-xs w-32">Harga/Unit</th>
                    <th className="text-right px-3 py-2 font-medium text-xs w-20">Disc %</th>
                    <th className="text-right px-3 py-2 font-medium text-xs w-32">Subtotal</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <SearchableSelect
                          value={it.inventoryItemId}
                          onChange={(v) => onPickInventory(it.id, v)}
                          options={itemOptions}
                          placeholder="Pilih item..."
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={it.quantity}
                          onChange={(e) => updateItem(it.id, { quantity: Number(e.target.value) })}
                          className="input w-full text-right"
                          min={0}
                          step="0.001"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Select value={it.unit} onChange={(e) => updateItem(it.id, { unit: e.target.value })} className="w-full">
                          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={it.rate}
                          onChange={(e) => updateItem(it.id, { rate: Number(e.target.value) })}
                          className="input w-full text-right"
                          min={0}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={it.discount}
                          onChange={(e) => updateItem(it.id, { discount: Number(e.target.value) })}
                          className="input w-full text-right"
                          min={0}
                          max={100}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatRupiah(computeAmount(it.quantity, it.rate, it.discount))}
                      </td>
                      <td className="px-1 text-center">
                        {items.length > 1 && (
                          <button onClick={() => setItems((arr) => arr.filter((x) => x.id !== it.id))} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Hapus baris">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border bg-muted/30 px-3 py-2">
              <button onClick={() => setItems((arr) => [...arr, defaultItem()])} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                <Plus size={12} /> Tambah baris
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground w-24">Potongan</label>
                <input type="number" value={potongan} onChange={(e) => setPotongan(Number(e.target.value))} className="input flex-1 text-right" min={0} />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground w-24">PPN %</label>
                <input type="number" value={taxPct} onChange={(e) => setTaxPct(Number(e.target.value))} className="input flex-1 text-right" min={0} max={100} />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground w-24">Biaya Lain</label>
                <input type="number" value={biayaLain} onChange={(e) => setBiayaLain(Number(e.target.value))} className="input flex-1 text-right" />
              </div>
            </div>
            <div className="bg-muted/30 border border-border rounded-lg p-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono tabular-nums">{formatRupiah(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">PPN ({taxPct}%)</span>
                <span className="font-mono tabular-nums">{formatRupiah(totals.tax)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold pt-1.5 border-t border-border">
                <span>Grand Total</span>
                <span className="font-mono tabular-nums text-blue-600">{formatRupiah(totals.grandTotal)}</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={15} /> <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-border bg-muted/30">
          <button onClick={onClose} disabled={mutation.isPending} className="btn-secondary">Batal</button>
          <button onClick={handleSubmit} disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? 'Simpan Perubahan' : 'Simpan sebagai Draft'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SalesOrderModal;
