import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { ComboboxField } from './overlays/ComboboxField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DateInput, Field, type ComboboxOption } from '@/components/shared';
import { FormError, OverlayBody, OverlayFooter, OverlayHeader } from './sales/dialog-parts-b';
import { dialogShellClass } from './sales/dialog-classes-b';

const UNITS = ['Kg', 'Ton', 'Sak', 'Liter', 'Pcs', 'Box', 'Unit', 'Set', 'Meter'];

interface Row { id: string; inventoryItemId: string; quantity: number; unit: string; description: string }
const newRow = (): Row => ({ id: crypto.randomUUID(), inventoryItemId: '', quantity: 1, unit: 'Kg', description: '' });

interface Props {
  onClose: () => void;
  /** Mode ubah: hanya untuk SJS berstatus Terbuka. */
  editNote?: any;
}

const TemporaryDeliveryNoteModal: React.FC<Props> = ({ onClose, editNote }) => {
  const isEdit = !!editNote;
  const today = new Date().toISOString().split('T')[0];
  const queryClient = useQueryClient();

  const [date, setDate] = useState(() => (editNote ? String(editNote.date).slice(0, 10) : today));
  const [partyId, setPartyId] = useState(() => editNote?.partyId ?? '');
  const [nomorMobil, setNomorMobil] = useState(() => editNote?.nomorMobil ?? '');
  const [driverName, setDriverName] = useState(() => editNote?.driverName ?? '');
  const [recipientName, setRecipientName] = useState(() => editNote?.recipientName ?? '');
  const [notes, setNotes] = useState(() => editNote?.notes ?? '');
  // Optional SO this delivery belongs to (same customer).
  const [salesOrderId, setSalesOrderId] = useState<string>(() => editNote?.salesOrderId ?? '');
  const [rows, setRows] = useState<Row[]>(() =>
    editNote
      ? editNote.items.map((it: any) => ({
          id: crypto.randomUUID(),
          inventoryItemId: it.inventoryItemId ?? '',
          quantity: Number(it.quantity),
          unit: it.unit,
          description: it.description ?? '',
        }))
      : [newRow()],
  );
  const [error, setError] = useState('');

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

  const { data: customerOrders } = useQuery({
    queryKey: ['sales-orders', 'for-tdn', partyId],
    enabled: !!partyId,
    queryFn: async () => {
      const res = await api.get('/sales-orders', { params: { partyId, limit: 200, sort: '-date' } });
      return (res.data.data ?? res.data) as Array<{ id: string; soNumber: string; status: string; date: string }>;
    },
  });
  const salesOrderOptions = useMemo<ComboboxOption[]>(
    () =>
      (customerOrders ?? [])
        .filter((so) => so.status !== 'Cancelled' || so.id === salesOrderId)
        .map((so) => ({ value: so.id, label: `${so.soNumber} · ${String(so.date).slice(0, 10)}` })),
    [customerOrders, salesOrderId],
  );
  const changeParty = (v: string) => {
    if (v !== partyId) setSalesOrderId('');
    setPartyId(v);
  };

  const partyOptions = useMemo<ComboboxOption[]>(
    () => (parties ?? []).map((p: any) => ({ value: p.id, label: p.name })),
    [parties],
  );
  const inventoryOptions = useMemo<ComboboxOption[]>(
    () => (inventoryItems ?? []).map((i: any) => ({ value: i.id, label: `${i.code} · ${i.name}` })),
    [inventoryItems],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        date, partyId,
        nomorMobil: nomorMobil || null,
        driverName: driverName || null,
        recipientName: recipientName || null,
        salesOrderId: salesOrderId || null,
        notes: notes || null,
        items: rows.map((r) => ({
          inventoryItemId: r.inventoryItemId,
          quantity: Number(r.quantity),
          unit: r.unit,
          description: r.description || null,
        })),
      };
      return isEdit
        ? api.put(`/temporary-delivery-notes/${editNote.id}`, payload)
        : api.post('/temporary-delivery-notes', payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['temporary-delivery-notes'] });
      queryClient.invalidateQueries({ queryKey: ['temporary-delivery-notes-summary'] });
      toast.success(`Surat jalan sementara ${res.data?.number ?? ''} disimpan.`);
      onClose();
    },
    onError: (e: any) => setError(e?.response?.data?.error || 'Gagal menyimpan surat jalan sementara.'),
  });

  const setRow = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const submit = () => {
    setError('');
    if (!partyId) return setError('Pelanggan wajib dipilih.');
    if (rows.some((r) => !r.inventoryItemId)) return setError('Semua barang wajib dipilih dari master item.');
    if (rows.some((r) => !(Number(r.quantity) > 0))) return setError('Qty harus lebih dari 0.');
    mutation.mutate();
  };

  const partyError = error === 'Pelanggan wajib dipilih.' ? error : undefined;
  const formError = partyError ? '' : error;

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent size="lg" className={dialogShellClass}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex min-h-0 flex-1 flex-col">
          <OverlayHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="size-5 text-warning-text" aria-hidden />
              {isEdit ? `Ubah ${editNote.number}` : 'Buat Surat Jalan Sementara'}
            </DialogTitle>
            <DialogDescription>
              Dokumen sementara: <b>tidak memotong stok, tidak ada jurnal, tidak bisa diinvoice</b>. Tautkan ke surat jalan resmi setelah produksi diinput.
            </DialogDescription>
          </OverlayHeader>

          <OverlayBody>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tanggal">
                <DateInput value={date} onChange={setDate} />
              </Field>
              <ComboboxField label="Pelanggan" required options={partyOptions} value={partyId} onChange={changeParty}
                placeholder="Pilih pelanggan" error={partyError || undefined} />
              <div className="sm:col-span-2">
                <ComboboxField label="Sales Order (opsional)" options={salesOrderOptions} value={salesOrderId}
                  onChange={setSalesOrderId} disabled={!partyId}
                  placeholder={partyId ? 'Tanpa sales order' : 'Pilih pelanggan dulu'}
                  hint="Tautkan pengiriman sementara ini ke pesanan pelanggan." />
              </div>
              <Field label="No. Mobil">
                <Input value={nomorMobil} onChange={(e) => setNomorMobil(e.target.value)} />
              </Field>
              <Field label="Supir">
                <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
              </Field>
              <Field label="Penerima" className="sm:col-span-2">
                <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
              </Field>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Barang</span>
                <Button type="button" variant="outline" size="sm" onClick={() => setRows((r) => [...r, newRow()])}>
                  <Plus aria-hidden /> Tambah baris
                </Button>
              </div>
              <div className="grid gap-3">
                {rows.map((r, idx) => (
                  <div key={r.id} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-border p-2">
                    <div className="col-span-12 sm:col-span-6">
                      <ComboboxField
                        label={`Barang ${idx + 1}`}
                        options={inventoryOptions}
                        value={r.inventoryItemId}
                        onChange={(v) => {
                          const inv = (inventoryItems ?? []).find((i: any) => i.id === v);
                          setRow(r.id, { inventoryItemId: v, unit: inv?.unit || r.unit });
                        }}
                        placeholder="Pilih barang (master item)"
                      />
                    </div>
                    <Field label="Qty" className="col-span-5 sm:col-span-2">
                      <NumberInput min="0" step="any" value={r.quantity}
                        onChange={(e) => setRow(r.id, { quantity: Number(e.target.value) })}
                        className="h-10 text-right tabular-nums md:h-9" />
                    </Field>
                    <Field label="Satuan" className="col-span-5 sm:col-span-2">
                      {(control) => (
                        <Select value={r.unit} onValueChange={(v) => setRow(r.id, { unit: v })}>
                          <SelectTrigger {...control}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[...new Set([r.unit, ...UNITS])].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </Field>
                    <div className="col-span-2 flex justify-end">
                      <Button type="button" variant="ghost" size="icon-touch" className="text-danger-text md:size-9"
                        disabled={rows.length === 1}
                        onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                        aria-label={`Hapus baris barang ${idx + 1}`}>
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Field label="Catatan">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </Field>

            <FormError message={formError} />
          </OverlayBody>

          <OverlayFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>Batal</Button>
            <Button type="submit" loading={mutation.isPending}>{mutation.isPending ? 'Menyimpan…' : 'Simpan'}</Button>
          </OverlayFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TemporaryDeliveryNoteModal;
