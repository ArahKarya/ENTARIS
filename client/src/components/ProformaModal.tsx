import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Plus, Trash2 } from 'lucide-react';
import { formatRupiah } from '@/lib/format';
import { PickerSelect, type PickerOption } from '@/components/sales-a/PickerSelect';
import { usePartyPicker } from '@/hooks/usePartyPicker';
import { OptionSelect } from '@/components/sales-a/OptionSelect';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
} from '@/components/sales-a/overlay-parts';
import { formDialogClass, formShellClass, numberInputClass } from '@/components/sales-a/overlay-classes';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface ProformaItem {
  id: string;
  itemName: string;
  itemType: 'product' | 'service';
  inventoryItemId: string;
  serviceItemId: string;
  accountId: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  discount: number;
  taxPct: number;
  pphPct: number;
}

const UNITS = ['Kg', 'Ton', 'Sak', 'Liter', 'Pcs', 'Box', 'Unit', 'Set', 'Meter', 'Jasa'];

const defaultItem = (): ProformaItem => ({
  id: crypto.randomUUID(), itemName: '', itemType: 'product', inventoryItemId: '', serviceItemId: '',
  accountId: '', description: '', quantity: 1, unit: 'Kg', rate: 0, discount: 0, taxPct: 0, pphPct: 0,
});

interface ApiRow { id: string; code?: string; name: string; unit?: string | null; isActive?: boolean; accountNumber?: string }
interface ApiErr { response?: { data?: { error?: string } } }
/** Sumber prefill / record yang diedit; field longgar karena datang dari API & dokumen sumber. */
type EditTarget = {
  id?: string; sourceKey?: string; proformaNumber?: string; partyId?: string; customer?: { id: string; name: string } | null;
  quotationId?: string | null; salesOrderId?: string | null; customerRefNo?: string | null; requestedAmount?: number | string | null;
  notes?: string | null; terms?: string | null; potongan?: number | string; biayaLain?: number | string;
  labelPotongan?: string | null; labelBiaya?: string | null; date?: string; validUntil?: string;
  items?: Array<Partial<ProformaItem> & { serviceItemId?: string | null }>;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editTarget?: EditTarget | null;
  // Called after a NEW proforma is created (not on edit). Receives the
  // server response so the caller can run side-effects like linking an
  // inquiry → quotation. Awaited before the modal closes.
  onCreated?: (proforma: unknown) => void | Promise<void>;
}

