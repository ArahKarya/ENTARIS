import React, { useCallback, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Upload, X, ImageIcon, Plus, Trash2, Sun, Moon } from 'lucide-react';
import api from '../../lib/api';
import { can } from '../../lib/permissions';
import { cn } from '../../lib/utils';
import { Field } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DEFAULT_LANGUAGE, LANGUAGE_OPTIONS, normalizeLanguage, type Language } from '@/i18n/language';
import { SettingsCard } from '../../components/settings/SettingsCard';
import { SaveBar } from '../../components/settings/SaveBar';

interface InvoiceSectionSettings {
  bankAccounts?: string;
  footerNote?: string;
  showSignature?: boolean;
  signatureLabels?: string[];
}
interface InvoiceFormatSettings {
  sales?: InvoiceSectionSettings;
  purchase?: Omit<InvoiceSectionSettings, 'bankAccounts'>;
}

interface CompanyForm {
  companyName: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
  defaultCurrency: string;
  logoUrl: string | null;
  logoUrlDark: string | null;
  defaultLanguage: Language;
}
type CompanyErrors = Partial<Record<keyof CompanyForm, string>>;
type LogoKey = 'logoUrl' | 'logoUrlDark';
type TextKey = Exclude<keyof CompanyForm, LogoKey | 'defaultLanguage'>;

const DEFAULT_SIGNATURES = ['Disiapkan oleh', 'Disetujui oleh', 'Diterima oleh'];
const EMPTY_FORM: CompanyForm = {
  companyName: '', address: '', phone: '', email: '', taxId: '', defaultCurrency: 'IDR', logoUrl: null, logoUrlDark: null,
  defaultLanguage: DEFAULT_LANGUAGE,
};
const DEFAULT_INVOICE: InvoiceFormatSettings = {
  sales: { bankAccounts: '', footerNote: '', showSignature: true, signatureLabels: DEFAULT_SIGNATURES },
  purchase: { footerNote: '', showSignature: true, signatureLabels: DEFAULT_SIGNATURES },
};
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_ACCEPT = 'image/png,image/jpeg,image/jpg,image/svg+xml,image/webp';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Labels live in `settings:company.fields.<key>`; placeholders without a key are literal formats. */
const TEXT_FIELDS: Array<{ key: TextKey; placeholder?: string; type: string; required?: boolean; hint?: boolean }> = [
  { key: 'companyName', type: 'text', required: true },
  { key: 'address', type: 'text' },
  { key: 'phone', placeholder: '+62 xxx', type: 'tel' },
  { key: 'email', placeholder: 'finance@company.com', type: 'email' },
  { key: 'taxId', placeholder: '00.000.000.0-000.000', type: 'text' },
  { key: 'defaultCurrency', placeholder: 'IDR', type: 'text', hint: true },
];

function validate(f: CompanyForm, t: TFunction<'settings'>): CompanyErrors {
  const errors: CompanyErrors = {};
  if (!f.companyName.trim()) errors.companyName = t('company.errors.nameRequired');
  if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) errors.email = t('company.errors.emailInvalid');
  return errors;
}

function formFromSettings(settings: any, prev: CompanyForm): CompanyForm {
  return {
    ...prev,
    companyName: settings.companyName || settings.name || prev.companyName,
    address: settings.address || prev.address,
    phone: settings.phone || '',
    email: settings.email || '',
    taxId: settings.taxId || '',
    defaultCurrency: settings.defaultCurrency || settings.currency || 'IDR',
    logoUrl: settings.logoUrl || null,
    logoUrlDark: settings.logoUrlDark || null,
    defaultLanguage: normalizeLanguage(settings.defaultLanguage),
  };
}

function invoiceFromSettings(s: InvoiceFormatSettings): InvoiceFormatSettings {
  return {
    sales: {
      bankAccounts: s.sales?.bankAccounts || '',
      footerNote: s.sales?.footerNote || '',
      showSignature: s.sales?.showSignature !== false,
      signatureLabels: s.sales?.signatureLabels?.length ? s.sales.signatureLabels : DEFAULT_SIGNATURES,
    },
    purchase: {
      footerNote: s.purchase?.footerNote || '',
      showSignature: s.purchase?.showSignature !== false,
      signatureLabels: s.purchase?.signatureLabels?.length ? s.purchase.signatureLabels : DEFAULT_SIGNATURES,
    },
  };
}

