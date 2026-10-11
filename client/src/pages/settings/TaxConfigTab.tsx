import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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

type TaxType = 'sales' | 'purchase' | 'withholding';

/** Labels live in `settings:tax.types.<type>`; translated at render time. */
const TYPE_VARIANT: Record<TaxType, BadgeProps['variant']> = {
  sales: 'info',
  purchase: 'warning',
  withholding: 'primary',
};
const TAX_TYPES = Object.keys(TYPE_VARIANT) as TaxType[];
const isTaxType = (v: string): v is TaxType => v in TYPE_VARIANT;

function validate(f: TaxForm, t: TFunction<'settings'>): TaxErrors {
  const errors: TaxErrors = {};
  if (!f.name.trim()) errors.name = t('tax.errors.nameRequired');
  const rate = parseFloat(f.rate);
  if (f.rate.trim() === '' || Number.isNaN(rate)) errors.rate = t('tax.errors.rateRequired');
  else if (rate < 0 || rate > 100) errors.rate = t('tax.errors.rateRange');
  return errors;
}

export const TaxConfigTab: React.FC = () => {
  const { t } = useTranslation('settings');
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
      toast.success(t('tax.toast.created'));
    },
    onError: (error: any) => toast.error(error.response?.data?.error || t('tax.toast.createError')),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => api.put(`/tax/config/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-configs'] });
      setIsModalOpen(false);
      resetForm();
      toast.success(t('tax.toast.updated'));
    },
    onError: (error: any) => toast.error(error.response?.data?.error || t('tax.toast.updateError')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/tax/config/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-configs'] });
      toast.success(t('tax.toast.deactivated'));
    },
    onError: (error: any) => toast.error(error.response?.data?.error || t('tax.toast.deleteError')),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/tax/config/${id}`, { isActive }),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['tax-configs'] });
      toast.success(vars.isActive ? t('tax.toast.enabled') : t('tax.toast.disabled'));
    },
    onError: (error: any) => toast.error(error.response?.data?.error || t('tax.toast.toggleError')),
  });

  const handleEdit = (config: TaxConfig) => {
    setEditingId(config.id);
    setSubmitted(false);
    setFormData({ name: config.name, rate: String(config.rate), type: config.type, accountId: config.accountId || '' });
    setIsModalOpen(true);
  };

  const handleSubmit = () => {
    setSubmitted(true);
    if (Object.keys(validate(formData, t)).length > 0) return;
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
  const errors = submitted ? validate(formData, t) : {};

  return (
    <div className="space-y-5">
      <SettingsCard
        title={t('tax.title')}
        description={t('tax.description')}
        actions={canEdit && (
          <Button onClick={() => { resetForm(); setIsModalOpen(true); }}>
            <Plus aria-hidden /> {t('tax.add')}
          </Button>
        )}
        contentClassName="px-0 pb-0"
      >
        {isLoading ? (
          <LoadingState className="pb-5" label={t('tax.loading')} />
        ) : !configs || configs.length === 0 ? (
          <EmptyState compact icon={Receipt} title={t('tax.empty')} className="pb-5" />
        ) : (
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard focusable (axe scrollable-region-focusable)
          <div className="relative overflow-x-auto border-t border-border" role="region" aria-label={t('tax.table.label')} tabIndex={0}>
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-2.5 text-left font-medium">{t('tax.table.name')}</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">{t('tax.table.rate')}</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">{t('tax.table.type')}</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">{t('tax.table.status')}</th>
                  {canEdit && <th scope="col" className="px-5 py-2.5 text-right font-medium"><span className="sr-only">{t('tax.table.actions')}</span></th>}
                </tr>
              </thead>
              <tbody>
                {configs.map((config) => {
                  const knownType = isTaxType(config.type) ? config.type : null;
                  return (
                    <tr key={config.id} className="border-t border-border">
                      <td className={cn('px-5 py-2.5 font-medium text-foreground', !config.isActive && 'text-muted-foreground')}>{config.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{Number(config.rate).toFixed(2)}%</td>
                      <td className="px-3 py-2.5">
                        <Badge variant={knownType ? TYPE_VARIANT[knownType] : 'neutral'}>{knownType ? t(`tax.types.${knownType}.label`) : config.type}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        {canEdit ? (
                          <span className="inline-flex items-center gap-2">
                            <Switch
                              checked={config.isActive}
                              disabled={toggleMutation.isPending}
                              onCheckedChange={(v) => toggleMutation.mutate({ id: config.id, isActive: v })}
                              aria-label={config.isActive ? t('tax.deactivate', { name: config.name }) : t('tax.activate', { name: config.name })}
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
                            <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(config)} aria-label={t('tax.edit', { name: config.name })}>
                              <Pencil aria-hidden />
                            </Button>
                            {canDelete && (
                              <Button variant="ghost" size="icon-sm" onClick={() => setConfirmDelete(config)} aria-label={t('tax.deactivate', { name: config.name })}>
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
            <DialogTitle>{editingId ? t('tax.form.editTitle') : t('tax.form.addTitle')}</DialogTitle>
            <DialogDescription>{t('tax.form.description')}</DialogDescription>
          </DialogHeader>
          <form id="tax-form" noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
            <Field label={t('tax.form.name')} required error={errors.name}>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('tax.form.namePlaceholder')}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves to the first field when the dialog/inline editor opens
                autoFocus
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('tax.form.rate')} required error={errors.rate}>
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
              <Field label={t('tax.table.type')} required>
                {(control) => (
                  <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                    <SelectTrigger {...control}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TAX_TYPES.map((value) => (
                        <SelectItem key={value} value={value}>{t(`tax.types.${value}.option`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsModalOpen(false); resetForm(); }} disabled={saving}>{t('tax.form.cancel')}</Button>
            <Button type="submit" form="tax-form" loading={saving}>{t('tax.form.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        tone="danger"
        title={t('tax.deleteConfirm.title', { name: confirmDelete?.name ?? t('tax.deleteConfirm.fallbackName') })}
        description={t('tax.deleteConfirm.description')}
        confirmLabel={t('tax.deleteConfirm.confirm')}
        loading={deleteMutation.isPending}
        onConfirm={() => (confirmDelete ? deleteMutation.mutateAsync(confirmDelete.id) : undefined)}
      />
    </div>
  );
};
