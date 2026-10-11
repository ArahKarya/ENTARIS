/** New fixed asset dialog; the server generates the asset number and straight-line depreciation schedule. */
import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import i18n from '@/i18n';
import api from '@/lib/api';
import { formatRupiah } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { controlBase } from '@/components/ui/styles';
import { DateInput, Field } from '@/components/shared';
import { AccountPicker } from './AccountPicker';
import { EamAssetPicker } from './EamAssetPicker';
import { apiError } from './errors';
import type { CoaOption } from './types';

interface FixedAssetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coa: readonly CoaOption[];
  coaLoading?: boolean;
}

interface FormState {
  name: string;
  category: string;
  acquisitionDate: string;
  acquisitionCost: string;
  usefulLifeMonths: string;
  salvageValue: string;
  assetAccountId: string;
  depreciationAccountId: string;
  accumulatedDepAccountId: string;
  description: string;
  gaAssetId: string;
}

const EMPTY: FormState = {
  name: '',
  category: '',
  acquisitionDate: '',
  acquisitionCost: '',
  usefulLifeMonths: '',
  salvageValue: '0',
  assetAccountId: '',
  depreciationAccountId: '',
  accumulatedDepAccountId: '',
  description: '',
  gaAssetId: '',
};

type Errors = Partial<Record<keyof FormState, string>>;

const numberClass = `${controlBase} h-10 px-3 md:h-9`;

function validate(f: FormState): Errors {
  const e: Errors = {};
  if (!f.name.trim()) e.name = i18n.t('finance:fixedAssetFormDialog.errors.name');
  if (!f.category.trim()) e.category = i18n.t('finance:fixedAssetFormDialog.errors.category');
  if (!f.acquisitionDate) e.acquisitionDate = i18n.t('finance:fixedAssetFormDialog.errors.acquisitionDate');
  if (!(Number(f.acquisitionCost) > 0)) e.acquisitionCost = i18n.t('finance:fixedAssetFormDialog.errors.acquisitionCost');
  if (!(Number(f.usefulLifeMonths) >= 1) || !Number.isInteger(Number(f.usefulLifeMonths)))
    e.usefulLifeMonths = i18n.t('finance:fixedAssetFormDialog.errors.usefulLife');
  if (Number(f.salvageValue || 0) < 0) e.salvageValue = i18n.t('finance:fixedAssetFormDialog.errors.salvageValue');
  if (!f.assetAccountId) e.assetAccountId = i18n.t('finance:fixedAssetFormDialog.errors.assetAccount');
  if (!f.depreciationAccountId) e.depreciationAccountId = i18n.t('finance:fixedAssetFormDialog.errors.depreciationAccount');
  if (!f.accumulatedDepAccountId) e.accumulatedDepAccountId = i18n.t('finance:fixedAssetFormDialog.errors.accumulatedAccount');
  return e;
}

