import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../../lib/api';
import { Plus, Trash2, Play, X, Eye, EyeOff, RefreshCw, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { can } from '../../lib/permissions';
import { ConfirmDialog, EmptyState, Field, LoadingState } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SettingsCard } from '../../components/settings/SettingsCard';
import { SaveBar } from '../../components/settings/SaveBar';

// ─── Tipe ──────────────────────────────────────────────────────────────────
interface EffectiveTool {
  name: string;
  group: string;
  module: string;
  desc: string;
  risk: 'read' | 'write' | 'critical';
  roles: string[];
  handler: string;
  enabled: boolean;
  tier: 'auto' | 'draft' | 'must_approve';
  level: number;
  source: 'registry' | 'override';
}
interface AiSetting {
  id: string;
  agenticEnabled: boolean;
  // Server never returns the token itself — only whether one is configured.
  hasServiceToken: boolean;
  // Write-only: set only when the admin enters or generates a new token.
  serviceToken?: string;
  activeChannels: string[];
  whitelistModules: string[];
}

// M2-A4: channel yang AIRA bisa layani (toggle global).
const AI_CHANNELS: { id: string; label: string }[] = [
  { id: 'web', label: 'Web (Panel ERP)' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'whatsapp', label: 'WhatsApp' },
];

// M2-A4: group modul bisnis (selaras tool-router .group). Kosong = semua boleh.
const AI_MODULE_GROUPS: string[] = [
  'Penjualan',
  'Pembelian',
  'Stok & Produksi',
  'Akuntansi',
  'Bank & Kas',
  'Laporan',
  'EAM',
  'Master & Sistem',
  'AI / Agentic',
  'Universal',
  'Laporan/Universal',
];
interface AiraHealth {
  online: boolean;
  status: string;
  version: string | null;
  tools_loaded: number | null;
  base_url: string;
  checked_at: string;
}
interface WhitelistEntry {
  id: string;
  channel: string;
  externalId: string;
  label: string | null;
  role: string | null;
  enabled: boolean;
}

const RISK_BADGE: Record<string, BadgeProps['variant']> = {
  read: 'success',
  write: 'warning',
  critical: 'danger',
};
const TIER_OPTIONS = [
  { value: 'auto', label: 'Otomatis (auto)' },
  { value: 'draft', label: 'Draf (draft)' },
  { value: 'must_approve', label: 'Wajib approval' },
];
const ALL_GROUPS = '__all__';

function generateToken(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '')
    : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
const CHANNELS = ['telegram', 'whatsapp'];

