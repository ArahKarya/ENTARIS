import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Loader2, AlertCircle, AlertTriangle, Building2, Phone, Mail, MapPin, CreditCard } from 'lucide-react';
import { cn } from '../lib/utils';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(h);
  }, [value, delay]);
  return debounced;
}

interface SimilarParty {
  id: string;
  name: string;
  partyType: 'Customer' | 'Supplier' | 'Both';
  phone: string | null;
  isActive: boolean;
  similarity: number;
}

type PartyType = 'Customer' | 'Supplier' | 'Both';

interface PartyFormData {
  name: string;
  partyType: PartyType;
  phone: string;
  email: string;
  address: string;
  npwp: string;
  website: string;
  contactPerson: string;
}

const defaultForm = (): PartyFormData => ({
  name: '', partyType: 'Customer', phone: '', email: '',
  address: '', npwp: '', website: '', contactPerson: ''
});

interface PartyFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pass party data to enable edit mode */
  editParty?: any | null;
}

const PartyFormModal: React.FC<PartyFormModalProps> = ({ isOpen, onClose, editParty }) => {
  const [form, setForm] = useState<PartyFormData>(defaultForm());
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const isEdit = !!editParty;

  // Pre-fill form when editing
  useEffect(() => {
    if (isOpen && editParty) {
      setForm({
        name: editParty.name || '',
        partyType: editParty.partyType || 'Customer',
        phone: editParty.phone || '',
        email: editParty.email || '',
        address: editParty.address || '',
        npwp: editParty.taxId || '',
        website: '',
        contactPerson: '',
      });
      setError('');
    } else if (isOpen) {
      setForm(defaultForm());
      setError('');
    }
  }, [isOpen, editParty]);

  const set = (field: keyof PartyFormData, val: string) =>
    setForm(prev => ({ ...prev, [field]: val }));

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['parties'] });
    queryClient.invalidateQueries({ queryKey: ['parties-customers'] });
    queryClient.invalidateQueries({ queryKey: ['parties-suppliers'] });
    queryClient.invalidateQueries({ queryKey: ['parties-all'] });
  };

  const mutation = useMutation({
    mutationFn: (data: any) =>
      isEdit ? api.put(`/parties/${editParty.id}`, data) : api.post('/parties', data),
    onSuccess: () => {
      invalidateAll();
      setForm(defaultForm());
      setError('');
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal menyimpan data mitra.')
  });

  const handleSubmit = () => {
    if (!form.name.trim()) { setError('Nama mitra wajib diisi.'); return; }
    const { npwp, website: _w, contactPerson: _cp, ...rest } = form;
    mutation.mutate({ ...rest, taxId: npwp || undefined });
  };

  // Duplicate detection — fetch similar parties when typing name (only on create)
  const debouncedName = useDebounce(form.name.trim(), 400);
  const { data: similarParties } = useQuery<SimilarParty[]>({
    queryKey: ['parties-similar', debouncedName, form.partyType],
    queryFn: async () => {
      const res = await api.get('/parties/similar', {
        params: { name: debouncedName, type: form.partyType },
      });
      return res.data.data ?? [];
    },
    enabled: !isEdit && isOpen && debouncedName.length >= 2,
  });
  const hasDuplicateWarning = !isEdit && (similarParties?.length ?? 0) > 0;

  if (!isOpen) return null;

  const inputCls = 'w-full border border-gray-200 rounded-lg py-2 pl-9 pr-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400';
  const iconCls = 'absolute left-3 top-1/2 -translate-y-1/2 text-gray-300';

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="party-modal-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onKeyDown={(e: React.KeyboardEvent) => e.key === "Escape" && onClose()}>
      <div className="rounded-xl w-full max-w-[calc(100vw-1rem)] sm:max-w-md lg:max-w-2xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden" style={{ backgroundColor: 'var(--color-bg-primary)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 id="party-modal-title" className="text-base font-semibold text-gray-900">
              {isEdit ? 'Edit Mitra' : 'Tambah Mitra Baru'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {isEdit ? `Mengubah data ${editParty.name}` : 'Pelanggan, vendor, atau keduanya'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Tipe Mitra */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Tipe Mitra</p>
            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              {(['Customer', 'Supplier', 'Both'] as PartyType[]).map(type => (
                <button
                  key={type}
                  onClick={() => set('partyType', type)}
                  className={cn(
                    'flex-1 py-2.5 text-xs font-semibold transition-colors',
                    form.partyType === type
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-50'
                  )}
                >
                  {type === 'Customer' ? 'Pelanggan' : type === 'Supplier' ? 'Vendor / Supplier' : 'Keduanya'}
                </button>
              ))}
            </div>
          </div>

          {/* Identitas */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Identitas</p>
            <div className="space-y-3">
              {/* Nama */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nama / Perusahaan <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Building2 size={14} className={iconCls} />
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                    placeholder="PT Maju Bersama / Budi Santoso"
                    className={inputCls}
                  />
                </div>
                {hasDuplicateWarning && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-amber-800">Nama mirip sudah ada</p>
                        <p className="text-xs text-amber-700 mt-0.5">Periksa apakah salah satu di bawah ini adalah mitra yang Anda maksud:</p>
                        <div className="mt-2 space-y-1">
                          {similarParties!.map((sp) => (
                            <div key={sp.id} className="flex items-center justify-between bg-white rounded-md px-2 py-1.5 border border-amber-200">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-gray-900 truncate">{sp.name}</p>
                                <p className="text-[10px] text-gray-500">
                                  {sp.partyType === 'Customer' ? 'Pelanggan' : sp.partyType === 'Supplier' ? 'Vendor' : 'Pelanggan & Vendor'}
                                  {sp.phone ? ` • ${sp.phone}` : ''}
                                  {!sp.isActive ? ' • (Non-aktif)' : ''}
                                </p>
                              </div>
                              <span className="text-[10px] text-amber-600 font-semibold ml-2">
                                {Math.round(sp.similarity * 100)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* NPWP */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">NPWP</label>
                <div className="relative">
                  <CreditCard size={14} className={iconCls} />
                  <input
                    type="text"
                    value={form.npwp}
                    onChange={e => set('npwp', e.target.value)}
                    placeholder="00.000.000.0-000.000"
                    className={inputCls}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Kontak */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Kontak</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Telepon / WhatsApp</label>
                <div className="relative">
                  <Phone size={14} className={iconCls} />
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                    placeholder="08xx-xxxx-xxxx"
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <div className="relative">
                  <Mail size={14} className={iconCls} />
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    placeholder="email@perusahaan.com"
                    className={inputCls}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Alamat */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Alamat</p>
            <div className="relative">
              <MapPin size={14} className="absolute left-3 top-3 text-gray-300" />
              <textarea
                value={form.address}
                onChange={e => set('address', e.target.value)}
                placeholder="Jl. Sudirman No. 1, Kelurahan ..., Kota ..., Provinsi ..."
                rows={3}
                className="w-full border border-gray-200 rounded-lg py-2 pl-9 pr-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-400"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={15} /> <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {form.partyType === 'Customer' ? 'Pelanggan' : form.partyType === 'Supplier' ? 'Vendor' : 'Pelanggan & Vendor'}
            {form.name ? ` — ${form.name}` : ''}
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary">Batal</button>
            <button
              onClick={handleSubmit}
              disabled={!form.name.trim() || mutation.isPending}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : isEdit ? 'Simpan Perubahan' : 'Simpan Mitra'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartyFormModal;
