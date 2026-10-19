/**
 * "Catat Pergerakan": POST /ga/inventory/movements (IN / OUT / TRANSFER /
 * ADJUSTMENT). Location requirements mirror the server rules.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { labelMap } from '../eam-i18n';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/shared';
import { FormNumberInput, FormSection, FormSheet } from '@/components/inventory/master-data-kit';
import { FormSelect } from './form-select';
import { MOVEMENT_LABEL, MOVEMENT_TYPES, errorMessage, movementNeeds, type GaMovementType } from './ga-inventory-model';
import { useGaItemOptions, useGaLocations, useInvalidateGaInventory } from './queries';
import { useTranslation } from 'react-i18next';

interface FormState {
  itemId: string;
  type: GaMovementType;
  quantity: string;
  fromLocationId: string;
  toLocationId: string;
  referenceNo: string;
  notes: string;
}

type Errors = Partial<Record<keyof FormState, string>>;

const TYPE_HINT: Record<GaMovementType, string> = labelMap(MOVEMENT_TYPES, 'gaInventory.movementForm.typeHint');

interface GaMovementFormSheetProps {
  open: boolean;
  /** Preselected item (row action). */
  itemId?: string;
  onClose: () => void;
}

/** Mount per open (keyed) so the form starts fresh. */
export function GaMovementFormSheet({ open, itemId, onClose }: GaMovementFormSheetProps) {
  const { t } = useTranslation('eam');
  const { data: items = [] } = useGaItemOptions(open);
  const { data: locations = [] } = useGaLocations();
  const invalidate = useInvalidateGaInventory();
  const [form, setForm] = useState<FormState>({
    itemId: itemId ?? '',
    type: 'IN',
    quantity: '',
    fromLocationId: '',
    toLocationId: '',
    referenceNo: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const needs = movementNeeds(form.type);
  const item = items.find((i) => i.id === form.itemId);
  const locationOptions = locations.map((l) => ({ value: l.id, label: `${l.code} · ${l.name}` }));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async () => {
    const e: Errors = {};
    if (!form.itemId) e.itemId = t('gaInventory.movementForm.itemRequired');
    const qty = Number(form.quantity);
    if (!qty || qty <= 0) e.quantity = t('gaInventory.movementForm.qtyRequired');
    if (needs.from && !form.fromLocationId) e.fromLocationId = t('gaInventory.movementForm.fromRequired');
    if (needs.to && !form.toLocationId) e.toLocationId = t('gaInventory.movementForm.toRequired');
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setSaving(true);
    setServerError(null);
    try {
      await api.post('/ga/inventory/movements', {
        itemId: form.itemId,
        type: form.type,
        quantity: qty,
        // Locations the movement type does not use are not sent.
        fromLocationId: needs.from ? form.fromLocationId || null : null,
        toLocationId: needs.to ? form.toLocationId || null : null,
        referenceNo: form.referenceNo || null,
        notes: form.notes || null,
      });
      toast.success(t('gaInventory.movementForm.saved'));
      invalidate();
      onClose();
    } catch (err) {
      setServerError(errorMessage(err, t('gaInventory.movementForm.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('gaInventory.movementForm.title')}
      description={t('gaInventory.movementForm.description')}
      error={serverError}
      saving={saving}
      submitLabel={t('gaInventory.movementForm.submit')}
      onSubmit={submit}
    >
      <FormSection title={t('gaInventory.movementForm.sectionItem')}>
        <Field label={t('gaInventory.movementForm.item')} required error={errors.itemId}>
          <FormSelect
            value={form.itemId}
            onChange={(v) => set('itemId', v)}
            options={items.map((i) => ({ value: i.id, label: `${i.sku} · ${i.name}` }))}
            placeholder={t('gaInventory.movementForm.itemPlaceholder')}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('gaInventory.movementForm.type')} required hint={TYPE_HINT[form.type]}>
            <FormSelect
              value={form.type}
              onChange={(v) => set('type', v as GaMovementType)}
              options={MOVEMENT_TYPES.map((type) => ({ value: type, label: MOVEMENT_LABEL[type] }))}
            />
          </Field>
          <Field label={item ? t('gaInventory.movementForm.qtyUom', { uom: item.uom }) : t('gaInventory.movementForm.qty')} required error={errors.quantity}>
            <FormNumberInput
              value={form.quantity}
              onChange={(ev) => set('quantity', ev.target.value)}
              min={0}
              step="any"
              inputMode="decimal"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title={t('gaInventory.movementForm.sectionLocation')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('gaInventory.movementForm.from')} required={needs.from} error={errors.fromLocationId} hint={needs.from ? undefined : t('gaInventory.movementForm.notUsed')}>
            <FormSelect
              value={needs.from ? form.fromLocationId : ''}
              onChange={(v) => set('fromLocationId', v)}
              options={locationOptions}
              placeholder={needs.from ? t('gaInventory.movementForm.locationPlaceholder') : '—'}
              disabled={!needs.from}
            />
          </Field>
          <Field label={t('gaInventory.movementForm.to')} required={needs.to} error={errors.toLocationId} hint={needs.to ? undefined : t('gaInventory.movementForm.notUsed')}>
            <FormSelect
              value={needs.to ? form.toLocationId : ''}
              onChange={(v) => set('toLocationId', v)}
              options={locationOptions}
              placeholder={needs.to ? t('gaInventory.movementForm.locationPlaceholder') : '—'}
              disabled={!needs.to}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title={t('gaInventory.movementForm.sectionRemarks')}>
        <Field label={t('gaInventory.movementForm.reference')}>
          <Input value={form.referenceNo} onChange={(e) => set('referenceNo', e.target.value)} autoComplete="off" />
        </Field>
        <Field label={t('shared.notes')}>
          <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} autoComplete="off" />
        </Field>
      </FormSection>
    </FormSheet>
  );
}
