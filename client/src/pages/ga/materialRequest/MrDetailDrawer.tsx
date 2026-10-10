/** Material request detail sheet (?mr=<id>); the sheet steps aside while the receive dialog is open. */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, Link2, PackageCheck, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatNumber, formatRupiah } from '@/lib/format';
import { ComboboxField } from '@/components/overlays/ComboboxField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog, EmptyState, Field, StatusBadge } from '@/components/shared';
import { FormModal } from '@/components/ga/maintenance/form-modal';
import { useTranslation } from 'react-i18next';
import {
  PROC_STATUS_EDITABLE,
  PROC_STATUS_LABELS,
  apiErrorMessage,
  estimatedTotal,
  isItemLocked,
  mrActions,
  type CategoryOpt,
  type JsonBody,
  type LocationOpt,
  type MrDetail,
  type MrItemDetail,
  type MrStatus,
  type ProcurementStatus,
} from './types';

const materialRequestKey = (id: string) => ['ga-material-request', id] as const;

export interface MrDetailDrawerProps {
  /** MR id from the URL; null closes the sheet. */
  id: string | null;
  /** ga_material_request edit. */
  canEdit: boolean;
  /** ga_maintenance view (link to the source work order). */
  canViewWorkOrder: boolean;
  /** Fallback requester name from the list row (the detail endpoint also returns it). */
  requesterName?: string | null;
  onClose: () => void;
}

