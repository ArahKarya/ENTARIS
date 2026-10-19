import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('finance');
  const set = <K extends keyof TravelValue>(key: K, v: TravelValue[K]) => onChange({ ...value, [key]: v });
  const days = tripDays(value.startDate, value.endDate);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('travelSection.title')}</CardTitle>
        <CardDescription>{t('travelSection.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label={t('travelSection.destination')} required error={errors.destination} className="sm:col-span-2">
          <Input maxLength={200} placeholder={t('travelSection.destinationPlaceholder')} value={value.destination} onChange={(e) => set('destination', e.target.value)} />
        </Field>
        <Field label={t('travelSection.startDate')} required error={errors.startDate}>
          {(control) => (
            <DateInput
              id={control.id}
              value={value.startDate}
              onChange={(v) => onChange({ ...value, startDate: v, endDate: value.endDate && v && value.endDate < v ? v : value.endDate })}
            />
          )}
        </Field>
        <Field
          label={t('travelSection.endDate')}
          required
          error={errors.endDate}
          hint={days ? t('travelSection.duration', { days, nights: Math.max(days - 1, 0) }) : t('travelSection.endDateHint')}
        >
          {(control) => <DateInput id={control.id} value={value.endDate} min={value.startDate || undefined} onChange={(v) => set('endDate', v)} />}
        </Field>
        <Field label={t('travelSection.participants')} hint={t('travelSection.participantsHint')} className="sm:col-span-2">
          <Textarea rows={2} maxLength={500} value={value.participants} onChange={(e) => set('participants', e.target.value)} />
        </Field>
      </CardContent>
    </Card>
  );
}
