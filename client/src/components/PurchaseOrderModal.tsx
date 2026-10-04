import React, { useDeferredValue, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, Loader2, AlertCircle, ClipboardList, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import SearchableSelect, { type SelectOption } from './SearchableSelect';
import Select from './Select';
import { Field } from '@/components/shared/field';
import { NumberInput } from '@/components/ui/number-input';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatRupiah } from '@/lib/format';
import { computePoTotals, PAYMENT_TERM_PRESETS, paymentTermLabel, poDueDate } from '@/lib/purchaseOrderCalc';

const UNITS = ['Kg', 'Ton', 'Sak', 'Liter', 'Pcs', 'Box', 'Unit', 'Set', 'Meter'];

interface POItem {
  id: string;
  inventoryItemId: string;
  itemName: string;
  quantity: number;
  unit: string;
  estimatedRate: number;
  discount: number;
  taxPct: number;
  description: string;
}

const defaultItem = (): POItem => ({
  id: crypto.randomUUID(),
  inventoryItemId: '',
  itemName: '',
  quantity: 0,
  unit: 'Kg',
  estimatedRate: 0,
  discount: 0,
  taxPct: 0,
  description: '',
});

type Num = number | string;

/** Existing PO (GET /purchase-orders/:id) used to prefill edit / duplicate. */
export interface PurchaseOrderSource {
  id: string;
  poNumber: string;
  date: string;
  status?: string;
  approvalStatus?: string | null;
  partyId: string | null;
  expectedDeliveryDate: string | null;
  notes: string | null;
  terms: string | null;
  paymentTermDays?: number | null;
  warehouseId?: string | null;
  supplierQuoteRef?: string | null;
  otherCosts?: Num;
  otherCostsLabel?: string | null;
  items: Array<{
    inventoryItemId: string | null;
    itemName: string;
    quantity: Num;
    unit: string;
    estimatedRate: Num;
    discount?: Num;
    taxPct?: Num;
    description: string | null;
  }>;
}

export type PurchaseOrderModalMode = 'create' | 'edit' | 'duplicate';

interface Props {
  onClose: () => void;
  /** edit → PUT the source PO; duplicate → new PO prefilled from source, dated today. */
  mode?: PurchaseOrderModalMode;
  source?: PurchaseOrderSource | null;
}

const dayPart = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');

const toFormItems = (source?: PurchaseOrderSource | null): POItem[] =>
  source && source.items.length > 0
    ? source.items.map((it) => ({
        id: crypto.randomUUID(),
        inventoryItemId: it.inventoryItemId ?? '',
        itemName: it.itemName,
        quantity: Number(it.quantity) || 0,
        unit: it.unit,
        estimatedRate: Number(it.estimatedRate) || 0,
        discount: Number(it.discount ?? 0) || 0,
        taxPct: Number(it.taxPct ?? 0) || 0,
        description: it.description ?? '',
      }))
    : [defaultItem()];

const termChoice = (days: number | null | undefined): string => {
  if (days == null) return '';
  return (PAYMENT_TERM_PRESETS as readonly number[]).includes(days) ? String(days) : 'custom';
};

type Errors = Partial<Record<'date' | 'partyId' | 'items' | 'term' | 'otherCosts', string>> & {
  lines?: Record<string, string>;
};

type SaveIntent = 'draft' | 'submit';

interface WarehouseOption { id: string; code: string; name: string; isActive: boolean }
/** POST /purchase-orders and /:id/submit response (subset). */
interface SavedPo { poNumber: string; approvalRequestId?: string | null }

