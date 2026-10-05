import React, { useDeferredValue, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ClipboardList, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { OptionPicker, type PickerOption as SelectOption } from './purchase-cash/OptionPicker';
import { FormDialog } from './purchase-cash/FormDialog';
import { Callout, ErrorAlert } from './purchase-cash/ErrorAlert';
import { Field, DateInput } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
    staleTime: 30_000,
  });
  const needsApproval = !!approvalCheck?.required;
  // Ordered PO: raising the total into an approval rule's range is refused by the server.
  const [originalGrandTotal] = useState(() =>
    source ? computePoTotals(toFormItems(source), Number(source.otherCosts ?? 0) || 0).grandTotal : 0,
  );
  const increaseBlocked = !isDraftFlow && needsApproval && totals.grandTotal > originalGrandTotal;

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

  const th = 'px-2 py-2 text-xs font-semibold uppercase text-muted-foreground';
  const title = isEdit
    ? `Edit PO ${source!.poNumber}`
    : mode === 'duplicate' && source
      ? `Duplikat PO ${source.poNumber}`
      : 'Buat Purchase Order (PO)';

  const footer = (
    <>
      <Button type="button" variant="outline" className="h-11 sm:h-9" onClick={onClose} disabled={mutation.isPending}>
        Batal
      </Button>
      {isDraftFlow ? (
        <>
          <Button
            type="button"
            variant="secondary"
            className="h-11 sm:h-9"
            onClick={() => handleSave('draft')}
            disabled={mutation.isPending}
            loading={pendingIntent === 'draft'}
          >
            {pendingIntent !== 'draft' && <Save aria-hidden />}
            Simpan Draf
          </Button>
          <Button
            type="button"
            className="h-11 sm:h-9"
            onClick={() => handleSave('submit')}
            disabled={mutation.isPending}
            loading={pendingIntent === 'submit'}
          >
            {pendingIntent !== 'submit' && <Send aria-hidden />}
            {submitLabel}
          </Button>
        </>
      ) : (
        <Button
          type="button"
          className="h-11 sm:h-9"
          onClick={() => handleSave('submit')}
          disabled={mutation.isPending}
          loading={mutation.isPending}
        >
          {!mutation.isPending && <ClipboardList aria-hidden />}
          {mutation.isPending ? 'Menyimpan…' : 'Simpan Perubahan'}
        </Button>
      )}
    </>
  );

  return (
    <FormDialog
      open
      onClose={onClose}
      size="doc"
      className="lg:max-w-6xl"
      title={title}
      description="Pesanan pembelian ke supplier — tidak ada GL/stock impact"
      busy={mutation.isPending}
      footer={footer}
    >
      {isEdit && source?.approvalStatus === 'Rejected' && (
        <Callout tone="warning">Pengajuan sebelumnya ditolak / perlu revisi. Perbaiki lalu ajukan ulang.</Callout>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Tanggal PO" required error={errors.date}>
          <DateInput value={date} onChange={setDate} />
        </Field>
        <Field label="Tgl Kirim Diharapkan">
          <DateInput value={expectedDeliveryDate} onChange={setExpectedDeliveryDate} />
        </Field>
        <div className="flex items-end">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground sm:min-h-9">
            <Checkbox
              checked={isUmum}
              onCheckedChange={(v) => {
                const checked = v === true;
                setIsUmum(checked);
                if (checked) setPartyId('');
              }}
            />
            PO Umum (boleh dipenuhi supplier apa saja)
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {!isUmum && (
          <Field label="Supplier" required error={errors.partyId}>
            <OptionPicker options={supplierOptions} value={partyId} onChange={setPartyId} placeholder="— Pilih Supplier —" />
          </Field>
        )}
        <Field label="Gudang Tujuan" hint="Dipakai sebagai gudang default saat Buat STT dari PO.">
          <OptionPicker options={warehouseOptions} value={warehouseId} onChange={setWarehouseId} placeholder="— Pilih gudang —" />
        </Field>
        <Field label="No. Penawaran Pemasok">
          <Input type="text" value={supplierQuoteRef} onChange={(e) => setSupplierQuoteRef(e.target.value)} maxLength={100} placeholder="mis. QT-2026/0042" />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field
          label="Termin Pembayaran"
          error={errors.term}
          hint={dueDate ? `Jatuh tempo: ${new Date(`${dueDate}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}` : undefined}
        >
          {(c) => (
            <div className="flex gap-2">
              <OptionPicker
                id={c.id}
                aria-describedby={c['aria-describedby']}
                aria-invalid={c['aria-invalid']}
                value={termSel}
                onChange={setTermSel}
                searchable={false}
                placeholder="— Tidak ditentukan —"
                emptyLabel="— Tidak ditentukan —"
                options={[
                  ...PAYMENT_TERM_PRESETS.map((d) => ({ value: String(d), label: paymentTermLabel(d) })),
                  { value: 'custom', label: 'Lainnya…' },
                ]}
              />
              {termSel === 'custom' && (
                <NumberInput aria-label="Termin (hari)" min={0} max={365} step={1} value={customTerm} onChange={(e) => setCustomTerm(e.target.value)} placeholder="hari" className="h-10 w-24 text-right md:h-9" />
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

      <section aria-labelledby="po-items-title" className="overflow-hidden rounded-xl border border-border">
        <h3 id="po-items-title" className="bg-muted px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Items dipesan ({items.length})
        </h3>
        <div
          role="region"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          aria-label="Tabel item PO (geser untuk melihat kolom lain)"
          className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <table className="w-full min-w-[920px] text-sm">
            <thead className="border-b border-border bg-muted">
              <tr>
                <th scope="col" className={`${th} w-8 text-left`}>#</th>
                <th scope="col" className={`${th} w-56 text-left`}>Item inventori</th>
                <th scope="col" className={`${th} text-left`}>Nama Item / Keterangan</th>
                <th scope="col" className={`${th} w-24 text-right`}>Qty</th>
                <th scope="col" className={`${th} w-24 text-center`}>Sat</th>
                <th scope="col" className={`${th} w-32 text-right`}>Harga</th>
                <th scope="col" className={`${th} w-20 text-right`}>Disk %</th>
                <th scope="col" className={`${th} w-20 text-right`}>PPN %</th>
                <th scope="col" className={`${th} w-36 text-right`}>Jumlah</th>
                <th scope="col" className={`${th} w-12`}><span className="sr-only">Aksi</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const line = totals.lines[idx];
                const lineErr = errors.lines?.[it.id];
                const n = idx + 1;
                return (
                  <React.Fragment key={it.id}>
                    <tr className={lineErr ? 'bg-danger-subtle' : 'border-b border-border last:border-0'}>
                      <td className="px-2 py-2 pt-4 text-center align-top text-xs text-muted-foreground">{n}</td>
                      <td className="px-2 py-2 align-top">
                        <OptionPicker
                          aria-label={`Item inventori baris ${n}`}
                          options={itemOptions}
                          value={it.inventoryItemId}
                          onChange={(v) => onItemPick(idx, v)}
                          placeholder="Pilih item (opsional)..."
                        />
                      </td>
                      <td className="space-y-1 px-2 py-2 align-top">
                        <Input type="text" aria-label={`Nama item baris ${n}`} aria-invalid={lineErr ? true : undefined} value={it.itemName} onChange={(e) => updateItem(idx, { itemName: e.target.value })} className="text-xs" placeholder="Nama item" />
                        <Input type="text" aria-label={`Keterangan baris ${n}`} value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} className="text-xs" placeholder="Keterangan (opsional)" />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <NumberInput aria-label={`Qty baris ${n}`} step="0.001" min={0} value={it.quantity || ''} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} className="num h-10 text-right md:h-9" />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <OptionPicker
                          aria-label={`Satuan baris ${n}`}
                          options={UNITS.map((u) => ({ value: u, label: u }))}
                          searchable={false}
                          value={it.unit}
                          onChange={(v) => updateItem(idx, { unit: v })}
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <NumberInput aria-label={`Harga baris ${n}`} step="0.01" min={0} value={it.estimatedRate || ''} onChange={(e) => updateItem(idx, { estimatedRate: Number(e.target.value) })} className="num h-10 text-right md:h-9" />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <NumberInput aria-label={`Diskon persen baris ${n}`} step="0.01" min={0} max={100} value={it.discount || ''} onChange={(e) => updateItem(idx, { discount: Number(e.target.value) })} className="num h-10 text-right md:h-9" placeholder="0" />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <NumberInput aria-label={`PPN persen baris ${n}`} step="0.01" min={0} max={100} value={it.taxPct || ''} onChange={(e) => updateItem(idx, { taxPct: Number(e.target.value) })} className="num h-10 text-right md:h-9" placeholder="0" />
                      </td>
                      <td className="num whitespace-nowrap px-2 py-2 pt-4 text-right align-top text-xs text-foreground">
                        {line && line.amount > 0 ? formatRupiah(line.amount) : '—'}
                      </td>
                      <td className="px-2 py-2 text-center align-top">
                        <Button type="button" variant="ghost" size="icon" className="text-muted-foreground hover:text-danger-text" onClick={() => removeItem(idx)} disabled={items.length === 1} aria-label={`Hapus baris ${n}`}>
                          <Trash2 aria-hidden />
                        </Button>
                      </td>
                    </tr>
                    {lineErr && (
                      <tr className="border-b border-border bg-danger-subtle">
                        <td colSpan={10} className="px-2 pb-2 pl-10 text-xs font-medium text-danger-text">
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
        <div className="border-t border-border px-3 py-2">
          <Button type="button" variant="ghost" size="sm" className="h-11 sm:h-8" onClick={addItem}>
            <Plus aria-hidden /> Tambah baris
          </Button>
        </div>
        {errors.items && <p className="px-4 pb-2 text-xs font-medium text-danger-text" role="alert">{errors.items}</p>}
      </section>

      <div className="flex flex-col sm:flex-row sm:justify-end">
        <div className="w-full space-y-1.5 text-sm sm:w-96" role="group" aria-label="Ringkasan total PO">
          <dl className="space-y-1.5">
            <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="num" data-testid="po-subtotal">{formatRupiah(totals.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Diskon</dt><dd className="num">− {formatRupiah(totals.discountTotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">PPN</dt><dd className="num">{formatRupiah(totals.taxTotal)}</dd></div>
          </dl>
          <div className="flex items-start gap-2 pt-1">
            <Field label="Label biaya lain" hideLabel className="flex-1">
              <Input type="text" value={otherCostsLabel} onChange={(e) => setOtherCostsLabel(e.target.value)} maxLength={100} placeholder="Biaya lain (mis. Ongkir)" className="text-xs" />
            </Field>
            <Field label="Jumlah biaya lain" hideLabel error={errors.otherCosts} className="w-36">
              <NumberInput step="0.01" min={0} value={otherCosts || ''} onChange={(e) => setOtherCosts(Number(e.target.value))} placeholder="0" className="num h-10 text-right md:h-9" />
            </Field>
          </div>
          <dl className="border-t border-border pt-2 text-base font-semibold">
            <div className="flex justify-between">
              <dt>Grand Total</dt><dd className="num" data-testid="po-grand-total">{formatRupiah(totals.grandTotal)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <ErrorAlert message={serverError} />

      {increaseBlocked && (
        <Callout tone="warning" className="text-xs">
          Kenaikan nilai PO ini (dari {formatRupiah(originalGrandTotal)}) melebihi batas persetujuan dan akan ditolak.
          Turunkan nilainya, atau batalkan PO ini dan buat PO baru untuk diajukan ulang.
        </Callout>
      )}

      {isDraftFlow && needsApproval && (
        <Callout tone="warning" className="text-xs">
          Nilai PO ini memerlukan persetujuan. Setelah diajukan, PO berstatus <b>Menunggu Persetujuan</b> dan baru menjadi <b>Dipesan</b> setelah disetujui.
        </Callout>
      )}
    </FormDialog>
  );
};

export default PurchaseOrderModal;
