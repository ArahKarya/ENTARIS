import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../../lib/api';
import {
  Loader2, Plus, Trash2, Play, Save, Bot, X, Eye, EyeOff, RefreshCw,
} from 'lucide-react';
import { cn } from '../../lib/utils';

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
  serviceToken: string | null;
}
interface WhitelistEntry {
  id: string;
  channel: string;
  externalId: string;
  label: string | null;
  role: string | null;
  enabled: boolean;
}

const RISK_BADGE: Record<string, string> = {
  read: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  write: 'bg-amber-50 text-amber-700 border-amber-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
};
const CHANNELS = ['telegram', 'whatsapp'];

export const AgenticSystemTab: React.FC = () => {
  const qc = useQueryClient();

  // ── Pengaturan Global ──
  const { data: settings } = useQuery<AiSetting>({
    queryKey: ['ai-settings'],
    queryFn: async () => (await api.get('/ai/config/settings')).data,
  });
  const [form, setForm] = useState<Partial<AiSetting> | null>(null);
  const [showToken, setShowToken] = useState(false);
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

  return (
    <div className="space-y-6">
      {/* ── Bagian 1: Koneksi AIRA (config sisi-ERP minimal) ── */}
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-1 flex items-center gap-2">
          <Bot size={16} className="text-blue-600" />
          <h2 className="text-sm font-semibold text-gray-900">Koneksi AIRA</h2>
        </div>
        <p className="mb-3 text-xs text-gray-400">
          Model AI, memori &amp; konteks dikelola oleh AIRA (aplikasi terpisah). ERP hanya mengatur
          aktivasi layer agentic &amp; token koneksi.
        </p>
        {s && (
          <div className="space-y-4">
            {/* Toggle Agentic Enabled */}
            <div className="flex items-center justify-between rounded border border-gray-200 px-3 py-2.5">
              <div>
                <div className="text-sm font-medium text-gray-800">Agentic Enabled</div>
                <div className="text-xs text-gray-400">
                  Aktifkan/nonaktifkan seluruh layer agentic. Saat nonaktif, semua pemanggilan tool
                  ditolak (403).
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!!s.agenticEnabled}
                onClick={() => setForm({ ...s, agenticEnabled: !s.agenticEnabled })}
                className={cn(
                  'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors',
                  s.agenticEnabled ? 'bg-emerald-500' : 'bg-gray-300',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    s.agenticEnabled ? 'translate-x-6' : 'translate-x-1',
                  )}
                />
              </button>
            </div>

            {/* Service Token */}
            <label className="block text-xs font-medium text-gray-600">
              Service Token <span className="text-gray-400">(Bearer untuk AIRA → ERP Tool Router)</span>
              <div className="mt-1 flex gap-2">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={s.serviceToken ?? ''}
                  onChange={(e) => setForm({ ...s, serviceToken: e.target.value })}
                  placeholder="Token rahasia untuk auth AIRA"
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  title={showToken ? 'Sembunyikan' : 'Tampilkan'}
                  className="flex items-center rounded border border-gray-300 px-2 text-gray-500 hover:bg-gray-50"
                >
                  {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const tok =
                      typeof crypto !== 'undefined' && 'randomUUID' in crypto
                        ? crypto.randomUUID().replace(/-/g, '')
                        : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
                    setForm({ ...s, serviceToken: tok });
                    setShowToken(true);
                  }}
                  title="Generate token baru"
                  className="flex items-center gap-1 rounded border border-gray-300 px-2 text-xs text-gray-600 hover:bg-gray-50"
                >
                  <RefreshCw size={14} /> Generate
                </button>
              </div>
            </label>
          </div>
        )}
        <div className="mt-3 flex justify-end">
          <button
            disabled={!dirty || saveSettings.isPending}
            onClick={() => s && saveSettings.mutate(s)}
            className={cn(
              'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium text-white',
              dirty ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed',
            )}
          >
            {saveSettings.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Simpan
          </button>
        </div>
      </section>

      {/* ── Bagian 2: Whitelist ── */}
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Whitelist Akses (channel ↔ user)</h2>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <select
            value={wlForm.channel}
            onChange={(e) => setWlForm({ ...wlForm, channel: e.target.value })}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            value={wlForm.externalId}
            onChange={(e) => setWlForm({ ...wlForm, externalId: e.target.value })}
            placeholder="chat_id / nomor WA"
            className="rounded border border-gray-300 px-2 py-1.5 text-sm font-mono w-40"
          />
          <input
            value={wlForm.label}
            onChange={(e) => setWlForm({ ...wlForm, label: e.target.value })}
            placeholder="Label"
            className="rounded border border-gray-300 px-2 py-1.5 text-sm w-32"
          />
          <input
            value={wlForm.role}
            onChange={(e) => setWlForm({ ...wlForm, role: e.target.value })}
            placeholder="Role"
            className="rounded border border-gray-300 px-2 py-1.5 text-sm w-24"
          />
          <button
            disabled={!wlForm.externalId || addWl.isPending}
            onClick={() => addWl.mutate(wlForm)}
            className="flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1.5 text-sm text-white hover:bg-blue-700 disabled:bg-gray-300"
          >
            <Plus size={14} /> Tambah
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-2 py-1.5">Channel</th>
                <th className="px-2 py-1.5">External ID</th>
                <th className="px-2 py-1.5">Label</th>
                <th className="px-2 py-1.5">Role</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {(whitelist ?? []).map((w) => (
                <tr key={w.id} className="border-t border-gray-100">
                  <td className="px-2 py-1.5">{w.channel}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">{w.externalId}</td>
                  <td className="px-2 py-1.5">{w.label || '-'}</td>
                  <td className="px-2 py-1.5">{w.role || 'Viewer'}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button onClick={() => delWl.mutate(w.id)} className="text-red-500 hover:text-red-700">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {(whitelist ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-2 py-3 text-center text-xs text-gray-400">Belum ada whitelist.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Bagian 3: Daftar Tool ── */}
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900">
            Daftar Tool <span className="text-xs font-normal text-gray-400">({enabledCount}/{tools?.length ?? 0} aktif)</span>
          </h2>
          <div className="flex gap-2">
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Semua grup</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari tool…"
              className="rounded border border-gray-300 px-2 py-1.5 text-sm w-40"
            />
          </div>
        </div>

        {toolsLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="animate-spin text-gray-400" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-2 py-1.5">Nama</th>
                  <th className="px-2 py-1.5">Modul</th>
                  <th className="px-2 py-1.5">Risk</th>
                  <th className="px-2 py-1.5">Tier</th>
                  <th className="px-2 py-1.5">Handler</th>
                  <th className="px-2 py-1.5 text-center">Aktif</th>
                  <th className="px-2 py-1.5 text-center">Test</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.name} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-2 py-1.5">
                      <div className="font-medium text-gray-800">{t.name}</div>
                      <div className="text-xs text-gray-400">{t.desc}</div>
                    </td>
                    <td className="px-2 py-1.5 text-xs">{t.module}</td>
                    <td className="px-2 py-1.5">
                      <span className={cn('rounded border px-1.5 py-0.5 text-xs', RISK_BADGE[t.risk])}>
                        {t.risk}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={t.tier}
                        disabled={t.risk === 'read'}
                        onChange={(e) => patchTool.mutate({ name: t.name, data: { tier: e.target.value } })}
                        className="rounded border border-gray-300 px-1 py-0.5 text-xs disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        <option value="auto">auto 🟢</option>
                        <option value="draft">draft 🟡</option>
                        <option value="must_approve">approve 🔴</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs text-gray-600">{t.handler}</td>
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={t.enabled}
                        onChange={(e) => patchTool.mutate({ name: t.name, data: { enabled: e.target.checked } })}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {t.risk === 'read' && (
                        <button
                          onClick={() => testTool.mutate(t.name)}
                          disabled={testTool.isPending}
                          className="text-blue-600 hover:text-blue-800 disabled:text-gray-300"
                          title="Test tool (panggil router)"
                        >
                          <Play size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Hasil Test Tool */}
        {testResult && (
          <div className="mt-3 rounded border border-gray-200 bg-gray-900 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-300">Hasil Test: {testResult.name}</span>
              <button onClick={() => setTestResult(null)} className="text-gray-400 hover:text-white">
                <X size={14} />
              </button>
            </div>
            <pre className="max-h-64 overflow-auto text-xs text-emerald-300">{testResult.out}</pre>
          </div>
        )}
      </section>
    </div>
  );
};
