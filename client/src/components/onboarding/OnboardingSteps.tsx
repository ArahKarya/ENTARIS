import { Building2, CalendarRange, CheckCircle2, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/shared/field';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDateRange } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Trans, useTranslation } from 'react-i18next';
import { STEPS, type FiscalYearLite } from './onboarding-state';

export interface CompanyForm {
  companyName: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
}

export interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** Numbered progress list; the current step carries aria-current="step". */
export function Stepper({ current }: { current: number }) {
  const { t } = useTranslation('shell');
  return (
    <ol aria-label={t('onboarding.stepsLabel')} className="flex items-center gap-1.5">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.id} aria-current={active ? 'step' : undefined} className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span
              aria-hidden
              className={cn('h-1 rounded-sm transition-colors', done || active ? 'bg-primary' : 'bg-border')}
            />
            <span
              className={cn(
                'hidden truncate text-xs sm:block',
                active ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              <span className="sr-only">
                {done ? t('onboarding.stepDonePrefix') : active ? t('onboarding.stepCurrentPrefix') : ''}
              </span>
              {t(`onboarding.steps.${s.id}`)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StepIntro({ icon: Icon, children }: { icon: typeof Building2; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

export function WelcomeStep() {
  const { t } = useTranslation('shell');
  const tasks = [
    { icon: Building2, text: t('onboarding.welcome.taskCompany') },
    { icon: CalendarRange, text: t('onboarding.welcome.taskFiscal') },
    { icon: KeyRound, text: t('onboarding.welcome.taskPassword') },
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t('onboarding.welcome.intro')}
      </p>
      <ul className="space-y-2">
        {tasks.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm text-foreground">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary-subtle-foreground">
              <Icon className="size-4" aria-hidden />
            </span>
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CompanyStep({
  form,
  onChange,
  error,
}: {
  form: CompanyForm;
  onChange: (next: CompanyForm) => void;
  error?: string;
}) {
  const { t } = useTranslation('shell');
  const set = (key: keyof CompanyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...form, [key]: e.target.value });
  return (
    <div className="space-y-4">
      <Field label={t('onboarding.company.name')} required hint={t('onboarding.company.nameHint')} error={error}>
        <Input value={form.companyName} onChange={set('companyName')} autoComplete="organization" />
      </Field>
      <Field label={t('onboarding.company.address')} hint={t('onboarding.company.addressHint')}>
        <Textarea value={form.address} onChange={set('address')} rows={2} autoComplete="street-address" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('onboarding.company.phone')}>
          <Input value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" />
        </Field>
        <Field label={t('onboarding.company.email')}>
          <Input type="email" value={form.email} onChange={set('email')} autoComplete="email" />
        </Field>
      </div>
      <Field label={t('onboarding.company.taxId')} hint={t('onboarding.company.taxIdHint')}>
        <Input value={form.taxId} onChange={set('taxId')} inputMode="numeric" />
      </Field>
    </div>
  );
}

export function FiscalStep({ years, loading }: { years: FiscalYearLite[] | undefined; loading: boolean }) {
  const { t } = useTranslation(['shell', 'common']);
  if (loading) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> {t('onboarding.fiscal.loading')}
      </div>
    );
  }
  if (!years?.length) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-dashed border-border-strong px-4 py-8 text-center">
          <CalendarRange className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">{t('onboarding.fiscal.emptyTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('onboarding.fiscal.emptyDescription')}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <StepIntro icon={CalendarRange}>
        {t('onboarding.fiscal.intro')}
      </StepIntro>
      <ul className="space-y-2">
        {years.map((fy) => (
          <li key={fy.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{t('onboarding.fiscal.yearName', { name: fy.name })}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatDateRange(fy.startDate, fy.endDate)}
              </p>
            </div>
            <StatusBadge label={fy.isClosed ? t('common:status.closed') : t('common:status.open')} tone={fy.isClosed ? 'neutral' : 'success'} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SecurityStep({
  form,
  onChange,
  error,
}: {
  form: PasswordForm;
  onChange: (next: PasswordForm) => void;
  error?: string;
}) {
  const { t } = useTranslation('shell');
  const set = (key: keyof PasswordForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...form, [key]: e.target.value });
  return (
    <div className="space-y-4">
      <StepIntro icon={ShieldCheck}>
        {t('onboarding.security.intro')}
      </StepIntro>
      <Field label={t('onboarding.security.current')}>
        <Input type="password" value={form.currentPassword} onChange={set('currentPassword')} autoComplete="current-password" />
      </Field>
      <Field label={t('onboarding.security.new')} hint={t('onboarding.security.newHint', { min: 8 })} error={error}>
        <Input type="password" value={form.newPassword} onChange={set('newPassword')} autoComplete="new-password" />
      </Field>
      <Field label={t('onboarding.security.confirm')}>
        <Input type="password" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" />
      </Field>
    </div>
  );
}

export function DoneStep({ companyName }: { companyName: string }) {
  const { t } = useTranslation('shell');
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <CheckCircle2 className="size-8 text-success-text" aria-hidden />
      <p className="max-w-sm text-sm text-muted-foreground">
        {t('onboarding.done.ready', { name: companyName || 'Entaris' })}{' '}
        <Trans
          t={t}
          i18nKey="onboarding.done.checklistNote"
          components={{ strong: <span className="font-medium text-foreground" /> }}
        />
      </p>
    </div>
  );
}
