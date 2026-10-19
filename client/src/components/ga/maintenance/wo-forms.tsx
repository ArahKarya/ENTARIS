/** Work-order forms: create, assign technician, complete (checklist + costs), record part usage. */
import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatRupiah } from '@/lib/format';
import { ComboboxField } from '@/components/overlays/ComboboxField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { DateInput, Field } from '@/components/shared';
import { ChecklistEditor, type ChecklistItem } from '@/pages/ga/maintenance/ChecklistEditor';
import { FormModal } from './form-modal';
import { assetOptions, useGaAssetOptions } from './queries';
import { useTranslation } from 'react-i18next';
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  TYPE_LABELS,
  apiErrorMessage,
  type WoPrefill,
  type WoPriority,
  type WoType,
} from './wo-meta';


const priorityOptions = () => PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }));
const typeOptions = () => (Object.keys(TYPE_LABELS) as WoType[]).map((type) => ({ value: type, label: TYPE_LABELS[type] }));

const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

export function CreateWorkOrderModal({ prefill, onClose }: { prefill?: WoPrefill | null; onClose: () => void }) {
  const { t } = useTranslation('eam');
  const queryClient = useQueryClient();
  const { data: assets, isLoading } = useGaAssetOptions();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    assetId: prefill?.assetId ?? '',
    type: prefill?.type ?? ('CORRECTIVE' as WoType),
    priority: 'MEDIUM' as WoPriority,
    title: '',
    description: '',
    component: '',
    dueAt: prefill?.dueAt ?? '',
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const scheduleId = prefill?.scheduleId;

  const errors = {
    assetId: !form.assetId ? t('workOrder.form.assetRequired') : undefined,
    title: !form.title.trim() ? t('workOrder.form.titleRequired') : undefined,
  };

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/ga/maintenance/work-orders', {
        assetId: form.assetId,
        type: form.type,
        priority: form.priority,
        title: form.title,
        description: form.description || null,
        component: form.component || null,
        scheduleId: scheduleId ?? null,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
      }),
    onSuccess: () => {
      toast.success(t('workOrder.form.created'));
      queryClient.invalidateQueries({ queryKey: ['ga-work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['ga-schedules'] });
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, t('workOrder.form.createFailed'))),
  });

  const submit = () => {
    setSubmitted(true);
    if (errors.assetId || errors.title) return;
    mutation.mutate();
  };

  return (
    <FormModal
      title={scheduleId ? t('workOrder.form.createFromSchedule') : t('workOrder.form.createTitle')}
      description={scheduleId ? undefined : t('workOrder.form.createDescription')}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={t('shared.save')}
      submitting={mutation.isPending}
    >
      {scheduleId && (
        <p className="flex items-start gap-2 rounded-md bg-info-subtle px-3 py-2 text-sm text-info-text">
          <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('workOrder.form.scheduleLinked')}
        </p>
      )}
      <ComboboxField label={t('workOrder.form.asset')} required error={submitted ? errors.assetId : undefined}
  options={assetOptions(assets)}
  value={form.assetId}
  onChange={(v) => set({ assetId: v })}
  placeholder={isLoading ? t('workOrder.form.loading') : t('workOrder.form.assetPlaceholder')}
  disabled={!!prefill?.assetId}
