import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Mail, MessageSquareText, Phone, Send } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { BrandMark, Field } from '@/components/shared';

interface Branding {
  companyName: string | null;
  logoUrl: string | null;
  logoUrlDark: string | null;
  phone?: string | null;
  email?: string | null;
}

const CHANNEL_FROM_SRC: Record<string, string> = {
  wa: 'WhatsApp',
  whatsapp: 'WhatsApp',
  ig: 'Referral',
  email: 'Email',
  ref: 'Referral',
  walk: 'WalkIn',
  // QR variants — all map to "Walk-in" since QR is typically scanned from
  // a printed surface or display (kartu nama, brosur, banner).
  'qr-cetak': 'WalkIn',
  'qr-toko': 'WalkIn',
  'qr-kartu-nama': 'WalkIn',
};

/** Seed placeholder values that mean "the tenant has not set a company name yet". */
const PLACEHOLDER_COMPANY_NAMES = new Set(['', 'nama perusahaan anda']);

const ITEMS_MAX = 2000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldName = 'name' | 'phone' | 'email' | 'itemsText';
type FieldErrors = Partial<Record<FieldName, string>>;
const FIELD_ORDER: readonly FieldName[] = ['name', 'phone', 'email', 'itemsText'];

interface FormValues {
  name: string;
  phone: string;
  email: string;
  itemsText: string;
}

const EMPTY_FORM: FormValues = { name: '', phone: '', email: '', itemsText: '' };

/** Client-side checks mirror the server schema (routes/public.ts) so bad input never costs a rate-limit slot. */
function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};
  const msg = (key: 'nameMin' | 'phoneMin' | 'emailInvalid' | 'itemsMin', min?: number) =>
    i18n.t(`publicInquiry.errors.${key}`, { ns: 'auth', min });
  if (values.name.trim().length < 2) errors.name = msg('nameMin', 2);
  const digits = values.phone.replace(/\D/g, '');
  if (values.phone.trim().length < 8 || digits.length < 8) errors.phone = msg('phoneMin', 8);
  if (values.email.trim() && !EMAIL_PATTERN.test(values.email.trim())) errors.email = msg('emailInvalid');
  if (values.itemsText.trim().length < 10) errors.itemsText = msg('itemsMin', 10);
  return errors;
}

function realCompanyName(name: string | null | undefined): string | null {
  const trimmed = (name ?? '').trim();
  return PLACEHOLDER_COMPANY_NAMES.has(trimmed.toLowerCase()) ? null : trimmed;
}

function initials(name: string): string {
  const words = name.replace(/^(PT|CV|UD|TB)\.?\s+/i, '').split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || name[0]?.toUpperCase() || '?';
}

function TenantIdentity({ branding, companyName }: { branding: Branding | null; companyName: string | null }) {
  const { t } = useTranslation('auth');
  if (branding?.logoUrl) {
    const darkLogo = branding.logoUrlDark || branding.logoUrl;
    return (
      <div className="flex h-12 items-center">
        <img src={branding.logoUrl} alt={companyName ?? t('publicInquiry.companyLogo')} className="h-12 max-w-[180px] object-contain dark:hidden" />
        <img src={darkLogo} alt={companyName ?? t('publicInquiry.companyLogo')} className="hidden h-12 max-w-[180px] object-contain dark:block" />
      </div>
    );
  }
  if (companyName) {
    return (
      <div
        aria-hidden
        className="flex size-12 items-center justify-center rounded-full bg-primary-subtle font-heading text-base font-bold text-primary-subtle-foreground"
      >
        {initials(companyName)}
      </div>
    );
  }
  return (
    <div aria-hidden className="flex size-12 items-center justify-center rounded-full bg-primary-subtle text-primary-subtle-foreground">
      <MessageSquareText className="size-5" strokeWidth={1.75} />
    </div>
  );
}

function ContactLinks({ phone, email }: { phone?: string | null; email?: string | null }) {
  const { t } = useTranslation('auth');
  if (!phone && !email) return null;
  return (
    <div className="mt-6 border-t border-border pt-5 text-sm">
      <p className="text-muted-foreground">{t('publicInquiry.contactPrompt')}</p>
      <ul className="mt-2 flex flex-col items-center gap-1.5">
        {phone && (
          <li>
            <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
              <Phone className="size-4" aria-hidden /> {phone}
            </a>
          </li>
        )}
        {email && (
          <li>
            <a href={`mailto:${email}`} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
              <Mail className="size-4" aria-hidden /> {email}
            </a>
          </li>
        )}
      </ul>
    </div>
  );
}

function PoweredBy() {
  const { t } = useTranslation('auth');
  return (
    <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
      <Trans
        t={t}
        i18nKey="publicInquiry.poweredBy"
        components={{ mark: <BrandMark variant="auto" size={14} title="" />, strong: <span className="font-semibold" /> }}
      />
    </p>
  );
}