const PurchaseOrderModal: React.FC<Props> = ({ onClose, mode = 'create', source = null }) => {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];
  const isEdit = mode === 'edit' && !!source;
  // Draft (edit or new) offers "Simpan Draf" + "Ajukan"; an ordered PO only "Simpan Perubahan".
  const isDraftFlow = !isEdit || source?.status === 'Draft';

  const [date, setDate] = useState(() => (isEdit ? dayPart(source?.date) : today));
  const [partyId, setPartyId] = useState(source?.partyId ?? '');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(() =>
    isEdit ? dayPart(source?.expectedDeliveryDate) : '',
  );
  const [notes, setNotes] = useState(source?.notes ?? '');
  const [terms, setTerms] = useState(source?.terms ?? '');
  const [warehouseId, setWarehouseId] = useState(source?.warehouseId ?? '');
  const [supplierQuoteRef, setSupplierQuoteRef] = useState(source?.supplierQuoteRef ?? '');
  const [termSel, setTermSel] = useState(() => termChoice(source?.paymentTermDays));
  const [customTerm, setCustomTerm] = useState(() =>
    termChoice(source?.paymentTermDays) === 'custom' ? String(source?.paymentTermDays) : '',
  );
  const [otherCosts, setOtherCosts] = useState(() => Number(source?.otherCosts ?? 0) || 0);
  const [otherCostsLabel, setOtherCostsLabel] = useState(source?.otherCostsLabel ?? '');
  const [items, setItems] = useState<POItem[]>(() => toFormItems(source));
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState('');
  const [isUmum, setIsUmum] = useState(() => !!source && !source.partyId);

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

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses-active'],
    queryFn: async () => {
      const res = await api.get('/warehouses');
      const all: WarehouseOption[] = res.data.data ?? res.data;
      return all.filter((w) => w.isActive);
    },
  });

  const supplierOptions: SelectOption[] = (parties ?? []).map((p: any) => ({ value: p.id, label: p.name }));
  const warehouseOptions: SelectOption[] = (warehouses ?? []).map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }));
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

  const totals = computePoTotals(items, otherCosts);
  const paymentTermDays = termSel === '' ? null : termSel === 'custom' ? (customTerm === '' ? NaN : Number(customTerm)) : Number(termSel);
  const dueDate = Number.isFinite(paymentTermDays) ? poDueDate(date, paymentTermDays) : null;

  // Live hint: will "Ajukan" go through approval? (rule PurchaseOrder, grandTotal ≥ minAmount)
  const deferredTotal = useDeferredValue(Math.round(totals.grandTotal));
  const { data: approvalCheck } = useQuery({
    queryKey: ['approval-check', 'PurchaseOrder', deferredTotal],
    queryFn: async () => (await api.get('/approvals/check', { params: { documentType: 'PurchaseOrder', amount: deferredTotal } })).data as { required: boolean },
    enabled: isDraftFlow,
    staleTime: 30_000,
  });
  const needsApproval = !!approvalCheck?.required;

  const afterSave = (msg: string) => {
    queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    if (source?.id) queryClient.invalidateQueries({ queryKey: ['purchase-order-detail', source.id] });
    queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
    toast.success(msg);
    onClose();
  };

  const mutation = useMutation({
    mutationFn: async ({ data, intent }: { data: Record<string, unknown>; intent: SaveIntent }): Promise<SavedPo | null> => {
      if (!isEdit) return (await api.post<SavedPo>('/purchase-orders', { ...data, saveAs: intent })).data;
      await api.put(`/purchase-orders/${source!.id}`, data);
      if (isDraftFlow && intent === 'submit') return (await api.post<SavedPo>(`/purchase-orders/${source!.id}/submit`)).data;
      return null;
    },
    onSuccess: (po: SavedPo | null, { intent }) => {
      const number = po?.poNumber ?? source?.poNumber ?? '';
      if (intent === 'draft' || !isDraftFlow) {
        afterSave(isEdit ? `PO ${number} disimpan.` : `Draf PO ${number} tersimpan.`);
      } else if (po?.approvalRequestId) {
        afterSave(`PO ${number} diajukan — menunggu persetujuan.`);
      } else {
        afterSave(`PO ${number} dipesan.`);
      }
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setServerError(err.response?.data?.error || 'Gagal menyimpan PO.'),
  });

  const validate = (): Errors => {
    const e: Errors = {};
    if (!date) e.date = 'Tanggal wajib diisi.';
    if (!isUmum && !partyId) e.partyId = 'Pilih supplier atau centang "PO Umum".';
    if (termSel === 'custom' && !(paymentTermDays != null && Number.isInteger(paymentTermDays) && paymentTermDays >= 0 && paymentTermDays <= 365)) {
      e.term = 'Isi termin 0–365 hari.';
    }
    if (!(otherCosts >= 0)) e.otherCosts = 'Biaya lain tidak boleh negatif.';
    const lines: Record<string, string> = {};
    items.forEach((it) => {
      const filled = it.itemName || it.quantity || it.estimatedRate;
      if (!filled) return;
      if (!it.itemName.trim()) lines[it.id] = 'Nama item wajib diisi.';
      else if (!(it.quantity > 0)) lines[it.id] = 'Qty harus lebih dari 0.';
      else if (it.estimatedRate < 0) lines[it.id] = 'Harga tidak boleh negatif.';
      else if (it.discount < 0 || it.discount > 100) lines[it.id] = 'Diskon 0–100%.';
      else if (it.taxPct < 0 || it.taxPct > 100) lines[it.id] = 'PPN 0–100%.';
    });
    if (Object.keys(lines).length > 0) e.lines = lines;
    if (!items.some((it) => it.itemName.trim() && it.quantity > 0)) e.items = 'Minimal satu item dengan nama dan qty > 0.';
    return e;
  };

  const handleSave = (intent: SaveIntent) => {
    setServerError('');
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    const validItems = items.filter((it) => it.itemName.trim() && it.quantity > 0);
    mutation.mutate({
      intent,
      data: {
        date,
        partyId: isUmum ? null : partyId,
        expectedDeliveryDate: expectedDeliveryDate || null,
        notes: notes.trim() || null,
        terms: terms.trim() || null,
        paymentTermDays: Number.isFinite(paymentTermDays) ? paymentTermDays : null,
        warehouseId: warehouseId || null,
        supplierQuoteRef: supplierQuoteRef.trim() || null,
        otherCosts: otherCosts || 0,
        otherCostsLabel: otherCostsLabel.trim() || null,
        items: validItems.map((it) => ({
          inventoryItemId: it.inventoryItemId || null,
          itemName: it.itemName.trim(),
          quantity: Number(it.quantity),
          unit: it.unit,
          estimatedRate: Number(it.estimatedRate) || 0,
          discount: Number(it.discount) || 0,
          taxPct: Number(it.taxPct) || 0,
          description: it.description.trim() || null,
        })),
      },
    });
  };

  const pendingIntent = mutation.isPending ? mutation.variables?.intent : null;
  const submitLabel = needsApproval ? 'Simpan & Ajukan' : 'Simpan & Pesan';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-2 sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="po-modal-title" className="w-full max-w-6xl bg-white rounded-xl shadow-2xl flex flex-col max-h-[94vh]">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-blue-50 rounded-lg shrink-0">
              <ClipboardList size={18} className="text-blue-600" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id="po-modal-title" className="text-sm font-semibold text-gray-900 truncate">
                {isEdit
                  ? `Edit PO ${source!.poNumber}`
                  : mode === 'duplicate' && source
                    ? `Duplikat PO ${source.poNumber}`
                    : 'Buat Purchase Order (PO)'}
              </h2>
              <p className="text-xs text-gray-500">Pesanan pembelian ke supplier — tidak ada GL/stock impact</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X size={18} aria-hidden /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">
          {isEdit && source?.approvalStatus === 'Rejected' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              Pengajuan sebelumnya ditolak / perlu revisi. Perbaiki lalu ajukan ulang.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Tanggal PO" required error={errors.date}>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Tgl Kirim Diharapkan">
              <Input type="date" value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} />
            </Field>
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {!isUmum && (
              <Field label="Supplier" required error={errors.partyId}>
                {() => <SearchableSelect options={supplierOptions} value={partyId} onChange={setPartyId} placeholder="— Pilih Supplier —" />}
              </Field>
            )}
            <Field label="Gudang Tujuan" hint="Dipakai sebagai gudang default saat Buat STT dari PO.">
              {() => <SearchableSelect options={warehouseOptions} value={warehouseId} onChange={setWarehouseId} placeholder="— Pilih gudang —" />}
            </Field>
            <Field label="No. Penawaran Pemasok">
              <Input type="text" value={supplierQuoteRef} onChange={(e) => setSupplierQuoteRef(e.target.value)} maxLength={100} placeholder="mis. QT-2026/0042" />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Termin Pembayaran" error={errors.term} hint={dueDate ? `Jatuh tempo: ${new Date(`${dueDate}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}` : undefined}>
              {() => (
                <div className="flex gap-2">
                  <Select value={termSel} onChange={(e) => setTermSel(e.target.value)} className="w-full" aria-label="Termin pembayaran">
                    <option value="">— Tidak ditentukan —</option>
                    {PAYMENT_TERM_PRESETS.map((d) => <option key={d} value={String(d)}>{paymentTermLabel(d)}</option>)}
                    <option value="custom">Lainnya…</option>
                  </Select>
                  {termSel === 'custom' && (
                    <NumberInput aria-label="Termin (hari)" min={0} max={365} step={1} value={customTerm} onChange={(e) => setCustomTerm(e.target.value)} placeholder="hari" className="w-24 text-right" />
                  )}
                </div>
              )}
            </Field>
            <Field label="Catatan" className="sm:col-span-2">
              <Input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>

          <Field label="Syarat & Ketentuan">
            <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} placeholder="mis. FOB Pabrik, barang sesuai spesifikasi penawaran" />
          </Field>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-widest">
              Items dipesan ({items.length})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                  <tr>
                    <th className="text-left px-2 py-2 w-8">#</th>
                    <th className="text-left px-2 py-2 w-56">Item inventori</th>
                    <th className="text-left px-2 py-2">Nama Item / Keterangan</th>
                    <th className="text-right px-2 py-2 w-24">Qty</th>
                    <th className="text-center px-2 py-2 w-24">Sat</th>
                    <th className="text-right px-2 py-2 w-32">Harga</th>
                    <th className="text-right px-2 py-2 w-20">Disk %</th>
                    <th className="text-right px-2 py-2 w-20">PPN %</th>
                    <th className="text-right px-2 py-2 w-36">Jumlah</th>
                    <th className="px-2 py-2 w-8"><span className="sr-only">Aksi</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const line = totals.lines[idx];
                    const lineErr = errors.lines?.[it.id];
                    const n = idx + 1;
                    return (
                      <React.Fragment key={it.id}>
                        <tr className={lineErr ? 'bg-red-50/40' : 'border-b border-gray-50 last:border-0'}>
                          <td className="px-2 py-2 text-center text-xs text-gray-500 align-top pt-4">{n}</td>
                          <td className="px-2 py-2 align-top">
                            <SearchableSelect
                              options={itemOptions}
                              value={it.inventoryItemId}
                              onChange={(v) => onItemPick(idx, v)}
                              placeholder="Pilih item (opsional)..."
                            />
                          </td>
                          <td className="px-2 py-2 align-top space-y-1">
                            <Input type="text" aria-label={`Nama item baris ${n}`} aria-invalid={lineErr ? true : undefined} value={it.itemName} onChange={(e) => updateItem(idx, { itemName: e.target.value })} className="text-xs" placeholder="Nama item" />
                            <Input type="text" aria-label={`Keterangan baris ${n}`} value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} className="text-xs" placeholder="Keterangan (opsional)" />
                          </td>
                          <td className="px-2 py-2 align-top">
                            <NumberInput aria-label={`Qty baris ${n}`} step="0.001" min={0} value={it.quantity || ''} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} className="text-right" />
                          </td>
                          <td className="px-2 py-2 align-top">
                            <Select value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} className="w-full" aria-label={`Satuan baris ${n}`}>
                              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                            </Select>
                          </td>
                          <td className="px-2 py-2 align-top">
                            <NumberInput aria-label={`Harga baris ${n}`} step="0.01" min={0} value={it.estimatedRate || ''} onChange={(e) => updateItem(idx, { estimatedRate: Number(e.target.value) })} className="text-right" />
                          </td>
                          <td className="px-2 py-2 align-top">
                            <NumberInput aria-label={`Diskon persen baris ${n}`} step="0.01" min={0} max={100} value={it.discount || ''} onChange={(e) => updateItem(idx, { discount: Number(e.target.value) })} className="text-right" placeholder="0" />
                          </td>
                          <td className="px-2 py-2 align-top">
                            <NumberInput aria-label={`PPN persen baris ${n}`} step="0.01" min={0} max={100} value={it.taxPct || ''} onChange={(e) => updateItem(idx, { taxPct: Number(e.target.value) })} className="text-right" placeholder="0" />
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-xs text-gray-800 align-top pt-4 whitespace-nowrap">
                            {line && line.amount > 0 ? formatRupiah(line.amount) : '—'}
                          </td>
                          <td className="px-2 py-2 text-center align-top pt-3">
                            <button type="button" onClick={() => removeItem(idx)} disabled={items.length === 1} aria-label={`Hapus baris ${n}`} className="text-gray-500 hover:text-red-600 disabled:opacity-30">
                              <Trash2 size={14} aria-hidden />
                            </button>
                          </td>
                        </tr>
                        {lineErr && (
                          <tr className="bg-red-50/40 border-b border-gray-50">
                            <td colSpan={10} className="px-2 pb-2 pl-10 text-xs font-medium text-red-700">
                              <p role="alert">Baris {n}: {lineErr}</p>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-gray-100">
              <button type="button" onClick={addItem} className="text-xs text-blue-700 hover:text-blue-800 font-medium flex items-center gap-1">
                <Plus size={12} aria-hidden /> Tambah baris
              </button>
            </div>
            {errors.items && <p className="px-4 pb-2 text-xs font-medium text-red-700" role="alert">{errors.items}</p>}
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-end">
            <dl className="w-full sm:w-96 text-sm space-y-1.5" aria-label="Ringkasan total PO">
              <div className="flex justify-between"><dt className="text-gray-600">Subtotal</dt><dd className="font-mono" data-testid="po-subtotal">{formatRupiah(totals.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-600">Diskon</dt><dd className="font-mono">− {formatRupiah(totals.discountTotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-600">PPN</dt><dd className="font-mono">{formatRupiah(totals.taxTotal)}</dd></div>
              <div className="flex items-start gap-2 pt-1">
                <Field label="Label biaya lain" hideLabel className="flex-1">
                  <Input type="text" value={otherCostsLabel} onChange={(e) => setOtherCostsLabel(e.target.value)} maxLength={100} placeholder="Biaya lain (mis. Ongkir)" className="text-xs" />
                </Field>
                <Field label="Jumlah biaya lain" hideLabel error={errors.otherCosts} className="w-36">
                  <NumberInput step="0.01" min={0} value={otherCosts || ''} onChange={(e) => setOtherCosts(Number(e.target.value))} placeholder="0" className="text-right" />
                </Field>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold">
                <dt>Grand Total</dt><dd className="font-mono" data-testid="po-grand-total">{formatRupiah(totals.grandTotal)}</dd>
              </div>
            </dl>
          </div>

          {serverError && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />{serverError}
            </div>
          )}

          {isDraftFlow && needsApproval && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              Nilai PO ini memerlukan persetujuan. Setelah diajukan, PO berstatus <b>Menunggu Persetujuan</b> dan baru menjadi <b>Dipesan</b> setelah disetujui.
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 py-3 border-t border-gray-100 bg-gray-50/40 flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={mutation.isPending}>Batal</button>
          {isDraftFlow ? (
            <>
              <button type="button" onClick={() => handleSave('draft')} disabled={mutation.isPending} className="btn-secondary flex items-center gap-1.5">
                {pendingIntent === 'draft' ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Save size={14} aria-hidden />}
                Simpan Draf
              </button>
              <button type="button" onClick={() => handleSave('submit')} disabled={mutation.isPending} className="btn-primary flex items-center gap-1.5">
                {pendingIntent === 'submit' ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Send size={14} aria-hidden />}
                {submitLabel}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => handleSave('submit')} disabled={mutation.isPending} className="btn-primary flex items-center gap-1.5">
              {mutation.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ClipboardList size={14} aria-hidden />}
              {mutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PurchaseOrderModal;
