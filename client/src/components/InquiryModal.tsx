import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { Plus, Trash2 } from 'lucide-react';
import { ComboboxField } from './overlays/ComboboxField';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DateInput, Field, type ComboboxOption } from '@/components/shared';
import { FormError, OverlayBody, OverlayFooter, OverlayHeader } from './sales/dialog-parts-b';
import { dialogShellClass } from './sales/dialog-classes-b';

interface InquiryItem {
  id: string;
  itemName: string;
  quantity: string;       // keep as string so user can leave blank
  unit: string;
  estimatedPrice: string;
  description: string;
}

const CHANNELS = [
  { value: 'WhatsApp', label: 'WhatsApp' },
  { value: 'Telepon', label: 'Telepon' },
  { value: 'Email', label: 'Email' },
  { value: 'WalkIn', label: 'Walk-in' },
  { value: 'Referral', label: 'Referral' },
  { value: 'Lainnya', label: 'Lainnya' },
];

const UNITS = ['Kg', 'Ton', 'Sak', 'Liter', 'Pcs', 'Box', 'Unit', 'Set', 'Meter', 'Jasa'];

const newRow = (): InquiryItem => ({
  id: crypto.randomUUID(), itemName: '', quantity: '', unit: 'Kg', estimatedPrice: '', description: '',
});

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editTarget?: any | null;
}