export default function PublicInquiry() {
  const { t } = useTranslation(['auth', 'common']);
  const [searchParams] = useSearchParams();
  const srcParam = searchParams.get('src')?.toLowerCase() ?? '';
  const channel = CHANNEL_FROM_SRC[srcParam] ?? 'Lainnya';

  const [branding, setBranding] = useState<Branding | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ inquiryNumber: string; message: string } | null>(null);
  const [formError, setFormError] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [website, setWebsite] = useState(''); // honeypot

  const companyName = realCompanyName(branding?.companyName);

  useEffect(() => {
    api.get('/public/branding')
      .then((r) => setBranding(r.data))
      .catch(() => setBranding(null));
  }, []);

  useEffect(() => {
    document.title = companyName ? t('publicInquiry.docTitleCompany', { company: companyName }) : t('publicInquiry.title');
  }, [companyName, t]);

  const setField = (field: FieldName, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => key !== field)) as FieldErrors);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const nextErrors = validate(values);
    setErrors(nextErrors);
    const firstInvalid = FIELD_ORDER.find((f) => nextErrors[f]);
    if (firstInvalid) {
      document.getElementById(`inquiry-${firstInvalid}`)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/public/inquiry', {
        prospectName: values.name.trim(),
        prospectPhone: values.phone.trim(),
        prospectEmail: values.email.trim() || null,
        itemsText: values.itemsText.trim(),
        channel,
        website,
      });
      setSuccess({ inquiryNumber: res.data.inquiryNumber, message: res.data.message });
    } catch (err: unknown) {
      const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setFormError(apiError ?? t('publicInquiry.sendFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSuccess(null);
    setValues(EMPTY_FORM);
    setErrors({});
  };

  if (success) {
    return (
      <main className="flex min-h-dvh items-start justify-center bg-background px-4 py-10 sm:items-center">
        <div className="w-full max-w-md">
          <section className="rounded-xl border border-border bg-card p-6 text-center shadow-[var(--shadow-2)] sm:p-8" aria-live="polite">
            <CheckCircle2 className="mx-auto mb-4 size-8 text-success-text" aria-hidden />
            <h1 className="text-xl font-semibold text-foreground">{t('publicInquiry.successTitle')}</h1>
            <p className="mt-2 text-sm text-foreground-secondary">{success.message}</p>
            <div className="mt-5 rounded-lg bg-surface-sunken px-4 py-3">
              <p className="text-xs text-muted-foreground">{t('publicInquiry.reference')}</p>
              <p className="mt-0.5 font-mono text-base font-semibold text-foreground">{success.inquiryNumber}</p>
            </div>
            <ContactLinks phone={branding?.phone} email={branding?.email} />
            <Button variant="ghost" size="sm" className="mt-5" onClick={resetForm}>
              <ArrowLeft aria-hidden /> {t('publicInquiry.sendAnother')}
            </Button>
          </section>
          <PoweredBy />
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-start justify-center bg-background px-4 py-8 sm:items-center sm:py-12">
      <div className="w-full max-w-md">
        <section className="rounded-xl border border-border bg-card shadow-[var(--shadow-2)]">
          <header className="flex flex-col items-center gap-3 border-b border-border px-5 pb-5 pt-6 text-center sm:px-8 sm:pt-8">
            <TenantIdentity branding={branding} companyName={companyName} />
            <div>
              {companyName && <p className="text-sm font-medium text-foreground-secondary">{companyName}</p>}
              <h1 className="mt-0.5 text-xl font-semibold text-foreground">{t('publicInquiry.title')}</h1>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t('publicInquiry.intro')}
            </p>
          </header>

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 px-5 py-6 sm:px-8" aria-label={t('publicInquiry.formLabel')}>
            {/* Honeypot — hidden from real users and assistive tech. */}
            <div className="absolute -left-[9999px] -top-[9999px]" aria-hidden="true">
              <label>
                {t('publicInquiry.honeypot')}
                <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
            </div>

            <Field label={t('publicInquiry.name')} required error={errors.name} id="inquiry-name">
              <Input
                name="name"
                autoComplete="name"
                autoCapitalize="words"
                value={values.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder={t('publicInquiry.namePlaceholder')}
                maxLength={200}
                className="h-11 md:h-10"
              />
            </Field>

            <Field label={t('publicInquiry.phone')} required error={errors.phone} id="inquiry-phone">
              <Input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={values.phone}
                onChange={(e) => setField('phone', e.target.value)}
                placeholder="08xx-xxxx-xxxx"
                maxLength={50}
                className="h-11 md:h-10"
              />
            </Field>

            <Field
              label={<>{t('publicInquiry.email')} <span className="font-normal text-muted-foreground">({t('common:labels.optional')})</span></>}
              error={errors.email}
              id="inquiry-email"
            >
              <Input
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={values.email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder={t('publicInquiry.emailPlaceholder')}
                maxLength={200}
                className="h-11 md:h-10"
              />
            </Field>

            <Field
              label={t('publicInquiry.items')}
              required
              error={errors.itemsText}
              hint={t('publicInquiry.itemsHint', { length: values.itemsText.length, max: ITEMS_MAX })}
              id="inquiry-itemsText"
            >
              <Textarea
                name="itemsText"
                value={values.itemsText}
                onChange={(e) => setField('itemsText', e.target.value)}
                rows={5}
                placeholder={t('publicInquiry.itemsPlaceholder')}
                maxLength={ITEMS_MAX}
                className="min-h-32 resize-y"
              />
            </Field>

            {formError && (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-subtle px-3 py-2.5 text-sm text-danger-text">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{formError}</span>
              </div>
            )}

            <Button type="submit" size="lg" loading={submitting} className="h-11 w-full">
              {!submitting && <Send aria-hidden />}
              {submitting ? t('publicInquiry.sending') : t('publicInquiry.submit')}
            </Button>

            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              {t('publicInquiry.consent')}
            </p>
          </form>
        </section>
        <PoweredBy />
      </div>
    </main>
  );
}
