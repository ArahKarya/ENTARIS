/**
 * "Buat Transfer Stok" modal, moved verbatim out of pages/StockTransfers.tsx
 * (create + submit in one step; FIFO batch split; SJG delivery fields).
 */
import { useState, useMemo } from 'react';
import { Plus, Trash2, Layers } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NumberInput } from '@/components/ui/number-input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DateInput, Field, type ComboboxOption } from '@/components/shared';
import {
  FormError,
  PinnedBody,
  PinnedFooter,
  PinnedHeader,
  pinnedDialogClass,
} from '@/components/overlays/dialog-parts';
import { ComboboxField } from '@/components/overlays/ComboboxField';
import { BatchSelect } from '@/components/overlays/BatchSelect';
import { fetchBatches, allocateFifo } from '@/lib/fifoAllocate';

interface TransferItemRow {
  id: string;
  itemId: string;
  quantity: number;
  unit?: string;
  description?: string;
  // Optional batch pick: locks unitCost to a specific inbound batch.
  sourceMovementId?: string;
}

interface WarehouseOption {
  id: string;
  code: string;
  name: string;
}

interface InvItemOption {
  id: string;
  code: string;
  name: string;
  unit: string;
  isActive?: boolean;
}

// Modal
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StockTransferModal({ isOpen, onClose }: ModalProps) {
  const { t } = useTranslation('inventory');
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [nomorMobil, setNomorMobil] = useState('');
  const [driverName, setDriverName] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<TransferItemRow[]>([
    { id: crypto.randomUUID(), itemId: '', quantity: 0 },
  ]);

  // Bagi Batch Otomatis (FIFO): pecah baris menjadi N baris per batch tersedia.
  // Sisa tak tertampung → baris tanpa batch (WAC) + warning.
  const splitTransferRow = async (idx: number) => {
    const row = items[idx];
    const qty = Number(row.quantity) || 0;
    if (!row.itemId || !fromWarehouseId || qty <= 0) return;
    try {
      const batches = await fetchBatches(row.itemId, fromWarehouseId);
      const claimed = new Map<string, number>();
      items.forEach((r, i) => {
        if (i !== idx && r.itemId === row.itemId && r.sourceMovementId) {
          claimed.set(r.sourceMovementId, (claimed.get(r.sourceMovementId) ?? 0) + (Number(r.quantity) || 0));
        }
      });
      const { allocations, shortfall } = allocateFifo(batches, qty, claimed);
      if (allocations.length === 0) {
        toast.error(t('stockTransferModal.toast.noBatches'));
        return;
      }
      const newRows: TransferItemRow[] = allocations.map(a => ({
        id: crypto.randomUUID(),
        itemId: row.itemId,
        quantity: a.qty,
        unit: row.unit,
        description: row.description,
        sourceMovementId: a.batch.id,
      }));
      if (shortfall > 0) {
        newRows.push({ id: crypto.randomUUID(), itemId: row.itemId, quantity: shortfall, unit: row.unit, sourceMovementId: '' });
        toast.warning(t('stockTransferModal.toast.shortfall', { qty: formatNumber(shortfall, { maxDecimals: 3 }) }));
      } else {
        toast.success(t('stockTransferModal.toast.split', { count: allocations.length }));
      }
      setItems(prev => [...prev.slice(0, idx), ...newRows, ...prev.slice(idx + 1)]);
    } catch {
      toast.error(t('stockTransferModal.toast.batchesFailed'));
    }
  };
  const [error, setError] = useState('');

  const queryClient = useQueryClient();

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses-active'],
    queryFn: async () => {
      const res = await api.get<{ data: WarehouseOption[] }>('/warehouses?active=true');
      return res.data.data;
    },
    enabled: isOpen,
  });

  const { data: invItems } = useQuery({
    queryKey: ['inventory-items-active'],
    queryFn: async () => {
      const res = await api.get('/inventory/items');
      const all: InvItemOption[] = res.data.data ?? res.data;
      return all.filter((i) => i.isActive !== false);
    },
    enabled: isOpen,
  });

  const whOptions = useMemo<ComboboxOption[]>(
    () => (warehouses ?? []).map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` })),
    [warehouses],
  );

  const itemOptions = useMemo<ComboboxOption[]>(
    () => (invItems ?? []).map((i) => ({ value: i.id, label: `${i.code} · ${i.name}` })),
    [invItems],
  );

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/stock-transfers', data),
    onSuccess: () => {
      toast.success(t('stockTransferModal.toast.created'));
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      onClose();
    },
    onError: (e: unknown) =>
      setError((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? t('stockTransferModal.errors.createFailed')),
  });

  const handleSubmit = () => {
    setError('');
    if (!fromWarehouseId) { setError(t('stockTransferModal.errors.fromRequired')); return; }
    if (!toWarehouseId) { setError(t('stockTransferModal.errors.toRequired')); return; }
    if (fromWarehouseId === toWarehouseId) { setError(t('stockTransferModal.errors.sameWarehouse')); return; }
    const valid = items.filter((it) => it.itemId && it.quantity > 0);
    if (valid.length === 0) { setError(t('stockTransferModal.errors.noItems')); return; }
    mutation.mutate({
      date,
      fromWarehouseId,
      toWarehouseId,
      notes: notes.trim() || null,
      nomorMobil: nomorMobil.trim() || null,
      driverName: driverName.trim() || null,
      recipientName: recipientName.trim() || null,
      items: valid.map((it) => ({
        itemId: it.itemId,
        quantity: it.quantity,
        description: it.description || null,
        sourceMovementId: it.sourceMovementId || null,
      })),
    });
  };

  const pending = mutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent size="lg" className={pinnedDialogClass}>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <PinnedHeader>
            <DialogTitle>{t('stockTransferModal.title')}</DialogTitle>
            <DialogDescription>{t('stockTransferModal.description')}</DialogDescription>
          </PinnedHeader>

          <PinnedBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('stockTransferModal.fields.date')}>
                <DateInput value={date} onChange={setDate} />
              </Field>
              <ComboboxField
                label={t('stockTransferModal.fields.from')}
                required
                options={whOptions}
                value={fromWarehouseId}
                onChange={setFromWarehouseId}
                placeholder={t('stockTransferModal.fields.fromPlaceholder')}
              />
              <ComboboxField
                label={t('stockTransferModal.fields.to')}
                required
                options={whOptions.filter((o) => o.value !== fromWarehouseId)}
                value={toWarehouseId}
                onChange={setToWarehouseId}
                placeholder={t('stockTransferModal.fields.toPlaceholder')}
              />
            </div>

            {/* SJG fields: physical delivery metadata printed on the SJG */}
            <fieldset className="space-y-3 rounded-lg border border-border bg-info-subtle/40 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-widest text-info-text">
                {t('stockTransferModal.shipping.title')}
              </legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={t('stockTransferModal.shipping.vehicle')}>
                  <Input
                    value={nomorMobil}
                    onChange={(e) => setNomorMobil(e.target.value)}
                    placeholder="B 1234 ABC"
                    className="font-mono uppercase"
                  />
                </Field>
                <Field label={t('stockTransferModal.shipping.driver')}>
                  <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder={t('stockTransferModal.shipping.driverPlaceholder')} />
                </Field>
                <Field label={t('stockTransferModal.shipping.recipient')}>
                  <Input
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder={t('stockTransferModal.shipping.recipientPlaceholder')}
                  />
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('stockTransferModal.shipping.hint')}
              </p>
            </fieldset>

            <section aria-labelledby="transfer-items-heading">
              <div className="mb-2 flex items-center justify-between">
                <h3 id="transfer-items-heading" className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  {t('stockTransferModal.items.title')}
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setItems([...items, { id: crypto.randomUUID(), itemId: '', quantity: 0 }])}
                >
                  <Plus aria-hidden /> {t('stockTransferModal.items.addRow')}
                </Button>
              </div>
              <ul className="space-y-2">
                {items.map((it, idx) => (
                  <li
                    key={it.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-lg border border-border bg-card p-2 md:grid-cols-[minmax(0,1fr)_9rem_auto]"
                  >
                    <div className="col-span-2 min-w-0 space-y-2 md:col-span-1">
                      <ComboboxField
                        label={t('stockTransferModal.items.itemLabel', { n: idx + 1 })}
                        options={itemOptions}
                        value={it.itemId}
                        onChange={(v) => {
                          const next = [...items];
                          next[idx] = { ...next[idx], itemId: v, sourceMovementId: '' };
                          const itemMeta = invItems?.find((i) => i.id === v);
                          if (itemMeta) next[idx].unit = itemMeta.unit;
                          setItems(next);
                        }}
                        placeholder={t('stockTransferModal.items.itemPlaceholder')}
                      />
                      {/* Optional batch picker: locks unitCost to a specific inbound batch */}
                      {it.itemId && fromWarehouseId && (
                        <div>
                          <span className="mb-0.5 block text-xs text-muted-foreground">{t('stockTransferModal.items.batch')}</span>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <BatchSelect
                                label={t('stockTransferModal.items.batchLabel', { n: idx + 1 })}
                                itemId={it.itemId}
                                warehouseId={fromWarehouseId}
                                value={it.sourceMovementId ?? ''}
                                excludeIds={items
                                  .filter((r, i) => i !== idx && r.itemId === it.itemId && r.sourceMovementId)
                                  .map((r) => r.sourceMovementId as string)}
                                onChange={(id) => {
                                  const next = [...items];
                                  next[idx] = { ...next[idx], sourceMovementId: id };
                                  setItems(next);
                                }}
                              />
                            </div>
                            {!it.sourceMovementId && (Number(it.quantity) || 0) > 0 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void splitTransferRow(idx)}
                                title={t('stockTransferModal.items.splitHint')}
                              >
                                <Layers aria-hidden /> {t('stockTransferModal.items.split')}
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <Field label={it.unit ? t('stockTransferModal.items.qtyWithUnit', { unit: it.unit }) : t('stockTransferModal.items.qty')} id={`transfer-qty-${it.id}`}>
                      <NumberInput
                        min={0}
                        value={it.quantity || ''}
                        onChange={(e) => {
                          const next = [...items];
                          next[idx] = { ...next[idx], quantity: Number(e.target.value) || 0 };
                          setItems(next);
                        }}
                        className="h-10 text-right tabular-nums"
                      />
                    </Field>
                    <div className="flex h-full items-end justify-end">
                      {items.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-touch"
                          className="text-danger-text md:size-9"
                          onClick={() => setItems(items.filter((_, i) => i !== idx))}
                          aria-label={t('stockTransferModal.items.removeRow', { n: idx + 1 })}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <Field label={t('stockTransferModal.fields.notes')}>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t('stockTransferModal.fields.notesPlaceholder')} />
            </Field>

            <FormError message={error} />
          </PinnedBody>

          <PinnedFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              {t('stockTransferModal.cancel')}
            </Button>
            <Button type="submit" loading={pending}>
              {pending ? t('stockTransferModal.saving') : t('stockTransferModal.submit')}
            </Button>
          </PinnedFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