export const AgenticSystemTab: React.FC = () => {
  const qc = useQueryClient();

  // ── Pengaturan Global ──
  const { data: settings } = useQuery<AiSetting>({
    queryKey: ['ai-settings'],
    queryFn: async () => (await api.get('/ai/config/settings')).data,
  });

  // ── Status AIRA core (Fase 5: detect online/offline) ──
  // Poll tiap 15 dtk supaya badge mengikuti kondisi aira-core secara live.
  const { data: airaHealth } = useQuery<AiraHealth>({
    queryKey: ['aira-health'],
    queryFn: async () => (await api.get('/ai/chat/aira-health')).data,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  const [form, setForm] = useState<Partial<AiSetting> | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const canEdit = can('settings', 'edit');
  const s = form ?? settings ?? null;

  const saveSettings = useMutation({
    mutationFn: async (data: Partial<AiSetting>) => api.put('/ai/config/settings', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-settings'] });
      setForm(null);
      toast.success('Pengaturan AI tersimpan.');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal menyimpan pengaturan.'),
  });

  // ── Whitelist ──
  const { data: whitelist } = useQuery<WhitelistEntry[]>({
    queryKey: ['ai-whitelist'],
    queryFn: async () => (await api.get('/ai/config/whitelist')).data,
  });
  const [wlForm, setWlForm] = useState({ channel: 'telegram', externalId: '', label: '', role: 'Viewer' });
  const addWl = useMutation({
    mutationFn: async (data: any) => api.post('/ai/config/whitelist', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-whitelist'] });
      setWlForm({ channel: 'telegram', externalId: '', label: '', role: 'Viewer' });
      toast.success('Whitelist ditambahkan.');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal menambah whitelist.'),
  });
  const delWl = useMutation({
    mutationFn: async (id: string) => api.delete(`/ai/config/whitelist/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-whitelist'] });
      toast.success('Whitelist dihapus.');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal menghapus whitelist.'),
  });

  // ── Tools ──
  const { data: tools, isLoading: toolsLoading } = useQuery<EffectiveTool[]>({
    queryKey: ['ai-tools'],
    queryFn: async () => (await api.get('/ai/config/tools')).data,
  });
  const patchTool = useMutation({
    mutationFn: async ({ name, data }: { name: string; data: any }) =>
      api.patch(`/ai/config/tools/${name}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-tools'] }),
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal mengubah tool.'),
  });

  // ── Test Tool ──
  const [testResult, setTestResult] = useState<{ name: string; out: string } | null>(null);
  const testTool = useMutation({
    mutationFn: async (name: string) => api.post('/ai/router', { tool: name, args: {} }),
    onSuccess: (res, name) => setTestResult({ name, out: JSON.stringify(res.data, null, 2) }),
    onError: (e: any, name) =>
      setTestResult({ name, out: JSON.stringify(e.response?.data ?? { error: 'gagal' }, null, 2) }),
  });

  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('');
  const groups = Array.from(new Set((tools ?? []).map((t) => t.group)));
  const filtered = (tools ?? []).filter(
    (t) =>
      (!groupFilter || t.group === groupFilter) &&
      (!search || t.name.toLowerCase().includes(search.toLowerCase())),
  );
  const enabledCount = (tools ?? []).filter((t) => t.enabled).length;

  const dirty = form !== null;

  const applyToken = () => {
    if (!s) return;
    setForm({ ...s, serviceToken: generateToken() });
    setShowToken(true);
  };

  const healthLabel = !airaHealth ? 'Mengecek…' : airaHealth.online ? 'AIRA Online' : 'AIRA Offline';
  const healthTitle = airaHealth
    ? `aira-core ${airaHealth.status}` +
      (airaHealth.version ? ` · v${airaHealth.version}` : '') +
      (airaHealth.tools_loaded != null ? ` · ${airaHealth.tools_loaded} tools` : '') +
      ` · ${airaHealth.base_url}`
    : 'mengecek status aira-core…';

  return (
    <div className="space-y-5">
      {/* ── Bagian 1: Koneksi AIRA (config sisi-ERP minimal) ── */}
      <SettingsCard
        title="Koneksi AIRA"
        description="Model AI, memori & konteks dikelola oleh AIRA (aplikasi terpisah). ERP hanya mengatur aktivasi layer agentik & token koneksi."
        actions={(
          <Badge
            title={healthTitle}
            variant={!airaHealth ? 'neutral' : airaHealth.online ? 'success' : 'danger'}
            className="gap-1.5"
          >
            <span
              aria-hidden
              className={cn('size-1.5 rounded-full', !airaHealth ? 'bg-muted-foreground' : airaHealth.online ? 'bg-success' : 'bg-danger')}
            />
            {healthLabel}
          </Badge>
        )}
      >
        {!s ? (
          <LoadingState />
        ) : (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p id="ai-enabled-label" className="text-sm font-medium text-foreground">Layer agentik aktif</p>
                <p id="ai-enabled-desc" className="mt-0.5 text-xs text-muted-foreground">
                  Saat nonaktif, semua pemanggilan tool ditolak (403).
                </p>
              </div>
              <Switch
                checked={!!s.agenticEnabled}
                disabled={!canEdit}
                onCheckedChange={(v) => setForm({ ...s, agenticEnabled: v })}
                aria-labelledby="ai-enabled-label"
                aria-describedby="ai-enabled-desc"
              />
            </div>

            <Field
              label="Service token"
              hint={s.hasServiceToken
                ? 'Token tersimpan dan disembunyikan (Bearer untuk AIRA → ERP Tool Router). Isi atau buat baru untuk mengganti.'
                : 'Bearer untuk AIRA → ERP Tool Router.'}
            >
              {(control) => (
                <div className="flex flex-wrap gap-2">
                  <Input
                    {...control}
                    type={showToken ? 'text' : 'password'}
                    autoComplete="off"
                    disabled={!canEdit}
                    value={s.serviceToken ?? ''}
                    onChange={(e) => setForm({ ...s, serviceToken: e.target.value })}
                    placeholder={s.hasServiceToken ? 'Token tersimpan (disembunyikan)' : 'Token rahasia untuk auth AIRA'}
                    className="min-w-48 flex-1 basis-48 font-mono"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowToken((v) => !v)}
                    aria-label={showToken ? 'Sembunyikan token' : 'Tampilkan token'}
                    aria-pressed={showToken}
                  >
                    {showToken ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                  </Button>
                  {canEdit && (
                    <Button
                      variant="outline"
                      onClick={() => (s.hasServiceToken ? setConfirmRegenerate(true) : applyToken())}
                    >
                      <RefreshCw aria-hidden /> Buat token
                    </Button>
                  )}
                  {s.serviceToken && (
                    <p role="status" className="basis-full text-xs font-medium text-warning-text">
                      Salin token ini ke konfigurasi AIRA sebelum menyimpan — setelah disimpan token tidak bisa ditampilkan lagi.
                    </p>
                  )}
                </div>
              )}
            </Field>

            <fieldset className="rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-medium text-foreground">Channel aktif</legend>
              <p className="mb-3 text-xs text-muted-foreground">
                Channel yang dilayani AIRA. Kosong = semua aktif. (Penegakan di gateway AIRA.)
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {AI_CHANNELS.map((ch) => {
                  const list = s.activeChannels ?? [];
                  const checked = list.length === 0 || list.includes(ch.id);
                  const allActive = list.length === 0;
                  return (
                    <label key={ch.id} className="flex items-center gap-2 text-sm text-foreground">
                      <Checkbox
                        checked={checked}
                        disabled={!canEdit}
                        onCheckedChange={() => {
                          // From "all active" (empty) → materialise the full list first, then toggle.
                          const base = allActive ? AI_CHANNELS.map((c) => c.id) : [...list];
                          const next = base.includes(ch.id) ? base.filter((c) => c !== ch.id) : [...base, ch.id];
                          // All checked again → store as empty (= all).
                          const normalized = next.length === AI_CHANNELS.length ? [] : next;
                          setForm({ ...s, activeChannels: normalized });
                        }}
                      />
                      {ch.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-medium text-foreground">Whitelist modul</legend>
              <p className="mb-3 text-xs text-muted-foreground">
                Group modul yang boleh dipakai AIRA. Kosong = semua modul boleh (default). Bila dipilih, tool di luar group ditolak (403).
              </p>
              <div className="flex flex-wrap gap-2">
                {AI_MODULE_GROUPS.map((g) => {
                  const list = s.whitelistModules ?? [];
                  const active = list.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      disabled={!canEdit}
                      aria-pressed={active}
                      onClick={() => {
                        const next = active ? list.filter((x) => x !== g) : [...list, g];
                        setForm({ ...s, whitelistModules: next });
                      }}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                        active
                          ? 'border-primary bg-primary-subtle font-medium text-primary-subtle-foreground'
                          : 'border-border bg-card text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
              {(s.whitelistModules ?? []).length === 0 && (
                <p className="mt-2 text-xs text-success-text">Semua modul aktif (tak ada batasan).</p>
              )}
            </fieldset>
          </div>
        )}
      </SettingsCard>

      {canEdit && (
        <SaveBar
          dirty={dirty}
          saving={saveSettings.isPending}
          onReset={() => { setForm(null); setShowToken(false); }}
          onSave={() =>
            s &&
            saveSettings.mutate({
              agenticEnabled: s.agenticEnabled,
              activeChannels: s.activeChannels,
              whitelistModules: s.whitelistModules,
              // Omit when blank so saving other fields never clears the stored token.
              ...(s.serviceToken ? { serviceToken: s.serviceToken } : {}),
            })
          }
        />
      )}

      <ConfirmDialog
        open={confirmRegenerate}
        onOpenChange={setConfirmRegenerate}
        tone="danger"
        title="Buat service token baru?"
        description="Token baru menggantikan token lama setelah Anda menekan Simpan. AIRA tidak bisa terhubung sampai token baru disalin ke konfigurasi AIRA."
        confirmLabel="Buat token baru"
        onConfirm={applyToken}
      />

      {/* ── Bagian 2: Whitelist ── */}
      <SettingsCard title="Whitelist Akses" description="Pemetaan channel ↔ pengguna yang boleh memakai AIRA." contentClassName="space-y-4 px-0 pb-0">
        {canEdit && (
          <form
            className="grid grid-cols-1 gap-3 px-5 sm:grid-cols-2 lg:grid-cols-[140px_1fr_1fr_120px_auto] lg:items-end"
            onSubmit={(e) => { e.preventDefault(); if (wlForm.externalId.trim()) addWl.mutate(wlForm); }}
          >
            <Field label="Channel">
              {(control) => (
                <Select value={wlForm.channel} onValueChange={(v) => setWlForm({ ...wlForm, channel: v })}>
                  <SelectTrigger {...control}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label="External ID" required>
              <Input value={wlForm.externalId} onChange={(e) => setWlForm({ ...wlForm, externalId: e.target.value })} placeholder="chat_id / nomor WA" className="font-mono" />
            </Field>
            <Field label="Label">
              <Input value={wlForm.label} onChange={(e) => setWlForm({ ...wlForm, label: e.target.value })} placeholder="Label" />
            </Field>
            <Field label="Peran">
              <Input value={wlForm.role} onChange={(e) => setWlForm({ ...wlForm, role: e.target.value })} placeholder="Viewer" />
            </Field>
            <Button type="submit" disabled={!wlForm.externalId} loading={addWl.isPending}>
              {!addWl.isPending && <Plus aria-hidden />} Tambah
            </Button>
          </form>
        )}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard focusable (axe scrollable-region-focusable) */}
        <div className="relative overflow-x-auto border-t border-border" role="region" aria-label="Tabel whitelist akses" tabIndex={0}>
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-medium">Channel</th>
                <th scope="col" className="px-3 py-2.5 font-medium">External ID</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Label</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Peran</th>
                <th scope="col" className="px-5 py-2.5"><span className="sr-only">Aksi</span></th>
              </tr>
            </thead>
            <tbody>
              {(whitelist ?? []).map((w) => (
                <tr key={w.id} className="border-t border-border">
                  <td className="px-5 py-2.5">{w.channel}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{w.externalId}</td>
                  <td className="px-3 py-2.5">{w.label || '-'}</td>
                  <td className="px-3 py-2.5">{w.role || 'Viewer'}</td>
                  <td className="px-5 py-2.5 text-right">
                    {canEdit && (
                      <Button variant="ghost" size="icon-sm" onClick={() => delWl.mutate(w.id)} aria-label={`Hapus whitelist ${w.externalId}`}>
                        <Trash2 className="text-danger-text" aria-hidden />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {(whitelist ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-5 py-4 text-center text-xs text-muted-foreground">Belum ada whitelist.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SettingsCard>

      {/* ── Bagian 3: Daftar Tool ── */}
      <SettingsCard
        title={<>Daftar Tool <span className="text-sm font-normal text-muted-foreground">({enabledCount}/{tools?.length ?? 0} aktif)</span></>}
        description="Aktifkan tool dan atur tingkat persetujuan. Tool baca bisa diuji langsung."
        contentClassName="space-y-4 px-0 pb-0"
      >
        <div className="flex flex-wrap gap-2 px-5">
          <Select value={groupFilter || ALL_GROUPS} onValueChange={(v) => setGroupFilter(v === ALL_GROUPS ? '' : v)}>
            <SelectTrigger className="w-full sm:w-48" aria-label="Filter grup tool"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_GROUPS}>Semua grup</SelectItem>
              {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari tool…" aria-label="Cari tool" className="pl-8" />
          </div>
        </div>

        {toolsLoading ? (
          <LoadingState className="pb-5" />
        ) : filtered.length === 0 ? (
          <EmptyState compact kind="no-results" title="Tidak ada tool yang cocok" className="pb-5" />
        ) : (
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard focusable (axe scrollable-region-focusable)
          <div className="relative overflow-x-auto border-t border-border" role="region" aria-label="Tabel daftar tool" tabIndex={0}>
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">Nama</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Modul</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Risiko</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Tingkat</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Handler</th>
                  <th scope="col" className="px-3 py-2.5 text-center font-medium">Aktif</th>
                  <th scope="col" className="px-5 py-2.5 text-center font-medium">Uji</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.name} className="border-t border-border">
                    <td className="px-5 py-2.5">
                      <div className="font-medium text-foreground">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.desc}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs">{t.module}</td>
                    <td className="px-3 py-2.5"><Badge variant={RISK_BADGE[t.risk] ?? 'neutral'}>{t.risk}</Badge></td>
                    <td className="px-3 py-2.5">
                      <Select
                        value={t.tier}
                        disabled={t.risk === 'read' || !canEdit}
                        onValueChange={(v) => patchTool.mutate({ name: t.name, data: { tier: v } })}
                      >
                        <SelectTrigger className="h-8 w-40 text-xs md:h-8" aria-label={`Tingkat persetujuan ${t.name}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TIER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{t.handler}</td>
                    <td className="px-3 py-2.5 text-center">
                      <Switch
                        checked={t.enabled}
                        disabled={!canEdit}
                        onCheckedChange={(v) => patchTool.mutate({ name: t.name, data: { enabled: v } })}
                        aria-label={`Aktifkan ${t.name}`}
                      />
                    </td>
                    <td className="px-5 py-2.5 text-center">
                      {t.risk === 'read' && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => testTool.mutate(t.name)}
                          disabled={testTool.isPending}
                          aria-label={`Uji tool ${t.name}`}
                        >
                          <Play aria-hidden />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {testResult && (
          <div className="mx-5 mb-5 rounded-lg border border-border bg-neutral-900 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-200">Hasil uji: {testResult.name}</span>
              <Button variant="ghost" size="icon-sm" onClick={() => setTestResult(null)} aria-label="Tutup hasil uji" className="text-neutral-300 hover:bg-neutral-800 hover:text-white">
                <X aria-hidden />
              </Button>
            </div>
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard focusable (axe scrollable-region-focusable) */}
            <pre className="max-h-64 overflow-auto text-xs text-emerald-300" tabIndex={0}>{testResult.out}</pre>
          </div>
        )}
      </SettingsCard>
    </div>
  );
};
