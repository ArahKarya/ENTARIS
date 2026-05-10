import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Plus, Trash2, Loader2, AlertCircle } from 'lucide-react';
import SearchableSelect, { type SelectOption } from './SearchableSelect';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { toast } from 'sonner';

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

  useBodyScrollLock(isOpen);
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

  const partyOptions = useMemo<SelectOption[]>(
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

  const canSubmit = prospectName.trim().length > 0 && !mutation.isPending;

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

  if (!isOpen) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="inquiry-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Escape' && onClose()}>
      <div className="rounded-xl w-full max-w-[calc(100vw-1rem)] lg:max-w-3xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-primary)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 id="inquiry-modal-title" className="font-semibold text-foreground">
            {isEdit ? `Edit Inquiry ${editTarget?.inquiryNumber ?? ''}` : 'Catat Inquiry Baru'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded" aria-label="Tutup"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Tanggal & Channel */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tanggal</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Channel</label>
              <select value={channel} onChange={(e) => setChannel(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500">
                {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tindak Lanjut (opsional)</label>
              <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Customer / Prospect */}
          <div className="space-y-3 border border-dashed border-border rounded-lg p-3 bg-muted/30">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Pilih dari Pelanggan Existing (opsional)</label>
              <SearchableSelect
                options={partyOptions}
                value={partyId}
                onChange={onPickParty}
                placeholder="Cari pelanggan terdaftar..."
              />
              {!partyId && (
                <p className="text-[11px] text-amber-600 mt-1">
                  Belum dipilih → akan dicatat sebagai prospect baru. Saat konversi ke Penawaran, pelanggan otomatis dibuat.
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nama Prospek/Customer *</label>
                <input type="text" value={prospectName} onChange={(e) => setProspectName(e.target.value)} maxLength={200}
                  placeholder="Mis: Pak Budi / PT Sukses Makmur"
                  className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Telepon</label>
                <input type="text" value={prospectPhone} onChange={(e) => setProspectPhone(e.target.value)}
                  placeholder="08xx-xxxx-xxxx"
                  className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <input type="email" value={prospectEmail} onChange={(e) => setProspectEmail(e.target.value)}
                  placeholder="email@domain.com"
                  className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          {/* Items: hybrid toggle */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Permintaan / Item</label>
              <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
                <button type="button" onClick={() => setItemsMode('freetext')}
                  className={`px-3 py-1 ${itemsMode === 'freetext' ? 'bg-blue-600 text-white' : 'bg-card text-muted-foreground hover:bg-accent'}`}>
                  Free-text
                </button>
                <button type="button" onClick={() => setItemsMode('structured')}
                  className={`px-3 py-1 ${itemsMode === 'structured' ? 'bg-blue-600 text-white' : 'bg-card text-muted-foreground hover:bg-accent'}`}>
                  Terstruktur
                </button>
              </div>
            </div>
            {itemsMode === 'freetext' ? (
              <textarea value={itemsText} onChange={(e) => setItemsText(e.target.value)} rows={4}
                placeholder="Mis: Beras Walemu 5 ton, Beras Cruise 25kg 2 ton, butuh delivery pekan depan..."
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
            ) : (
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={it.id} className="grid grid-cols-12 gap-2 items-end border border-border rounded-lg p-2 bg-card/50">
                    <div className="col-span-12 md:col-span-4">
                      <label className="text-[11px] text-muted-foreground">Item</label>
                      <input type="text" value={it.itemName} onChange={(e) => updateItem(idx, 'itemName', e.target.value)}
                        placeholder="Nama produk/jasa" className="w-full mt-1 px-2 py-1.5 text-xs border border-border rounded bg-card" />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className="text-[11px] text-muted-foreground">Qty</label>
                      <input type="number" value={it.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                        className="w-full mt-1 px-2 py-1.5 text-xs border border-border rounded bg-card" />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className="text-[11px] text-muted-foreground">Unit</label>
                      <select value={it.unit} onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                        className="w-full mt-1 px-2 py-1.5 text-xs border border-border rounded bg-card">
                        {UNITS.map((u) => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="col-span-4 md:col-span-3">
                      <label className="text-[11px] text-muted-foreground">Est. Harga</label>
                      <input type="number" value={it.estimatedPrice} onChange={(e) => updateItem(idx, 'estimatedPrice', e.target.value)}
                        placeholder="0" className="w-full mt-1 px-2 py-1.5 text-xs border border-border rounded bg-card" />
                    </div>
                    <div className="col-span-12 md:col-span-1 flex justify-end">
                      {items.length > 1 && (
                        <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))}
                          className="p-1 text-red-500 hover:bg-red-50 rounded" aria-label="Hapus baris">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setItems([...items, newRow()])}
                  className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
                  <Plus size={12} /> Tambah baris
                </button>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Catatan Internal</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Sumber referral, batas budget, dll..."
              className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-muted/30">
          <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
          <button type="button" onClick={handleSubmit} disabled={!canSubmit}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? 'Simpan Perubahan' : 'Simpan Inquiry'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InquiryModal;
