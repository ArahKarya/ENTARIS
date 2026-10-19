import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trans, useTranslation } from 'react-i18next';
import { Send, Info } from 'lucide-react';
import api from '../../lib/api';
import { can } from '../../lib/permissions';
import { Field, LoadingState } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SettingsCard } from '../../components/settings/SettingsCard';
import { SaveBar } from '../../components/settings/SaveBar';

interface TelegramConfig {
  enabled: boolean;
  chatId: string;
  hasToken: boolean;
  notifyApproval: boolean;
  notifyInvoiceOverdue: boolean;
  notifyLowStock: boolean;
  personalEnabled: boolean;
}
type TelegramForm = TelegramConfig & { botToken: string };
type ToggleKey = 'enabled' | 'notifyApproval' | 'notifyInvoiceOverdue' | 'notifyLowStock' | 'personalEnabled';

const DEFAULT_FORM: TelegramForm = {
  enabled: false, chatId: '', hasToken: false, botToken: '',
  notifyApproval: true, notifyInvoiceOverdue: true, notifyLowStock: true, personalEnabled: true,
};
const TOGGLE_KEYS: ToggleKey[] = ['enabled', 'notifyApproval', 'notifyInvoiceOverdue', 'notifyLowStock', 'personalEnabled'];
const TOKEN_RE = /^\d+:[\w-]+$/;

function isDirty(form: TelegramForm, data: TelegramConfig | undefined): boolean {
  const base = { ...DEFAULT_FORM, ...data };
  if (form.botToken.trim()) return true;
  if ((form.chatId ?? '') !== (base.chatId ?? '')) return true;
  return TOGGLE_KEYS.some((k) => form[k] !== base[k]);
}

interface ToggleRowProps {
  id: string;
  label: string;
  desc?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ id, label, desc, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <label id={`${id}-label`} htmlFor={id} className="block text-sm font-medium text-foreground">{label}</label>
        {desc && <p id={`${id}-desc`} className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-labelledby={`${id}-label`}
        aria-describedby={desc ? `${id}-desc` : undefined}
        className="mt-0.5"
      />
    </div>
  );
}