export const CompanySettingsTab: React.FC = () => {
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();
  const canEdit = can('settings', 'edit');
  const fileInputRefLight = useRef<HTMLInputElement>(null);
  const fileInputRefDark = useRef<HTMLInputElement>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState<CompanyForm>(EMPTY_FORM);
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceFormatSettings>(DEFAULT_INVOICE);

  const { data: settings } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      try { const res = await api.get('/settings/company'); return res.data; } catch { return null; }
    },
    staleTime: 60000,
  });

  const applySettings = useCallback((s: any) => {
    setFormData((prev) => formFromSettings(s, prev));
    if (s.invoiceSettings) setInvoiceSettings(invoiceFromSettings(s.invoiceSettings as InvoiceFormatSettings));
  }, []);

  React.useEffect(() => {
    if (settings && !isDirty) applySettings(settings);
  }, [settings, isDirty, applySettings]);

  const handleChange = (key: keyof CompanyForm, value: string | null) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const updateInvoiceSetting = (section: 'sales' | 'purchase', key: string, value: string | boolean | string[]) => {
    setInvoiceSettings((prev) => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
    setIsDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (data: any) => api.put('/settings/company', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
      queryClient.invalidateQueries({ queryKey: ['company-settings-pdf'] });
      setIsDirty(false);
      setSubmitted(false);
      toast.success(t('company.toast.saved'));
    },
    onError: () => toast.error(t('company.toast.saveError')),
  });

  const handleSave = () => {
    setSubmitted(true);
    if (Object.keys(validate(formData, t)).length > 0) {
      // Move focus to the first invalid field once errors have rendered.
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-settings-form] [aria-invalid="true"]')?.focus());
      return;
    }
    saveMutation.mutate({ ...formData, invoiceSettings });
  };

  const handleReset = () => {
    setInvoiceSettings(DEFAULT_INVOICE);
    setFormData(EMPTY_FORM);
    if (settings) applySettings(settings);
    setIsDirty(false);
    setSubmitted(false);
    if (fileInputRefLight.current) fileInputRefLight.current.value = '';
    if (fileInputRefDark.current) fileInputRefDark.current.value = '';
  };

  const handleLogoUpload = (variant: LogoKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(t('company.logo.tooLarge'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => handleChange(variant, ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = (variant: LogoKey) => {
    handleChange(variant, null);
    const ref = variant === 'logoUrl' ? fileInputRefLight : fileInputRefDark;
    if (ref.current) ref.current.value = '';
  };

  const errors = submitted ? validate(formData, t) : {};

  return (
    <div className="space-y-5">
      <fieldset disabled={!canEdit} className="min-w-0 space-y-5" data-settings-form>
        <legend className="sr-only">{t('company.legend')}</legend>

        <SettingsCard
          title={t('company.logo.title')}
          description={t('company.logo.description')}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <LogoSlot
              id="logo-upload-light"
              title={t('company.logo.light.title')}
              hint={t('company.logo.light.hint')}
              icon={<Sun className="size-3.5" aria-hidden />}
              value={formData.logoUrl}
              dark={false}
              inputRef={fileInputRefLight}
              onUpload={handleLogoUpload('logoUrl')}
              onRemove={() => handleRemoveLogo('logoUrl')}
              canEdit={canEdit}
            />
            <LogoSlot
              id="logo-upload-dark"
              title={t('company.logo.dark.title')}
              hint={t('company.logo.dark.hint')}
              icon={<Moon className="size-3.5" aria-hidden />}
              value={formData.logoUrlDark}
              dark
              inputRef={fileInputRefDark}
              onUpload={handleLogoUpload('logoUrlDark')}
              onRemove={() => handleRemoveLogo('logoUrlDark')}
              canEdit={canEdit}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t('company.logo.formats')}</p>
        </SettingsCard>

        <SettingsCard title={t('company.identity.title')} description={t('company.identity.description')}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {TEXT_FIELDS.map((f) => (
              <Field key={f.key} label={t(`company.fields.${f.key}.label`)} required={f.required} error={errors[f.key]} hint={f.hint ? t('company.fields.defaultCurrency.hint') : undefined}>
                <Input
                  type={f.type}
                  value={formData[f.key]}
                  onChange={(e) => handleChange(f.key, e.target.value)}
                  placeholder={f.placeholder ?? (f.key === 'companyName' ? t('company.fields.companyName.placeholder') : f.key === 'address' ? t('company.fields.address.placeholder') : undefined)}
                  autoComplete="off"
                />
              </Field>
            ))}
            <Field label={t('company.defaultLanguage.label')} hint={t('company.defaultLanguage.hint')}>
              <Select value={formData.defaultLanguage} onValueChange={(v) => handleChange('defaultLanguage', normalizeLanguage(v))}>
                <SelectTrigger aria-label={t('company.defaultLanguage.label')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </SettingsCard>

        <SettingsCard title={t('company.salesInvoice.title')} description={t('company.salesInvoice.description')}>
          <div className="space-y-4">
            <Field label={t('company.salesInvoice.bankAccounts')} hint={t('company.salesInvoice.bankAccountsHint')}>
              <Textarea
                value={invoiceSettings.sales?.bankAccounts || ''}
                onChange={(e) => updateInvoiceSetting('sales', 'bankAccounts', e.target.value)}
                placeholder={t('company.salesInvoice.bankAccountsPlaceholder')}
                rows={3}
              />
            </Field>
            <Field label={t('company.footerNote')}>
              <Input
                value={invoiceSettings.sales?.footerNote || ''}
                onChange={(e) => updateInvoiceSetting('sales', 'footerNote', e.target.value)}
                placeholder={t('company.salesInvoice.footerPlaceholder')}
              />
            </Field>
            <SignatureSettings
              idPrefix="sales"
              show={invoiceSettings.sales?.showSignature !== false}
              labels={invoiceSettings.sales?.signatureLabels || []}
              canEdit={canEdit}
              onShowChange={(v) => updateInvoiceSetting('sales', 'showSignature', v)}
              onLabelsChange={(l) => updateInvoiceSetting('sales', 'signatureLabels', l)}
            />
          </div>
        </SettingsCard>

        <SettingsCard title={t('company.purchaseInvoice.title')} description={t('company.purchaseInvoice.description')}>
          <div className="space-y-4">
            <Field label={t('company.footerNote')}>
              <Input
                value={invoiceSettings.purchase?.footerNote || ''}
                onChange={(e) => updateInvoiceSetting('purchase', 'footerNote', e.target.value)}
                placeholder={t('company.purchaseInvoice.footerPlaceholder')}
              />
            </Field>
            <SignatureSettings
              idPrefix="purchase"
              show={invoiceSettings.purchase?.showSignature !== false}
              labels={invoiceSettings.purchase?.signatureLabels || []}
              canEdit={canEdit}
              onShowChange={(v) => updateInvoiceSetting('purchase', 'showSignature', v)}
              onLabelsChange={(l) => updateInvoiceSetting('purchase', 'signatureLabels', l)}
            />
          </div>
        </SettingsCard>
      </fieldset>

      {canEdit ? (
        <SaveBar dirty={isDirty} saving={saveMutation.isPending} onSave={handleSave} onReset={handleReset} saveLabel={t('company.save')} />
      ) : (
        <p className="text-sm text-muted-foreground">{t('company.viewOnly')}</p>
      )}
    </div>
  );
};

interface LogoSlotProps {
  id: string;
  title: string;
  hint: string;
  icon: React.ReactNode;
  value: string | null;
  dark: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  canEdit: boolean;
}

function LogoSlot({ id, title, hint, icon, value, dark, inputRef, onUpload, onRemove, canEdit }: LogoSlotProps) {
  const { t } = useTranslation('settings');
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-2 flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
        {icon} {title}
        <span className="text-xs font-normal text-muted-foreground">({hint})</span>
      </p>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border-2 border-dashed',
            dark ? 'border-neutral-700' : 'border-border',
          )}
          style={dark ? { background: '#171717', color: '#d4d4d4' } : { background: '#ffffff', color: '#525252' }}
        >
          {value ? (
            <img src={value} alt={t('company.logo.previewAlt', { variant: title.toLowerCase() })} className="size-full object-contain p-1.5" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-[11px]">
              <ImageIcon className="size-4" aria-hidden /> {t('company.logo.none')}
            </span>
          )}
        </div>
        {canEdit && (
          <div className="flex flex-col gap-1.5">
            <input ref={inputRef} type="file" accept={LOGO_ACCEPT} onChange={onUpload} className="sr-only" id={id} tabIndex={-1} aria-label={t('company.logo.uploadLabel', { variant: title.toLowerCase() })} />
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              <Upload aria-hidden /> {value ? t('company.logo.replace') : t('company.logo.upload')}
            </Button>
            {value && (
              <Button variant="ghost" size="sm" onClick={onRemove} className="text-danger-text">
                <X aria-hidden /> {t('company.logo.remove')}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface SignatureSettingsProps {
  idPrefix: string;
  show: boolean;
  labels: string[];
  canEdit: boolean;
  onShowChange: (v: boolean) => void;
  onLabelsChange: (labels: string[]) => void;
}

function SignatureSettings({ idPrefix, show, labels, canEdit, onShowChange, onLabelsChange }: SignatureSettingsProps) {
  const { t } = useTranslation('settings');
  const checkboxId = `${idPrefix}-sig`;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Checkbox id={checkboxId} checked={show} disabled={!canEdit} onCheckedChange={(v) => onShowChange(v === true)} />
        <Label htmlFor={checkboxId} className="font-normal">{t('company.signature.show')}</Label>
      </div>
      {show && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium text-foreground">{t('company.signature.legend')}</legend>
          {labels.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={label}
                aria-label={t('company.signature.label', { index: i + 1 })}
                onChange={(e) => onLabelsChange(labels.map((l, j) => (j === i ? e.target.value : l)))}
              />
              {canEdit && labels.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('company.signature.remove', { index: i + 1 })}
                  onClick={() => onLabelsChange(labels.filter((_, j) => j !== i))}
                >
                  <Trash2 className="text-danger-text" aria-hidden />
                </Button>
              )}
            </div>
          ))}
          {canEdit && labels.length < 5 && (
            <Button variant="link" size="sm" onClick={() => onLabelsChange([...labels, ''])}>
              <Plus aria-hidden /> {t('company.signature.add')}
            </Button>
          )}
        </fieldset>
      )}
    </div>
  );
}
