import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { tEam } from '@/components/ga/eam-i18n';
import { ComboboxField } from '@/components/overlays/ComboboxField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/shared';
import { FormModal } from '@/components/ga/maintenance/form-modal';
import { apiErrorMessage, type MrItemDraft, type InventoryItemOpt } from './types';
import { useTranslation } from 'react-i18next';

interface AssetOpt {
  id: string;
  code: string;
  name: string;
}

const emptyItem = (): MrItemDraft => ({ inventoryItemId: null, itemName: '', sku: '', uom: '', quantity: 1, notes: '' });

function itemError(it: MrItemDraft): string | undefined {
  if (!it.itemName.trim()) return tEam('materialRequest.create.nameRequired');
  if (!it.uom.trim()) return tEam('materialRequest.create.uomRequired');
  if (!(Number(it.quantity) > 0)) return tEam('materialRequest.create.qtyRequired');
  return undefined;
}

/**
 * Modal buat Material Request. Dua mode:
 *  - Standalone: user pilih aset + isi item.
 *  - Dari Work Order (woContext diisi): aset terkunci dari WO, POST ke
 *    /from-work-order/:workOrderId.
 */
export function CreateMrModal({
  woContext,
  onClose,
}: {
  woContext?: { workOrderId: string; assetId: string | null; woCode: string };
  onClose: () => void;
}) {
  const { t } = useTranslation('eam');
  const queryClient = useQueryClient();

  const { data: assets = [], isLoading: loadingAssets } = useQuery<AssetOpt[]>({
    queryKey: ['ga-assets-mr'],
    queryFn: async () => (await api.get('/ga/assets', { params: { limit: 500 } })).data,
    enabled: !woContext,
  });
  const { data: invItems = [] } = useQuery<InventoryItemOpt[]>({
    queryKey: ['ga-inventory-items-mr'],
    queryFn: async () => {
      const res = await api.get('/ga/inventory/items');
      return Array.isArray(res.data) ? res.data : res.data?.data ?? [];
    },
  });

  const [assetId, setAssetId] = useState<string>(woContext?.assetId ?? '');
  const [machineTarget, setMachineTarget] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<MrItemDraft[]>([emptyItem()]);
  const [submitted, setSubmitted] = useState(false);

  const updateItem = (idx: number, patch: Partial<MrItemDraft>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  // Saat pilih item inventaris existing → autofill nama/sku/uom.
  const pickInventoryItem = (idx: number, itemId: string) => {
    if (!itemId) {
      updateItem(idx, { inventoryItemId: null });
      return;
    }
    const src = invItems.find((x) => x.id === itemId);
    updateItem(idx, {
      inventoryItemId: itemId,
      itemName: src?.name ?? '',
      sku: src?.sku ?? '',
      uom: src?.uom ?? '',
    });
  };

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        machineTarget: machineTarget || null,
        notes: notes || null,
        items: items.map((it) => ({
          inventoryItemId: it.inventoryItemId,
          itemName: it.itemName.trim(),
          sku: it.sku || null,
          uom: it.uom.trim(),
          quantity: Number(it.quantity),
          notes: it.notes || null,
        })),
      };
      if (woContext) {
        return api.post(`/ga/material-requests/from-work-order/${woContext.workOrderId}`, payload);
      }
      return api.post('/ga/material-requests', { ...payload, assetId: assetId || null });
    },
    onSuccess: () => {
      toast.success(t('materialRequest.create.created'));
      queryClient.invalidateQueries({ queryKey: ['ga-material-requests'] });
      if (woContext) queryClient.invalidateQueries({ queryKey: ['ga-work-order', woContext.workOrderId] });
      onClose();
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, t('materialRequest.create.createFailed'))),
  });

  const submit = () => {
    setSubmitted(true);
    if (items.some((it) => itemError(it))) return;
    mutation.mutate();
  };

  const invOptions = invItems.map((x) => ({ value: x.id, label: `${x.sku} · ${x.name}` }));

  return (
    <FormModal
      title={woContext ? t('materialRequest.create.titleFromWo', { code: woContext.woCode }) : t('materialRequest.create.title')}
      description={t('materialRequest.create.description')}
      size="lg"
      onClose={onClose}
      onSubmit={submit}
      submitLabel={t('materialRequest.create.submit')}
      submitting={mutation.isPending}
    >
      {!woContext && (
        <ComboboxField label={t('materialRequest.create.asset')} hint={t('materialRequest.create.optional')}
  options={assets.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))}
  value={assetId}
  onChange={setAssetId}
  placeholder={loadingAssets ? t('materialRequest.create.loading') : t('materialRequest.create.noAsset')}
/>
      )}
      <Field label={t('materialRequest.create.machine')} hint={t('materialRequest.create.optional')}>
        <Input value={machineTarget} onChange={(e) => setMachineTarget(e.target.value)} placeholder={t('materialRequest.create.machinePlaceholder')} />
      </Field>
      <Field label={t('shared.notes')} hint={t('materialRequest.create.optional')}>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <fieldset className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <legend className="text-sm font-medium text-foreground">
            {t('materialRequest.create.items')} <span className="text-danger-text" aria-hidden>*</span>
          </legend>
          <Button size="sm" variant="secondary" onClick={addItem}>
            <Plus aria-hidden /> {t('materialRequest.create.addRow')}
          </Button>
        </div>
        <ol className="space-y-3">
          {items.map((it, idx) => {
            const error = submitted ? itemError(it) : undefined;
            return (
              <li key={idx} className="space-y-3 rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">{t('materialRequest.create.itemN', { n: idx + 1 })}</span>
                  {items.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeItem(idx)}
                      aria-label={t('materialRequest.create.removeItem', { n: idx + 1 })}
                      className="text-danger-text hover:bg-danger-subtle"
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </div>
                <ComboboxField label={t('materialRequest.create.invItem')} hint={t('materialRequest.create.invItemHint')}
  options={invOptions}
  value={it.inventoryItemId ?? ''}
  onChange={(v) => pickInventoryItem(idx, v)}
  placeholder={t('materialRequest.create.invItemPlaceholder')}
/>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('materialRequest.create.name')} required className="col-span-2">
                    <Input value={it.itemName} onChange={(e) => updateItem(idx, { itemName: e.target.value })} placeholder={t('materialRequest.create.namePlaceholder')} />
                  </Field>
                  <Field label={t('materialRequest.create.sku')}>
                    <Input value={it.sku} onChange={(e) => updateItem(idx, { sku: e.target.value })} />
                  </Field>
                  <Field label={t('materialRequest.create.uom')} required>
                    <Input value={it.uom} onChange={(e) => updateItem(idx, { uom: e.target.value })} placeholder={t('materialRequest.create.uomPlaceholder')} />
                  </Field>
                  <Field label={t('materialRequest.create.qty')} required>
                    <NumberInput min={0} step="any" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                  </Field>
                  <Field label={t('materialRequest.create.itemNotes')}>
                    <Input value={it.notes} onChange={(e) => updateItem(idx, { notes: e.target.value })} />
                  </Field>
                </div>
                {error && (
                  <p role="alert" className="text-xs font-medium text-danger-text">
                    {error}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </fieldset>
    </FormModal>
  );
}
