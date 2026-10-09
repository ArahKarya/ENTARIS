import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
      toast.success('Konfigurasi Telegram disimpan.');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal menyimpan.'),
  });

  const testMut = useMutation({
    mutationFn: async () => api.post('/telegram/test', {
      ...(form.botToken.trim() ? { botToken: form.botToken.trim() } : {}),
      ...(form.chatId.trim() ? { chatId: form.chatId.trim() } : {}),
    }),
    onSuccess: () => toast.success('Pesan uji terkirim ke Telegram. Cek grup Anda.'),
    onError: (e: any) => toast.error(e.response?.data?.error || 'Tes gagal.'),
  });

  if (isLoading) return <LoadingState label="Memuat pengaturan notifikasi…" />;

  const tokenError = form.botToken.trim() && !TOKEN_RE.test(form.botToken.trim())
    ? 'Format token tidak dikenali (contoh: 123456789:ABC-DEF…).'
    : undefined;
  const dirty = isDirty(form, data);
  const setToggle = (key: ToggleKey) => (v: boolean) => setForm((f) => ({ ...f, [key]: v }));
  const reset = () => setForm({ ...DEFAULT_FORM, ...data, botToken: '' });

  return (
    <div className="space-y-5">
      <SettingsCard
        title="Notifikasi Telegram"
        description="Kirim notifikasi sistem (approval, invoice jatuh tempo, stok rendah) ke Telegram."
        actions={canEdit && (
          <Button variant="outline" onClick={() => testMut.mutate()} loading={testMut.isPending} disabled={!!tokenError}>
            {!testMut.isPending && <Send aria-hidden />} Tes Koneksi
          </Button>
        )}
      >
        <div className="divide-y divide-border">
          <ToggleRow
            id="tg-enabled"
            label="Aktifkan notifikasi Telegram"
            desc="Sakelar utama. Jika mati, tidak ada pesan yang dikirim."
            checked={form.enabled}
            disabled={!canEdit}
            onChange={setToggle('enabled')}
          />
          <div className="grid grid-cols-1 gap-4 py-4 md:grid-cols-2">
            <Field
              label="Bot token"
              error={tokenError}
              hint={form.hasToken ? 'Token tersimpan dan tidak ditampilkan kembali. Isi hanya untuk mengganti.' : 'Token tidak pernah ditampilkan kembali demi keamanan.'}
            >
              <Input
                type="password"
                autoComplete="off"
                disabled={!canEdit}
                value={form.botToken}
                onChange={(e) => setForm((f) => ({ ...f, botToken: e.target.value }))}
                placeholder={form.hasToken ? '•••••••• (tersimpan)' : 'mis. 123456789:ABC-DEF...'}
              />
            </Field>
            <Field
              label="Chat ID grup (opsional)"
              hint="Notifikasi dikirim japri ke staf yang ditautkan; Chat ID grup hanya untuk mirror pengumuman ke grup."
            >
              <Input
                disabled={!canEdit}
                value={form.chatId}
                onChange={(e) => setForm((f) => ({ ...f, chatId: e.target.value }))}
                placeholder="mis. -1001234567890"
              />
            </Field>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Jenis Notifikasi" description="Pilih kejadian yang dikirim ke Telegram.">
        <div className="divide-y divide-border">
          <ToggleRow id="tg-approval" label="Approval / pengajuan menunggu" checked={form.notifyApproval} disabled={!canEdit} onChange={setToggle('notifyApproval')} />
          <ToggleRow id="tg-overdue" label="Invoice jatuh tempo" checked={form.notifyInvoiceOverdue} disabled={!canEdit} onChange={setToggle('notifyInvoiceOverdue')} />
          <ToggleRow id="tg-lowstock" label="Stok rendah" checked={form.notifyLowStock} disabled={!canEdit} onChange={setToggle('notifyLowStock')} />
          <ToggleRow
            id="tg-personal"
            label="Notifikasi personal (japri ke user)"
            desc="Kirim ke Telegram pribadi staf yang sudah ditautkan (mis. hasil approval ke pengaju). Tautkan akun di Manajemen User."
            checked={form.personalEnabled}
            disabled={!canEdit}
            onChange={setToggle('personalEnabled')}
          />
        </div>
      </SettingsCard>

      <div className="flex gap-3 rounded-lg border border-info/30 bg-info-subtle p-4 text-sm text-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-info-text" aria-hidden />
        <div className="space-y-1.5">
          <p className="font-medium">Cara setup singkat</p>
          <ol className="ml-4 list-decimal space-y-1 text-xs text-muted-foreground">
            <li>Buka <b>@BotFather</b> di Telegram → <code>/newbot</code> → ikuti langkah → dapat <b>Bot Token</b>.</li>
            <li>Buat grup, tambahkan bot tadi ke grup (jadikan admin agar bisa kirim).</li>
            <li>Kirim 1 pesan di grup, lalu dapatkan <b>Chat ID</b> grup (mis. via <b>@userinfobot</b> / <b>@getidsbot</b>, atau buka <code className="break-all">https://api.telegram.org/bot&lt;token&gt;/getUpdates</code> dan ambil <code>chat.id</code> yang diawali <code>-100…</code>).</li>
            <li>Isi Token &amp; Chat ID di atas → <b>Simpan</b> → <b>Tes Koneksi</b>.</li>
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
          message={tokenError ? 'Perbaiki format token sebelum menyimpan.' : undefined}
        />
      )}
    </div>
  );
};

export default NotificationsTab;