export const NotificationsTab: React.FC = () => {
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();
  const canEdit = can('settings', 'edit');
  const { data, isLoading } = useQuery<TelegramConfig>({
    queryKey: ['telegram-config'],
    queryFn: async () => { const r = await api.get('/telegram/config'); return r.data; },
  });

  const [form, setForm] = useState<TelegramForm>(DEFAULT_FORM);

  useEffect(() => {
    if (data) setForm((f) => ({ ...f, ...data, botToken: '' }));
  }, [data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        enabled: form.enabled,
        chatId: form.chatId,
        notifyApproval: form.notifyApproval,
        notifyInvoiceOverdue: form.notifyInvoiceOverdue,
        notifyLowStock: form.notifyLowStock,
        personalEnabled: form.personalEnabled,
      };
      if (form.botToken.trim()) payload.botToken = form.botToken.trim();
      return api.put('/telegram/config', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram-config'] });
      setForm((f) => ({ ...f, botToken: '' }));
      toast.success(t('notifications.toast.saved'));
    },
    onError: (e: any) => toast.error(e.response?.data?.error || t('notifications.toast.saveError')),
  });

  const testMut = useMutation({
    mutationFn: async () => api.post('/telegram/test', {
      ...(form.botToken.trim() ? { botToken: form.botToken.trim() } : {}),
      ...(form.chatId.trim() ? { chatId: form.chatId.trim() } : {}),
    }),
    onSuccess: () => toast.success(t('notifications.toast.testSent')),
    onError: (e: any) => toast.error(e.response?.data?.error || t('notifications.toast.testError')),
  });

  if (isLoading) return <LoadingState label={t('notifications.loading')} />;

  const tokenError = form.botToken.trim() && !TOKEN_RE.test(form.botToken.trim())
    ? t('notifications.tokenInvalid')
    : undefined;
  const dirty = isDirty(form, data);
  const setToggle = (key: ToggleKey) => (v: boolean) => setForm((f) => ({ ...f, [key]: v }));
  const reset = () => setForm({ ...DEFAULT_FORM, ...data, botToken: '' });

  return (
    <div className="space-y-5">
      <SettingsCard
        title={t('notifications.title')}
        description={t('notifications.description')}
        actions={canEdit && (
          <Button variant="outline" onClick={() => testMut.mutate()} loading={testMut.isPending} disabled={!!tokenError}>
            {!testMut.isPending && <Send aria-hidden />} {t('notifications.testConnection')}
          </Button>
        )}
      >
        <div className="divide-y divide-border">
          <ToggleRow
            id="tg-enabled"
            label={t('notifications.enabled.label')}
            desc={t('notifications.enabled.description')}
            checked={form.enabled}
            disabled={!canEdit}
            onChange={setToggle('enabled')}
          />
          <div className="grid grid-cols-1 gap-4 py-4 md:grid-cols-2">
            <Field
              label={t('notifications.botToken.label')}
              error={tokenError}
              hint={form.hasToken ? t('notifications.botToken.hintSaved') : t('notifications.botToken.hintNew')}
            >
              <Input
                type="password"
                autoComplete="off"
                disabled={!canEdit}
                value={form.botToken}
                onChange={(e) => setForm((f) => ({ ...f, botToken: e.target.value }))}
                placeholder={form.hasToken ? t('notifications.botToken.placeholderSaved') : t('notifications.botToken.placeholderNew')}
              />
            </Field>
            <Field
              label={t('notifications.chatId.label')}
              hint={t('notifications.chatId.hint')}
            >
              <Input
                disabled={!canEdit}
                value={form.chatId}
                onChange={(e) => setForm((f) => ({ ...f, chatId: e.target.value }))}
                placeholder={t('notifications.chatId.placeholder')}
              />
            </Field>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title={t('notifications.types.title')} description={t('notifications.types.description')}>
        <div className="divide-y divide-border">
          <ToggleRow id="tg-approval" label={t('notifications.types.approval')} checked={form.notifyApproval} disabled={!canEdit} onChange={setToggle('notifyApproval')} />
          <ToggleRow id="tg-overdue" label={t('notifications.types.overdue')} checked={form.notifyInvoiceOverdue} disabled={!canEdit} onChange={setToggle('notifyInvoiceOverdue')} />
          <ToggleRow id="tg-lowstock" label={t('notifications.types.lowStock')} checked={form.notifyLowStock} disabled={!canEdit} onChange={setToggle('notifyLowStock')} />
          <ToggleRow
            id="tg-personal"
            label={t('notifications.types.personal.label')}
            desc={t('notifications.types.personal.description')}
            checked={form.personalEnabled}
            disabled={!canEdit}
            onChange={setToggle('personalEnabled')}
          />
        </div>
      </SettingsCard>

      <div className="flex gap-3 rounded-lg border border-info/30 bg-info-subtle p-4 text-sm text-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-info-text" aria-hidden />
        <div className="space-y-1.5">
          <p className="font-medium">{t('notifications.setup.title')}</p>
          <ol className="ml-4 list-decimal space-y-1 text-xs text-muted-foreground">
            <li><Trans t={t} i18nKey="notifications.setup.step1" components={{ b: <b />, code: <code /> }} /></li>
            <li>{t('notifications.setup.step2')}</li>
            <li><Trans t={t} i18nKey="notifications.setup.step3" values={{ url: 'https://api.telegram.org/bot<token>/getUpdates' }} components={{ b: <b />, code: <code />, url: <code className="break-all" /> }} /></li>
            <li><Trans t={t} i18nKey="notifications.setup.step4" components={{ b: <b /> }} /></li>
          </ol>
        </div>
      </div>

      {canEdit && (
        <SaveBar
          dirty={dirty}
          saveDisabled={!!tokenError}
          saving={saveMut.isPending}
          onSave={() => saveMut.mutate()}
          onReset={reset}
          message={tokenError ? t('notifications.fixToken') : undefined}
        />
      )}
    </div>
  );
};

export default NotificationsTab;
