/**
 * New rental contract for a building asset:
 * POST /ga/building/assets/:id/rentals (same payload as before).
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { DateInput, Field } from '@/components/shared';
import { ChoiceCards, FormNumberInput, FormSheet } from '@/components/inventory/master-data-kit';
import { RENTAL_DIRECTION_OPTIONS, RENTAL_PERIOD_OPTIONS, apiErrorMessage, numOrNull } from './asset-model';
import { OptionSelect } from './OptionSelect';

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
  if (!f.pihak.trim()) errors.pihak = 'Nama pihak wajib diisi.';
  const nilai = numOrNull(f.nilaiSewa);
  if (nilai === null) errors.nilaiSewa = 'Nilai sewa wajib diisi.';
  else if (nilai < 0) errors.nilaiSewa = 'Nilai sewa tidak boleh negatif.';
  if (!f.tanggalMulai) errors.tanggalMulai = 'Tanggal mulai wajib diisi.';
  if (!f.tanggalAkhir) errors.tanggalAkhir = 'Tanggal akhir wajib diisi.';
  else if (f.tanggalMulai && f.tanggalAkhir < f.tanggalMulai) errors.tanggalAkhir = 'Tanggal akhir sebelum tanggal mulai.';
  return errors;
}

interface RentalFormSheetProps {
  assetId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function RentalFormSheet({ assetId, onClose, onSaved }: RentalFormSheetProps) {
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
      toast.success('Kontrak sewa ditambahkan.');
      onSaved();
    },
    onError: (e) => setServerError(apiErrorMessage(e, 'Gagal simpan kontrak sewa.')),
  });

  const submit = () => {
    setTouched(true);
    setServerError(null);
    if (Object.keys(validateRental(form)).length > 0) return;
    save.mutate();
  };

  const partyLabel = form.arah === 'SEWA_MASUK' ? 'Pemilik / yang menyewakan' : 'Penyewa';

  return (
    <FormSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title="Kontrak sewa baru"
      description="Masa sewa dipakai untuk menandai kontrak yang segera atau sudah berakhir."
      error={serverError}
      saving={save.isPending}
      submitLabel="Simpan kontrak"
      onSubmit={submit}
    >
      <ChoiceCards label="Arah sewa" value={form.arah} options={RENTAL_DIRECTION_OPTIONS} onChange={(v) => set('arah', v)} />
      <Field label={partyLabel} required error={errors.pihak}>
        <Input value={form.pihak} onChange={(e) => set('pihak', e.target.value)} maxLength={200} />
      </Field>
      <Field label="Kontak">
        <Input value={form.kontak} onChange={(e) => set('kontak', e.target.value)} maxLength={100} placeholder="Telepon atau email" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nilai sewa (Rp)" required error={errors.nilaiSewa}>
          <FormNumberInput value={form.nilaiSewa} onChange={(e) => set('nilaiSewa', e.target.value)} min={0} className="num text-right" />
        </Field>
        <Field label="Periode bayar">
          <OptionSelect value={form.periode} onChange={(v) => set('periode', v)} options={RENTAL_PERIOD_OPTIONS} />
        </Field>
        <Field label="Tanggal mulai" required error={errors.tanggalMulai}>
          {(control) => <DateInput id={control.id} required={control.required} value={form.tanggalMulai} onChange={(v) => set('tanggalMulai', v)} />}
        </Field>
        <Field label="Tanggal akhir" required error={errors.tanggalAkhir}>
          {(control) => (
            <DateInput id={control.id} required={control.required} value={form.tanggalAkhir} min={form.tanggalMulai || undefined} onChange={(v) => set('tanggalAkhir', v)} />
          )}
        </Field>
      </div>
      <Field label="Catatan">
        <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </FormSheet>
  );
}