function Detail({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2 min-w-0' : 'min-w-0'}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function MrDetailDrawer({ id, canEdit, canViewWorkOrder, requesterName, onClose }: MrDetailDrawerProps) {
  const { t } = useTranslation('eam');
  const queryClient = useQueryClient();
  const [receiveItem, setReceiveItem] = useState<MrItemDetail | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const query = useQuery<MrDetail>({
    queryKey: materialRequestKey(id ?? ''),
    queryFn: async () => (await api.get(`/ga/material-requests/${id}`)).data,
    enabled: !!id,
  });
  const mr = query.data;

  const invalidate = () => {
    if (id) queryClient.invalidateQueries({ queryKey: materialRequestKey(id) });
    queryClient.invalidateQueries({ queryKey: ['ga-material-requests'] });
  };

  const lifecycle = useMutation({
    mutationFn: (action: { verb: 'submit' | 'approve' | 'reject' | 'cancel'; body?: JsonBody }) =>
      api.patch(`/ga/material-requests/${id}/${action.verb}`, action.body ?? {}),
    onSuccess: (_res, action) => {
      toast.success(t(`materialRequest.detail.done.${action.verb}`));
      invalidate();
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, t('materialRequest.detail.statusFailed'))),
  });

  const actions = mr ? mrActions(mr.status) : null;
  const total = mr ? estimatedTotal(mr.items) : 0;
  const received = mr ? mr.items.filter((it) => it.procurementStatus === 'RECEIVED').length : 0;
  const hasFooter = !!mr && canEdit && !!actions && (actions.submit || actions.approve || actions.cancel);

  return (
    <>
      <Sheet open={!!id && receiveItem === null} onOpenChange={(open) => !open && onClose()}>
        <SheetContent size="lg">
          <SheetHeader>
            {mr ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle className="num font-mono">{mr.code}</SheetTitle>
                  <StatusBadge status={mr.status} docType="ga_material_request" />
                </div>
                <SheetDescription>
                  {mr.asset ? `${mr.asset.code} · ${mr.asset.name}` : mr.machineTarget || t('materialRequest.detail.noAsset')} ·{' '}
                  {t('materialRequest.detail.itemCount', { count: mr.items.length, n: formatNumber(mr.items.length) })}
                </SheetDescription>
              </>
            ) : (
              <>
                <SheetTitle>{t('materialRequest.detail.title')}</SheetTitle>
                <SheetDescription className="sr-only">{t('materialRequest.detail.loading')}</SheetDescription>
              </>
            )}
          </SheetHeader>

          <SheetBody className="space-y-6">
            {query.isError ? (
              <EmptyState
                kind="error"
                compact
                description={t('materialRequest.detail.loadError')}
                action={
                  <Button size="sm" variant="outline" onClick={() => query.refetch()}>
                    {t('materialRequest.detail.retry')}
                  </Button>
                }
              />
            ) : !mr ? (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Detail label={t('materialRequest.detail.requested')}>{formatDate(mr.requestedAt)}</Detail>
                  <Detail label={t('materialRequest.detail.requester')}>{mr.requester?.fullName || requesterName || '—'}</Detail>
                  <Detail label={t('materialRequest.detail.asset')}>{mr.asset ? `${mr.asset.code} · ${mr.asset.name}` : '—'}</Detail>
                  <Detail label={t('materialRequest.detail.machine')}>{mr.machineTarget || '—'}</Detail>
                  {mr.approvedAt && <Detail label={t('materialRequest.detail.approvedAt')}>{formatDate(mr.approvedAt)}</Detail>}
                  {mr.rejectedAt && <Detail label={t('materialRequest.detail.rejectedAt')}>{formatDate(mr.rejectedAt)}</Detail>}
                  <Detail label={t('materialRequest.detail.estimate')}>
                    <span className="num">{formatRupiah(total)}</span>
                  </Detail>
                  <Detail label={t('materialRequest.detail.received')}>
                    {t('materialRequest.detail.receivedOf', { received: formatNumber(received), total: formatNumber(mr.items.length) })}
                  </Detail>
                  {mr.notes && (
                    <Detail label={t('shared.notes')} wide>
                      <span className="whitespace-pre-wrap">{mr.notes}</span>
                    </Detail>
                  )}
                  {mr.rejectReason && (
                    <Detail label={t('materialRequest.detail.rejectReason')} wide>
                      {mr.rejectReason}
                    </Detail>
                  )}
                </dl>

                {mr.status === 'PAID' && (
                  <section aria-labelledby="mr-paid" className="rounded-md border border-border bg-success-subtle/40 px-3 py-2">
                    <h3 id="mr-paid" className="text-sm font-semibold text-foreground">
                      {t('materialRequest.detail.paidTitle')}
                    </h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {mr.paidAt ? t('materialRequest.detail.paidOn', { date: formatDate(mr.paidAt) }) : t('materialRequest.detail.paid')}
                      {mr.paidAmount != null && (
                        <>
                          {' '}· <span className="num text-foreground">{formatRupiah(mr.paidAmount)}</span>
                        </>
                      )}
                      {mr.journalEntryId ? ` · ${t('materialRequest.detail.journalPosted')}` : ''}
                    </p>
                  </section>
                )}

                {mr.workOrder &&
                  (canViewWorkOrder ? (
                    <Link
                      to={`/ga/maintenance?wo=${mr.workOrder.id}`}
                      className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0">
                        {t('materialRequest.detail.fromWo')} <span className="num font-mono font-medium text-primary">{mr.workOrder.code}</span>:{' '}
                        {mr.workOrder.title}
                      </span>
                    </Link>
                  ) : (
                    <p className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground">
                      <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      {t('materialRequest.detail.fromWo')} <span className="num font-mono">{mr.workOrder.code}</span>
                    </p>
                  ))}

                <section aria-labelledby="mr-items" className="space-y-2">
                  <h3 id="mr-items" className="text-sm font-semibold text-foreground">
                    {t('materialRequest.detail.itemsTitle')}
                  </h3>
                  <ul className="space-y-3">
                    {mr.items.map((it) => (
                      <ItemRow
                        key={it.id}
                        mrId={mr.id}
                        mrStatus={mr.status}
                        item={it}
                        canEdit={canEdit}
                        onChanged={invalidate}
                        onReceive={() => setReceiveItem(it)}
                      />
                    ))}
                  </ul>
                </section>
              </>
            )}
          </SheetBody>

          {hasFooter && actions && (
            <SheetFooter className="flex-row flex-wrap justify-end sm:flex-row">
              {actions.cancel && (
                <Button variant="ghost" className="mr-auto text-danger-text hover:bg-danger-subtle" onClick={() => setCancelOpen(true)}>
                  <Ban aria-hidden /> {t('materialRequest.detail.cancel')}
                </Button>
              )}
              {actions.reject && (
                <Button variant="outline" onClick={() => setRejectOpen(true)}>
                  <ThumbsDown aria-hidden /> {t('materialRequest.detail.reject')}
                </Button>
              )}
              {actions.approve && (
                <Button
                  onClick={() => lifecycle.mutate({ verb: 'approve' })}
                  loading={lifecycle.isPending && lifecycle.variables?.verb === 'approve'}
                >
                  <ThumbsUp aria-hidden /> {t('materialRequest.detail.approve')}
                </Button>
              )}
              {actions.submit && (
                <Button
                  onClick={() => lifecycle.mutate({ verb: 'submit' })}
                  loading={lifecycle.isPending && lifecycle.variables?.verb === 'submit'}
                >
                  <Send aria-hidden /> {t('materialRequest.detail.submit')}
                </Button>
              )}
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      {receiveItem && mr && (
        <ReceiveModal mrId={mr.id} item={receiveItem} onClose={() => setReceiveItem(null)} onDone={invalidate} />
      )}

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        tone="danger"
        title={t('materialRequest.detail.rejectTitle')}
        description={mr ? t('materialRequest.detail.rejectDescription', { code: mr.code }) : undefined}
        confirmLabel={t('materialRequest.detail.reject')}
        requireReason={{ label: t('materialRequest.detail.rejectReason'), minLength: 1 }}
        loading={lifecycle.isPending}
        onConfirm={(reason) => lifecycle.mutateAsync({ verb: 'reject', body: { reason: (reason ?? '').slice(0, 500) } })}
      />
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        tone="danger"
        title={t('materialRequest.detail.cancelTitle')}
        description={mr ? t('materialRequest.detail.cancelDescription', { code: mr.code }) : undefined}
        confirmLabel={t('materialRequest.detail.cancelMr')}
        cancelLabel={t('materialRequest.detail.back')}
        loading={lifecycle.isPending}
        onConfirm={() => lifecycle.mutateAsync({ verb: 'cancel' })}
      />
    </>
  );
}

/** One MR item: procurement summary, inline procurement editor and "Terima barang". */
function ItemRow({
  mrId,
  mrStatus,
  item,
  canEdit,
  onChanged,
  onReceive,
}: {
  mrId: string;
  mrStatus: MrStatus;
  item: MrItemDetail;
  canEdit: boolean;
  onChanged: () => void;
  onReceive: () => void;
}) {
  const { t } = useTranslation('eam');
  const [vendorName, setVendorName] = useState(item.vendorName ?? '');
  const [unitPrice, setUnitPrice] = useState<string>(item.unitPrice != null ? String(Number(item.unitPrice) || 0) : '0');
  const [poNumber, setPoNumber] = useState(item.poNumber ?? '');
  const [procurementStatus, setProcurementStatus] = useState<ProcurementStatus>(item.procurementStatus);

  const procMutation = useMutation({
    mutationFn: () =>
      api.patch(`/ga/material-requests/${mrId}/items/${item.id}/procurement`, {
        vendorName: vendorName || null,
        unitPrice: Number(unitPrice) || 0,
        poNumber: poNumber || null,
        procurementStatus,
      }),
    onSuccess: () => {
      toast.success(t('materialRequest.detail.procSaved'));
      onChanged();
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, t('materialRequest.detail.procFailed'))),
  });

  const locked = isItemLocked(item, mrStatus);
  const canReceive = canEdit && mrActions(mrStatus).receive && !locked;
  const qty = Number(item.quantity) || 0;

  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{item.itemName}</p>
          <p className="text-xs text-muted-foreground">
            <span className="num">{formatNumber(qty, { maxDecimals: 3 })}</span> {item.uom}
            {item.sku ? ` · SKU ${item.sku}` : ''}
            {item.inventoryItem
              ? ` · ${t('materialRequest.detail.linked', { sku: item.inventoryItem.sku })}`
              : ` · ${t('materialRequest.detail.notLinked')}`}
          </p>
          {(item.vendorName || Number(item.unitPrice) > 0 || item.poNumber) && (
            <p className="text-xs text-muted-foreground">
              {[item.vendorName, item.poNumber ? `PO ${item.poNumber}` : null, Number(item.unitPrice) > 0 ? `${formatRupiah(Number(item.unitPrice))}/${item.uom}` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {item.procurementStatus === 'RECEIVED' && (
            <p className="text-xs text-success-text">
              {t('materialRequest.detail.receivedLine', {
                qty: formatNumber(Number(item.receivedQty), { maxDecimals: 3 }),
                uom: item.uom,
                location: item.receivedIntoLocation?.name ?? '—',
                date: formatDate(item.receivedAt),
              })}
            </p>
          )}
        </div>
        <StatusBadge status={item.procurementStatus} label={PROC_STATUS_LABELS[item.procurementStatus]} className="shrink-0" />
      </div>

      {canEdit && !locked && (
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3">
          <Field label={t('materialRequest.detail.supplier')} className="col-span-2">
            <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
          </Field>
          <Field label={t('materialRequest.detail.unitPrice')}>
            <NumberInput min={0} step="any" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          </Field>
          <Field label={t('materialRequest.detail.poNumber')}>
            <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
          </Field>
          <Field label={t('materialRequest.detail.procStatus')} className="col-span-2 sm:col-span-1">
            {(control) => (
              <Select value={procurementStatus} onValueChange={(v) => setProcurementStatus(v as ProcurementStatus)}>
                <SelectTrigger id={control.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROC_STATUS_EDITABLE.map((s) => (
                    <SelectItem key={s} value={s}>
                      {PROC_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 sm:col-span-1 sm:self-end">
            <span className="text-xs text-muted-foreground">
              {t('materialRequest.detail.total')} <span className="num text-foreground">{formatRupiah((Number(unitPrice) || 0) * qty)}</span>
            </span>
          </div>
          <div className="col-span-2 flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => procMutation.mutate()} loading={procMutation.isPending}>
              <Check aria-hidden /> {t('materialRequest.detail.saveProc')}
            </Button>
            {canReceive && (
              <Button size="sm" onClick={onReceive}>
                <PackageCheck aria-hidden /> {t('materialRequest.detail.receive')}
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/** Receive an item into GA stock (link to an existing inventory item or create one). */
function ReceiveModal({
  mrId,
  item,
  onClose,
  onDone,
}: {
  mrId: string;
  item: MrItemDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation('eam');
  const { data: locations = [] } = useQuery<LocationOpt[]>({
    queryKey: ['ga-locations-mr'],
    queryFn: async () => (await api.get('/ga/master/locations')).data,
  });
  const { data: categories = [] } = useQuery<CategoryOpt[]>({
    queryKey: ['ga-inv-categories-mr'],
    queryFn: async () => (await api.get('/ga/master/inventory-categories')).data,
  });

  const needsLink = !item.inventoryItemId; // not linked yet → pick or create an inventory item
  const [locationId, setLocationId] = useState('');
  const [receivedQty, setReceivedQty] = useState<string>(String(Number(item.quantity) || 1));
  const [mode, setMode] = useState<'existing' | 'new'>('new');
  const [existingItemId, setExistingItemId] = useState('');
  const [newSku, setNewSku] = useState(item.sku ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const { data: invItems = [] } = useQuery<{ id: string; sku: string; name: string }[]>({
    queryKey: ['ga-inventory-items-mr-receive'],
    queryFn: async () => {
      const res = await api.get('/ga/inventory/items');
      return Array.isArray(res.data) ? res.data : res.data?.data ?? [];
    },
    enabled: needsLink,
  });

  const errors = {
    location: !locationId ? t('materialRequest.detail.locationRequired') : undefined,
    qty: !(Number(receivedQty) > 0) ? t('materialRequest.detail.qtyRequired') : undefined,
    existing: needsLink && mode === 'existing' && !existingItemId ? t('materialRequest.detail.existingRequired') : undefined,
    sku: needsLink && mode === 'new' && !newSku.trim() ? t('materialRequest.detail.skuRequired') : undefined,
    category: needsLink && mode === 'new' && !categoryId ? t('materialRequest.detail.categoryRequired') : undefined,
  };

  const mutation = useMutation({
    mutationFn: () => {
      const body: JsonBody = { receivedQty: Number(receivedQty), locationId };
      if (needsLink) {
        if (mode === 'existing') body.inventoryItemId = existingItemId;
        else body.newItem = { sku: newSku.trim(), categoryId };
      }
      return api.patch(`/ga/material-requests/${mrId}/items/${item.id}/receive`, body);
    },
    onSuccess: () => {
      toast.success(t('materialRequest.detail.receivedToast'));
      onDone();
      onClose();
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, t('materialRequest.detail.receiveFailed'))),
  });

  const submit = () => {
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    mutation.mutate();
  };

  const err = (k: keyof typeof errors) => (submitted ? errors[k] : undefined);

  return (
    <FormModal
      title={t('materialRequest.detail.receiveTitle', { name: item.itemName })}
      description={t('materialRequest.detail.receiveDescription')}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={t('materialRequest.detail.receiveSubmit')}
      submitting={mutation.isPending}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('materialRequest.detail.receivedQty', { uom: item.uom })} required error={err('qty')}>
          <NumberInput min={0} step="any" value={receivedQty} onChange={(e) => setReceivedQty(e.target.value)} />
        </Field>
        <ComboboxField label={t('materialRequest.detail.location')} required error={err('location')}
  options={locations.map((l) => ({ value: l.id, label: `${l.code} · ${l.name}` }))}
  value={locationId}
  onChange={setLocationId}
  placeholder={t('materialRequest.detail.locationPlaceholder')}
/>
      </div>

      {needsLink && (
        <fieldset className="space-y-3 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium text-foreground">{t('materialRequest.detail.invItem')}</legend>
          <p className="text-xs text-muted-foreground">
            {t('materialRequest.detail.linkHint')}
          </p>
          <div className="flex gap-2" role="group" aria-label={t('materialRequest.detail.linkMode')}>
            <Button size="sm" variant={mode === 'new' ? 'primary' : 'secondary'} aria-pressed={mode === 'new'} onClick={() => setMode('new')} className="flex-1">
              {t('materialRequest.detail.newItem')}
            </Button>
            <Button size="sm" variant={mode === 'existing' ? 'primary' : 'secondary'} aria-pressed={mode === 'existing'} onClick={() => setMode('existing')} className="flex-1">
              {t('materialRequest.detail.pickExisting')}
            </Button>
          </div>
          {mode === 'existing' ? (
            <ComboboxField label={t('materialRequest.detail.invItem')} required error={err('existing')}
  options={invItems.map((x) => ({ value: x.id, label: `${x.sku} · ${x.name}` }))}
  value={existingItemId}
  onChange={setExistingItemId}
  placeholder={t('materialRequest.detail.itemPlaceholder')}
/>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('materialRequest.detail.newSku')} required error={err('sku')}>
                <Input value={newSku} onChange={(e) => setNewSku(e.target.value)} />
              </Field>
              <ComboboxField label={t('materialRequest.detail.category')} required error={err('category')}
  options={categories.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))}
  value={categoryId}
  onChange={setCategoryId}
  placeholder={t('materialRequest.detail.categoryPlaceholder')}
/>
            </div>
          )}
        </fieldset>
      )}
    </FormModal>
  );
}
