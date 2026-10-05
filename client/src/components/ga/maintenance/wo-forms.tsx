/**
 * Work-order forms of the Pemeliharaan page: create, assign technician,
 * complete (with checklist + costs) and record part usage. Payloads and
 * endpoints are unchanged from the previous page; only the shell and the
 * validation display (inline errors) are new.
 */
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
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  TYPE_LABELS,
  apiErrorMessage,
  type WoPrefill,
  type WoPriority,
  type WoType,
} from './wo-meta';


const PRIORITY_OPTIONS = PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }));
const TYPE_OPTIONS = (Object.keys(TYPE_LABELS) as WoType[]).map((t) => ({ value: t, label: TYPE_LABELS[t] }));

const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

// ─── Create ──────────────────────────────────────────────────────────────

export function CreateWorkOrderModal({ prefill, onClose }: { prefill?: WoPrefill | null; onClose: () => void }) {
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
    assetId: !form.assetId ? 'Aset wajib dipilih.' : undefined,
    title: !form.title.trim() ? 'Judul wajib diisi.' : undefined,
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
      toast.success('Work order dibuat.');
      queryClient.invalidateQueries({ queryKey: ['ga-work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['ga-schedules'] });
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal membuat work order.')),
  });

  const submit = () => {
    setSubmitted(true);
    if (errors.assetId || errors.title) return;
    mutation.mutate();
  };

  return (
    <FormModal
      title={scheduleId ? 'Buat WO dari Jadwal' : 'Buat Work Order'}
      description={scheduleId ? undefined : 'Catat pekerjaan perbaikan atau perawatan untuk satu aset.'}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Simpan"
      submitting={mutation.isPending}
    >
      {scheduleId && (
        <p className="flex items-start gap-2 rounded-md bg-info-subtle px-3 py-2 text-sm text-info-text">
          <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
          WO ini terhubung ke jadwal preventif. Saat WO selesai, jadwal otomatis bergulir ke jatuh tempo berikutnya.
        </p>
      )}
      <ComboboxField label="Aset" required error={submitted ? errors.assetId : undefined}
  options={assetOptions(assets)}
  value={form.assetId}
  onChange={(v) => set({ assetId: v })}
  placeholder={isLoading ? 'Memuat…' : '— Pilih aset —'}
  disabled={!!prefill?.assetId}
/>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Tipe">
          {(control) => (
            <Select value={form.type} onValueChange={(v) => set({ type: v as WoType })}>
              <SelectTrigger {...control}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Prioritas">
          {(control) => (
            <Select value={form.priority} onValueChange={(v) => set({ priority: v as WoPriority })}>
              <SelectTrigger {...control}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>
      <Field label="Judul" required error={submitted ? errors.title : undefined}>
        <Input
          value={form.title}
          maxLength={200}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Contoh: Perbaikan AC ruang server"
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Komponen" hint="Opsional">
          <Input
            value={form.component}
            maxLength={200}
            onChange={(e) => set({ component: e.target.value })}
            placeholder="V-belt, bearing, kompresor"
          />
        </Field>
        <Field label="Jatuh tempo" hint="Opsional">
          {(control) => <DateInput id={control.id} value={form.dueAt} onChange={(v) => set({ dueAt: v })} />}
        </Field>
      </div>
      <Field label="Deskripsi">
        <Textarea rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
    </FormModal>
  );
}

// ─── Assign ──────────────────────────────────────────────────────────────

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
      toast.success('Teknisi ditugaskan.');
      onDone();
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menugaskan teknisi.')),
  });

  return (
    <FormModal
      title={currentAssigneeId ? 'Ubah Teknisi' : 'Tugaskan Teknisi'}
      onClose={onClose}
      onSubmit={() => {
        setSubmitted(true);
        if (assignedToId) mutation.mutate();
      }}
      submitLabel="Tugaskan"
      submitting={mutation.isPending}
    >
      <ComboboxField label="Teknisi" required error={submitted && !assignedToId ? 'Teknisi wajib dipilih.' : undefined}
  options={(users ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` }))}
  value={assignedToId}
  onChange={setAssignedToId}
  placeholder={isLoading ? 'Memuat…' : '— Pilih teknisi —'}
/>
    </FormModal>
  );
}

// ─── Complete ────────────────────────────────────────────────────────────

export function CompleteModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
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
      toast.success('Work order selesai.');
      onDone();
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyelesaikan work order.')),
  });

  const totalCost = (Number(form.laborCost) || 0) + (Number(form.externalCost) || 0);

  return (
    <FormModal
      title="Selesaikan Work Order"
      description="Catat hasil pekerjaan, biaya tenaga dan vendor, serta checklist penyelesaian."
      size="lg"
      onClose={onClose}
      onSubmit={() => {
        setSubmitted(true);
        if (!blankLabel) mutation.mutate();
      }}
      submitLabel="Tandai Selesai"
      submitting={mutation.isPending}
    >
      <Field label="Penyelesaian / resolusi">
        <Textarea rows={3} value={form.resolution} onChange={(e) => set({ resolution: e.target.value })} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Jam kerja">
          <NumberInput min={0} step="any" value={form.laborHours} onChange={(e) => set({ laborHours: e.target.value })} />
        </Field>
        <Field label="Biaya tenaga (Rp)">
          <NumberInput min={0} value={form.laborCost} onChange={(e) => set({ laborCost: e.target.value })} />
        </Field>
        <Field label="Vendor eksternal">
          <Input value={form.externalVendor} onChange={(e) => set({ externalVendor: e.target.value })} />
        </Field>
        <Field label="Biaya eksternal (Rp)">
          <NumberInput min={0} value={form.externalCost} onChange={(e) => set({ externalCost: e.target.value })} />
        </Field>
      </div>
      {totalCost > 0 && (
        <p className="text-sm text-muted-foreground">
          Biaya tenaga + eksternal: <span className="num font-medium text-foreground">{formatRupiah(totalCost)}</span>{' '}
          (biaya part dihitung dari pemakaian part).
        </p>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">Checklist penyelesaian</legend>
        <p className="text-xs text-muted-foreground">
          Item bertanda &ldquo;Wajib&rdquo; harus dicentang &ldquo;Selesai&rdquo; sebelum WO bisa diselesaikan.
        </p>
        <ChecklistEditor items={checklist} onChange={setChecklist} />
        {submitted && blankLabel && (
          <p role="alert" className="text-xs font-medium text-danger-text">
            Setiap item checklist wajib punya label.
          </p>
        )}
        {missingRequired.length > 0 && (
          <p className="text-xs text-warning-text">
            {missingRequired.length} item wajib belum dicentang selesai; server akan menolak penyelesaian.
          </p>
        )}
      </fieldset>
    </FormModal>
  );
}

// ─── Add part ────────────────────────────────────────────────────────────

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
    item: !form.inventoryItemId ? 'Item wajib dipilih.' : undefined,
    qty: !(Number(form.quantity) > 0) ? 'Qty harus lebih dari 0.' : undefined,
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
      else toast.success('Part dicatat.');
      onDone();
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal mencatat part.')),
  });

  const lineTotal = (Number(form.quantity) || 0) * (Number(form.unitCost) || 0);

  return (
    <FormModal
      title="Tambah Pemakaian Part"
      onClose={onClose}
      onSubmit={() => {
        setSubmitted(true);
        if (!errors.item && !errors.qty) mutation.mutate();
      }}
      submitLabel="Tambah"
      submitting={mutation.isPending}
    >
      <ComboboxField label="Item inventaris" required error={submitted ? errors.item : undefined}
  options={(items ?? []).map((it) => ({ value: it.id, label: `${it.sku} — ${it.name}` }))}
  value={form.inventoryItemId}
  onChange={(v) => set({ inventoryItemId: v })}
  placeholder={loadingItems ? 'Memuat…' : '— Pilih item —'}
/>
      <ComboboxField label="Lokasi asal" hint="Isi untuk mengurangi stok dari lokasi ini."
  options={(locations ?? []).map((l) => ({ value: l.id, label: `${l.code} — ${l.name}` }))}
  value={form.fromLocationId}
  onChange={(v) => set({ fromLocationId: v })}
  placeholder="— Tanpa pengurangan stok —"
/>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Qty" required error={submitted ? errors.qty : undefined}>
          <NumberInput min={0} step="any" value={form.quantity} onChange={(e) => set({ quantity: e.target.value })} />
        </Field>
        <Field label="Harga satuan (Rp)">
          <NumberInput min={0} value={form.unitCost} onChange={(e) => set({ unitCost: e.target.value })} />
        </Field>
      </div>
      {lineTotal > 0 && (
        <p className="text-sm text-muted-foreground">
          Subtotal: <span className="num font-medium text-foreground">{formatRupiah(lineTotal)}</span>
        </p>
      )}
    </FormModal>
  );
}
