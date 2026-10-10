import React, { useMemo, useState } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Plus, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { LOCALE } from '@/lib/format';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { DateInput, Field } from '@/components/shared';
import {
  FooterButton,
  FormDialogBody,
  FormDialogFooter,
  FormDialogHeader,
  FormError,
  TableRegion,
} from '@/components/sales-a/overlay-parts';
import { formDialogClass, formShellClass, numberInputClass } from '@/components/sales-a/overlay-classes';
import { PickerSelect, type PickerOption } from '@/components/sales-a/PickerSelect';
import { usePartyPicker } from '@/hooks/usePartyPicker';
import { OptionSelect } from '@/components/sales-a/OptionSelect';
import { WarehouseSelect } from '@/components/sales-a/WarehouseSelect';
import { cap } from '@/lib/permissions';

const UNITS = ['Kg', 'Ton', 'Sak', 'Liter', 'Pcs', 'Box', 'Unit', 'Set', 'Meter'];

interface DOItem {
  id: string;
  inventoryItemId: string;
  warehouseId: string;
  itemName: string;
  quantity: number;
  unit: string;
  description: string;
  // Diisi saat baris ditarik dari SO → submit lewat endpoint generate-do
  // (otomatis kurangi SO + update status). Kosong = baris manual/standalone.
  salesOrderItemId?: string;
}

const defaultItem = (): DOItem => ({
  id: crypto.randomUUID(),
  inventoryItemId: '',
  warehouseId: '',
  itemName: '',
  quantity: 1,
  unit: 'Kg',
  description: '',
});

interface Props {
  onClose: () => void;
  /** Existing DO to edit. When provided, modal opens in edit mode: PUT /:id
   *  instead of POST /, pre-filled with the DO's current header + items. */
  editDO?: {
    id: string;
    doNumber: string;
    date: string;
    partyId: string;
    nomorMobil: string | null;
    driverName: string | null;
    recipientName: string | null;
    notes: string | null;
    items: Array<{
      id: string;
      inventoryItemId: string | null;
      warehouseId: string | null;
      itemName: string;
      quantity: number;
      unit: string;
      description: string | null;
    }>;
  };
}

