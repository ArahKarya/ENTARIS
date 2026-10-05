import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Plus, Trash2 } from 'lucide-react';
import { formatRupiah } from '@/lib/format';
import { PickerSelect, type PickerOption } from '@/components/sales-a/PickerSelect';
import { OptionSelect } from '@/components/sales-a/OptionSelect';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { DateInput, Field } from '@/components/shared';
import {
  FooterButton,
  FormDialogBody,
  FormDialogFooter,
  FormDialogHeader,
  FormError,
} from '@/components/sales-a/overlay-parts';
import { formDialogClass, formShellClass, numberInputClass } from '@/components/sales-a/overlay-classes';
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

  const inventoryOptions = useMemo<PickerOption[]>(
    () =>
      (inventoryItems ?? []).map((inv: any) => ({
        value: inv.id,
        label: `${inv.code} — ${inv.name}`,
      })),
    [inventoryItems],
  );

  const serviceOptions = useMemo<PickerOption[]>(
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

  const compactNum = `${numberInputClass} text-sm`;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className={`${formDialogClass} sm:max-w-5xl`}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className={formShellClass}>
          <FormDialogHeader>
            <DialogTitle>
              {isEdit ? `Edit Penawaran ${editTarget?.quotationNumber ?? ''}` : 'Buat Penawaran Baru'}
            </DialogTitle>
            <DialogDescription>Penawaran harga ke pelanggan sebelum menjadi Sales Order.</DialogDescription>
          </FormDialogHeader>

          <FormDialogBody className="space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Tanggal">
                {(c) => <DateInput id={c.id} value={date} onChange={setDate} />}
              </Field>
              <Field label="Berlaku Sampai">
                {(c) => <DateInput id={c.id} value={validUntil} onChange={setValidUntil} />}
              </Field>
              <Field label="Pelanggan" required>
                {() => (
                  <PickerSelect
                    aria-label="Pelanggan"
                    options={(parties ?? []).map((p: any) => ({ value: p.id, label: p.name }))}
                    value={partyId}
                    onChange={(v) => setPartyId(v)}
                    placeholder="Pilih pelanggan..."
                  />
                )}
              </Field>
            </div>

            <section aria-labelledby="qt-items-title">
              <div className="mb-2 flex items-center justify-between">
                <h4 id="qt-items-title" className="text-sm font-semibold text-foreground">Item Penawaran</h4>
                <Button variant="ghost" size="sm" className="text-primary max-sm:h-11" onClick={addItem}>
                  <Plus aria-hidden /> Tambah baris
                </Button>
              </div>
              <div className="space-y-3">
                {items.map((it, idx) => (
                  <div key={it.id} role="group" aria-label={`Item penawaran ${idx + 1}`} className="space-y-2 rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center justify-between">
                      <div role="group" aria-label={`Jenis item ${idx + 1}`} className="inline-flex overflow-hidden rounded-lg border border-border text-xs">
                        {(['product', 'service'] as const).map((type) => (
                          <button
                            key={type}
                            type="button"
                            aria-pressed={it.itemType === type}
                            onClick={() => toggleItemType(idx, type)}
                            className={cn(
                              'px-3 py-1 max-sm:min-h-11',
                              it.itemType === type ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent',
                            )}
                          >
                            {type === 'product' ? 'Produk' : 'Jasa'}
                          </button>
                        ))}
                      </div>
                      {items.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-danger-text max-sm:size-11"
                          aria-label={`Hapus baris ${idx + 1}`}
                          onClick={() => removeItem(idx)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-12 gap-2">
                      <Field label="Item" className="col-span-12 md:col-span-5">
                        {() => (
                          <div className="space-y-1.5">
                            {it.itemType === 'product' ? (
                              <PickerSelect
                                aria-label={`Item produk baris ${idx + 1}`}
                                options={inventoryOptions}
                                value={it.inventoryItemId}
                                onChange={(v) => selectInventoryItem(idx, v)}
                                placeholder="Pilih item / ketik nama bebas..."
                              />
                            ) : (
                              <PickerSelect
                                aria-label={`Item jasa baris ${idx + 1}`}
                                options={serviceOptions}
                                value={it.serviceItemId}
                                onChange={(v) => selectServiceItem(idx, v)}
                                placeholder="Pilih jasa / ketik nama bebas..."
                              />
                            )}
                            {!it.inventoryItemId && !it.serviceItemId && (
                              <Input
                                aria-label={`Nama item bebas baris ${idx + 1}`}
                                placeholder="Atau ketik nama item bebas"
                                value={it.itemName}
                                onChange={(e) => updateItem(idx, 'itemName', e.target.value)}
                                autoComplete="off"
                              />
                            )}
                          </div>
                        )}
                      </Field>
                      <Field label="Qty" className="col-span-4 md:col-span-2">
                        <NumberInput min={0} value={it.quantity || ''} className={compactNum}
                          onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value) || 0)} />
                      </Field>
                      <Field label="Unit" className="col-span-4 md:col-span-2">
                        {() => (
                          <OptionSelect
                            aria-label={`Unit baris ${idx + 1}`}
                            value={it.unit}
                            onChange={(v) => updateItem(idx, 'unit', v)}
                            options={UNITS.map((u) => ({ value: u, label: u }))}
                          />
                        )}
                      </Field>
                      <Field label="Harga Satuan" className="col-span-4 md:col-span-3">
                        <NumberInput min={0} value={it.rate || ''} className={compactNum}
                          onChange={(e) => updateItem(idx, 'rate', Number(e.target.value) || 0)} />
                      </Field>
                    </div>

                    <div className="grid grid-cols-12 gap-2">
                      <Field label="Diskon %" className="col-span-4 md:col-span-2">
                        <NumberInput min={0} max={100} value={it.discount || ''} className={compactNum}
                          onChange={(e) => updateItem(idx, 'discount', Math.min(100, Number(e.target.value) || 0))} />
                      </Field>
                      <Field label="PPN %" className="col-span-4 md:col-span-2">
                        <NumberInput min={0} max={100} value={it.taxPct || ''} className={compactNum}
                          onChange={(e) => updateItem(idx, 'taxPct', Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
                      </Field>
                      <Field label="PPh %" className="col-span-4 md:col-span-2">
                        <NumberInput min={0} max={100} value={it.pphPct || ''} className={compactNum}
                          onChange={(e) => updateItem(idx, 'pphPct', Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
                      </Field>
                      <div className="col-span-12 flex items-end justify-end text-right md:col-span-6">
                        <span className="text-sm font-semibold tabular-nums text-foreground">{formatRupiah(lineTotal(it))}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <Field label="Catatan">
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                    placeholder="Catatan tambahan untuk pelanggan..." />
                </Field>
                <Field label="Syarat & Ketentuan">
                  <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} />
                </Field>
              </div>

              <div className="space-y-2 rounded-lg bg-muted/40 p-4 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums">{formatRupiah(subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">PPN</span>
                  <span className="tabular-nums">{formatRupiah(taxAmount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">PPh</span>
                  <span className="tabular-nums">−{formatRupiah(pphAmount)}</span></div>
                <div className="flex items-center gap-2">
                  <Input aria-label="Label potongan" value={labelPotongan} onChange={(e) => setLabelPotongan(e.target.value)}
                    className="flex-1 text-sm" />
                  <NumberInput aria-label="Nilai potongan" min={0} value={potongan || ''} onChange={(e) => setPotongan(Number(e.target.value) || 0)}
                    className={`${compactNum} w-32`} />
                </div>
                <div className="flex items-center gap-2">
                  <Input aria-label="Label biaya lain" value={labelBiaya} onChange={(e) => setLabelBiaya(e.target.value)}
                    className="flex-1 text-sm" />
                  <NumberInput aria-label="Nilai biaya lain" value={biayaLain || ''} onChange={(e) => setBiayaLain(Number(e.target.value) || 0)}
                    className={`${compactNum} w-32`} />
                </div>
                <div className="flex justify-between border-t border-border pt-2 font-bold">
                  <span>Grand Total</span>
                  <span className="text-lg tabular-nums text-primary">{formatRupiah(grandTotal)}</span>
                </div>
              </div>
            </div>

            <FormError>{error}</FormError>
          </FormDialogBody>

          <FormDialogFooter>
            <FooterButton variant="ghost" onClick={onClose} disabled={mutation.isPending}>Batal</FooterButton>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3">
              <p className="text-xs text-muted-foreground">
                {canSubmit ? `Total: ${formatRupiah(grandTotal)}` : 'Lengkapi pelanggan dan minimal 1 item.'}
              </p>
              <FooterButton type="submit" loading={mutation.isPending} disabled={!canSubmit && !mutation.isPending}>
                {mutation.isPending ? 'Menyimpan…' : isEdit ? 'Simpan Perubahan' : 'Simpan Draft'}
              </FooterButton>
            </div>
          </FormDialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default QuotationModal;
