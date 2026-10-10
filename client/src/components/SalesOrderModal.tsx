import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Plus, Trash2 } from 'lucide-react';
import { formatRupiah } from '@/lib/format';
import { PickerSelect } from '@/components/sales-a/PickerSelect';
import { usePartyPicker } from '@/hooks/usePartyPicker';
import { OptionSelect } from '@/components/sales-a/OptionSelect';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { DateInput, Field } from '@/components/shared';
import {
  FooterButton,
  FormDialogBody,
  FormDialogFooter,
  FormDialogHeader,
  FormError,
  TableRegion,
} from '@/components/sales-a/overlay-parts';
import { formDialogClass, formShellClass, numberInputClass } from '@/components/sales-a/overlay-classes';
import { toast } from 'sonner';

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
  // Source quotation link (edit keeps it; "dari penawaran" prefill sets it).
  const [quotationId, setQuotationId] = useState<string | null>(null);
  const [quotationNumber, setQuotationNumber] = useState('');
  const [error, setError] = useState('');

  const queryClient = useQueryClient();

  const partyPicker = usePartyPicker({ type: 'Customer', selectedId: partyId || null, known: editTarget?.customer ?? null });

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
      setQuotationId(editTarget.quotationId ?? null);
      setQuotationNumber(editTarget.quotation?.quotationNumber ?? editTarget.quotationNumber ?? '');
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
      setQuotationId(null);
      setQuotationNumber('');
    }
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editTarget?.id, editTarget?.quotationId]);


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
        quotationId,
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

  const num = (setter: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => setter(Number(e.target.value));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className={`${formDialogClass} sm:max-w-5xl`}>
        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
          className={formShellClass}
        >
          <FormDialogHeader>
            <DialogTitle>{isEdit ? 'Edit Sales Order' : 'Buat Sales Order'}</DialogTitle>
            <DialogDescription>Komitmen jual ke pelanggan (Draft → Submitted)</DialogDescription>
          </FormDialogHeader>

          <FormDialogBody>
            {quotationId && (
              <p className="rounded-md bg-info-subtle px-3 py-2 text-xs text-info-text">
                Dari penawaran <span className="font-mono font-semibold">{quotationNumber || '-'}</span>
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              <Field label="Tanggal">
                {(c) => <DateInput id={c.id} value={date} onChange={setDate} />}
              </Field>
              <Field label="Target Pengiriman">
                {(c) => <DateInput id={c.id} value={expectedDelivery} onChange={setExpectedDelivery} />}
              </Field>
              <Field label="Pelanggan" required className="md:col-span-2">
                {() => (
                  <PickerSelect
                    aria-label="Pelanggan"
                    value={partyId}
                    onChange={setPartyId}
                    {...partyPicker.pickerProps}
                    placeholder="Pilih pelanggan..."
                  />
                )}
              </Field>
              <Field label="No. Referensi PO Pelanggan" className="md:col-span-2">
                <Input value={customerRefNo} onChange={(e) => setCustomerRefNo(e.target.value)} placeholder="Opsional" autoComplete="off" />
              </Field>
              <Field label="Catatan" className="md:col-span-2">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsional" autoComplete="off" />
              </Field>
            </div>

            <div className="overflow-hidden rounded-lg border border-border">
              <TableRegion label="Daftar item sales order" className="rounded-none border-0">
                <table className="min-w-[760px] w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium">Item</th>
                      <th scope="col" className="w-24 px-3 py-2 text-right text-xs font-medium">Qty</th>
                      <th scope="col" className="w-24 px-3 py-2 text-left text-xs font-medium">Unit</th>
                      <th scope="col" className="w-32 px-3 py-2 text-right text-xs font-medium">Harga/Unit</th>
                      <th scope="col" className="w-20 px-3 py-2 text-right text-xs font-medium">Disc %</th>
                      <th scope="col" className="w-32 px-3 py-2 text-right text-xs font-medium">Subtotal</th>
                      <th scope="col" className="w-12 px-1 py-2"><span className="sr-only">Aksi</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={it.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <PickerSelect
                            aria-label={`Item baris ${idx + 1}`}
                            value={it.inventoryItemId}
                            onChange={(v) => onPickInventory(it.id, v)}
                            options={itemOptions}
                            placeholder="Pilih item..."
                          />
                        </td>
                        <td className="px-3 py-2">
                          <NumberInput
                            aria-label={`Qty baris ${idx + 1}`}
                            value={it.quantity}
                            onChange={(e) => updateItem(it.id, { quantity: Number(e.target.value) })}
                            className={numberInputClass}
                            min={0}
                            step="0.001"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <OptionSelect
                            aria-label={`Unit baris ${idx + 1}`}
                            value={it.unit}
                            onChange={(v) => updateItem(it.id, { unit: v })}
                            options={UNITS.map((u) => ({ value: u, label: u }))}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <NumberInput
                            aria-label={`Harga per unit baris ${idx + 1}`}
                            value={it.rate}
                            onChange={(e) => updateItem(it.id, { rate: Number(e.target.value) })}
                            className={numberInputClass}
                            min={0}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <NumberInput
                            aria-label={`Diskon persen baris ${idx + 1}`}
                            value={it.discount}
                            onChange={(e) => updateItem(it.id, { discount: Number(e.target.value) })}
                            className={numberInputClass}
                            min={0}
                            max={100}
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatRupiah(computeAmount(it.quantity, it.rate, it.discount))}
                        </td>
                        <td className="px-1 text-center">
                          {items.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-danger-text max-sm:size-11"
                              aria-label={`Hapus baris ${idx + 1}`}
                              onClick={() => setItems((arr) => arr.filter((x) => x.id !== it.id))}
                            >
                              <Trash2 aria-hidden />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableRegion>
              <div className="border-t border-border bg-muted/30 px-3 py-2">
                <Button variant="ghost" size="sm" className="text-primary max-sm:h-11" onClick={() => setItems((arr) => [...arr, defaultItem()])}>
                  <Plus aria-hidden /> Tambah baris
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-1">
                <Field label="Potongan">
                  <NumberInput value={potongan} onChange={num(setPotongan)} className={numberInputClass} min={0} />
                </Field>
                <Field label="PPN %">
                  <NumberInput value={taxPct} onChange={num(setTaxPct)} className={numberInputClass} min={0} max={100} />
                </Field>
                <Field label="Biaya Lain">
                  <NumberInput value={biayaLain} onChange={num(setBiayaLain)} className={numberInputClass} />
                </Field>
              </div>
              <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums">{formatRupiah(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">PPN ({taxPct}%)</span>
                  <span className="tabular-nums">{formatRupiah(totals.tax)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
                  <span>Grand Total</span>
                  <span className="tabular-nums text-primary">{formatRupiah(totals.grandTotal)}</span>
                </div>
              </div>
            </div>

            <FormError>{error}</FormError>
          </FormDialogBody>

          <FormDialogFooter>
            <FooterButton variant="ghost" onClick={onClose} disabled={mutation.isPending}>Batal</FooterButton>
            <FooterButton type="submit" loading={mutation.isPending}>
              {mutation.isPending ? 'Menyimpan…' : isEdit ? 'Simpan Perubahan' : 'Simpan sebagai Draft'}
            </FooterButton>
          </FormDialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SalesOrderModal;
