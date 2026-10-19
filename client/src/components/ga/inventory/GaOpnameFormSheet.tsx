/**
 * "Stok Opname Cepat": POST /ga/inventory/stock-set — sets the counted stock
 * of one item at one location; the server records the difference as an
 * ADJUSTMENT movement. Shows the system stock and the difference live.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/shared';
import { FormNumberInput, FormSection, FormSheet } from '@/components/inventory/master-data-kit';
import { FormSelect } from './form-select';
import { GA_INVENTORY_KEY, errorMessage, formatQty } from './ga-inventory-model';
import { useGaItemOptions, useGaLocations, useInvalidateGaInventory } from './queries';
import { useTranslation } from 'react-i18next';

interface FormState {
  itemId: string;
  locationId: string;
  quantity: string;
  notes: string;
}

type Errors = Partial<Record<keyof FormState, string>>;

interface ItemDetail {
  stocks: { quantity: number; location: { id: string; code: string; name: string } }[];
}

interface StockSetResult {
  changed: boolean;
  delta: number;
  before: number;
  after: number;
}

interface GaOpnameFormSheetProps {
  open: boolean;
  itemId?: string;
  onClose: () => void;
}

/** Mount per open (keyed) so the form starts fresh. */
export function GaOpnameFormSheet({ open, itemId, onClose }: GaOpnameFormSheetProps) {
  const { t } = useTranslation('eam');
  const { data: items = [] } = useGaItemOptions(open);
  const { data: locations = [] } = useGaLocations();
  const invalidate = useInvalidateGaInventory();
  const [form, setForm] = useState<FormState>({ itemId: itemId ?? '', locationId: '', quantity: '', notes: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const detail = useQuery({
    queryKey: [GA_INVENTORY_KEY, 'item-detail', form.itemId],
    queryFn: async () => (await api.get<ItemDetail>(`/ga/inventory/items/${form.itemId}`)).data,
    enabled: open && !!form.itemId,
  });

  const item = items.find((i) => i.id === form.itemId);
  const systemStock = form.locationId
    ? Number(detail.data?.stocks.find((s) => s.location?.id === form.locationId)?.quantity ?? 0)
    : null;
  const delta = form.quantity === '' || systemStock === null ? null : Number(form.quantity) - systemStock;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async () => {
    const e: Errors = {};
    if (!form.itemId) e.itemId = t('gaInventory.opname.itemRequired');
    if (!form.locationId) e.locationId = t('gaInventory.opname.locationRequired');
    if (form.quantity === '' || Number(form.quantity) < 0) e.quantity = t('gaInventory.opname.qtyRequired');
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setSaving(true);
    setServerError(null);
    try {
      const res = await api.post<StockSetResult>('/ga/inventory/stock-set', {
        itemId: form.itemId,
        locationId: form.locationId,
        quantity: Number(form.quantity),
        notes: form.notes || null,
      });
      const d = res.data;
      if (d && d.changed === false) toast.info(t('gaInventory.opname.noChange'));
      else
        toast.success(
          t('gaInventory.opname.saved', {
            before: formatQty(d?.before),
            after: formatQty(d?.after),
            delta: `${d?.delta > 0 ? '+' : ''}${formatQty(d?.delta ?? 0)}`,
          }),
        );
      invalidate();
      onClose();
    } catch (err) {
      setServerError(errorMessage(err, t('gaInventory.opname.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('gaInventory.opname.title')}
      description={t('gaInventory.opname.description')}
      error={serverError}
      saving={saving}
      submitLabel={t('gaInventory.opname.submit')}
      onSubmit={submit}
    >
      <FormSection title={t('gaInventory.opname.sectionCounted')}>
        <Field label={t('gaInventory.opname.item')} required error={errors.itemId}>
          <FormSelect
            value={form.itemId}
            onChange={(v) => set('itemId', v)}
            options={items.map((i) => ({ value: i.id, label: `${i.sku} · ${i.name}` }))}
            placeholder={t('gaInventory.opname.itemPlaceholder')}
          />
        </Field>
        <Field label={t('gaInventory.opname.location')} required error={errors.locationId}>
          <FormSelect
            value={form.locationId}
            onChange={(v) => set('locationId', v)}
            options={locations.map((l) => ({ value: l.id, label: `${l.code} · ${l.name}` }))}
            placeholder={t('gaInventory.opname.locationPlaceholder')}
          />
        </Field>
      </FormSection>

      <FormSection title={t('gaInventory.opname.sectionResult')}>
        <Field
          label={item ? t('gaInventory.opname.countedUom', { uom: item.uom }) : t('gaInventory.opname.counted')}
          required
          error={errors.quantity}
          hint={t('gaInventory.opname.countedHint')}
        >
          <FormNumberInput
            value={form.quantity}
            onChange={(ev) => set('quantity', ev.target.value)}
            min={0}
            step="any"
            inputMode="decimal"
            placeholder="0"
          />
        </Field>
        {item && systemStock !== null && (
          <dl className="space-y-1 rounded-md border border-border bg-muted px-3 py-2.5 text-sm" aria-live="polite">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('gaInventory.opname.systemStock')}</dt>
              <dd className="num font-medium text-foreground">
                {detail.isFetching && !detail.data ? t('gaInventory.opname.loading') : `${formatQty(systemStock)} ${item.uom}`}
              </dd>
            </div>
            {delta !== null && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('gaInventory.opname.difference')}</dt>
                <dd
                  className={cn(
                    'num font-semibold',
                    delta === 0 ? 'text-muted-foreground' : delta > 0 ? 'text-success-text' : 'text-danger-text',
                  )}
                >
                  {delta === 0 ? t('gaInventory.opname.match') : `${delta > 0 ? '+' : '−'}${formatQty(Math.abs(delta))} ${item.uom}`}
                </dd>
              </div>
            )}
          </dl>
        )}
        <Field label={t('shared.notes')}>
          <Input
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder={t('gaInventory.opname.notesPlaceholder')}
            autoComplete="off"
          />
        </Field>
      </FormSection>
    </FormSheet>
  );
}
