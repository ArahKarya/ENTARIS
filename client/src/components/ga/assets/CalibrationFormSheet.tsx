/**
 * New calibration log for an equipment asset:
 * POST /ga/equipment/assets/:id/calibration-logs (same payload as before; the
 * server syncs lastCalibratedAt / nextCalibrationDue from it).
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { DateInput, Field } from '@/components/shared';
import { FormNumberInput, FormSheet } from '@/components/inventory/master-data-kit';
import { CALIBRATION_MODE_OPTIONS, CALIBRATION_RESULT_OPTIONS, apiErrorMessage, numOrNull } from './asset-model';
import { OptionSelect } from './OptionSelect';

export interface CalibrationLog {
  id: string;
  tanggal: string;
  lembaga: string;
  noSertifikat: string;
  mode: string;
  biaya: string | number | null;
  hasil: string;
  deviasi: string | null;
  rangeTested: string | null;
  validUntil: string;
}

interface CalForm {
  tanggal: string;
  validUntil: string;
  lembaga: string;
  noSertifikat: string;
  mode: string;
  hasil: string;
  biaya: string;
  rangeTested: string;
  deviasi: string;
}

type ErrorKey = 'tanggal' | 'validUntil' | 'lembaga' | 'noSertifikat' | 'biaya';

function validateCalibration(f: CalForm): Partial<Record<ErrorKey, string>> {
  const errors: Partial<Record<ErrorKey, string>> = {};
  if (!f.tanggal) errors.tanggal = 'Tanggal kalibrasi wajib diisi.';
  if (!f.validUntil) errors.validUntil = 'Masa berlaku wajib diisi.';
  else if (f.tanggal && f.validUntil < f.tanggal) errors.validUntil = 'Masa berlaku sebelum tanggal kalibrasi.';
  if (!f.lembaga.trim()) errors.lembaga = 'Lembaga wajib diisi.';
  if (!f.noSertifikat.trim()) errors.noSertifikat = 'No. sertifikat wajib diisi.';
  const biaya = numOrNull(f.biaya);
  if (biaya !== null && biaya < 0) errors.biaya = 'Biaya tidak boleh negatif.';
  return errors;
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface CalibrationFormSheetProps {
  assetId: string;
  /** Prefills the calibration body (equipment default calibrator). */
  defaultLembaga?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function CalibrationFormSheet({ assetId, defaultLembaga, onClose, onSaved }: CalibrationFormSheetProps) {
  const [form, setForm] = useState<CalForm>({
    tanggal: todayIso(),
    validUntil: '',
    lembaga: defaultLembaga ?? '',
    noSertifikat: '',
    mode: 'ON_SITE',
    hasil: 'PASS',
    biaya: '',
    rangeTested: '',
    deviasi: '',
  });
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const errors = touched ? validateCalibration(form) : {};
  const set = <K extends keyof CalForm>(k: K, v: CalForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () =>
      api.post(`/ga/equipment/assets/${assetId}/calibration-logs`, {
        tanggal: form.tanggal,
        lembaga: form.lembaga.trim(),
        noSertifikat: form.noSertifikat.trim(),
        mode: form.mode,
        biaya: numOrNull(form.biaya),
        hasil: form.hasil,
        deviasi: form.deviasi.trim() || null,
        rangeTested: form.rangeTested.trim() || null,
        validUntil: form.validUntil,
      }),
    onSuccess: () => {
      toast.success('Log kalibrasi tersimpan.');
      onSaved();
    },
    onError: (e) => setServerError(apiErrorMessage(e, 'Gagal menyimpan log kalibrasi.')),
  });

  const submit = () => {
    setTouched(true);
    setServerError(null);
    if (Object.keys(validateCalibration(form)).length > 0) return;
    save.mutate();
  };

  return (
    <FormSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title="Log kalibrasi baru"
      description="Masa berlaku sertifikat menjadi jatuh tempo kalibrasi berikutnya."
      error={serverError}
      saving={save.isPending}
      submitLabel="Simpan log"
      onSubmit={submit}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Tanggal kalibrasi" required error={errors.tanggal}>
          {(control) => <DateInput id={control.id} required={control.required} value={form.tanggal} onChange={(v) => set('tanggal', v)} />}
        </Field>
        <Field label="Berlaku s/d" required error={errors.validUntil}>
          {(control) => (
            <DateInput id={control.id} required={control.required} value={form.validUntil} min={form.tanggal || undefined} onChange={(v) => set('validUntil', v)} />
          )}
        </Field>
      </div>
      <Field label="Lembaga kalibrasi" required error={errors.lembaga}>
        <Input value={form.lembaga} onChange={(e) => set('lembaga', e.target.value)} maxLength={200} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="No. sertifikat" required error={errors.noSertifikat}>
          <Input value={form.noSertifikat} onChange={(e) => set('noSertifikat', e.target.value)} maxLength={100} />
        </Field>
        <Field label="Hasil">
          <OptionSelect value={form.hasil} onChange={(v) => set('hasil', v)} options={CALIBRATION_RESULT_OPTIONS} />
        </Field>
        <Field label="Cara kalibrasi">
          <OptionSelect value={form.mode} onChange={(v) => set('mode', v)} options={CALIBRATION_MODE_OPTIONS} />
        </Field>
        <Field label="Biaya (Rp)" error={errors.biaya}>
          <FormNumberInput value={form.biaya} onChange={(e) => set('biaya', e.target.value)} min={0} className="num text-right" />
        </Field>
        <Field label="Rentang diuji">
          <Input value={form.rangeTested} onChange={(e) => set('rangeTested', e.target.value)} maxLength={100} placeholder="Mis. 0–3000 kg" />
        </Field>
        <Field label="Deviasi">
          <Input value={form.deviasi} onChange={(e) => set('deviasi', e.target.value)} maxLength={500} />
        </Field>
      </div>
    </FormSheet>
  );
}
