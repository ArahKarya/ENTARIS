import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DateInput, Field } from '@/components/shared';
import { tripDays } from './payment-request';
import type { TravelErrors, TravelValue } from './travel';

interface TravelSectionProps {
  value: TravelValue;
  onChange: (next: TravelValue) => void;
  errors?: TravelErrors;
}

/** "Perjalanan dinas" block of the request form: destination, dates (return ≥ departure), duration, participants. */
export function TravelSection({ value, onChange, errors = {} }: TravelSectionProps) {
  const set = <K extends keyof TravelValue>(key: K, v: TravelValue[K]) => onChange({ ...value, [key]: v });
  const days = tripDays(value.startDate, value.endDate);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Perjalanan dinas</CardTitle>
        <CardDescription>Tujuan, jadwal, dan peserta. Keperluan perjalanan diisi pada kolom Keperluan di atas.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Kota / tujuan" required error={errors.destination} className="sm:col-span-2">
          <Input maxLength={200} placeholder="mis. Surabaya" value={value.destination} onChange={(e) => set('destination', e.target.value)} />
        </Field>
        <Field label="Tanggal berangkat" required error={errors.startDate}>
          {(control) => (
            <DateInput
              id={control.id}
              value={value.startDate}
              onChange={(v) => onChange({ ...value, startDate: v, endDate: value.endDate && v && value.endDate < v ? v : value.endDate })}
            />
          )}
        </Field>
        <Field label="Tanggal kembali" required error={errors.endDate} hint={days ? `Durasi ${days} hari (${Math.max(days - 1, 0)} malam).` : 'Tidak boleh sebelum tanggal berangkat.'}>
          {(control) => <DateInput id={control.id} value={value.endDate} min={value.startDate || undefined} onChange={(v) => set('endDate', v)} />}
        </Field>
        <Field label="Peserta" hint="Opsional. Nama peserta lain bila berangkat bersama." className="sm:col-span-2">
          <Textarea rows={2} maxLength={500} value={value.participants} onChange={(e) => set('participants', e.target.value)} />
        </Field>
      </CardContent>
    </Card>
  );
}
