import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { NumberInput } from '@/components/ui/number-input';
import { Field, DateInput, ConfirmDialog } from '@/components/shared';
import { FormDialog } from './purchase-cash/FormDialog';
import { OptionPicker, type PickerOption as SelectOption } from './purchase-cash/OptionPicker';
import { usePartyPicker } from '@/hooks/usePartyPicker';
import { ErrorAlert, Callout } from './purchase-cash/ErrorAlert';

const UNITS = ['Kg', 'Ton', 'Sak', 'Liter', 'Pcs', 'Box', 'Unit', 'Set', 'Meter'];

interface GRItem {
  id: string;
  inventoryItemId: string;
  warehouseId: string;
  itemName: string;
  quantity: number;
  unit: string;
  description: string;
  /** Set when the line was prefilled from a PO line (bumps its qtyReceived). */
  purchaseOrderItemId?: string;
  /** PO the line was prefilled from; the PO-line link is sent only while the STT still points at it. */
  sourcePurchaseOrderId?: string;
}

const defaultItem = (): GRItem => ({
  id: crypto.randomUUID(),
  inventoryItemId: '',
  warehouseId: '',
  itemName: '',
  quantity: 0,
  unit: 'Kg',
  description: '',
});

/** PO (GET /purchase-orders/:id) to receive against — "Buat STT dari PO". */
export interface GoodsReceiptSourcePO {
  id: string;
  partyId: string | null;
  /** Destination warehouse of the PO — default for every prefilled line. */
  warehouseId?: string | null;
  items: Array<{
    id: string;
    inventoryItemId: string | null;
    itemName: string;
    unit: string;
    quantity: number | string;
    qtyReceived: number | string;
    description?: string | null;
  }>;
}

interface Props {
  onClose: () => void;
  /** Prefill supplier, PO and the PO's outstanding lines (remaining qty). */
  initialPurchaseOrder?: GoodsReceiptSourcePO | null;
}

/** True when the user has not entered anything on the line yet. */
const isBlankLine = (it: GRItem) => !it.inventoryItemId && !it.itemName.trim() && !(it.quantity > 0);

/** Outstanding PO lines → STT lines (warehouse defaults to the PO destination). */
function itemsFromPO(po: GoodsReceiptSourcePO): GRItem[] {
  const lines = po.items
    .map((it) => ({ it, remaining: Number(it.quantity) - Number(it.qtyReceived ?? 0) }))
    .filter(({ remaining }) => remaining > 0)
    .map(({ it, remaining }) => ({
      ...defaultItem(),
      warehouseId: po.warehouseId ?? '',
      inventoryItemId: it.inventoryItemId ?? '',
      itemName: it.itemName,
      unit: it.unit,
      quantity: Math.round(remaining * 1000) / 1000,
      description: it.description ?? '',
      purchaseOrderItemId: it.id,
      sourcePurchaseOrderId: po.id,
    }));
  return lines.length > 0 ? lines : [defaultItem()];
}

// Pull current logged-in user's full name from localStorage to auto-fill
// "Penerima". Staff yang buat STT = orang yang menerima barang fisik —
// tidak perlu ketik manual setiap kali.
function getCurrentUserName(): string {
  try {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    return u?.fullName ?? '';
  } catch {
    return '';
  }
}

