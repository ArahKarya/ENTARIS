import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Receipt } from 'lucide-react';
import api from '../../lib/api';
import { can, cap } from '../../lib/permissions';
import { cn } from '../../lib/utils';
import { ConfirmDialog, EmptyState, Field, LoadingState, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { SettingsCard } from '../../components/settings/SettingsCard';

interface TaxConfig {
  id: string;
  name: string;
  rate: number;
  type: string;
  accountId: string | null;
  isActive: boolean;
}

interface TaxForm { name: string; rate: string; type: string; accountId: string }
type TaxErrors = Partial<Record<'name' | 'rate', string>>;

const EMPTY_FORM: TaxForm = { name: '', rate: '', type: 'sales', accountId: '' };

const TYPE_META: Record<string, { label: string; option: string; variant: BadgeProps['variant'] }> = {
  sales: { label: 'Penjualan', option: 'Penjualan (PPN Keluaran)', variant: 'info' },
  purchase: { label: 'Pembelian', option: 'Pembelian (PPN Masukan)', variant: 'warning' },
  withholding: { label: 'Pemotongan', option: 'Pemotongan (PPh)', variant: 'primary' },
};

function validate(f: TaxForm): TaxErrors {
  const errors: TaxErrors = {};
  if (!f.name.trim()) errors.name = 'Nama pajak wajib diisi.';
  const rate = parseFloat(f.rate);
  if (f.rate.trim() === '' || Number.isNaN(rate)) errors.rate = 'Tarif wajib diisi.';
  else if (rate < 0 || rate > 100) errors.rate = 'Tarif harus antara 0 dan 100.';
  return errors;
}

export const TaxConfigTab: React.FC = () => {
  const queryClient = useQueryClient();
  const canEdit = can('settings', 'edit');
  const canDelete = canEdit && cap('doc.cancel');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<TaxForm>(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TaxConfig | null>(null);

  const { data: configs, isLoading } = useQuery<TaxConfig[]>({
    queryKey: ['tax-configs'],
    queryFn: async () => { const res = await api.get('/tax/config'); return res.data; },
  });

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditingId(null);
    setSubmitted(false);
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => api.post('/tax/config', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-configs'] });
      setIsModalOpen(false);
      resetForm();
      toast.success('Konfigurasi pajak berhasil dibuat.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal membuat konfigurasi pajak.'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => api.put(`/tax/config/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-configs'] });
      setIsModalOpen(false);
      resetForm();
      toast.success('Konfigurasi pajak berhasil diperbarui.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal memperbarui konfigurasi pajak.'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/tax/config/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-configs'] });
      toast.success('Konfigurasi pajak dinonaktifkan.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal menghapus konfigurasi pajak.'),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/tax/config/${id}`, { isActive }),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['tax-configs'] });
      toast.success(vars.isActive ? 'Pajak diaktifkan.' : 'Pajak dinonaktifkan.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal mengubah status.'),
  });

  const handleEdit = (config: TaxConfig) => {
    setEditingId(config.id);
    setSubmitted(false);
    setFormData({ name: config.name, rate: String(config.rate), type: config.type, accountId: config.accountId || '' });
    setIsModalOpen(true);
  };

  const handleSubmit = () => {
    setSubmitted(true);
    if (Object.keys(validate(formData)).length > 0) return;
    const data = {
      name: formData.name,
      rate: parseFloat(formData.rate),
      type: formData.type,
      accountId: formData.accountId || null,
    };
    if (editingId) updateMutation.mutate({ id: editingId, data });
    else createMutation.mutate(data);
  };

  const saving = createMutation.isPending || updateMutation.isPending;
  const errors = submitted ? validate(formData) : {};

  return (
    <div className="space-y-5">
      <SettingsCard
        title="Konfigurasi Pajak"
        description="Pajak nonaktif tidak muncul sebagai pilihan di transaksi baru."
        actions={canEdit && (
          <Button onClick={() => { resetForm(); setIsModalOpen(true); }}>
            <Plus aria-hidden /> Tambah Pajak
          </Button>
        )}
        contentClassName="px-0 pb-0"
      >
        {isLoading ? (
          <LoadingState className="pb-5" />
        ) : !configs || configs.length === 0 ? (
          <EmptyState compact icon={Receipt} title="Belum ada konfigurasi pajak" className="pb-5" />
        ) : (
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard focusable (axe scrollable-region-focusable)
          <div className="relative overflow-x-auto border-t border-border" role="region" aria-label="Tabel konfigurasi pajak" tabIndex={0}>
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-2.5 text-left font-medium">Nama Pajak</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Tarif</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Tipe</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Status</th>
                  {canEdit && <th scope="col" className="px-5 py-2.5 text-right font-medium"><span className="sr-only">Aksi</span></th>}
                </tr>
              </thead>
              <tbody>
                {configs.map((config) => {
                  const meta = TYPE_META[config.type];
                  return (
                    <tr key={config.id} className="border-t border-border">
                      <td className={cn('px-5 py-2.5 font-medium text-foreground', !config.isActive && 'text-muted-foreground')}>{config.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{Number(config.rate).toFixed(2)}%</td>
                      <td className="px-3 py-2.5">
                        <Badge variant={meta?.variant ?? 'neutral'}>{meta?.label ?? config.type}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        {canEdit ? (
                          <span className="inline-flex items-center gap-2">
                            <Switch
                              checked={config.isActive}
                              disabled={toggleMutation.isPending}
                              onCheckedChange={(v) => toggleMutation.mutate({ id: config.id, isActive: v })}
                              aria-label={`${config.isActive ? 'Nonaktifkan' : 'Aktifkan'} ${config.name}`}
                            />
                            <StatusBadge status={config.isActive ? 'active' : 'inactive'} dot={false} />
                          </span>
                        ) : (
                          <StatusBadge status={config.isActive ? 'active' : 'inactive'} />
                        )}
                      </td>
                      {canEdit && (
                        <td className="px-5 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(config)} aria-label={`Ubah ${config.name}`}>
                              <Pencil aria-hidden />
                            </Button>
                            {canDelete && (
                              <Button variant="ghost" size="icon-sm" onClick={() => setConfirmDelete(config)} aria-label={`Nonaktifkan ${config.name}`}>
                                <Trash2 className="text-danger-text" aria-hidden />
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SettingsCard>

      <Dialog open={isModalOpen} onOpenChange={(o) => { if (!saving) { setIsModalOpen(o); if (!o) resetForm(); } }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Ubah Konfigurasi Pajak' : 'Tambah Konfigurasi Pajak'}</DialogTitle>
            <DialogDescription>Tarif dalam persen, mis. 11 untuk PPN 11%.</DialogDescription>
          </DialogHeader>
          <form id="tax-form" noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
            <Field label="Nama pajak" required error={errors.name}>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder='Contoh: "PPN 11%", "PPh 23"'
                // eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves to the first field when the dialog/inline editor opens
                autoFocus
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Tarif (%)" required error={errors.rate}>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.rate}
                  onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                  placeholder="11.00"
                />
              </Field>
              <Field label="Tipe" required>
                {(control) => (
                  <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                    <SelectTrigger {...control}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_META).map(([value, m]) => (
                        <SelectItem key={value} value={value}>{m.option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsModalOpen(false); resetForm(); }} disabled={saving}>Batal</Button>
            <Button type="submit" form="tax-form" loading={saving}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        tone="danger"
        title={`Nonaktifkan ${confirmDelete?.name ?? 'pajak'}?`}
        description="Konfigurasi pajak ini tidak akan bisa dipilih di transaksi baru. Transaksi lama tidak berubah."
        confirmLabel="Nonaktifkan"
        loading={deleteMutation.isPending}
        onConfirm={() => (confirmDelete ? deleteMutation.mutateAsync(confirmDelete.id) : undefined)}
      />
    </div>
  );
};
