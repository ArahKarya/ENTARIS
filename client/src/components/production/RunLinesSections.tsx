/** Input and output line editors of the production run dialog (presentational). */
import { Plus, Trash2, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { Field, type ComboboxOption } from '@/components/shared';
import { ComboboxField } from '@/components/overlays/ComboboxField';
import { BatchSelect } from '@/components/overlays/BatchSelect';
import type { Batch } from '@/components/overlays/BatchSelect';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { LOCALE } from '@/lib/format';
import type { LineItem, OutputLineItem } from './run-form-utils';

interface ItemLike {
  currentStock?: number | string;
  unit?: string;
}

interface InputsSectionProps {
  inputs: LineItem[];
  itemOptions: ComboboxOption[];
  warehouseId: string;
  getItemById: (id: string) => ItemLike | undefined;
  onUpdate: (idx: number, field: keyof LineItem, value: string) => void;
  onPickBatch: (idx: number, batchId: string, batch: Batch | null) => void;
  onSplit: (idx: number) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
}

const rowClass = 'rounded-lg border border-border bg-muted/40 p-3';

export function RunInputsSection({
  inputs, itemOptions, warehouseId, getItemById, onUpdate, onPickBatch, onSplit, onAdd, onRemove,
}: InputsSectionProps) {
  const { t } = useTranslation('production');
  return (
    <section aria-labelledby="run-inputs-heading">
      <div className="mb-2 flex items-center justify-between">
        <h3 id="run-inputs-heading" className="text-xs font-bold uppercase tracking-wide text-foreground">{t('runLinesSections.inputsHeading')}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onAdd}>
          <Plus aria-hidden /> {t('runLinesSections.addInput')}
        </Button>
      </div>
      <ul className="space-y-2">
        {inputs.map((row, idx) => {
          const item = getItemById(row.itemId);
          return (
            <li key={idx} className={cn(rowClass, 'space-y-3')}>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
                <div className="col-span-2 sm:col-span-1">
                  <ComboboxField
                    label={t('runLinesSections.inputItemLabel', { n: idx + 1 })}
                    options={itemOptions}
                    value={row.itemId}
                    onChange={(v) => onUpdate(idx, 'itemId', v)}
                    placeholder={t('runLinesSections.selectItem')}
                    hint={
                      item
                        ? t('runLinesSections.warehouseStock', { qty: Number(item.currentStock).toLocaleString(LOCALE, { maximumFractionDigits: 3 }), unit: item.unit ?? '' })
                        : undefined
                    }
                  />
                </div>
                <Field label={`Qty${item?.unit ? ` (${item.unit})` : ''}`}>
                  <NumberInput
                    value={row.quantity}
                    onChange={(e) => onUpdate(idx, 'quantity', e.target.value)}
                    placeholder="Qty"
                    min="0.001"
                    step="0.001"
                    className="h-10 text-right tabular-nums"
                  />
                </Field>
                <div className="flex justify-end">
                  {inputs.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-touch"
                      className="text-muted-foreground hover:text-danger-text"
                      onClick={() => onRemove(idx)}
                      aria-label={t('runLinesSections.removeInput', { n: idx + 1 })}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </div>
              </div>
              {row.itemId && (
                <div>
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t('runLinesSections.sourceBatch')}</span>
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1 basis-60">
                      <BatchSelect
                        label={t('runLinesSections.sourceBatchLabel', { n: idx + 1 })}
                        itemId={row.itemId}
                        warehouseId={warehouseId}
                        value={row.sourceMovementId}
                        excludeIds={inputs
                          .filter((r, i) => i !== idx && r.itemId === row.itemId && r.sourceMovementId)
                          .map((r) => r.sourceMovementId)}
                        onChange={(id, batch) => onPickBatch(idx, id, batch)}
                      />
                    </div>
                    {!row.sourceMovementId && (parseFloat(row.quantity) || 0) > 0 && warehouseId && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onSplit(idx)}
                        title={t('runLinesSections.splitBatchTitle')}
                      >
                        <Layers aria-hidden /> {t('runLinesSections.splitBatch')}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface OutputsSectionProps {
  outputs: OutputLineItem[];
  itemOptions: ComboboxOption[];
  getItemById: (id: string) => ItemLike | undefined;
  totalInputQty: number;
  autoHpp: number;
  onUpdate: (idx: number, field: string, value: string | boolean) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
}

export function RunOutputsSection({
  outputs, itemOptions, getItemById, totalInputQty, autoHpp, onUpdate, onAdd, onRemove,
}: OutputsSectionProps) {
  const { t } = useTranslation('production');
  return (
    <section aria-labelledby="run-outputs-heading">
      <div className="mb-2 flex items-center justify-between">
        <h3 id="run-outputs-heading" className="text-xs font-bold uppercase tracking-wide text-foreground">{t('runLinesSections.outputsHeading')}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onAdd}>
          <Plus aria-hidden /> {t('runLinesSections.addOutput')}
        </Button>
      </div>
      <ul className="space-y-3">
        {outputs.map((row, idx) => {
          const item = getItemById(row.itemId);
          const qty = parseFloat(row.quantity) || 0;
          const price = parseFloat(row.unitPrice) || 0;
          const rPct = totalInputQty > 0 && qty > 0 && !row.isByProduct ? ((qty / totalInputQty) * 100).toFixed(1) : null;
          const checkId = `run-byproduct-${idx}`;
          return (
            <li
              key={idx}
              className={cn(
                'space-y-3 rounded-lg border p-3',
                row.isByProduct ? 'border-warning/30 bg-warning-subtle/50' : 'border-border bg-muted/40',
              )}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
                <div className="col-span-2 sm:col-span-1">
                  <ComboboxField
                    label={t('runLinesSections.outputItemLabel', { n: idx + 1 })}
                    options={itemOptions}
                    value={row.itemId}
                    onChange={(v) => onUpdate(idx, 'itemId', v)}
                    placeholder={t('runLinesSections.selectItem')}
                  />
                </div>
                <Field label={`Qty${item?.unit ? ` (${item.unit})` : ''}`}>
                  <NumberInput
                    value={row.quantity}
                    onChange={(e) => onUpdate(idx, 'quantity', e.target.value)}
                    placeholder="Qty"
                    min="0.001"
                    step="0.001"
                    className="h-10 text-right tabular-nums"
                  />
                </Field>
                <div className="flex justify-end">
                  {outputs.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-touch"
                      className="text-muted-foreground hover:text-danger-text"
                      onClick={() => onRemove(idx)}
                      aria-label={t('runLinesSections.removeOutput', { n: idx + 1 })}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {rPct !== null && (
                  <span className="rounded-md bg-success-subtle px-2 py-1 text-xs font-semibold text-success-text">{rPct}%</span>
                )}
                {row.isByProduct && (
                  <span className="rounded-md bg-warning-subtle px-2 py-1 text-xs font-semibold text-warning-text">{t('runLinesSections.byProductBadge')}</span>
                )}
              </div>

              {/* HPP / unit price row + by-product toggle */}
              <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-end">
                <Field label={row.isByProduct ? t('runLinesSections.nrvPerKg') : t('runLinesSections.hppPerKg')}>
                  <NumberInput
                    value={row.unitPrice}
                    onChange={(e) => onUpdate(idx, 'unitPrice', e.target.value)}
                    placeholder={
                      row.isByProduct
                        ? t('runLinesSections.nrvPlaceholder')
                        : autoHpp > 0
                          ? t('runLinesSections.autoHppPlaceholder', { amount: autoHpp.toLocaleString(LOCALE, { maximumFractionDigits: 0 }) })
                          : t('runLinesSections.emptyHppPlaceholder')
                    }
                    min="0"
                    className="h-10 text-right font-mono tabular-nums"
                  />
                </Field>
                <div className="flex flex-wrap items-center justify-between gap-2 sm:pb-2">
                  {price > 0 && qty > 0 ? (
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">= Rp {(price * qty).toLocaleString(LOCALE)}</span>
                  ) : !row.isByProduct && qty > 0 && autoHpp > 0 ? (
                    <span className="whitespace-nowrap font-mono text-xs tabular-nums text-success-text">
                      = Rp {Math.round(autoHpp * qty).toLocaleString(LOCALE)} {t('runLinesSections.autoSuffix')}
                    </span>
                  ) : (
                    <span />
                  )}
                  <div className="flex min-h-9 items-center gap-2">
                    <Checkbox
                      id={checkId}
                      checked={row.isByProduct}
                      onCheckedChange={(v) => onUpdate(idx, 'isByProduct', v === true)}
                    />
                    <Label htmlFor={checkId} className="cursor-pointer text-xs font-medium text-muted-foreground">
                      {t('runLinesSections.byProduct')}
                    </Label>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