const GoodsReceiptModal: React.FC<Props> = ({ onClose, initialPurchaseOrder = null }) => {
  const { t } = useTranslation('purchasing');
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [partyId, setPartyId] = useState(initialPurchaseOrder?.partyId ?? '');
  const [purchaseOrderId, setPurchaseOrderId] = useState(initialPurchaseOrder?.id ?? '');
  const [nomorMobil, setNomorMobil] = useState('');
  const [driverName, setDriverName] = useState('');
  // Read-only — derived dari user login. setRecipientName tidak dipakai
  // tapi tetap di-keep untuk konsistensi useState pattern.
  const [recipientName, _setRecipientName] = useState(() => getCurrentUserName());
  const [notes, setNotes] = useState('');
  const [isCustomerOwned, setIsCustomerOwned] = useState(false);
  const [items, setItems] = useState<GRItem[]>(() =>
    initialPurchaseOrder ? itemsFromPO(initialPurchaseOrder) : [defaultItem()],
  );
  const [error, setError] = useState('');
  const [loadingPO, setLoadingPO] = useState(false);
  // PO lines waiting for the user to confirm replacing lines they already typed.
  const [poItemRefs, setPoItemRefs] = useState<Array<{ id: string; inventoryItemId: string | null }>>(
    () => (initialPurchaseOrder?.items ?? []).map((i) => ({ id: i.id, inventoryItemId: i.inventoryItemId ?? null })),
  );
  const [pendingPOLines, setPendingPOLines] = useState<{ poNumber: string; lines: GRItem[] } | null>(null);

  /**
   * Picking a PO loads its outstanding lines so the receipt links to the PO
   * lines and updates their qtyReceived.
   */
  const handlePickPO = async (id: string) => {
    setPurchaseOrderId(id);
    if (!id) {
      setPoItemRefs([]);
      return;
    }
    setLoadingPO(true);
    try {
      const { data: po } = await api.get(`/purchase-orders/${id}`);
      const source: GoodsReceiptSourcePO = {
        id: po.id,
        partyId: po.partyId ?? null,
        warehouseId: po.warehouseId ?? null,
        items: po.items ?? [],
      };
      setPoItemRefs(source.items.map((i) => ({ id: i.id, inventoryItemId: i.inventoryItemId ?? null })));
      const lines = itemsFromPO(source);
      if (!lines.some((l) => l.purchaseOrderItemId)) {
        toast.info(t('receiptForm.toastFullyReceived', { number: po.poNumber }));
        return;
      }
      if (items.every(isBlankLine)) {
        setItems(lines);
      } else {
        setPendingPOLines({ poNumber: po.poNumber, lines });
      }
    } catch {
      toast.error(t('receiptForm.errorLoadPO'));
    } finally {
      setLoadingPO(false);
    }
  };

  const partyPicker = usePartyPicker({ type: 'Supplier', selectedId: partyId || null });

  const { data: inventoryItems } = useQuery({
    queryKey: ['inventory-items-gr'],
    queryFn: async () => {
      const res = await api.get('/inventory/items?limit=500');
      return res.data.data ?? res.data;
    },
  });

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses-active'],
    queryFn: async () => {
      const res = await api.get('/warehouses');
      const all = res.data.data ?? res.data;
      return (all as any[]).filter((w: any) => w.isActive);
    },
  });

  const { data: openPOs } = useQuery({
    queryKey: ['purchase-orders-open', partyId],
    queryFn: async () => {
      try {
        // open=1 leaves out short-closed POs ("Tutup PO"); closedAt check is a fallback.
        const res = await api.get('/purchase-orders?status=Submitted&open=1&limit=100');
        const all = res.data.data ?? res.data;
        return (all as any[]).filter((po: any) => !po.closedAt && (!po.partyId || po.partyId === partyId));
      } catch {
        return [];
      }
    },
    enabled: !!partyId,
  });

  const poOptions: SelectOption[] = [
    { value: '', label: t('receiptForm.noPOStandalone') },
    ...((openPOs ?? []).map((po: any) => ({
      value: po.id,
      label: po.partyId ? po.poNumber : t('receiptForm.generalPOOption', { number: po.poNumber }),
    })) as SelectOption[]),
  ];

  const itemOptions = (inventoryItems ?? []).map((i: any) => ({
    value: i.id,
    label: `${i.code} · ${i.name}`,
    meta: { unit: i.unit, avgCost: Number(i.averageCost ?? 0), name: i.name },
  }));

  const warehouseOptions: SelectOption[] = (warehouses ?? []).map((w: any) => ({ value: w.id, label: w.name }));

  const onItemPick = (idx: number, invId: string) => {
    const meta = itemOptions.find((o: any) => o.value === invId)?.meta;
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx
          ? {
              ...it,
              inventoryItemId: invId,
              itemName: meta?.name ?? it.itemName,
              unit: meta?.unit ?? it.unit,
            }
          : it,
      ),
    );
  };

  const updateItem = (idx: number, patch: Partial<GRItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const addItem = () => setItems((prev) => [...prev, defaultItem()]);
  const removeItem = (idx: number) =>
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/goods-receipts', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goods-receipts'] });
      // STT linked to a PO bumps its qtyReceived → receipt status changes.
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-order-detail'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      toast.success(t('receiptForm.toastSaved'));
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || t('receiptForm.errorSave')),
  });

  const handleSubmit = () => {
    setError('');
    if (!partyId) return setError(t('receiptForm.errorSupplier'));
    if (!date) return setError(t('receiptForm.errorDate'));
    const validItems = items.filter((it) => it.inventoryItemId && it.warehouseId && it.quantity > 0);
    if (validItems.length === 0) return setError(t('receiptForm.errorItems'));

    mutation.mutate({
      date,
      partyId,
      purchaseOrderId: isCustomerOwned ? null : (purchaseOrderId || null),
      isCustomerOwned,
      nomorMobil: nomorMobil.trim() || null,
      driverName: driverName.trim() || null,
      recipientName: recipientName.trim() || null,
      notes: notes.trim() || null,
      items: validItems.map((it) => ({
        inventoryItemId: it.inventoryItemId,
        warehouseId: it.warehouseId,
        itemName: it.itemName,
        quantity: Number(it.quantity),
        unit: it.unit,
        // Harga di-set di PI nanti. Backend pakai averageCost saat ini sebagai
        // provisional cost untuk JE accrual + weighted average.
        lockedUnitCost: 0,
        description: it.description.trim() || null,
        // Only keep the PO-line link while the STT still points at the PO the line came from.
        // Manual/edited lines without a link: match the PO line with the same inventory item
        // (unique candidate only; ambiguous → leave null, backend rejects with a clear message).
        purchaseOrderItemId:
          isCustomerOwned || !purchaseOrderId
            ? null
            : it.purchaseOrderItemId && it.sourcePurchaseOrderId === purchaseOrderId
              ? it.purchaseOrderItemId
              : (() => {
                  const c = poItemRefs.filter((r) => r.inventoryItemId && r.inventoryItemId === it.inventoryItemId);
                  return c.length === 1 ? c[0].id : null;
                })(),
      })),
    });
  };

  const cellLabel = 'text-xs font-medium text-muted-foreground md:sr-only';

  return (
    <FormDialog
      open
      onClose={onClose}
      title={t('receiptForm.title')}
      description={t('receiptForm.description')}
      size="doc"
      className="lg:max-w-5xl"
      busy={mutation.isPending}
      submitLabel={t('receiptForm.submit')}
      onSubmit={handleSubmit}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label={t('receiptForm.date')} required>
          <DateInput value={date} onChange={setDate} />
        </Field>
        <Field label={t('receiptForm.supplier')} required className="sm:col-span-2">
          <OptionPicker {...partyPicker.pickerProps} value={partyId} onChange={setPartyId} placeholder={t('receiptForm.supplierPlaceholder')} />
        </Field>
      </div>

      {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- wraps a Checkbox (button role) */}
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-info/30 bg-info-subtle px-3 py-2.5 sm:min-h-0">
        <Checkbox
          className="mt-0.5"
          checked={isCustomerOwned}
          onCheckedChange={(v) => {
            const checked = v === true;
            setIsCustomerOwned(checked);
            if (checked) setPurchaseOrderId('');
          }}
        />
        <span>
          <span className="text-sm font-medium text-info-text">{t('receiptForm.customerOwned')}</span>
          <span className="mt-0.5 block text-xs text-info-text">
            {t('receiptForm.customerOwnedHint')}
          </span>
        </span>
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label={t('receiptForm.poOptional')}>
          {isCustomerOwned ? (
            <Input value={t('receiptForm.poNotApplicable')} disabled readOnly />
          ) : (
            <OptionPicker
              options={poOptions}
              value={purchaseOrderId}
              onChange={(v) => void handlePickPO(v)}
              placeholder={loadingPO ? t('receiptForm.loadingPOLines') : t('receiptForm.noPO')}
            />
          )}
        </Field>
        <Field label={t('receiptForm.vehicleNo')}>
          <Input value={nomorMobil} onChange={(e) => setNomorMobil(e.target.value)} placeholder={t('receiptForm.vehicleNoPlaceholder')} className="font-mono uppercase" />
        </Field>
        <Field label={t('receiptForm.driver')}>
          <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('receiptForm.recipient')} hint={t('receiptForm.recipientHint')}>
          <Input value={recipientName} readOnly className="cursor-not-allowed bg-muted text-muted-foreground" />
        </Field>
        <Field label={t('receiptForm.notes')}>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>

      {/* Harga & subtotal tidak ditampilkan di STT; harga diisi saat invoice pembelian dibuat. */}
      <section aria-labelledby="gr-items-title" className="overflow-hidden rounded-xl border border-border">
        <h3 id="gr-items-title" className="bg-muted px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('receiptForm.itemsTitle', { count: items.length })}
        </h3>
        <div className="space-y-2 p-2">
          <div className="hidden grid-cols-12 gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid" aria-hidden>
            <div className="col-span-3">{t('receiptForm.columns.item')}</div>
            <div className="col-span-2">{t('receiptForm.columns.warehouse')}</div>
            <div className="col-span-2 text-right">{t('receiptForm.columns.qty')}</div>
            <div className="col-span-1">{t('receiptForm.columns.unit')}</div>
            <div className="col-span-3">{t('receiptForm.columns.description')}</div>
            <div className="col-span-1" />
          </div>
          {items.map((it, idx) => {
            const n = idx + 1;
            return (
              <div
                key={it.id}
                role="group"
                aria-label={t('receiptForm.itemRow', { n })}
                className="grid grid-cols-1 items-start gap-2 rounded-lg border border-border p-2 md:grid-cols-12 md:border-0 md:border-b md:rounded-none md:last:border-0"
              >
                <div className="flex flex-col gap-1 md:col-span-3">
                  <label htmlFor={`gr-item-${it.id}`} className={cellLabel}>{t('receiptForm.columns.item')}</label>
                  <OptionPicker
                    id={`gr-item-${it.id}`}
                    options={itemOptions}
                    value={it.inventoryItemId}
                    onChange={(v) => onItemPick(idx, v)}
                    placeholder={t('receiptForm.itemPlaceholder')}
                  />
                </div>
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label htmlFor={`gr-wh-${it.id}`} className={cellLabel}>{t('receiptForm.columns.warehouse')}</label>
                  <OptionPicker
                    id={`gr-wh-${it.id}`}
                    options={warehouseOptions}
                    value={it.warehouseId}
                    onChange={(v) => updateItem(idx, { warehouseId: v })}
                    placeholder={t('receiptForm.warehousePlaceholder')}
                  />
                </div>
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label htmlFor={`gr-qty-${it.id}`} className={cellLabel}>{t('receiptForm.columns.qty')}</label>
                  <NumberInput
                    id={`gr-qty-${it.id}`}
                    step="0.001"
                    inputMode="decimal"
                    value={it.quantity || ''}
                    onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                    className="num h-10 text-right md:h-9"
                  />
                </div>
                <div className="flex flex-col gap-1 md:col-span-1">
                  <label htmlFor={`gr-unit-${it.id}`} className={cellLabel}>{t('receiptForm.columns.unit')}</label>
                  <OptionPicker
                    id={`gr-unit-${it.id}`}
                    options={UNITS.map((u) => ({ value: u, label: u }))}
                    searchable={false}
                    value={it.unit}
                    onChange={(v) => updateItem(idx, { unit: v })}
                  />
                </div>
                <div className="flex flex-col gap-1 md:col-span-3">
                  <label htmlFor={`gr-desc-${it.id}`} className={cellLabel}>{t('receiptForm.columns.description')}</label>
                  <Input
                    id={`gr-desc-${it.id}`}
                    value={it.description}
                    onChange={(e) => updateItem(idx, { description: e.target.value })}
                    placeholder={t('receiptForm.descriptionPlaceholder')}
                  />
                </div>
                <div className="flex md:col-span-1 md:justify-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-touch"
                    className="w-full text-muted-foreground hover:text-danger-text md:size-9 md:w-9"
                    onClick={() => removeItem(idx)}
                    disabled={items.length === 1}
                    aria-label={t('receiptForm.removeItem', { n })}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t border-border px-3 py-2">
          <Button type="button" variant="ghost" size="sm" className="h-11 sm:h-8" onClick={addItem}>
            <Plus aria-hidden /> {t('receiptForm.addRow')}
          </Button>
        </div>
      </section>

      <ErrorAlert message={error} />

      <Callout tone="warning" icon={<span className="sr-only">{t('receiptForm.noteLabel')}</span>}>
        <strong>{t('receiptForm.noteLabel')}</strong> {t('receiptForm.costNote')}
      </Callout>
      <ConfirmDialog
        open={!!pendingPOLines}
        onOpenChange={(open) => { if (!open) setPendingPOLines(null); }}
        title={t('receiptForm.replaceLines.title')}
        description={
          pendingPOLines
            ? t('receiptForm.replaceLines.description', {
                count: pendingPOLines.lines.length,
                number: pendingPOLines.poNumber,
              })
            : undefined
        }
        confirmLabel={t('receiptForm.replaceLines.confirm')}
        onConfirm={() => {
          if (pendingPOLines) setItems(pendingPOLines.lines);
          setPendingPOLines(null);
        }}
      />
    </FormDialog>
  );
};

export default GoodsReceiptModal;