const DeliveryOrderModal: React.FC<Props> = ({ onClose, editDO }) => {
  const { t } = useTranslation('sales');
  const today = new Date().toISOString().split('T')[0];
  const isEdit = !!editDO;

  const [date, setDate] = useState(() => editDO ? editDO.date.slice(0, 10) : today);
  const [partyId, setPartyId] = useState(() => editDO?.partyId ?? '');
  const [nomorMobil, setNomorMobil] = useState(() => editDO?.nomorMobil ?? '');
  const [driverName, setDriverName] = useState(() => editDO?.driverName ?? '');
  const [recipientName, setRecipientName] = useState(() => editDO?.recipientName ?? '');
  const [notes, setNotes] = useState(() => editDO?.notes ?? '');
  const [items, setItems] = useState<DOItem[]>(() =>
    editDO
      ? editDO.items.map((it) => ({
          id: crypto.randomUUID(),
          inventoryItemId: it.inventoryItemId ?? '',
          warehouseId: it.warehouseId ?? '',
          itemName: it.itemName,
          quantity: Number(it.quantity),
          unit: it.unit,
          description: it.description ?? '',
        }))
      : [defaultItem()],
  );
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [negativeStockReason, setNegativeStockReason] = useState('');
  const isAdmin = cap('inventory.negative_stock');
  const [salesOrderId, setSalesOrderId] = useState('');
  const [error, setError] = useState('');
  // Surat Jalan Sementara yang ditautkan ke DO resmi ini
  const [tempNoteIds, setTempNoteIds] = useState<string[]>([]);

  const queryClient = useQueryClient();

  const partyPicker = usePartyPicker({ type: 'Customer', selectedId: partyId || null });

  // SO terbuka (Submitted/PartiallyDelivered) utk fitur "Tarik dari SO".
  const { data: openSOs } = useQuery({
    queryKey: ['open-sales-orders'],
    queryFn: async () => {
      const res = await api.get('/sales-orders', { params: { limit: 200 } });
      const all: any[] = res.data.data ?? res.data;
      return all.filter((so: any) => so.status === 'Submitted' || so.status === 'PartiallyDelivered');
    },
    enabled: !isEdit,
  });

  // Surat Jalan Sementara Terbuka milik pelanggan terpilih (hanya saat DO baru)
  // Ganti pelanggan → pilihan SJS sebelumnya tidak berlaku lagi
  React.useEffect(() => { setTempNoteIds([]); }, [partyId]);

  const { data: linkableNotes } = useQuery({
    queryKey: ['temporary-delivery-notes-linkable', partyId],
    queryFn: async () => (await api.get('/temporary-delivery-notes/linkable', { params: { partyId } })).data as any[],
    enabled: !isEdit && !!partyId,
  });

  const { data: inventoryItems } = useQuery({
    queryKey: ['inventory-items-active'],
    queryFn: async () => {
      const res = await api.get('/inventory/items');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((i: any) => i.isActive !== false);
    },
  });

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses-active'],
    queryFn: async () => {
      const res = await api.get('/warehouses?active=true');
      return (res.data.data ?? res.data) as any[];
    },
  });

  const selectedParty = partyPicker.selectedParty;


  const inventoryOptions = useMemo<PickerOption[]>(
    () =>
      (inventoryItems ?? []).map((inv: any) => ({
        value: inv.id,
        label: `${inv.code} · ${inv.name}`,
      })),
    [inventoryItems],
  );

  // Stok PER GUDANG: ambil stok item untuk tiap gudang yang dipakai di baris.
  // /inventory/items?warehouseId=X meng-override currentStock jadi stok gudang
  // tsb. Dipakai utk tampilan & validasi per baris (bukan total semua gudang).
  const usedWarehouseIds = useMemo(
    () => [...new Set(items.filter((i) => i.inventoryItemId && i.warehouseId).map((i) => i.warehouseId))],
    [items],
  );
  const whStockQueries = useQueries({
    queries: usedWarehouseIds.map((wh) => ({
      queryKey: ['inv-stock-by-wh', wh],
      queryFn: async () => {
        const res = await api.get('/inventory/items', { params: { warehouseId: wh, limit: 1000 } });
        const arr: any[] = res.data.data ?? res.data;
        const m: Record<string, number> = {};
        for (const it of arr) m[it.id] = Number(it.currentStock);
        return m;
      },
      staleTime: 30_000,
    })),
  });
  const whStock: Record<string, Record<string, number>> = {};
  usedWarehouseIds.forEach((wh, i) => { whStock[wh] = (whStockQueries[i]?.data as Record<string, number>) ?? {}; });
  // Stok gudang utk satu baris (null = belum ada gudang / belum termuat).
  const lineStock = (itemId: string, warehouseId: string): number | null => {
    if (!itemId || !warehouseId) return null;
    const map = whStock[warehouseId];
    if (!map) return null;
    return map[itemId] ?? 0;
  };

  // Opsi SO: kalau pelanggan sudah dipilih, batasi ke SO pelanggan itu.
  const soOptions = useMemo<PickerOption[]>(
    () => (openSOs ?? [])
      .filter((so: any) => !partyId || so.partyId === partyId)
      .map((so: any) => ({ value: so.id, label: `${so.soNumber} · ${so.customer?.name ?? ''}` })),
    [openSOs, partyId],
  );

  // Tarik baris dari SO: prefill item dari sisa belum-terkirim + link SO item.
  const handlePickSO = async (soId: string) => {
    setSalesOrderId(soId);
    setError('');
    if (!soId) return;
    try {
      const res = await api.get(`/sales-orders/${soId}`);
      const so = res.data;
      setPartyId(so.partyId);
      // Semua baris SO ikut tampil. Sisa belum-terkirim jadi qty default;
      // baris yang sudah penuh prefill 0 — staff tetap bisa menambah untuk
      // kirim LEBIH dari qty SO (over-delivery diizinkan, SO tampil "+X lebih").
      const rows: DOItem[] = (so.items ?? []).map((it: any) => {
        const remaining = Number(it.quantity) - Number(it.deliveredQty ?? 0);
        return {
          id: crypto.randomUUID(),
          inventoryItemId: it.inventoryItemId ?? '',
          warehouseId: '',
          itemName: it.itemName,
          quantity: Number(Math.max(remaining, 0).toFixed(3)),
          unit: it.unit,
          description: it.description ?? '',
          salesOrderItemId: it.id,
        };
      });
      setItems(rows.length > 0 ? rows : [defaultItem()]);
      if (rows.length > 0 && rows.every((r) => r.quantity === 0)) {
        toast.info(t('deliveryOrderModal.toast.allDelivered'));
      }
    } catch {
      setError(t('deliveryOrderModal.errors.loadSo'));
    }
  };

  const mutation = useMutation({
    mutationFn: async (vars: { endpoint: string; method: 'post' | 'put'; body: any }) => {
      const res = vars.method === 'put' ? await api.put(vars.endpoint, vars.body) : await api.post(vars.endpoint, vars.body);
      return res.data;
    },
    onSuccess: (data: any) => {
      if (data?.pendingApproval) {
        toast.success(t('deliveryOrderModal.toast.pendingApproval'));
      } else {
        toast.success(
          isEdit
            ? t('deliveryOrderModal.toast.updated', { number: editDO!.doNumber })
            : t('deliveryOrderModal.toast.created'),
        );
      }
      queryClient.invalidateQueries({ queryKey: ['delivery-orders'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-order-detail'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items-active'] });
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      queryClient.invalidateQueries({ queryKey: ['open-sales-orders'] });
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || (isEdit ? t('deliveryOrderModal.errors.edit') : t('deliveryOrderModal.errors.save'))),
  });

  const addItem = () => setItems([...items, defaultItem()]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof DOItem, value: any) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: value };
    setItems(next);
  };
  const selectInventoryItem = (idx: number, inventoryId: string) => {
    const inv = inventoryItems?.find((i: any) => i.id === inventoryId);
    const next = [...items];
    if (inv) {
      next[idx] = { ...next[idx], inventoryItemId: inventoryId, itemName: inv.name, unit: inv.unit || 'Kg' };
    } else {
      next[idx] = { ...next[idx], inventoryItemId: '', itemName: '' };
    }
    setItems(next);
  };

  // Total qty per unit (don't sum across different units — meaningless).
  const totalQtyByUnit = items.reduce<Record<string, number>>((acc, it) => {
    if (!it.itemName || !it.quantity) return acc;
    const u = it.unit || 'Pcs';
    acc[u] = (acc[u] ?? 0) + Number(it.quantity);
    return acc;
  }, {});

  // Deteksi kekurangan stok PER (item + gudang) — bukan total semua gudang.
  const stockShortages = (() => {
    const qtyByKey = new Map<string, { itemId: string; warehouseId: string; needed: number }>();
    for (const it of items) {
      if (!it.inventoryItemId || !it.warehouseId) continue;
      const key = `${it.inventoryItemId}|${it.warehouseId}`;
      const prev = qtyByKey.get(key);
      qtyByKey.set(key, { itemId: it.inventoryItemId, warehouseId: it.warehouseId, needed: (prev?.needed ?? 0) + (Number(it.quantity) || 0) });
    }
    const out: { id: string; name: string; unit: string; warehouse: string; available: number; needed: number }[] = [];
    qtyByKey.forEach(({ itemId, warehouseId, needed }) => {
      const inv = inventoryItems?.find((i: any) => i.id === itemId);
      if (!inv) return;
      const available = lineStock(itemId, warehouseId);
      if (available == null) return; // stok gudang belum termuat — jangan blok
      if (available < needed) {
        const wh = warehouses?.find((w: any) => w.id === warehouseId);
        out.push({ id: itemId, name: inv.name, unit: inv.unit || '', warehouse: wh?.name ?? wh?.code ?? '', available, needed });
      }
    });
    return out;
  })();
  const hasShortage = stockShortages.length > 0;

  // Product line must have a warehouse so backend can decrement stock.
  const hasMissingWarehouse = items.some(
    (i) => i.inventoryItemId && !i.warehouseId,
  );
  const validItems = items.filter((i) => i.itemName && Number(i.quantity) > 0);
  const canSubmit =
    !!partyId &&
    validItems.length > 0 &&
    !hasMissingWarehouse &&
    (!hasShortage || allowNegativeStock) &&
    !mutation.isPending;

  const handleSubmit = () => {
    setError('');
    if (!partyId) { setError(t('deliveryOrderModal.validation.customer')); return; }
    if (validItems.length === 0) { setError(t('deliveryOrderModal.validation.minItem')); return; }
    if (hasMissingWarehouse) { setError(t('deliveryOrderModal.validation.warehouse')); return; }
    if (allowNegativeStock && negativeStockReason.trim().length < 10) {
      setError(t('deliveryOrderModal.validation.reasonMin'));
      return;
    }

    // Ditarik dari SO → submit lewat generate-do (otomatis kurangi SO + status).
    if (!isEdit && salesOrderId) {
      const soItems = validItems.filter((i) => i.salesOrderItemId);
      if (soItems.length === 0) { setError(t('deliveryOrderModal.validation.noSoLines')); return; }
      mutation.mutate({
        endpoint: `/sales-orders/${salesOrderId}/generate-do`,
        method: 'post',
        body: {
          date,
          nomorMobil: nomorMobil.trim() || null,
          driverName: driverName.trim() || null,
          recipientName: recipientName.trim() || null,
          notes: notes.trim() || null,
          allowNegativeStock,
          negativeStockReason: allowNegativeStock ? negativeStockReason.trim() : null,
          temporaryNoteIds: tempNoteIds,
          items: soItems.map((i) => ({
            salesOrderItemId: i.salesOrderItemId,
            warehouseId: i.warehouseId || null,
            quantity: Number(i.quantity),
            description: i.description?.trim() || null,
          })),
        },
      });
      return;
    }

    mutation.mutate({
      endpoint: isEdit ? `/delivery-orders/${editDO!.id}` : '/delivery-orders',
      method: isEdit ? 'put' : 'post',
      body: {
        date,
        partyId,
        nomorMobil: nomorMobil.trim() || null,
        driverName: driverName.trim() || null,
        recipientName: recipientName.trim() || null,
        notes: notes.trim() || null,
        allowNegativeStock,
        negativeStockReason: allowNegativeStock ? negativeStockReason.trim() : null,
        ...(isEdit ? {} : { temporaryNoteIds: tempNoteIds }),
        items: validItems.map((i) => ({
          inventoryItemId: i.inventoryItemId || null,
          warehouseId: i.warehouseId || null,
          itemName: i.itemName,
          quantity: Number(i.quantity),
          unit: i.unit,
          description: i.description.trim() || null,
        })),
      },
    });
  };

  const sectionLabel = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';
  const fmt3 = (n: number) => n.toLocaleString(LOCALE, { maximumFractionDigits: 3 });

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className={`${formDialogClass} sm:max-w-4xl`}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className={formShellClass}>
          <FormDialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="size-5 text-primary" aria-hidden />
              {isEdit ? t('deliveryOrderModal.titleEdit', { number: editDO!.doNumber }) : t('deliveryOrderModal.titleCreate')}
            </DialogTitle>
            <DialogDescription>{t('deliveryOrderModal.description')}</DialogDescription>
          </FormDialogHeader>

          <FormDialogBody className="space-y-5">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                {!isEdit && (
                  <Field
                    label={t('deliveryOrderModal.fields.fromSo')}
                    hint={salesOrderId ? t('deliveryOrderModal.fields.fromSoHint') : undefined}
                  >
                    {() => (
                      <PickerSelect
                        aria-label={t('deliveryOrderModal.fields.fromSoAria')}
                        options={soOptions}
                        value={salesOrderId}
                        onChange={(v) => void handlePickSO(v)}
                        placeholder={t('deliveryOrderModal.fields.fromSoPlaceholder')}
                      />
                    )}
                  </Field>
                )}
                <Field label={t('deliveryOrderModal.fields.customer')} required>
                  {() => (
                    <PickerSelect
                      aria-label={t('deliveryOrderModal.fields.customer')}
                      {...partyPicker.pickerProps}
                      value={partyId}
                      onChange={setPartyId}
                      placeholder={t('deliveryOrderModal.fields.customerPlaceholder')}
                      disabled={!!salesOrderId}
                    />
                  )}
                </Field>
                {selectedParty && (
                  <div className="space-y-0.5 pl-1 text-xs text-muted-foreground">
                    {selectedParty.phone && <p>{selectedParty.phone}</p>}
                    {selectedParty.address && <p>{selectedParty.address}</p>}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t('deliveryOrderModal.fields.date')} className="sm:col-span-2">
                  {(c) => <DateInput id={c.id} value={date} onChange={setDate} />}
                </Field>
                <Field label={t('deliveryOrderModal.fields.vehicle')}>
                  <Input value={nomorMobil} onChange={(e) => setNomorMobil(e.target.value)}
                    placeholder={t('deliveryOrderModal.fields.vehiclePlaceholder')} maxLength={30} className="uppercase" autoComplete="off" />
                </Field>
                <Field label={t('deliveryOrderModal.fields.driver')}>
                  <Input value={driverName} onChange={(e) => setDriverName(e.target.value)}
                    placeholder={t('deliveryOrderModal.fields.driverPlaceholder')} maxLength={100} autoComplete="off" />
                </Field>
                <Field label={t('deliveryOrderModal.fields.recipient')} className="sm:col-span-2">
                  <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)}
                    placeholder={t('deliveryOrderModal.fields.recipientPlaceholder')} maxLength={100} autoComplete="off" />
                </Field>
              </div>
            </div>

            {!isEdit && partyId && (linkableNotes?.length ?? 0) > 0 && (
              <fieldset className="rounded-lg border border-warning/30 bg-warning-subtle px-4 py-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-warning-text">{t('deliveryOrderModal.linkNotes.legend')}</legend>
                <p className="mb-2 text-xs text-warning-text">
                  {t('deliveryOrderModal.linkNotes.help')}
                </p>
                <div className="space-y-1.5">
                  {linkableNotes!.map((n: any) => (
                    <label key={n.id} htmlFor={`tnote-${n.id}`} className="flex cursor-pointer items-start gap-2 text-sm max-sm:min-h-11">
                      <Checkbox
                        id={`tnote-${n.id}`}
                        className="mt-1"
                        checked={tempNoteIds.includes(n.id)}
                        onCheckedChange={(checked) => setTempNoteIds((ids) => (checked === true ? [...ids, n.id] : ids.filter((x) => x !== n.id)))}
                      />
                      <span>
                        <span className="font-mono text-xs">{n.number}</span>
                        <span className="text-xs text-muted-foreground"> · {String(n.date).slice(0, 10)}{n.nomorMobil ? ` · ${String(n.nomorMobil).toUpperCase()}` : ''}</span>
                        <span className="block text-xs text-foreground">
                          {(n.items ?? []).map((it: any) => `${it.itemName} ${Number(it.quantity).toLocaleString(LOCALE)} ${it.unit}`).join(', ')}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <section aria-labelledby="do-items-title">
              <div className="mb-3 flex items-center justify-between">
                <h3 id="do-items-title" className={sectionLabel}>{t('deliveryOrderModal.items.title')}</h3>
                <Button variant="ghost" size="sm" className="text-primary max-sm:h-11" onClick={addItem}>
                  <Plus aria-hidden /> {t('deliveryOrderModal.items.addRow')}
                </Button>
              </div>

              <TableRegion label={t('deliveryOrderModal.items.tableLabel')}>
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="w-8 px-4 py-3 text-left">#</th>
                      <th scope="col" className="min-w-[260px] px-4 py-3 text-left">{t('deliveryOrderModal.columns.itemName')}</th>
                      <th scope="col" className="w-28 min-w-[96px] px-3 py-3 text-right">{t('deliveryOrderModal.columns.qty')}</th>
                      <th scope="col" className="w-28 px-3 py-3 text-left">{t('deliveryOrderModal.columns.unit')}</th>
                      <th scope="col" className="min-w-[160px] px-3 py-3 text-left">{t('deliveryOrderModal.columns.description')}</th>
                      <th scope="col" className="w-12 px-2 py-3"><span className="sr-only">{t('deliveryOrderModal.columns.actions')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">{idx + 1}</td>
                        <td className="space-y-1.5 px-4 py-3">
                          <PickerSelect
                            aria-label={t('deliveryOrderModal.rows.item', { row: idx + 1 })}
                            options={inventoryOptions}
                            value={item.inventoryItemId}
                            onChange={(v) => selectInventoryItem(idx, v)}
                            placeholder={t('deliveryOrderModal.rows.itemPlaceholder')}
                          />
                          {!item.inventoryItemId && (
                            <Input
                              aria-label={t('deliveryOrderModal.rows.manualName', { row: idx + 1 })}
                              value={item.itemName}
                              onChange={(e) => updateItem(idx, 'itemName', e.target.value)}
                              placeholder={t('deliveryOrderModal.rows.manualNamePlaceholder')}
                              className="h-9 text-xs"
                              autoComplete="off"
                            />
                          )}
                          {item.inventoryItemId && (
                            <div className="space-y-1">
                              <WarehouseSelect
                                value={item.warehouseId}
                                onChange={(v) => updateItem(idx, 'warehouseId', v)}
                                label={t('deliveryOrderModal.rows.warehouse', { row: idx + 1 })}
                              />
                              {item.warehouseId && (() => {
                                const avail = lineStock(item.inventoryItemId, item.warehouseId);
                                if (avail == null) return <p className="text-[11px] text-muted-foreground">{t('deliveryOrderModal.rows.loadingStock')}</p>;
                                const short = avail < (Number(item.quantity) || 0);
                                return (
                                  <p className={`text-[11px] ${short ? 'font-medium text-danger-text' : 'text-muted-foreground'}`}>
                                    {t('deliveryOrderModal.rows.stockHere', { qty: fmt3(avail), unit: item.unit })}
                                  </p>
                                );
                              })()}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <NumberInput
                            aria-label={t('deliveryOrderModal.rows.qty', { row: idx + 1 })}
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                            min={0}
                            className={numberInputClass}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <OptionSelect
                            aria-label={t('deliveryOrderModal.rows.unit', { row: idx + 1 })}
                            value={item.unit}
                            onChange={(v) => updateItem(idx, 'unit', v)}
                            options={UNITS.map((u) => ({ value: u, label: u }))}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <Input
                            aria-label={t('deliveryOrderModal.rows.description', { row: idx + 1 })}
                            value={item.description}
                            onChange={(e) => updateItem(idx, 'description', e.target.value)}
                            placeholder={t('deliveryOrderModal.rows.descriptionPlaceholder')}
                            className="h-9 text-xs"
                            autoComplete="off"
                          />
                        </td>
                        <td className="px-2 py-3 text-center">
                          {items.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-danger-text max-sm:size-11"
                              aria-label={t('deliveryOrderModal.rows.remove', { row: idx + 1 })}
                              onClick={() => removeItem(idx)}
                            >
                              <Trash2 aria-hidden />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableRegion>
            </section>

            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
              <Field label={t('deliveryOrderModal.fields.notes')}>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('deliveryOrderModal.fields.notesPlaceholder')}
                  rows={3}
                  className="resize-none"
                />
              </Field>

              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <p className={`${sectionLabel} mb-2`}>{t('deliveryOrderModal.summary.title')}</p>
                {Object.keys(totalQtyByUnit).length === 0 ? (
                  <p className="text-xs italic text-muted-foreground">{t('deliveryOrderModal.summary.empty')}</p>
                ) : (
                  <div className="space-y-1.5">
                    {Object.entries(totalQtyByUnit).map(([u, q]) => (
                      <div key={u} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t('deliveryOrderModal.summary.total', { unit: u })}</span>
                        <span className="tabular-nums text-foreground">{fmt3(q)} {u}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-[11px] italic text-muted-foreground">
                  {t('deliveryOrderModal.summary.note')}
                </p>
              </div>
            </div>

            {hasShortage && (
              <div role="alert" className="rounded-lg border border-warning/30 bg-warning-subtle p-3 text-sm text-warning-text">
                <div className="mb-2 flex items-start gap-2">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <div>
                    <p className="font-medium">{t('deliveryOrderModal.shortage.title')}</p>
                    <ul className="ml-1 mt-1 list-inside list-disc space-y-0.5 text-xs">
                      {stockShortages.map((s) => (
                        <li key={s.id}>
                          <span className="font-medium">{s.name}</span> @ {s.warehouse}: {t('deliveryOrderModal.shortage.line', { available: fmt3(s.available), needed: fmt3(s.needed), unit: s.unit })}
                          <span> {t('deliveryOrderModal.shortage.short', { qty: fmt3(s.needed - s.available) })}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="mt-2 space-y-2 pl-6">
                  <label className="flex cursor-pointer items-start gap-2 text-xs max-sm:min-h-11">
                    <Checkbox
                      className="mt-0.5"
                      checked={allowNegativeStock}
                      onCheckedChange={(checked) => setAllowNegativeStock(checked === true)}
                    />
                    {isAdmin ? (
                      <span>
                        <strong>{t('deliveryOrderModal.shortage.adminOverride')}</strong> {t('deliveryOrderModal.shortage.adminOverrideText')}
                      </span>
                    ) : (
                      <span>
                        <strong>{t('deliveryOrderModal.shortage.requestApproval')}</strong> {t('deliveryOrderModal.shortage.requestApprovalText')} <strong>{t('deliveryOrderModal.shortage.managerApproved')}</strong>.
                      </span>
                    )}
                  </label>
                  {allowNegativeStock && (
                    <Field label={isAdmin ? t('deliveryOrderModal.shortage.reasonBypass') : t('deliveryOrderModal.shortage.reasonRequest')} required>
                      <Textarea
                        value={negativeStockReason}
                        onChange={(e) => setNegativeStockReason(e.target.value)}
                        placeholder={isAdmin ? t('deliveryOrderModal.shortage.reasonBypassPlaceholder') : t('deliveryOrderModal.shortage.reasonPlaceholder')}
                        className="text-xs"
                        rows={2}
                      />
                    </Field>
                  )}
                </div>
              </div>
            )}

            <FormError>{error}</FormError>
          </FormDialogBody>

          <FormDialogFooter>
            <FooterButton variant="ghost" onClick={onClose} disabled={mutation.isPending}>{t('deliveryOrderModal.cancel')}</FooterButton>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3">
              <p className="text-xs text-muted-foreground">
                {canSubmit
                  ? t('deliveryOrderModal.footer.ready')
                  : hasMissingWarehouse
                    ? t('deliveryOrderModal.validation.warehouse')
                    : !partyId
                      ? t('deliveryOrderModal.footer.needCustomer')
                      : t('deliveryOrderModal.footer.needItem')}
              </p>
              <FooterButton type="submit" loading={mutation.isPending} disabled={!canSubmit && !mutation.isPending}>
                {mutation.isPending ? t('deliveryOrderModal.saving') : t('deliveryOrderModal.submit')}
              </FooterButton>
            </div>
          </FormDialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default DeliveryOrderModal;
