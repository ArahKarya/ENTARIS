/** New rental contract for a building asset (POST /ga/building/assets/:id/rentals). */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { tEam } from '../eam-i18n';
import { Input } from '@/components/ui/input';
import { DateInput, Field } from '@/components/shared';
import { ChoiceCards, FormNumberInput, FormSheet } from '@/components/inventory/master-data-kit';
import { RENTAL_DIRECTION_OPTIONS, RENTAL_PERIOD_OPTIONS, apiErrorMessage, numOrNull } from './asset-model';
import { OptionSelect } from './OptionSelect';
import { useTranslation } from 'react-i18next';

export interface BuildingRental {
  id: string;
  arah: 'SEWA_MASUK' | 'SEWA_KELUAR' | string;
  pihak: string;
  kontak: string | null;
  nilaiSewa: string | number;
  periode: 'BULANAN' | 'TAHUNAN' | string;
  tanggalMulai: string;
  tanggalAkhir: string;
  status: string;
  notes: string | null;
}

interface RentalForm {
  arah: 'SEWA_MASUK' | 'SEWA_KELUAR';
  pihak: string;
  kontak: string;
  nilaiSewa: string;
  periode: string;
  tanggalMulai: string;
  tanggalAkhir: string;
  notes: string;
}

type ErrorKey = 'pihak' | 'nilaiSewa' | 'tanggalMulai' | 'tanggalAkhir';

function validateRental(f: RentalForm): Partial<Record<ErrorKey, string>> {
  const errors: Partial<Record<ErrorKey, string>> = {};
  if (!f.pihak.trim()) errors.pihak = tEam('assets.rentalForm.partyRequired');
  const nilai = numOrNull(f.nilaiSewa);
  if (nilai === null) errors.nilaiSewa = tEam('assets.rentalForm.amountRequired');
  else if (nilai < 0) errors.nilaiSewa = tEam('assets.rentalForm.amountNegative');
  if (!f.tanggalMulai) errors.tanggalMulai = tEam('assets.rentalForm.startRequired');
  if (!f.tanggalAkhir) errors.tanggalAkhir = tEam('assets.rentalForm.endRequired');
  else if (f.tanggalMulai && f.tanggalAkhir < f.tanggalMulai) errors.tanggalAkhir = tEam('assets.rentalForm.endBefore');
  return errors;
}

interface RentalFormSheetProps {
  assetId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function RentalFormSheet({ assetId, onClose, onSaved }: RentalFormSheetProps) {
  const { t } = useTranslation('eam');
  const [form, setForm] = useState<RentalForm>({
    arah: 'SEWA_MASUK',
    pihak: '',
    kontak: '',
    nilaiSewa: '',
    periode: 'BULANAN',
    tanggalMulai: '',
    tanggalAkhir: '',
    notes: '',
  });
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const errors = touched ? validateRental(form) : {};
  const set = <K extends keyof RentalForm>(k: K, v: RentalForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () =>
      api.post(`/ga/building/assets/${assetId}/rentals`, {
        arah: form.arah,
        pihak: form.pihak.trim(),
        kontak: form.kontak.trim() || null,
        nilaiSewa: numOrNull(form.nilaiSewa) ?? 0,
        periode: form.periode,
        tanggalMulai: form.tanggalMulai,
        tanggalAkhir: form.tanggalAkhir,
        notes: form.notes.trim() || null,
      }),
    onSuccess: () => {
      toast.success(t('assets.rentalForm.saved'));
      onSaved();
    },
    onError: (e) => setServerError(apiErrorMessage(e, t('assets.rentalForm.saveFailed'))),
  });

  const submit = () => {
    setTouched(true);
    setServerError(null);
    if (Object.keys(validateRental(form)).length > 0) return;
    save.mutate();
  };

  const partyLabel = form.arah === 'SEWA_MASUK' ? t('assets.rentalForm.owner') : t('assets.rentalForm.tenant');

  return (
    <FormSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('assets.rentalForm.title')}
      description={t('assets.rentalForm.description')}
      error={serverError}
      saving={save.isPending}
      submitLabel={t('assets.rentalForm.submit')}
      onSubmit={submit}
    >
      <ChoiceCards label={t('assets.rentalForm.direction')} value={form.arah} options={RENTAL_DIRECTION_OPTIONS} onChange={(v) => set('arah', v)} />
      <Field label={partyLabel} required error={errors.pihak}>
        <Input value={form.pihak} onChange={(e) => set('pihak', e.target.value)} maxLength={200} />
      </Field>
      <Field label={t('assets.rentalForm.contact')}>
        <Input value={form.kontak} onChange={(e) => set('kontak', e.target.value)} maxLength={100} placeholder={t('assets.rentalForm.contactPlaceholder')} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('assets.rentalForm.amount')} required error={errors.nilaiSewa}>
          <FormNumberInput value={form.nilaiSewa} onChange={(e) => set('nilaiSewa', e.target.value)} min={0} className="num text-right" />
        </Field>
        <Field label={t('assets.rentalForm.period')}>
          <OptionSelect value={form.periode} onChange={(v) => set('periode', v)} options={RENTAL_PERIOD_OPTIONS} />
        </Field>
        <Field label={t('assets.rentalForm.start')} required error={errors.tanggalMulai}>
          {(control) => <DateInput id={control.id} required={control.required} value={form.tanggalMulai} onChange={(v) => set('tanggalMulai', v)} />}
        </Field>
        <Field label={t('assets.rentalForm.end')} required error={errors.tanggalAkhir}>
          {(control) => (
            <DateInput id={control.id} required={control.required} value={form.tanggalAkhir} min={form.tanggalMulai || undefined} onChange={(v) => set('tanggalAkhir', v)} />
          )}
        </Field>
      </div>
      <Field label={t('shared.notes')}>
        <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </FormSheet>
  );
}
