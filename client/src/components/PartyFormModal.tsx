import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { AlertTriangle, Building2, Phone, Mail, MapPin, CreditCard } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/shared';
import { FormError, OverlayBody, OverlayFooter, OverlayHeader } from './sales/dialog-parts-b';
import { dialogShellClass } from './sales/dialog-classes-b';

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
  isWapu: boolean;
}

const defaultForm = (): PartyFormData => ({
  name: '', partyType: 'Customer', phone: '', email: '',
  address: '', npwp: '', website: '', contactPerson: '', isWapu: false,
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
        isWapu: !!editParty.isWapu,
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
    mutation.mutate({ ...rest, taxId: npwp || undefined, isWapu: form.isWapu });
  };

  const setBool = (field: 'isWapu', val: boolean) => setForm(prev => ({ ...prev, [field]: val }));

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

  const nameError = error === 'Nama mitra wajib diisi.' ? error : undefined;
  const formError = nameError ? '' : error;
  const typeLabel = form.partyType === 'Customer' ? 'Pelanggan' : form.partyType === 'Supplier' ? 'Vendor' : 'Pelanggan & Vendor';
  const iconCls = 'pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground';
  const inputCls = 'pl-9';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent size="lg" className={dialogShellClass}>
        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); if (form.name.trim() && !mutation.isPending) handleSubmit(); }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <OverlayHeader>
            <DialogTitle>{isEdit ? 'Edit Mitra' : 'Tambah Mitra Baru'}</DialogTitle>
            <DialogDescription>
              {isEdit ? `Mengubah data ${editParty.name}` : 'Pelanggan, vendor, atau keduanya'}
            </DialogDescription>
          </OverlayHeader>

          <OverlayBody className="gap-6">
            <div role="radiogroup" aria-labelledby="party-type-label" className="grid gap-2">
              <span id="party-type-label" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Tipe Mitra</span>
              <div className="flex overflow-hidden rounded-lg border border-border">
                {(['Customer', 'Supplier', 'Both'] as PartyType[]).map(type => (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={form.partyType === type}
                    onClick={() => set('partyType', type)}
                    className={cn(
                      'min-h-11 flex-1 px-2 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-10',
                      form.partyType === type
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {type === 'Customer' ? 'Pelanggan' : type === 'Supplier' ? 'Vendor / Supplier' : 'Keduanya'}
                  </button>
                ))}
              </div>
            </div>

            <section aria-labelledby="party-identity" className="grid gap-3">
              <h3 id="party-identity" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Identitas</h3>
              <Field
                label="Nama / Perusahaan"
                required
                error={nameError}
              >
                {(control) => (
                  <div className="relative">
                  <Building2 className={iconCls} aria-hidden />
                  <Input {...control} value={form.name} onChange={e => set('name', e.target.value)}
                    placeholder="Nama perusahaan atau perorangan" className={inputCls} />
                  </div>
                )}
              </Field>
              {hasDuplicateWarning && (
                <div role="status" className="rounded-lg border border-border bg-warning-subtle p-3 text-warning-text">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">Nama mirip sudah ada</p>
                      <p className="mt-0.5 text-xs">Periksa apakah salah satu di bawah ini adalah mitra yang Anda maksud:</p>
                      <ul className="mt-2 grid gap-1">
                        {similarParties!.map((sp) => (
                          <li key={sp.id} className="flex items-center justify-between rounded-md border border-border bg-card px-2 py-1.5 text-foreground">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium">{sp.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {sp.partyType === 'Customer' ? 'Pelanggan' : sp.partyType === 'Supplier' ? 'Vendor' : 'Pelanggan & Vendor'}
                                {sp.phone ? ` • ${sp.phone}` : ''}
                                {!sp.isActive ? ' • (Non-aktif)' : ''}
                              </p>
                            </div>
                            <span className="ml-2 text-[11px] font-semibold tabular-nums text-warning-text">
                              {Math.round(sp.similarity * 100)}%
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
              <Field label="NPWP">
                {(control) => (
                  <div className="relative">
                  <CreditCard className={iconCls} aria-hidden />
                  <Input {...control} value={form.npwp} onChange={e => set('npwp', e.target.value)}
                    placeholder="00.000.000.0-000.000" className={inputCls} />
                  </div>
                )}
              </Field>
              {/* WAPU: tagihan ke party ini tidak include PPN (BUMN / instansi pemerintah
                  memungut PPN sendiri ke kas negara). Invoice modal auto-set tax_pct=0. */}
              <div className="flex items-start gap-3 rounded-lg border border-border bg-warning-subtle p-3">
                <Checkbox id="party-wapu" checked={form.isWapu}
                  onCheckedChange={(checked) => setBool('isWapu', checked === true)} className="mt-0.5" />
                <div className="grid gap-0.5">
                  <Label htmlFor="party-wapu" className="text-sm font-medium text-warning-text">Wajib Pungut (WAPU)</Label>
                  <p className="text-xs text-warning-text">
                    Customer memungut PPN sendiri ke kas negara (mis. BUMN atau instansi pemerintah).
                    Invoice ke pihak ini akan otomatis di-set tanpa PPN (tax_pct=0).
                  </p>
                </div>
              </div>
            </section>

            <section aria-labelledby="party-contact" className="grid gap-3">
              <h3 id="party-contact" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Kontak</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Telepon / WhatsApp">
                  {(control) => (
                    <div className="relative">
                    <Phone className={iconCls} aria-hidden />
                    <Input {...control} type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                      placeholder="08xx-xxxx-xxxx" className={inputCls} />
                    </div>
                  )}
                </Field>
                <Field label="Email">
                  {(control) => (
                    <div className="relative">
                    <Mail className={iconCls} aria-hidden />
                    <Input {...control} type="email" value={form.email} onChange={e => set('email', e.target.value)}
                      placeholder="email@perusahaan.com" className={inputCls} />
                    </div>
                  )}
                </Field>
              </div>
            </section>

            <section aria-labelledby="party-address" className="grid gap-3">
              <h3 id="party-address" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Alamat</h3>
              <Field label="Alamat" hideLabel>
                {(control) => (
                  <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-3 size-3.5 text-muted-foreground" aria-hidden />
                  <Textarea {...control} value={form.address} onChange={e => set('address', e.target.value)}
                    placeholder="Jl. Sudirman No. 1, Kelurahan ..., Kota ..., Provinsi ..."
                    rows={3} className="resize-none pl-9" />
                  </div>
                )}
              </Field>
            </section>

            <FormError message={formError} />
          </OverlayBody>

          <OverlayFooter className="sm:items-center sm:justify-between">
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              {typeLabel}{form.name ? ` · ${form.name}` : ''}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>Batal</Button>
              <Button type="submit" disabled={!form.name.trim()} loading={mutation.isPending}>
                {mutation.isPending ? 'Menyimpan…' : isEdit ? 'Simpan Perubahan' : 'Simpan Mitra'}
              </Button>
            </div>
          </OverlayFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PartyFormModal;