/>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('workOrder.form.type')}>
          {(control) => (
            <Select value={form.type} onValueChange={(v) => set({ type: v as WoType })}>
              <SelectTrigger {...control}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeOptions().map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label={t('workOrder.form.priority')}>
          {(control) => (
            <Select value={form.priority} onValueChange={(v) => set({ priority: v as WoPriority })}>
              <SelectTrigger {...control}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priorityOptions().map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>
      <Field label={t('workOrder.form.title')} required error={submitted ? errors.title : undefined}>
        <Input
          value={form.title}
          maxLength={200}
          onChange={(e) => set({ title: e.target.value })}
          placeholder={t('workOrder.form.titlePlaceholder')}
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('workOrder.form.component')} hint={t('workOrder.form.optional')}>
          <Input
            value={form.component}
            maxLength={200}
            onChange={(e) => set({ component: e.target.value })}
            placeholder={t('workOrder.form.componentPlaceholder')}
          />
        </Field>
        <Field label={t('workOrder.form.dueDate')} hint={t('workOrder.form.optional')}>
          {(control) => <DateInput id={control.id} value={form.dueAt} onChange={(v) => set({ dueAt: v })} />}
        </Field>
      </div>
      <Field label={t('workOrder.form.description')}>
        <Textarea rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
    </FormModal>
  );
}

interface UserOption {
  id: string;
  fullName: string;
  username: string;
}

export function AssignModal({
  id,
  currentAssigneeId,
  onClose,
  onDone,
}: {
  id: string;
  currentAssigneeId?: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation('eam');
  const { data: users, isLoading } = useQuery({
    queryKey: ['ga-technicians'],
    queryFn: async () => {
      const res = await api.get('/users', { params: { limit: 200 } });
      return ((res.data?.data ?? []) as UserOption[]) ?? [];
    },
    staleTime: 5 * 60_000,
  });
  const [assignedToId, setAssignedToId] = useState(currentAssigneeId ?? '');
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api.patch(`/ga/maintenance/work-orders/${id}/assign`, { assignedToId }),
    onSuccess: () => {
      toast.success(t('workOrder.form.assigned'));
      onDone();
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, t('workOrder.form.assignFailed'))),
  });

  return (
    <FormModal
      title={currentAssigneeId ? t('workOrder.form.changeTechnician') : t('workOrder.form.assignTechnician')}
      onClose={onClose}
      onSubmit={() => {
        setSubmitted(true);
        if (assignedToId) mutation.mutate();
      }}
      submitLabel={t('workOrder.form.assign')}
      submitting={mutation.isPending}
    >
      <ComboboxField label={t('workOrder.form.technician')} required error={submitted && !assignedToId ? t('workOrder.form.technicianRequired') : undefined}
  options={(users ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` }))}
  value={assignedToId}
  onChange={setAssignedToId}
  placeholder={isLoading ? t('workOrder.form.loading') : t('workOrder.form.technicianPlaceholder')}
/>
    </FormModal>
  );
}

export function CompleteModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation('eam');
  const [form, setForm] = useState({ resolution: '', laborHours: '', laborCost: '', externalVendor: '', externalCost: '' });
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const blankLabel = checklist.some((c) => !c.label.trim());
  const missingRequired = checklist.filter((c) => c.required && !c.done);

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/ga/maintenance/work-orders/${id}/complete`, {
        resolution: form.resolution || null,
        checklist: checklist.length
          ? checklist.map((c) => ({ id: c.id, label: c.label, required: c.required, done: c.done, notes: c.notes || null }))
          : null,
        laborHours: numOrNull(form.laborHours),
        laborCost: numOrNull(form.laborCost),
        externalVendor: form.externalVendor || null,
        externalCost: numOrNull(form.externalCost),
      }),
    onSuccess: () => {
      toast.success(t('workOrder.form.completed'));
      onDone();
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, t('workOrder.form.completeFailed'))),
  });

  const totalCost = (Number(form.laborCost) || 0) + (Number(form.externalCost) || 0);

  return (
    <FormModal
      title={t('workOrder.form.completeTitle')}
      description={t('workOrder.form.completeDescription')}
      size="lg"
      onClose={onClose}
      onSubmit={() => {
        setSubmitted(true);
        if (!blankLabel) mutation.mutate();
      }}
      submitLabel={t('workOrder.form.markDone')}
      submitting={mutation.isPending}
    >
      <Field label={t('workOrder.form.resolution')}>
        <Textarea rows={3} value={form.resolution} onChange={(e) => set({ resolution: e.target.value })} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('workOrder.form.laborHours')}>
          <NumberInput min={0} step="any" value={form.laborHours} onChange={(e) => set({ laborHours: e.target.value })} />
        </Field>
        <Field label={t('workOrder.form.laborCost')}>
          <NumberInput min={0} value={form.laborCost} onChange={(e) => set({ laborCost: e.target.value })} />
        </Field>
        <Field label={t('workOrder.form.externalVendor')}>
          <Input value={form.externalVendor} onChange={(e) => set({ externalVendor: e.target.value })} />
        </Field>
        <Field label={t('workOrder.form.externalCost')}>
          <NumberInput min={0} value={form.externalCost} onChange={(e) => set({ externalCost: e.target.value })} />
        </Field>
      </div>
      {totalCost > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('workOrder.form.costSum')} <span className="num font-medium text-foreground">{formatRupiah(totalCost)}</span>{' '}
          {t('workOrder.form.costSumNote')}
        </p>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">{t('workOrder.form.checklist')}</legend>
        <p className="text-xs text-muted-foreground">
          {t('workOrder.form.checklistHint')}
        </p>
        <ChecklistEditor items={checklist} onChange={setChecklist} />
        {submitted && blankLabel && (
          <p role="alert" className="text-xs font-medium text-danger-text">
            {t('workOrder.form.checklistLabelRequired')}
          </p>
        )}
        {missingRequired.length > 0 && (
          <p className="text-xs text-warning-text">
            {t('workOrder.form.missingRequired', { count: missingRequired.length })}
          </p>
        )}
      </fieldset>
    </FormModal>
  );
}

