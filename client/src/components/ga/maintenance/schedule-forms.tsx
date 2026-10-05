/**
 * Create / edit a preventive maintenance schedule (interval in days, operating
 * hours or km, plus the next due date). Payloads unchanged from the old page.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { ComboboxField } from '@/components/overlays/ComboboxField';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { DateInput, Field } from '@/components/shared';
import { FormModal } from './form-modal';
import { assetOptions, useGaAssetOptions } from './queries';
import { apiErrorMessage, assetLabel, toDateInput, type ScheduleRow } from './wo-meta';

const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));
const str = (v: number | null) => (v != null ? String(v) : '');

/** Pass `schedule` to edit; omit to create. */
export function ScheduleFormModal({ schedule, onClose }: { schedule?: ScheduleRow | null; onClose: () => void }) {
  const editing = !!schedule;
  const queryClient = useQueryClient();
  const { data: assets, isLoading } = useGaAssetOptions();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    assetId: schedule?.asset?.id ?? '',
    intervalDays: str(schedule?.intervalDays ?? null),
    intervalHours: str(schedule?.intervalHours ?? null),
    intervalKm: str(schedule?.intervalKm ?? null),
    nextDueAt: toDateInput(schedule?.nextDueAt),
    notes: schedule?.notes ?? '',
    isActive: schedule ? !!schedule.isActive : true,
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const errors = {
    assetId: !editing && !form.assetId ? 'Aset wajib dipilih.' : undefined,
    interval: !form.intervalDays && !form.intervalHours && !form.intervalKm ? 'Isi salah satu interval (hari, jam, atau km).' : undefined,
    nextDueAt: !editing && !form.nextDueAt ? 'Tanggal jatuh tempo berikutnya wajib diisi.' : undefined,
  };

  const intervals = {
    intervalDays: numOrNull(form.intervalDays),
    intervalHours: numOrNull(form.intervalHours),
    intervalKm: numOrNull(form.intervalKm),
  };

  const mutation = useMutation({
    mutationFn: () =>
      editing
        ? api.put(`/ga/maintenance/schedules/${schedule.id}`, {
            ...intervals,
            nextDueAt: form.nextDueAt || undefined,
            notes: form.notes || null,
            isActive: form.isActive,
          })
        : api.post('/ga/maintenance/schedules', {
            assetId: form.assetId,
            ...intervals,
            nextDueAt: form.nextDueAt,
            notes: form.notes || null,
          }),
    onSuccess: () => {
      toast.success(editing ? 'Jadwal diperbarui.' : 'Jadwal dibuat.');
      queryClient.invalidateQueries({ queryKey: ['ga-schedules'] });
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, editing ? 'Gagal memperbarui jadwal.' : 'Gagal membuat jadwal.')),
  });

  const submit = () => {
    setSubmitted(true);
    if (errors.assetId || errors.interval || errors.nextDueAt) return;
    mutation.mutate();
  };

  return (
    <FormModal
      title={editing ? 'Edit Jadwal Preventif' : 'Buat Jadwal Preventif'}
      description={editing ? assetLabel(schedule.asset) : 'Jadwal perawatan berkala; jatuh tempo bergulir otomatis saat WO terkait selesai.'}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Simpan"
      submitting={mutation.isPending}
    >
      {!editing && (
        <ComboboxField label="Aset" required error={submitted ? errors.assetId : undefined}
  options={assetOptions(assets)}
  value={form.assetId}
  onChange={(v) => set({ assetId: v })}
  placeholder={isLoading ? 'Memuat…' : '— Pilih aset —'}
/>
      )}
      <fieldset className="flex flex-col gap-1.5" aria-describedby="schedule-interval-hint">
        <legend className="mb-0.5 text-sm font-medium text-foreground">
          Interval <span className="text-danger-text" aria-hidden>*</span>
        </legend>
        <p id="schedule-interval-hint" className="text-xs text-muted-foreground">
          Isi salah satu: hari kalender, jam operasi, atau kilometer.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Hari">
            <NumberInput min={1} value={form.intervalDays} onChange={(e) => set({ intervalDays: e.target.value })} />
          </Field>
          <Field label="Jam">
            <NumberInput min={1} value={form.intervalHours} onChange={(e) => set({ intervalHours: e.target.value })} />
          </Field>
          <Field label="Km">
            <NumberInput min={1} value={form.intervalKm} onChange={(e) => set({ intervalKm: e.target.value })} />
          </Field>
        </div>
        {submitted && errors.interval && (
          <p role="alert" className="text-xs font-medium text-danger-text">
            {errors.interval}
          </p>
        )}
      </fieldset>
      <Field label="Jatuh tempo berikutnya" required={!editing} error={submitted ? errors.nextDueAt : undefined}>
        {(control) => <DateInput id={control.id} value={form.nextDueAt} onChange={(v) => set({ nextDueAt: v })} />}
      </Field>
      <Field label="Catatan">
        <Textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
      {editing && (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set({ isActive: e.target.checked })}
            className="size-4 accent-[var(--primary)]"
          />
          Jadwal aktif
        </label>
      )}
    </FormModal>
  );
}