const InquiryModal: React.FC<Props> = ({ isOpen, onClose, editTarget }) => {
  const isEdit = Boolean(editTarget?.id);
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [channel, setChannel] = useState('Lainnya');
  const [partyId, setPartyId] = useState('');
  const [prospectName, setProspectName] = useState('');
  const [prospectPhone, setProspectPhone] = useState('');
  const [prospectEmail, setProspectEmail] = useState('');
  const [itemsMode, setItemsMode] = useState<'freetext' | 'structured'>('freetext');
  const [itemsText, setItemsText] = useState('');
  const [items, setItems] = useState<InquiryItem[]>([newRow()]);
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [error, setError] = useState('');

  const queryClient = useQueryClient();

  const { data: parties } = useQuery({
    queryKey: ['parties-customers'],
    queryFn: async () => {
      const res = await api.get('/parties?type=Customer');
      return res.data.data ?? res.data;
    },
  });

  // Sync form when modal opens / editTarget changes
  useEffect(() => {
    if (!isOpen) return;
    if (editTarget?.id) {
      setDate(editTarget.date ? new Date(editTarget.date).toISOString().split('T')[0] : today);
      setChannel(editTarget.channel ?? 'Lainnya');
      setPartyId(editTarget.partyId ?? '');
      setProspectName(editTarget.prospectName ?? '');
      setProspectPhone(editTarget.prospectPhone ?? '');
      setProspectEmail(editTarget.prospectEmail ?? '');
      setItemsMode(editTarget.itemsMode ?? 'freetext');
      setItemsText(editTarget.itemsText ?? '');
      setItems(
        (editTarget.items ?? []).length > 0
          ? editTarget.items.map((it: any) => ({
              id: crypto.randomUUID(),
              itemName: it.itemName ?? '',
              quantity: it.quantity != null ? String(it.quantity) : '',
              unit: it.unit ?? 'Kg',
              estimatedPrice: it.estimatedPrice != null ? String(it.estimatedPrice) : '',
              description: it.description ?? '',
            }))
          : [newRow()],
      );
      setNotes(editTarget.notes ?? '');
      setFollowUpDate(editTarget.followUpDate ? new Date(editTarget.followUpDate).toISOString().split('T')[0] : '');
    } else {
      setDate(today);
      setChannel('Lainnya');
      setPartyId('');
      setProspectName('');
      setProspectPhone('');
      setProspectEmail('');
      setItemsMode('freetext');
      setItemsText('');
      setItems([newRow()]);
      setNotes('');
      setFollowUpDate('');
    }
    setError('');
  }, [isOpen, editTarget?.id]);

  const partyOptions = useMemo<ComboboxOption[]>(
    () => (parties ?? []).map((p: any) => ({ value: p.id, label: p.name })),
    [parties],
  );

  const onPickParty = (id: string) => {
    setPartyId(id);
    const p = parties?.find((x: any) => x.id === id);
    if (p) {
      setProspectName(p.name);
      setProspectPhone(p.phone ?? '');
      setProspectEmail(p.email ?? '');
    }
  };

  const updateItem = (i: number, field: keyof InquiryItem, value: string) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: value };
    setItems(next);
  };

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const url = isEdit ? `/inquiries/${editTarget.id}` : '/inquiries';
      const method = isEdit ? 'put' : 'post';
      const res = await api[method](url, data);
      return res.data;
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Inquiry diperbarui.' : 'Inquiry dicatat.');
      queryClient.invalidateQueries({ queryKey: ['inquiries'] });
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error ?? 'Gagal menyimpan inquiry.'),
  });


  const handleSubmit = () => {
    setError('');
    if (!prospectName.trim()) { setError('Nama prospek/customer wajib diisi.'); return; }

    const validItems = itemsMode === 'structured'
      ? items.filter((it) => it.itemName.trim().length > 0).map((it) => ({
          itemName: it.itemName.trim(),
          quantity: it.quantity ? Number(it.quantity) : null,
          unit: it.unit || null,
          estimatedPrice: it.estimatedPrice ? Number(it.estimatedPrice) : null,
          description: it.description || null,
        }))
      : [];

    if (itemsMode === 'structured' && validItems.length === 0 && !itemsText.trim()) {
      setError('Tambahkan minimal satu item, atau isi permintaan di mode free-text.');
      return;
    }

    mutation.mutate({
      date,
      channel,
      partyId: partyId || null,
      prospectName: prospectName.trim(),
      prospectPhone: prospectPhone.trim() || null,
      prospectEmail: prospectEmail.trim() || null,
      itemsMode,
      itemsText: itemsText.trim() || null,
      items: validItems,
      notes: notes.trim() || null,
      followUpDate: followUpDate || null,
    });
  };

  const nameError = error.startsWith('Nama prospek') ? error : undefined;
  const formError = nameError ? '' : error;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent size="lg" className={dialogShellClass}>
        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <OverlayHeader>
            <DialogTitle>
              {isEdit ? `Edit Inquiry ${editTarget?.inquiryNumber ?? ''}` : 'Catat Inquiry Baru'}
            </DialogTitle>
            <DialogDescription>
              Catat permintaan awal dari calon pelanggan sebelum dibuatkan Penawaran.
            </DialogDescription>
          </OverlayHeader>

          <OverlayBody className="gap-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Tanggal">
                <DateInput value={date} onChange={setDate} />
              </Field>
              <Field label="Channel">
                {(control) => (
                  <Select value={channel} onValueChange={setChannel}>
                    <SelectTrigger {...control}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </Field>
              <Field label="Tindak Lanjut (opsional)">
                <DateInput value={followUpDate} onChange={setFollowUpDate} />
              </Field>
            </div>

            <div className="grid gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-3">
              <div className="flex flex-col gap-1.5">
                <ComboboxField
                  label="Pilih dari Pelanggan Existing (opsional)"
                  options={partyOptions}
                  value={partyId}
                  onChange={onPickParty}
                  placeholder="Cari pelanggan terdaftar..."
                />
                {!partyId && (
                  <p className="text-xs text-warning-text">
                    Belum dipilih → akan dicatat sebagai prospect baru. Saat konversi ke Penawaran, pelanggan otomatis dibuat.
                  </p>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Nama Prospek/Customer" required error={nameError}>
                  <Input value={prospectName} onChange={(e) => setProspectName(e.target.value)} maxLength={200}
                    placeholder="Mis: Pak Budi / PT Sukses Makmur" />
                </Field>
                <Field label="Telepon">
                  <Input type="tel" value={prospectPhone} onChange={(e) => setProspectPhone(e.target.value)}
                    placeholder="08xx-xxxx-xxxx" />
                </Field>
                <Field label="Email">
                  <Input type="email" value={prospectEmail} onChange={(e) => setProspectEmail(e.target.value)}
                    placeholder="email@domain.com" />
                </Field>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Permintaan / Item</span>
                <div role="group" aria-label="Mode input permintaan" className="inline-flex gap-1">
                  <Button type="button" size="sm" variant={itemsMode === 'freetext' ? 'primary' : 'outline'}
                    aria-pressed={itemsMode === 'freetext'} onClick={() => setItemsMode('freetext')}>
                    Free-text
                  </Button>
                  <Button type="button" size="sm" variant={itemsMode === 'structured' ? 'primary' : 'outline'}
                    aria-pressed={itemsMode === 'structured'} onClick={() => setItemsMode('structured')}>
                    Terstruktur
                  </Button>
                </div>
              </div>
              {itemsMode === 'freetext' ? (
                <Field label="Permintaan (free-text)" hideLabel>
                  <Textarea value={itemsText} onChange={(e) => setItemsText(e.target.value)} rows={4}
                    placeholder="Mis: Produk A 25 kg 100 sak, Produk B 2 ton, butuh delivery pekan depan..." />
                </Field>
              ) : (
                <div className="grid gap-2">
                  {items.map((it, idx) => (
                    <div key={it.id} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-border bg-muted/20 p-2">
                      <Field label="Item" className="col-span-12 md:col-span-4">
                        <Input value={it.itemName} onChange={(e) => updateItem(idx, 'itemName', e.target.value)}
                          placeholder="Nama produk/jasa" />
                      </Field>
                      <Field label="Qty" className="col-span-4 md:col-span-2">
                        <NumberInput value={it.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                          className="h-10 text-right tabular-nums md:h-9" />
                      </Field>
                      <Field label="Unit" className="col-span-4 md:col-span-2">
                        {(control) => (
                          <Select value={it.unit} onValueChange={(v) => updateItem(idx, 'unit', v)}>
                            <SelectTrigger {...control}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </Field>
                      <Field label="Est. Harga" className="col-span-4 md:col-span-3">
                        <NumberInput value={it.estimatedPrice} onChange={(e) => updateItem(idx, 'estimatedPrice', e.target.value)}
                          placeholder="0" className="h-10 text-right tabular-nums md:h-9" />
                      </Field>
                      <div className="col-span-12 flex justify-end md:col-span-1">
                        {items.length > 1 && (
                          <Button type="button" variant="ghost" size="icon-touch"
                            className="text-danger-text md:size-9"
                            onClick={() => setItems(items.filter((_, i) => i !== idx))}
                            aria-label={`Hapus baris item ${idx + 1}`}>
                            <Trash2 aria-hidden />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="ghost" size="sm" className="justify-self-start"
                    onClick={() => setItems([...items, newRow()])}>
                    <Plus aria-hidden /> Tambah baris
                  </Button>
                </div>
              )}
            </div>

            <Field label="Catatan Internal">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                placeholder="Sumber referral, batas budget, dll..." />
            </Field>

            <FormError message={formError} />
          </OverlayBody>

          <OverlayFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>Batal</Button>
            <Button type="submit" disabled={!prospectName.trim()} loading={mutation.isPending}>
              {mutation.isPending ? 'Menyimpan…' : isEdit ? 'Simpan Perubahan' : 'Simpan Inquiry'}
            </Button>
          </OverlayFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default InquiryModal;
