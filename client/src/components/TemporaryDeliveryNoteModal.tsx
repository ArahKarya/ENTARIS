import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, Loader2, AlertCircle, Truck } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import SearchableSelect, { type SelectOption } from './SearchableSelect';

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

  const partyOptions = useMemo<SelectOption[]>(
    () => (parties ?? []).map((p: any) => ({ value: p.id, label: p.name })),
    [parties],
  );
  const inventoryOptions = useMemo<SelectOption[]>(
    () => (inventoryItems ?? []).map((i: any) => ({ value: i.id, label: `${i.code} — ${i.name}` })),
    [inventoryItems],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        date, partyId,
        nomorMobil: nomorMobil || null,
        driverName: driverName || null,
        recipientName: recipientName || null,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Truck size={18} className="text-amber-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              {isEdit ? `Ubah ${editNote.number}` : 'Buat Surat Jalan Sementara'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100" aria-label="Tutup"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
            Dokumen sementara: <b>tidak memotong stok, tidak ada jurnal, tidak bisa diinvoice</b>. Tautkan ke surat jalan resmi setelah produksi diinput.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Tanggal</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <div className="text-sm">
              <span className="block text-gray-600 mb-1">Pelanggan</span>
              <SearchableSelect options={partyOptions} value={partyId} onChange={setPartyId} placeholder="Pilih pelanggan" />
            </div>
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">No. Mobil</span>
              <input value={nomorMobil} onChange={(e) => setNomorMobil(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Supir</span>
              <input value={driverName} onChange={(e) => setDriverName(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="block text-gray-600 mb-1">Penerima</span>
              <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Barang</span>
              <button type="button" className="btn-secondary text-xs" onClick={() => setRows((r) => [...r, newRow()])}>
                <Plus size={13} /> Tambah baris
              </button>
            </div>
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-12 sm:col-span-6">
                    <SearchableSelect
                      options={inventoryOptions}
                      value={r.inventoryItemId}
                      onChange={(v) => {
                        const inv = (inventoryItems ?? []).find((i: any) => i.id === v);
                        setRow(r.id, { inventoryItemId: v, unit: inv?.unit || r.unit });
                      }}
                      placeholder="Pilih barang (master item)"
                    />
                  </div>
                  <input
                    type="number" min="0" step="any" value={r.quantity}
                    onChange={(e) => setRow(r.id, { quantity: Number(e.target.value) })}
                    className="col-span-5 sm:col-span-2 border border-gray-200 rounded-lg px-2 py-2 text-sm"
                    aria-label="Qty"
                  />
                  <select
                    value={r.unit} onChange={(e) => setRow(r.id, { unit: e.target.value })}
                    className="col-span-5 sm:col-span-2 border border-gray-200 rounded-lg px-2 py-2 text-sm"
                  >
                    {[...new Set([r.unit, ...UNITS])].map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <button
                    type="button" disabled={rows.length === 1}
                    onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                    className="col-span-2 sm:col-span-2 p-2 text-red-500 hover:bg-red-50 rounded disabled:opacity-30"
                    aria-label="Hapus baris"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <label className="text-sm block">
            <span className="block text-gray-600 mb-1">Catatan</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </label>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />} Simpan
          </button>
        </div>
      </div>
    </div>
  );
};

export default TemporaryDeliveryNoteModal;
