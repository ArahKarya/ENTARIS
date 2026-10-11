/**
 * Pengaturan → Jenis Pengajuan: master data for Pengajuan Pembayaran types
 * (reimbursement, pembayaran vendor, uang muka, perjalanan dinas, …).
 * Writes need settings edit (server: requireWrite('settings')).
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandCoins, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
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
import type { PaymentRequestType, PrKind } from '@/components/payment-requests/payment-request';

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
const KINDS: PrKind[] = ['REIMBURSEMENT', 'VENDOR_PAYMENT', 'CASH_ADVANCE', 'TRAVEL', 'OTHER'];

export function PaymentRequestTypesTab() {
  const { t } = useTranslation('settings');
  const kindLabel = (k: PrKind) => t(`paymentRequestTypes.kinds.${k}`);
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
      toast.success(t('paymentRequestTypes.toast.saved'));
      setOpen(false);
      invalidate();
    },
    onError: (e) => setError(apiError(e, t('paymentRequestTypes.toast.saveError'))),
  });

  const toggle = useMutation({
    mutationFn: (row: PaymentRequestType) =>
      api.put(`/payment-request-types/${row.id}`, {
        code: row.code,
        name: row.name,
        kind: row.kind,
        description: row.description,
        defaultExpenseAccountId: row.defaultExpenseAccountId,
        requiresAttachment: row.requiresAttachment,
        requiresSettlement: row.requiresSettlement,
        isActive: !row.isActive,
        sortOrder: row.sortOrder,
      }),
    onSuccess: invalidate,
    onError: (e) => toast.error(apiError(e, t('paymentRequestTypes.toast.toggleError'))),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/payment-request-types/${id}`),
    onSuccess: () => {
      toast.success(t('paymentRequestTypes.toast.deleted'));
      invalidate();
    },
    onError: (e) => toast.error(apiError(e, t('paymentRequestTypes.toast.deleteError'))),
  });

  const openForm = (row: PaymentRequestType | null) => {
    setEditing(row);
    setError('');
    setForm(
      row
        ? {
            code: row.code,
            name: row.name,
            kind: row.kind,
            description: row.description ?? '',
            defaultExpenseAccountId: row.defaultExpenseAccountId ?? '',
            requiresAttachment: row.requiresAttachment,
            requiresSettlement: row.requiresSettlement,
            isActive: row.isActive,
            sortOrder: row.sortOrder,
          }
        : EMPTY,
    );
    setOpen(true);
  };

  const submit = () => {
    setError('');
    if (!/^[A-Za-z0-9_-]{2,20}$/.test(form.code.trim())) return setError(t('paymentRequestTypes.errors.code'));
    if (form.name.trim().length < 2) return setError(t('paymentRequestTypes.errors.name'));
    save.mutate();
  };

  const set = <K extends keyof TypeForm>(k: K, v: TypeForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const types = typesQuery.data ?? [];

  return (
    <div className="space-y-5">
      <SettingsCard
        title={t('paymentRequestTypes.title')}
        description={t('paymentRequestTypes.description')}
        actions={
          canEdit && (
            <Button onClick={() => openForm(null)}>
              <Plus aria-hidden /> {t('paymentRequestTypes.add')}
            </Button>
          )
        }
        contentClassName="px-0 pb-0"
      >
        {typesQuery.isLoading ? (
          <LoadingState className="pb-5" label={t('paymentRequestTypes.loading')} />
        ) : types.length === 0 ? (
          <EmptyState compact icon={HandCoins} title={t('paymentRequestTypes.empty')} className="pb-5" />
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {types.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium text-foreground">
                    {row.name} <span className="font-mono text-xs text-muted-foreground">{row.code}</span>
                  </p>
                  {row.description && <p className="text-sm text-muted-foreground">{row.description}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="neutral">{kindLabel(row.kind)}</Badge>
                    {row.requiresAttachment && <Badge variant="info">{t('paymentRequestTypes.requiresAttachment')}</Badge>}
                    {row.requiresSettlement && <Badge variant="warning">{t('paymentRequestTypes.requiresSettlement')}</Badge>}
                    {row.defaultExpenseAccount && (
                      <Badge variant="neutral">
                        {t('paymentRequestTypes.account', { number: row.defaultExpenseAccount.accountNumber })}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canEdit ? (
                    <Switch
                      checked={row.isActive}
                      disabled={toggle.isPending}
                      onCheckedChange={() => toggle.mutate(row)}
                      aria-label={row.isActive ? t('paymentRequestTypes.deactivate', { name: row.name }) : t('paymentRequestTypes.activate', { name: row.name })}
                    />
                  ) : null}
                  <StatusBadge status={row.isActive ? 'active' : 'inactive'} dot={false} />
                  {canEdit && (
                    <>
                      <Button variant="ghost" size="icon-sm" onClick={() => openForm(row)} aria-label={t('paymentRequestTypes.edit', { name: row.name })}>
                        <Pencil aria-hidden />
                      </Button>
                      {(row._count?.requests ?? 0) === 0 && (
                        <Button variant="ghost" size="icon-sm" onClick={() => setToDelete(row)} aria-label={t('paymentRequestTypes.delete', { name: row.name })}>
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
            <DialogTitle>{editing ? t('paymentRequestTypes.edit', { name: editing.name }) : t('paymentRequestTypes.form.addTitle')}</DialogTitle>
            <DialogDescription>{t('paymentRequestTypes.form.description')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('paymentRequestTypes.form.code')} required>
              <Input maxLength={20} className="font-mono uppercase" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} />
            </Field>
            <Field label={t('paymentRequestTypes.form.name')} required>
              <Input maxLength={100} value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label={t('paymentRequestTypes.form.kind')} required hint={t('paymentRequestTypes.form.kindHint')} className="sm:col-span-2">
              {(control) => (
                <Select value={form.kind} onValueChange={(v) => set('kind', v as PrKind)}>
                  <SelectTrigger {...control}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {kindLabel(k)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label={t('paymentRequestTypes.form.notes')} className="sm:col-span-2">
              <Textarea rows={2} maxLength={500} value={form.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
            <AccountPicker
              label={t('paymentRequestTypes.form.defaultAccount')}
              hint={t('paymentRequestTypes.form.defaultAccountHint')}
              value={form.defaultExpenseAccountId}
              onChange={(v) => set('defaultExpenseAccountId', v)}
              accounts={expenseAccounts}
              loading={accountsQuery.isLoading}
              className="sm:col-span-2"
            />
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Switch id="prt-requiresAttachment" checked={form.requiresAttachment} onCheckedChange={(v) => set('requiresAttachment', v)} />
              <label htmlFor="prt-requiresAttachment">{t('paymentRequestTypes.requiresAttachment')}</label>
            </div>
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Switch id="prt-requiresSettlement" checked={form.requiresSettlement} onCheckedChange={(v) => set('requiresSettlement', v)} />
              <label htmlFor="prt-requiresSettlement">{t('paymentRequestTypes.requiresSettlement')}</label>
            </div>
            <Field label={t('paymentRequestTypes.form.sortOrder')}>
              <Input type="number" min={0} max={9999} value={form.sortOrder} onChange={(e) => set('sortOrder', Number(e.target.value) || 0)} />
            </Field>
            <div className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
              <Switch id="prt-isActive" checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} />
              <label htmlFor="prt-isActive">{t('paymentRequestTypes.form.active')}</label>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
              {t('paymentRequestTypes.form.cancel')}
            </Button>
            <Button onClick={submit} loading={save.isPending}>
              {t('paymentRequestTypes.form.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t('paymentRequestTypes.deleteConfirm.title', { name: toDelete?.name ?? '' })}
        description={t('paymentRequestTypes.deleteConfirm.description')}
        tone="danger"
        confirmLabel={t('paymentRequestTypes.deleteConfirm.confirm')}
        loading={remove.isPending}
        onConfirm={async () => {
          if (toDelete) await remove.mutateAsync(toDelete.id);
          setToDelete(null);
        }}
      />
    </div>
  );
}