const ProformaModal: React.FC<Props> = ({ isOpen, onClose, editTarget, onCreated }) => {
  const { t } = useTranslation('sales');
  const isEdit = Boolean(editTarget?.id);
  const today = new Date().toISOString().split('T')[0];
  const defaultValidUntil = new Date(new Date().getTime() + 30 * 86400000).toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [validUntil, setValidUntil] = useState(defaultValidUntil);
  const [partyId, setPartyId] = useState('');
  const [notes, setNotes] = useState('');
  const [customerRefNo, setCustomerRefNo] = useState('');
  const [requestedAmount, setRequestedAmount] = useState(0);
  const [terms, setTerms] = useState(() => t('proformaModal.defaults.terms'));
  const [potongan, setPotongan] = useState(0);
  const [biayaLain, setBiayaLain] = useState(0);
  const [labelPotongan, setLabelPotongan] = useState(() => t('proformaModal.defaults.discountLabel'));
  const [labelBiaya, setLabelBiaya] = useState(() => t('proformaModal.defaults.otherCostLabel'));
  const [items, setItems] = useState<ProformaItem[]>([defaultItem()]);
  const [error, setError] = useState('');


  const queryClient = useQueryClient();

  const partyPicker = usePartyPicker({ type: 'Customer', selectedId: partyId || null, known: editTarget?.customer ?? null });

  const { data: inventoryItems } = useQuery({
    queryKey: ['inventory-items-active'],
    queryFn: async () => {
      const res = await api.get('/inventory/items');
      const all: ApiRow[] = res.data.data ?? res.data;
      return all.filter((i) => i.isActive !== false);
    },
  });

  const { data: serviceItems } = useQuery({
    queryKey: ['service-items-active'],
    queryFn: async () => {
      const res = await api.get('/service-items?isActive=true');
      return res.data.data ?? res.data;
    },
  });

  // Default revenue accounts: 4.1 Penjualan (product), 4.2 Pendapatan Jasa (service)
  const { data: accounts } = useQuery({
    queryKey: ['coa-flat'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      return res.data.data ?? res.data;
    },
  });
  const defaultProductAccountId = useMemo(() => accounts?.find((a: ApiRow) => a.accountNumber === '4.1')?.id ?? '', [accounts]);
  const defaultServiceAccountId = useMemo(() => accounts?.find((a: ApiRow) => a.accountNumber === '4.2')?.id ?? '', [accounts]);

  // Hydrate form when editTarget changes
  useEffect(() => {
    if (!isOpen) return;
    if (editTarget?.id) {
      setDate(editTarget.date ? new Date(editTarget.date).toISOString().split('T')[0] : today);
      setValidUntil(editTarget.validUntil ? new Date(editTarget.validUntil).toISOString().split('T')[0] : defaultValidUntil);
      setPartyId(editTarget.partyId ?? '');
      setNotes(editTarget.notes ?? '');
      setCustomerRefNo(editTarget.customerRefNo ?? '');
      setRequestedAmount(editTarget.requestedAmount != null ? Number(editTarget.requestedAmount) : 0);
      setTerms(editTarget.terms ?? '');
      setPotongan(Number(editTarget.potongan ?? 0));
      setBiayaLain(Number(editTarget.biayaLain ?? 0));
      setLabelPotongan(editTarget.labelPotongan ?? t('proformaModal.defaults.discountLabel'));
      setLabelBiaya(editTarget.labelBiaya ?? t('proformaModal.defaults.otherCostLabel'));
      setItems(
        (editTarget.items ?? []).map((it) => ({
          id: crypto.randomUUID(),
          itemName: it.itemName ?? '',
          itemType: it.itemType ?? (it.serviceItemId ? 'service' : 'product'),
          inventoryItemId: it.inventoryItemId ?? '',
          serviceItemId: it.serviceItemId ?? '',
          accountId: it.accountId ?? '',
          description: it.description ?? '',
          quantity: Number(it.quantity ?? 0),
          unit: it.unit ?? 'Kg',
          rate: Number(it.rate ?? 0),
          discount: Number(it.discount ?? 0),
          taxPct: Number(it.taxPct ?? 0),
          pphPct: Number(it.pphPct ?? 0),
        })),
      );
    } else {
      // Pembuatan baru, bisa diisi awal dari Quotation / Sales Order (editTarget tanpa id).
      const pre = editTarget ?? {};
      setDate(today);
      setValidUntil(defaultValidUntil);
      setPartyId(pre.partyId ?? '');
      setNotes(pre.notes ?? '');
      setCustomerRefNo(pre.customerRefNo ?? '');
      setRequestedAmount(0);
      setTerms(pre.terms ?? t('proformaModal.defaults.terms'));
      setPotongan(Number(pre.potongan ?? 0));
      setBiayaLain(Number(pre.biayaLain ?? 0));
      setLabelPotongan(pre.labelPotongan ?? t('proformaModal.defaults.discountLabel'));
      setLabelBiaya(pre.labelBiaya ?? t('proformaModal.defaults.otherCostLabel'));
      setItems(
        Array.isArray(pre.items) && pre.items.length > 0
          ? pre.items.map((it) => ({
              id: crypto.randomUUID(),
              itemName: it.itemName ?? '',
              itemType: it.itemType ?? (it.serviceItemId ? 'service' : 'product'),
              inventoryItemId: it.inventoryItemId ?? '',
              serviceItemId: it.serviceItemId ?? '',
              accountId: it.accountId ?? '',
              description: it.description ?? '',
              quantity: Number(it.quantity ?? 1),
              unit: it.unit ?? 'Kg',
              rate: Number(it.rate ?? 0),
              discount: Number(it.discount ?? 0),
              taxPct: Number(it.taxPct ?? 0),
              pphPct: Number(it.pphPct ?? 0),
            }))
          : [defaultItem()],
      );
    }
    setError('');
    // Reset only on open or when a different record is edited; other editTarget fields are a snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editTarget?.id, editTarget?.sourceKey]);

  const inventoryOptions = useMemo<PickerOption[]>(
    () =>
      (inventoryItems ?? []).map((inv: ApiRow) => ({
        value: inv.id,
        label: `${inv.code} · ${inv.name}`,
      })),
    [inventoryItems],
  );

  const serviceOptions = useMemo<PickerOption[]>(
    () =>
      (serviceItems ?? []).map((svc: ApiRow) => ({
        value: svc.id,
        label: `${svc.code} · ${svc.name}`,
      })),
    [serviceItems],
  );

  const mutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const url = isEdit ? `/proforma-invoices/${editTarget?.id}` : '/proforma-invoices';
      const method = isEdit ? 'put' : 'post';
      const res = await api[method](url, data);
      return res.data;
    },
    onSuccess: async (data) => {
      toast.success(isEdit ? t('proformaModal.toast.updated') : t('proformaModal.toast.created'));
      queryClient.invalidateQueries({ queryKey: ['proforma-invoices'] });
      if (!isEdit && onCreated) {
        try { await onCreated(data); } catch { /* caller handles its own toast */ }
      }
      onClose();
    },
    onError: (err: ApiErr) => setError(err.response?.data?.error ?? t('proformaModal.errors.saveFailed')),
  });

  const updateItem = (i: number, field: keyof ProformaItem, value: string | number) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: value };
    setItems(next);
  };
  const addItem = () => setItems([...items, defaultItem()]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  const selectInventoryItem = (idx: number, id: string) => {
    const inv = inventoryItems?.find((i: ApiRow) => i.id === id);
    const next = [...items];
    if (inv) {
      next[idx] = {
        ...next[idx],
        inventoryItemId: id,
        itemName: inv.name,
        unit: inv.unit || 'Kg',
        accountId: next[idx].accountId || defaultProductAccountId,
      };
    } else {
      next[idx] = { ...next[idx], inventoryItemId: '', itemName: '' };
    }
    setItems(next);
  };

  const selectServiceItem = (idx: number, id: string) => {
    const svc = serviceItems?.find((s: ApiRow) => s.id === id);
    const next = [...items];
    if (svc) {
      next[idx] = {
        ...next[idx],
        serviceItemId: id,
        itemName: svc.name,
        unit: svc.unit || 'Jasa',
        rate: svc.defaultRate ? Number(svc.defaultRate) : next[idx].rate,
        accountId: svc.accountId || defaultServiceAccountId,
      };
    } else {
      next[idx] = { ...next[idx], serviceItemId: '', itemName: '', accountId: '' };
    }
    setItems(next);
  };

  const toggleItemType = (idx: number, newType: 'product' | 'service') => {
    const next = [...items];
    next[idx] = {
      ...next[idx],
      itemType: newType,
      inventoryItemId: '',
      serviceItemId: '',
      accountId: newType === 'service' ? defaultServiceAccountId : defaultProductAccountId,
      itemName: '',
      unit: newType === 'service' ? 'Jasa' : 'Kg',
      rate: 0,
    };
    setItems(next);
  };

  const lineTotal = (it: ProformaItem) => {
    const base = it.quantity * it.rate;
    return base - (base * it.discount) / 100;
  };
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const taxAmount = items.reduce((s, it) => s + lineTotal(it) * (it.taxPct / 100), 0);
  const pphAmount = items.reduce((s, it) => s + lineTotal(it) * (it.pphPct / 100), 0);
  const grandTotal = subtotal + taxAmount - pphAmount - potongan + biayaLain;

  const canSubmit = partyId && items.some((i) => i.itemName) && grandTotal >= 0 && !mutation.isPending;

  const handleSubmit = () => {
    setError('');
    const validItems = items.filter((it) => it.itemName);
    if (validItems.length === 0) { setError(t('proformaModal.errors.noItems')); return; }
    if (!partyId) { setError(t('proformaModal.errors.noCustomer')); return; }
    if (new Date(validUntil) < new Date(date)) { setError(t('proformaModal.errors.validUntilBeforeDate')); return; }
    if (requestedAmount > grandTotal) { setError(t('proformaModal.errors.requestedAboveTotal')); return; }
    for (const it of validItems) {
      if (!it.accountId) { setError(t('proformaModal.errors.missingRevenueAccount', { name: it.itemName })); return; }
    }
    mutation.mutate({
      date,
      validUntil,
      partyId,
      customerRefNo: customerRefNo || null,
      quotationId: !isEdit ? editTarget?.quotationId ?? null : undefined,
      salesOrderId: !isEdit ? editTarget?.salesOrderId ?? null : undefined,
      requestedAmount: requestedAmount > 0 ? requestedAmount : null,
      notes: notes || null,
      terms: terms || null,
      potongan,
      biayaLain,
      labelPotongan: labelPotongan || null,
      labelBiaya: labelBiaya || null,
      items: validItems.map((it) => ({
        itemType: it.itemType,
        inventoryItemId: it.itemType === 'product' ? it.inventoryItemId || null : null,
        serviceItemId: it.itemType === 'service' ? it.serviceItemId || null : null,
        accountId: it.accountId,
        itemName: it.itemName,
        quantity: it.quantity,
        unit: it.unit,
        rate: it.rate,
        discount: it.discount,
        taxPct: it.taxPct,
        pphPct: it.pphPct,
        description: it.description || null,
      })),
    });
  };

  const compactNum = `${numberInputClass} text-sm`;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className={`${formDialogClass} sm:max-w-5xl`}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className={formShellClass}>
          <FormDialogHeader>
            <DialogTitle>
              {isEdit ? t('proformaModal.titleEdit', { number: editTarget?.proformaNumber ?? '' }) : t('proformaModal.titleCreate')}
            </DialogTitle>
            <DialogDescription>{t('proformaModal.description')}</DialogDescription>
          </FormDialogHeader>

          <FormDialogBody className="space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label={t('proformaModal.fields.date')}>
                {(c) => <DateInput id={c.id} value={date} onChange={setDate} />}
              </Field>
              <Field label={t('proformaModal.fields.validUntil')}>
                {(c) => <DateInput id={c.id} value={validUntil} onChange={setValidUntil} />}
              </Field>
              <Field label={t('proformaModal.fields.customer')} required>
                {() => (
                  <PickerSelect
                    aria-label={t('proformaModal.fields.customer')}
                    {...partyPicker.pickerProps}
                    value={partyId}
                    onChange={(v) => setPartyId(v)}
                    placeholder={t('proformaModal.placeholders.customer')}
                  />
                )}
              </Field>
            </div>

            <section aria-labelledby="qt-items-title">
              <div className="mb-2 flex items-center justify-between">
                <h4 id="qt-items-title" className="text-sm font-semibold text-foreground">{t('proformaModal.items.title')}</h4>
                <Button variant="ghost" size="sm" className="text-primary max-sm:h-11" onClick={addItem}>
                  <Plus aria-hidden /> {t('proformaModal.items.addRow')}
                </Button>
              </div>
              <div className="space-y-3">
                {items.map((it, idx) => (
                  <div key={it.id} role="group" aria-label={t('proformaModal.items.rowLabel', { n: idx + 1 })} className="space-y-2 rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center justify-between">
                      <div role="group" aria-label={t('proformaModal.items.typeLabel', { n: idx + 1 })} className="inline-flex overflow-hidden rounded-lg border border-border text-xs">
                        {(['product', 'service'] as const).map((type) => (
                          <button
                            key={type}
                            type="button"
                            aria-pressed={it.itemType === type}
                            onClick={() => toggleItemType(idx, type)}
                            className={cn(
                              'px-3 py-1 max-sm:min-h-11',
                              it.itemType === type ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent',
                            )}
                          >
                            {type === 'product' ? t('proformaModal.items.product') : t('proformaModal.items.service')}
                          </button>
                        ))}
                      </div>
                      {items.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-danger-text max-sm:size-11"
                          aria-label={t('proformaModal.items.removeRow', { n: idx + 1 })}
                          onClick={() => removeItem(idx)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-12 gap-2">
                      <Field label={t('proformaModal.items.item')} className="col-span-12 md:col-span-5">
                        {() => (
                          <div className="space-y-1.5">
                            {it.itemType === 'product' ? (
                              <PickerSelect
                                aria-label={t('proformaModal.items.productItemLabel', { n: idx + 1 })}
                                options={inventoryOptions}
                                value={it.inventoryItemId}
                                onChange={(v) => selectInventoryItem(idx, v)}
                                placeholder={t('proformaModal.items.productPlaceholder')}
                              />
                            ) : (
                              <PickerSelect
                                aria-label={t('proformaModal.items.serviceItemLabel', { n: idx + 1 })}
                                options={serviceOptions}
                                value={it.serviceItemId}
                                onChange={(v) => selectServiceItem(idx, v)}
                                placeholder={t('proformaModal.items.servicePlaceholder')}
                              />
                            )}
                            {!it.inventoryItemId && !it.serviceItemId && (
                              <Input
                                aria-label={t('proformaModal.items.freeNameLabel', { n: idx + 1 })}
                                placeholder={t('proformaModal.items.freeNamePlaceholder')}
                                value={it.itemName}
                                onChange={(e) => updateItem(idx, 'itemName', e.target.value)}
                                autoComplete="off"
                              />
                            )}
                          </div>
                        )}
                      </Field>
                      <Field label={t('proformaModal.items.qty')} className="col-span-4 md:col-span-2">
                        <NumberInput min={0} value={it.quantity || ''} className={compactNum}
                          onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value) || 0)} />
                      </Field>
                      <Field label={t('proformaModal.items.unit')} className="col-span-4 md:col-span-2">
                        {() => (
                          <OptionSelect
                            aria-label={t('proformaModal.items.unitLabel', { n: idx + 1 })}
                            value={it.unit}
                            onChange={(v) => updateItem(idx, 'unit', v)}
                            options={UNITS.map((u) => ({ value: u, label: u }))}
                          />
                        )}
                      </Field>
                      <Field label={t('proformaModal.items.rate')} className="col-span-4 md:col-span-3">
                        <NumberInput min={0} value={it.rate || ''} className={compactNum}
                          onChange={(e) => updateItem(idx, 'rate', Number(e.target.value) || 0)} />
                      </Field>
                    </div>

                    <div className="grid grid-cols-12 gap-2">
                      <Field label={t('proformaModal.items.discountPct')} className="col-span-4 md:col-span-2">
                        <NumberInput min={0} max={100} value={it.discount || ''} className={compactNum}
                          onChange={(e) => updateItem(idx, 'discount', Math.min(100, Number(e.target.value) || 0))} />
                      </Field>
                      <Field label={t('proformaModal.items.vatPct')} className="col-span-4 md:col-span-2">
                        <NumberInput min={0} max={100} value={it.taxPct || ''} className={compactNum}
                          onChange={(e) => updateItem(idx, 'taxPct', Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
                      </Field>
                      <Field label={t('proformaModal.items.pphPct')} className="col-span-4 md:col-span-2">
                        <NumberInput min={0} max={100} value={it.pphPct || ''} className={compactNum}
                          onChange={(e) => updateItem(idx, 'pphPct', Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
                      </Field>
                      <div className="col-span-12 flex items-end justify-end text-right md:col-span-6">
                        <span className="text-sm font-semibold tabular-nums text-foreground">{formatRupiah(lineTotal(it))}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <Field label={t('proformaModal.fields.customerRef')}>
                  {(c) => <Input id={c.id} value={customerRefNo} onChange={(e) => setCustomerRefNo(e.target.value)} maxLength={100} />}
                </Field>
                <Field label={t('proformaModal.fields.requestedAmount')} hint={t('proformaModal.hints.requestedAmount')}>
                  {(c) => (
                    <NumberInput id={c.id} min={0} value={requestedAmount || ''}
                      onChange={(e) => setRequestedAmount(Number(e.target.value) || 0)} className={compactNum} />
                  )}
                </Field>
                <Field label={t('proformaModal.fields.notes')}>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                    placeholder={t('proformaModal.placeholders.notes')} />
                </Field>
                <Field label={t('proformaModal.fields.terms')}>
                  <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} />
                </Field>
              </div>

              <div className="space-y-2 rounded-lg bg-muted/40 p-4 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">{t('proformaModal.summary.subtotal')}</span>
                  <span className="tabular-nums">{formatRupiah(subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t('proformaModal.summary.vat')}</span>
                  <span className="tabular-nums">{formatRupiah(taxAmount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t('proformaModal.summary.pph')}</span>
                  <span className="tabular-nums">−{formatRupiah(pphAmount)}</span></div>
                <div className="flex items-center gap-2">
                  <Input aria-label={t('proformaModal.summary.discountLabelAria')} value={labelPotongan} onChange={(e) => setLabelPotongan(e.target.value)}
                    className="flex-1 text-sm" />
                  <NumberInput aria-label={t('proformaModal.summary.discountValueAria')} min={0} value={potongan || ''} onChange={(e) => setPotongan(Number(e.target.value) || 0)}
                    className={`${compactNum} w-32`} />
                </div>
                <div className="flex items-center gap-2">
                  <Input aria-label={t('proformaModal.summary.otherCostLabelAria')} value={labelBiaya} onChange={(e) => setLabelBiaya(e.target.value)}
                    className="flex-1 text-sm" />
                  <NumberInput aria-label={t('proformaModal.summary.otherCostValueAria')} value={biayaLain || ''} onChange={(e) => setBiayaLain(Number(e.target.value) || 0)}
                    className={`${compactNum} w-32`} />
                </div>
                <div className="flex justify-between border-t border-border pt-2 font-bold">
                  <span>{t('proformaModal.summary.grandTotal')}</span>
                  <span className="text-lg tabular-nums text-primary">{formatRupiah(grandTotal)}</span>
                </div>
              </div>
            </div>

            <FormError>{error}</FormError>
          </FormDialogBody>

          <FormDialogFooter>
            <FooterButton variant="ghost" onClick={onClose} disabled={mutation.isPending}>{t('proformaModal.actions.cancel')}</FooterButton>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3">
              <p className="text-xs text-muted-foreground">
                {canSubmit ? t('proformaModal.footer.total', { amount: formatRupiah(grandTotal) }) : t('proformaModal.footer.incomplete')}
              </p>
              <FooterButton type="submit" loading={mutation.isPending} disabled={!canSubmit && !mutation.isPending}>
                {mutation.isPending ? t('proformaModal.actions.saving') : isEdit ? t('proformaModal.actions.saveChanges') : t('proformaModal.actions.saveDraft')}
              </FooterButton>
            </div>
          </FormDialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProformaModal;