export function FixedAssetFormDialog({ open, onOpenChange, coa, coaLoading }: FixedAssetFormDialogProps) {
  const { t } = useTranslation('finance');
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});

  // Reset on every open (adjust state during render, no effect needed).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(EMPTY);
      setErrors({});
    }
  }

  // Asset and accumulated depreciation accounts under 1., expenses under 6.
  const assetAccounts = useMemo(() => coa.filter((a) => a.accountNumber.startsWith('1.')), [coa]);
  const expenseAccounts = useMemo(() => coa.filter((a) => a.accountNumber.startsWith('6.')), [coa]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const createMut = useMutation({
    mutationFn: async (f: FormState) =>
      (
        await api.post('/fixed-assets', {
          name: f.name.trim(),
          category: f.category.trim(),
          description: f.description.trim() || undefined,
          acquisitionDate: f.acquisitionDate,
          acquisitionCost: Number(f.acquisitionCost),
          usefulLifeMonths: Number(f.usefulLifeMonths),
          salvageValue: Number(f.salvageValue || 0),
          assetAccountId: f.assetAccountId,
          depreciationAccountId: f.depreciationAccountId,
          accumulatedDepAccountId: f.accumulatedDepAccountId,
          gaAssetId: f.gaAssetId || null,
        })
      ).data,
    onSuccess: () => {
      toast.success(t('fixedAssetFormDialog.created'));
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['dashboard-fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['ga-assets'] });
      qc.invalidateQueries({ queryKey: ['ga-asset-detail'] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiError(err, t('fixedAssetFormDialog.createFailed'))),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length === 0) createMut.mutate(form);
  };

  const monthly =
    Number(form.acquisitionCost) > 0 && Number(form.usefulLifeMonths) > 0
      ? (Number(form.acquisitionCost) - Number(form.salvageValue || 0)) / Number(form.usefulLifeMonths)
      : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !createMut.isPending && onOpenChange(next)}>
      <DialogContent size="lg" hideClose={createMut.isPending}>
        <form onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t('fixedAssetFormDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('fixedAssetFormDialog.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('fixedAssetFormDialog.fields.name')} required error={errors.name}>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={200} />
            </Field>
            <Field label={t('fixedAssetFormDialog.fields.category')} required error={errors.category}>
              <Input
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
                placeholder={t('fixedAssetFormDialog.fields.categoryPlaceholder')}
                maxLength={100}
              />
            </Field>
            <Field label={t('fixedAssetFormDialog.fields.acquisitionDate')} required error={errors.acquisitionDate}>
              {(control) => (
                <DateInput
                  id={control.id}
                  required
                  value={form.acquisitionDate}
                  onChange={(v) => set('acquisitionDate', v)}
                />
              )}
            </Field>
            <Field label={t('fixedAssetFormDialog.fields.acquisitionCost')} required error={errors.acquisitionCost}>
              <NumberInput
                className={numberClass}
                min={0}
                inputMode="decimal"
                value={form.acquisitionCost}
                onChange={(e) => set('acquisitionCost', e.target.value)}
              />
            </Field>
            <Field label={t('fixedAssetFormDialog.fields.usefulLife')} required error={errors.usefulLifeMonths}>
              <NumberInput
                className={numberClass}
                min={1}
                step={1}
                inputMode="numeric"
                value={form.usefulLifeMonths}
                onChange={(e) => set('usefulLifeMonths', e.target.value)}
              />
            </Field>
            <Field
              label={t('fixedAssetFormDialog.fields.salvageValue')}
              error={errors.salvageValue}
              hint={monthly !== null ? t('fixedAssetFormDialog.fields.monthlyHint', { amount: formatRupiah(monthly) }) : undefined}
            >
              <NumberInput
                className={numberClass}
                min={0}
                inputMode="decimal"
                value={form.salvageValue}
                onChange={(e) => set('salvageValue', e.target.value)}
              />
            </Field>
            <AccountPicker
              label={t('fixedAssetFormDialog.fields.assetAccount')}
              required
              value={form.assetAccountId}
              onChange={(v) => set('assetAccountId', v)}
              accounts={assetAccounts}
              loading={coaLoading}
              error={errors.assetAccountId}
            />
            <AccountPicker
              label={t('fixedAssetFormDialog.fields.depreciationAccount')}
              required
              value={form.depreciationAccountId}
              onChange={(v) => set('depreciationAccountId', v)}
              accounts={expenseAccounts}
              loading={coaLoading}
              error={errors.depreciationAccountId}
            />
            <AccountPicker
              label={t('fixedAssetFormDialog.fields.accumulatedAccount')}
              required
              value={form.accumulatedDepAccountId}
              onChange={(v) => set('accumulatedDepAccountId', v)}
              accounts={assetAccounts}
              loading={coaLoading}
              error={errors.accumulatedDepAccountId}
            />
            <Field label={t('fixedAssetFormDialog.fields.description')}>
              <Input value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={500} />
            </Field>
            <div className="sm:col-span-2">
              <EamAssetPicker value={form.gaAssetId} onChange={(v) => set('gaAssetId', v)} enabled={open} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createMut.isPending}>
              {t('fixedAssetFormDialog.cancel')}
            </Button>
            <Button type="submit" loading={createMut.isPending}>
              {t('fixedAssetFormDialog.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