interface InventoryOption {
  id: string;
  sku: string;
  name: string;
  uom?: string;
}
interface LocationOption {
  id: string;
  code: string;
  name: string;
}

export function AddPartModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation('eam');
  const { data: items, isLoading: loadingItems } = useQuery({
    queryKey: ['ga-inventory-items-select'],
    queryFn: async () => {
      const res = await api.get('/ga/inventory/items', { params: { limit: 500 } });
      return (Array.isArray(res.data) ? res.data : res.data?.data ?? []) as InventoryOption[];
    },
  });
  const { data: locations } = useQuery({
    queryKey: ['ga-locations-select'],
    queryFn: async () => {
      const res = await api.get('/ga/master/locations');
      return (Array.isArray(res.data) ? res.data : []) as LocationOption[];
    },
  });
  const [form, setForm] = useState({ inventoryItemId: '', fromLocationId: '', quantity: '', unitCost: '' });
  const [submitted, setSubmitted] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const errors = {
    item: !form.inventoryItemId ? t('workOrder.form.itemRequired') : undefined,
    qty: !(Number(form.quantity) > 0) ? t('workOrder.form.qtyRequired') : undefined,
  };

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ warning?: string }>(`/ga/maintenance/work-orders/${id}/parts`, {
        inventoryItemId: form.inventoryItemId,
        fromLocationId: form.fromLocationId || null,
        quantity: Number(form.quantity),
        unitCost: Number(form.unitCost) || 0,
      }),
    onSuccess: (res) => {
      if (res.data?.warning) toast.warning(res.data.warning);
      else toast.success(t('workOrder.form.partAdded'));
      onDone();
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, t('workOrder.form.partFailed'))),
  });

  const lineTotal = (Number(form.quantity) || 0) * (Number(form.unitCost) || 0);

  return (
    <FormModal
      title={t('workOrder.form.partTitle')}
      onClose={onClose}
      onSubmit={() => {
        setSubmitted(true);
        if (!errors.item && !errors.qty) mutation.mutate();
      }}
      submitLabel={t('workOrder.form.add')}
      submitting={mutation.isPending}
    >
      <ComboboxField label={t('workOrder.form.item')} required error={submitted ? errors.item : undefined}
  options={(items ?? []).map((it) => ({ value: it.id, label: `${it.sku} · ${it.name}` }))}
  value={form.inventoryItemId}
  onChange={(v) => set({ inventoryItemId: v })}
  placeholder={loadingItems ? t('workOrder.form.loading') : t('workOrder.form.itemPlaceholder')}
/>
      <ComboboxField label={t('workOrder.form.fromLocation')} hint={t('workOrder.form.fromLocationHint')}
  options={(locations ?? []).map((l) => ({ value: l.id, label: `${l.code} · ${l.name}` }))}
  value={form.fromLocationId}
  onChange={(v) => set({ fromLocationId: v })}
  placeholder={t('workOrder.form.noStockDeduction')}
/>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('workOrder.form.qty')} required error={submitted ? errors.qty : undefined}>
          <NumberInput min={0} step="any" value={form.quantity} onChange={(e) => set({ quantity: e.target.value })} />
        </Field>
        <Field label={t('workOrder.form.unitCost')}>
          <NumberInput min={0} value={form.unitCost} onChange={(e) => set({ unitCost: e.target.value })} />
        </Field>
      </div>
      {lineTotal > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('workOrder.form.subtotal')} <span className="num font-medium text-foreground">{formatRupiah(lineTotal)}</span>
        </p>
      )}
    </FormModal>
  );
}
