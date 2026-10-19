import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NumberInput } from '@/components/ui/number-input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/shared';
import {
  FormError,
  PinnedBody,
  PinnedFooter,
  PinnedHeader,
  pinnedDialogClass,
} from '@/components/overlays/dialog-parts';

interface InventoryItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  editItem: any | null;
}

const defaultForm = {
  code: '',
  name: '',
  unit: '',
  category: '',
  description: '',
  minimumStock: 0,
  accountId: '',
};

const NO_ACCOUNT = '__none';

export function InventoryItemModal({ isOpen, onClose, editItem }: InventoryItemModalProps) {
  const { t } = useTranslation('inventory');
  const [form, setForm] = useState({ ...defaultForm });
  const [error, setError] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const queryClient = useQueryClient();

  // Reset form whenever modal opens or editItem changes
  useEffect(() => {
    if (isOpen) {
      if (editItem) {
        setForm({
          code: editItem.code ?? '',
          name: editItem.name ?? '',
          unit: editItem.unit ?? '',
          category: editItem.category ?? '',
          description: editItem.description ?? '',
          minimumStock: Number(editItem.minimumStock),
          accountId: editItem.accountId ?? '',
        });
      } else {
        setForm({ ...defaultForm });
      }
      setError('');
      setShowErrors(false);
    }
  }, [isOpen, editItem]);

  const { data: coaData } = useQuery({
    queryKey: ['coa-flat'],
    queryFn: () => api.get('/coa/flat').then(r => r.data),
    enabled: isOpen,
  });

  const assetAccounts = (coaData ?? []).filter(
    (a: any) => a.accountType === 'ASSET' && !a.isGroup
  );

  const mutation = useMutation({
    mutationFn: (data: any) =>
      editItem
        ? api.put(`/inventory/items/${editItem.id}`, data)
        : api.post('/inventory/items', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      toast.success(t('inventoryItemModal.toast.saved'));
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || t('inventoryItemModal.toast.saveFailed');
      setError(msg);
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    // Same required fields the native `required` attributes enforced before.
    if (!form.code.trim() || !form.name.trim() || !form.unit.trim()) {
      setShowErrors(true);
      return;
    }
    mutation.mutate({
      code: form.code,
      name: form.name,
      unit: form.unit,
      // null clears the field on edit
      category: form.category.trim() || null,
      description: form.description.trim() || null,
      minimumStock: Number(form.minimumStock),
      accountId: form.accountId || null,
    });
  };

  const required = (v: string) => (showErrors && !v.trim() ? t('inventoryItemModal.errors.required') : undefined);
  const pending = mutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent size="md" className={pinnedDialogClass}>
        <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <PinnedHeader>
            <DialogTitle>{editItem ? t('inventoryItemModal.titleEdit') : t('inventoryItemModal.titleCreate')}</DialogTitle>
            <DialogDescription>{t('inventoryItemModal.description')}</DialogDescription>
          </PinnedHeader>
          <PinnedBody className="grid gap-4">
            <Field label={t('inventoryItemModal.fields.code')} required error={required(form.code)}>
              <Input
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder={t('inventoryItemModal.placeholders.code')}
              />
            </Field>
            <Field label={t('inventoryItemModal.fields.name')} required error={required(form.name)}>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t('inventoryItemModal.placeholders.name')}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('inventoryItemModal.fields.unit')} required error={required(form.unit)}>
                <Input
                  value={form.unit}
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  placeholder={t('inventoryItemModal.placeholders.unit')}
                />
              </Field>
              <Field label={t('inventoryItemModal.fields.category')}>
                <Input
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  placeholder={t('inventoryItemModal.placeholders.category')}
                />
              </Field>
            </div>
            <Field label={t('inventoryItemModal.fields.description')}>
              <Textarea
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder={t('inventoryItemModal.placeholders.description')}
                className="resize-none"
              />
            </Field>
            <Field
              label={t('inventoryItemModal.fields.minimumStock')}
              hint={t('inventoryItemModal.hints.minimumStock')}
            >
              <NumberInput
                min={0}
                value={form.minimumStock}
                onChange={e => setForm(f => ({ ...f, minimumStock: Number(e.target.value) }))}
                className="h-10 text-right tabular-nums"
              />
            </Field>
            <Field
              label={t('inventoryItemModal.fields.account')}
              hint={t('inventoryItemModal.hints.account')}
            >
              {(control) => (
                <Select
                  value={form.accountId || NO_ACCOUNT}
                  onValueChange={v => setForm(f => ({ ...f, accountId: v === NO_ACCOUNT ? '' : v }))}
                >
                  <SelectTrigger {...control}>
                    <SelectValue placeholder={t('inventoryItemModal.placeholders.account')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ACCOUNT}>{t('inventoryItemModal.noAccount')}</SelectItem>
                    {assetAccounts.map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.accountNumber} · {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <FormError message={error} />
          </PinnedBody>
          <PinnedFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              {t('inventoryItemModal.actions.cancel')}
            </Button>
            <Button type="submit" loading={pending}>
              {pending ? t('inventoryItemModal.actions.saving') : t('inventoryItemModal.actions.save')}
            </Button>
          </PinnedFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
