/**
 * Pengaturan → Jenis Pengajuan: master data for Pengajuan Pembayaran types
 * (reimbursement, pembayaran vendor, uang muka, perjalanan dinas, …).
 * Writes need settings edit (server: requireWrite('settings')).
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandCoins, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { can } from '@/lib/permissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog, EmptyState, Field, LoadingState, StatusBadge } from '@/components/shared';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { AccountPicker, type AccountOption } from '@/components/fixed-assets/AccountPicker';
import { apiError } from '@/components/fixed-assets/errors';
import { KIND_LABEL, type PaymentRequestType, type PrKind } from '@/components/payment-requests/payment-request';

interface TypeForm {
  code: string;
  name: string;
  kind: PrKind;
  description: string;
  defaultExpenseAccountId: string;
  requiresAttachment: boolean;
  requiresSettlement: boolean;
  isActive: boolean;
  sortOrder: number;
}

const EMPTY: TypeForm = {
  code: '',
  name: '',
  kind: 'OTHER',
  description: '',
  defaultExpenseAccountId: '',
  requiresAttachment: false,
  requiresSettlement: false,
  isActive: true,
  sortOrder: 100,
};

const QK = ['payment-request-types'];

export function PaymentRequestTypesTab() {
  const qc = useQueryClient();
  const canEdit = can('settings', 'edit');
  const [editing, setEditing] = useState<PaymentRequestType | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TypeForm>(EMPTY);
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState<PaymentRequestType | null>(null);

  const typesQuery = useQuery({
    queryKey: [...QK, 'all'],
    queryFn: async () => (await api.get<PaymentRequestType[]>('/payment-request-types', { params: { all: 1 } })).data,
  });
  const accountsQuery = useQuery({
    queryKey: ['all-accounts-flat'],
    queryFn: async () => {
      const res = await api.get<Array<AccountOption & { isGroup?: boolean; accountType?: string }> | { data: Array<AccountOption & { isGroup?: boolean; accountType?: string }> }>('/coa/flat');
      const all = Array.isArray(res.data) ? res.data : res.data.data;
      return all.filter((a) => !a.isGroup);
    },
    enabled: open,
  });
  const expenseAccounts = useMemo(() => (accountsQuery.data ?? []).filter((a) => a.accountType === 'EXPENSE'), [accountsQuery.data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        defaultExpenseAccountId: form.defaultExpenseAccountId || null,
      };
      return editing ? api.put(`/payment-request-types/${editing.id}`, body) : api.post('/payment-request-types', body);
    },
    onSuccess: () => {
      toast.success('Jenis pengajuan disimpan.');
      setOpen(false);
      invalidate();
    },
    onError: (e) => setError(apiError(e, 'Gagal menyimpan jenis pengajuan.')),
  });

  const toggle = useMutation({
    mutationFn: (t: PaymentRequestType) =>
      api.put(`/payment-request-types/${t.id}`, {
        code: t.code,
        name: t.name,
        kind: t.kind,
        description: t.description,
        defaultExpenseAccountId: t.defaultExpenseAccountId,
        requiresAttachment: t.requiresAttachment,
        requiresSettlement: t.requiresSettlement,
        isActive: !t.isActive,
        sortOrder: t.sortOrder,
      }),
    onSuccess: invalidate,
    onError: (e) => toast.error(apiError(e, 'Gagal mengubah status.')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/payment-request-types/${id}`),
    onSuccess: () => {
      toast.success('Jenis pengajuan dihapus.');
      invalidate();
    },
    onError: (e) => toast.error(apiError(e, 'Gagal menghapus jenis pengajuan.')),
  });

  const openForm = (t: PaymentRequestType | null) => {
    setEditing(t);
    setError('');
    setForm(
      t
        ? {
            code: t.code,
            name: t.name,
            kind: t.kind,
            description: t.description ?? '',
            defaultExpenseAccountId: t.defaultExpenseAccountId ?? '',
            requiresAttachment: t.requiresAttachment,
            requiresSettlement: t.requiresSettlement,
            isActive: t.isActive,
            sortOrder: t.sortOrder,
          }
        : EMPTY,
    );
    setOpen(true);
  };

  const submit = () => {
    setError('');
    if (!/^[A-Za-z0-9_-]{2,20}$/.test(form.code.trim())) return setError('Kode 2–20 karakter: huruf, angka, _ atau -.');
    if (form.name.trim().length < 2) return setError('Nama minimal 2 karakter.');
    save.mutate();
  };

  const set = <K extends keyof TypeForm>(k: K, v: TypeForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const types = typesQuery.data ?? [];

  return (
    <div className="space-y-5">
      <SettingsCard
        title="Jenis Pengajuan Pembayaran"
        description="Jenis yang bisa dipilih karyawan saat membuat Pengajuan Pembayaran. Jenis yang sudah dipakai cukup dinonaktifkan."
        actions={
          canEdit && (
            <Button onClick={() => openForm(null)}>
              <Plus aria-hidden /> Tambah Jenis
            </Button>
          )
        }
        contentClassName="px-0 pb-0"
      >
        {typesQuery.isLoading ? (
          <LoadingState className="pb-5" />
        ) : types.length === 0 ? (
          <EmptyState compact icon={HandCoins} title="Belum ada jenis pengajuan" className="pb-5" />
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {types.map((t) => (
              <li key={t.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium text-foreground">
                    {t.name} <span className="font-mono text-xs text-muted-foreground">{t.code}</span>
                  </p>
                  {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="neutral">{KIND_LABEL[t.kind]}</Badge>
                    {t.requiresAttachment && <Badge variant="info">Wajib lampiran</Badge>}
                    {t.requiresSettlement && <Badge variant="warning">Wajib pertanggungjawaban</Badge>}
                    {t.defaultExpenseAccount && (
                      <Badge variant="neutral">
                        Akun {t.defaultExpenseAccount.accountNumber}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canEdit ? (
                    <Switch
                      checked={t.isActive}
                      disabled={toggle.isPending}
                      onCheckedChange={() => toggle.mutate(t)}
                      aria-label={`${t.isActive ? 'Nonaktifkan' : 'Aktifkan'} ${t.name}`}
                    />
                  ) : null}
                  <StatusBadge status={t.isActive ? 'active' : 'inactive'} dot={false} />
                  {canEdit && (
                    <>
                      <Button variant="ghost" size="icon-sm" onClick={() => openForm(t)} aria-label={`Ubah ${t.name}`}>
                        <Pencil aria-hidden />
                      </Button>
                      {(t._count?.requests ?? 0) === 0 && (
                        <Button variant="ghost" size="icon-sm" onClick={() => setToDelete(t)} aria-label={`Hapus ${t.name}`}>
                          <Trash2 className="text-danger-text" aria-hidden />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <Dialog open={open} onOpenChange={(o) => !save.isPending && setOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Ubah ${editing.name}` : 'Tambah Jenis Pengajuan'}</DialogTitle>
            <DialogDescription>Jenis menentukan perlakuan akuntansi saat dibayar dan syarat lampiran.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kode" required>
              <Input maxLength={20} className="font-mono uppercase" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} />
            </Field>
            <Field label="Nama" required>
              <Input maxLength={100} value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Perlakuan" required hint="Uang muka & perjalanan dinas dicatat ke Uang Muka Karyawan." className="sm:col-span-2">
              {(control) => (
                <Select value={form.kind} onValueChange={(v) => set('kind', v as PrKind)}>
                  <SelectTrigger {...control}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(KIND_LABEL) as PrKind[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {KIND_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label="Keterangan" className="sm:col-span-2">
              <Textarea rows={2} maxLength={500} value={form.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
            <AccountPicker
              label="Akun biaya default"
              hint="Opsional. Terisi otomatis di rincian, bisa diubah Keuangan."
              value={form.defaultExpenseAccountId}
              onChange={(v) => set('defaultExpenseAccountId', v)}
              accounts={expenseAccounts}
              loading={accountsQuery.isLoading}
              className="sm:col-span-2"
            />
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Switch id="prt-requiresAttachment" checked={form.requiresAttachment} onCheckedChange={(v) => set('requiresAttachment', v)} />
              <label htmlFor="prt-requiresAttachment">Wajib lampiran</label>
            </div>
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Switch id="prt-requiresSettlement" checked={form.requiresSettlement} onCheckedChange={(v) => set('requiresSettlement', v)} />
              <label htmlFor="prt-requiresSettlement">Wajib pertanggungjawaban</label>
            </div>
            <Field label="Urutan">
              <Input type="number" min={0} max={9999} value={form.sortOrder} onChange={(e) => set('sortOrder', Number(e.target.value) || 0)} />
            </Field>
            <div className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
              <Switch id="prt-isActive" checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} />
              <label htmlFor="prt-isActive">Aktif</label>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
              Batal
            </Button>
            <Button onClick={submit} loading={save.isPending}>
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Hapus ${toDelete?.name ?? ''}?`}
        description="Jenis yang belum pernah dipakai akan dihapus permanen."
        tone="danger"
        confirmLabel="Hapus"
        loading={remove.isPending}
        onConfirm={async () => {
          if (toDelete) await remove.mutateAsync(toDelete.id);
          setToDelete(null);
        }}
      />
    </div>
  );
}
