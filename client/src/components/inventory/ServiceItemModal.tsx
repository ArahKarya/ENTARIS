/**
 * Add / edit a service item (layanan). Dialog with a scrollable body and a
 * pinned footer; mounted only while open (the parent owns visibility).
 */
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/shared';
import { PinnedBody, PinnedFooter, PinnedHeader, pinnedDialogClass } from '@/components/overlays/dialog-parts';
import { errorMessage, type ServiceItemRow } from './inventory-rows';

interface ServiceItemModalProps {
  /** null = create. */
  editService: ServiceItemRow | null;
  onClose: () => void;
}

interface RevenueAccount {
  id: string;
  accountNumber: string;
  name: string;
  rootType: string;
  isGroup: boolean;
}

const NO_ACCOUNT = '__none';

const initialForm = (svc: ServiceItemRow | null) =>
  svc
    ? {
        code: svc.code,
        name: svc.name,
        unit: svc.unit || 'Jasa',
        defaultRate: svc.defaultRate ? String(Number(svc.defaultRate)) : '',
        accountId: svc.accountId || svc.account?.id || '',
        description: svc.description || '',
      }
    : { code: '', name: '', unit: 'Jasa', defaultRate: '', accountId: '', description: '' };

export function ServiceItemModal({ editService, onClose }: ServiceItemModalProps) {
  const queryClient = useQueryClient();
  const [serviceForm, setServiceForm] = useState(() => initialForm(editService));
  const [serviceSaving, setServiceSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const { data: revenueAccounts } = useQuery({
    queryKey: ['revenue-accounts'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      const all: RevenueAccount[] = res.data.data ?? res.data;
      return all.filter((a) => a.rootType === 'REVENUE' && !a.isGroup);
    },
  });

  const handleSaveService = async () => {
    if (!serviceForm.code || !serviceForm.name || !serviceForm.accountId) {
      setShowErrors(true);
      toast.error('Kode, nama, dan akun pendapatan wajib diisi.');
      return;
    }
    setServiceSaving(true);
    try {
      const payload = {
        ...serviceForm,
        defaultRate: serviceForm.defaultRate ? Number(serviceForm.defaultRate) : undefined,
      };
      if (editService) {
        await api.patch(`/service-items/${editService.id}`, payload);
        toast.success('Layanan berhasil diubah.');
      } else {
        await api.post('/service-items', payload);
        toast.success('Layanan berhasil ditambahkan.');
      }
      queryClient.invalidateQueries({ queryKey: ['service-items'] });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal menyimpan layanan.'));
    } finally {
      setServiceSaving(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void handleSaveService();
  };
  const required = (v: string) => (showErrors && !v ? 'Wajib diisi.' : undefined);
  const set = (patch: Partial<typeof serviceForm>) => setServiceForm((f) => ({ ...f, ...patch }));

  return (
    <Dialog open onOpenChange={(open) => !open && !serviceSaving && onClose()}>
      <DialogContent size="md" className={pinnedDialogClass}>
        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <PinnedHeader>
            <DialogTitle>{editService ? 'Edit Layanan' : 'Tambah Layanan'}</DialogTitle>
            <DialogDescription>Layanan jasa yang dapat ditagihkan pada faktur penjualan.</DialogDescription>
          </PinnedHeader>
          <PinnedBody className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kode" required error={required(serviceForm.code)}>
                <Input value={serviceForm.code} onChange={(e) => set({ code: e.target.value })} placeholder="JSG-001" />
              </Field>
              <Field label="Satuan">
                <Input value={serviceForm.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="Jasa" />
              </Field>
            </div>
            <Field label="Nama Layanan" required error={required(serviceForm.name)}>
              <Input
                value={serviceForm.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="Jasa Maklon Produksi"
              />
            </Field>
            <Field label="Tarif Default (Rp)">
              <NumberInput
                value={serviceForm.defaultRate}
                onChange={(e) => set({ defaultRate: e.target.value })}
                placeholder="500000"
                inputMode="decimal"
                className="h-10 text-right tabular-nums"
              />
            </Field>
            <Field label="Akun Pendapatan" required error={required(serviceForm.accountId)}>
              {(control) => (
                <Select
                  value={serviceForm.accountId || NO_ACCOUNT}
                  onValueChange={(v) => set({ accountId: v === NO_ACCOUNT ? '' : v })}
                >
                  <SelectTrigger {...control}>
                    <SelectValue placeholder="Pilih akun" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ACCOUNT}>— Pilih Akun —</SelectItem>
                    {revenueAccounts?.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.accountNumber} — {acc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label="Deskripsi">
              <Input
                value={serviceForm.description}
                onChange={(e) => set({ description: e.target.value })}
                placeholder="Opsional"
              />
            </Field>
          </PinnedBody>
          <PinnedFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={serviceSaving}>
              Batal
            </Button>
            <Button type="submit" loading={serviceSaving}>
              {serviceSaving ? 'Menyimpan…' : editService ? 'Simpan Perubahan' : 'Tambah Layanan'}
            </Button>
          </PinnedFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
