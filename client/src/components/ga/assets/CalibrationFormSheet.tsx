/**
 * New calibration log for an equipment asset; the server syncs
 * lastCalibratedAt / nextCalibrationDue from it.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { tEam } from '../eam-i18n';
import { Input } from '@/components/ui/input';
import { DateInput, Field } from '@/components/shared';
import { FormNumberInput, FormSheet } from '@/components/inventory/master-data-kit';
import { CALIBRATION_MODE_OPTIONS, CALIBRATION_RESULT_OPTIONS, apiErrorMessage, numOrNull } from './asset-model';
import { OptionSelect } from './OptionSelect';
import { useTranslation } from 'react-i18next';

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
  if (!f.tanggal) errors.tanggal = tEam('assets.calibrationForm.dateRequired');
  if (!f.validUntil) errors.validUntil = tEam('assets.calibrationForm.validUntilRequired');
  else if (f.tanggal && f.validUntil < f.tanggal) errors.validUntil = tEam('assets.calibrationForm.validUntilBefore');
  if (!f.lembaga.trim()) errors.lembaga = tEam('assets.calibrationForm.labRequired');
  if (!f.noSertifikat.trim()) errors.noSertifikat = tEam('assets.calibrationForm.certRequired');
  const biaya = numOrNull(f.biaya);
  if (biaya !== null && biaya < 0) errors.biaya = tEam('assets.calibrationForm.costNegative');
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
  const { t } = useTranslation('eam');
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
      toast.success(t('assets.calibrationForm.saved'));
      onSaved();
    },
    onError: (e) => setServerError(apiErrorMessage(e, t('assets.calibrationForm.saveFailed'))),
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
      title={t('assets.calibrationForm.title')}
      description={t('assets.calibrationForm.description')}
      error={serverError}
      saving={save.isPending}
      submitLabel={t('assets.calibrationForm.submit')}
      onSubmit={submit}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('assets.calibrationForm.date')} required error={errors.tanggal}>
          {(control) => <DateInput id={control.id} required={control.required} value={form.tanggal} onChange={(v) => set('tanggal', v)} />}
        </Field>
        <Field label={t('assets.calibrationForm.validUntil')} required error={errors.validUntil}>
          {(control) => (
            <DateInput id={control.id} required={control.required} value={form.validUntil} min={form.tanggal || undefined} onChange={(v) => set('validUntil', v)} />
          )}
        </Field>
      </div>
      <Field label={t('assets.calibrationForm.lab')} required error={errors.lembaga}>
        <Input value={form.lembaga} onChange={(e) => set('lembaga', e.target.value)} maxLength={200} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('assets.calibrationForm.cert')} required error={errors.noSertifikat}>
          <Input value={form.noSertifikat} onChange={(e) => set('noSertifikat', e.target.value)} maxLength={100} />
        </Field>
        <Field label={t('assets.calibrationForm.result')}>
          <OptionSelect value={form.hasil} onChange={(v) => set('hasil', v)} options={CALIBRATION_RESULT_OPTIONS} />
        </Field>
        <Field label={t('assets.calibrationForm.mode')}>
          <OptionSelect value={form.mode} onChange={(v) => set('mode', v)} options={CALIBRATION_MODE_OPTIONS} />
        </Field>
        <Field label={t('assets.calibrationForm.cost')} error={errors.biaya}>
          <FormNumberInput value={form.biaya} onChange={(e) => set('biaya', e.target.value)} min={0} className="num text-right" />
        </Field>
        <Field label={t('assets.calibrationForm.range')}>
          <Input value={form.rangeTested} onChange={(e) => set('rangeTested', e.target.value)} maxLength={100} placeholder={t('assets.calibrationForm.rangePlaceholder')} />
        </Field>
        <Field label={t('assets.calibrationForm.deviation')}>
          <Input value={form.deviasi} onChange={(e) => set('deviasi', e.target.value)} maxLength={500} />
        </Field>
      </div>
    </FormSheet>
  );
}
