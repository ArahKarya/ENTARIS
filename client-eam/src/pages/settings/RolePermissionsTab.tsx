import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, ShieldCheck, Lock } from 'lucide-react';
import api from '../../lib/api';
import { cn } from '../../lib/utils';

interface ModuleDef { key: string; label: string; group: string }
interface CapabilityDef { key: string; label: string }
interface Catalog { modules: ModuleDef[]; capabilities: CapabilityDef[] }

interface RolePerm { module: string; canView: boolean; canEdit: boolean }
interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isSuperAdmin: boolean;
  isActive: boolean;
  userCount: number;
  permissions: RolePerm[];
  caps: string[];
}

export const RolePermissionsTab: React.FC = () => {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftPerms, setDraftPerms] = useState<Record<string, { view: boolean; edit: boolean }>>({});
  const [draftCaps, setDraftCaps] = useState<Set<string>>(new Set());
  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const { data: catalog } = useQuery<Catalog>({
    queryKey: ['roles-catalog'],
    queryFn: async () => (await api.get('/roles/catalog')).data,
  });
  const { data: roles = [], isLoading } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: async () => (await api.get('/roles')).data,
  });

  const selected = roles.find((r) => r.id === selectedId) || null;

  const groups = useMemo(() => {
    const g: Record<string, ModuleDef[]> = {};
    for (const m of catalog?.modules ?? []) (g[m.group] ??= []).push(m);
    return g;
  }, [catalog]);

  const loadDraft = (r: Role) => {
    setSelectedId(r.id);
    const perms: Record<string, { view: boolean; edit: boolean }> = {};
    for (const p of r.permissions) perms[p.module] = { view: p.canView, edit: p.canEdit };
    setDraftPerms(perms);
    setDraftCaps(new Set(r.caps));
    setDraftName(r.name);
    setDraftDesc(r.description ?? '');
  };

  const setPerm = (mod: string, action: 'view' | 'edit', val: boolean) => {
    setDraftPerms((prev) => {
      const cur = prev[mod] ?? { view: false, edit: false };
      const next = { ...cur, [action]: val };
      if (action === 'edit' && val) next.view = true; // edit menyiratkan view
      if (action === 'view' && !val) next.edit = false; // tanpa view → tanpa edit
      return { ...prev, [mod]: next };
    });
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const permissions = Object.entries(draftPerms)
        .filter(([, v]) => v.view || v.edit)
        .map(([module, v]) => ({ module, canView: v.view || v.edit, canEdit: v.edit }));
      return api.put(`/roles/${selected.id}`, {
        name: draftName,
        description: draftDesc,
        permissions,
        caps: [...draftCaps],
      });
    },
    onSuccess: () => { toast.success('Role disimpan.'); qc.invalidateQueries({ queryKey: ['roles'] }); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Gagal menyimpan role.'),
  });

  const createMut = useMutation({
    mutationFn: async () => api.post('/roles', { name: newName }),
    onSuccess: (res: any) => {
      toast.success('Role dibuat.');
      setCreating(false); setNewName('');
      qc.invalidateQueries({ queryKey: ['roles'] }).then(() => {
        if (res?.data?.id) setSelectedId(res.data.id);
      });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Gagal membuat role.'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/roles/${id}`),
    onSuccess: () => { toast.success('Role dihapus.'); setSelectedId(null); qc.invalidateQueries({ queryKey: ['roles'] }); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Gagal menghapus role.'),
  });

  if (isLoading) return <div className="py-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
      {/* Daftar role */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Role</h3>
          <button onClick={() => setCreating(true)} className="btn-primary text-xs"><Plus size={13} /> Role Baru</button>
        </div>
        {creating && (
          <div className="card p-3 space-y-2">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nama role (mis. Kasir)"
              className="w-full border rounded-lg px-2.5 py-1.5 text-sm" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setCreating(false); setNewName(''); }} className="btn-secondary text-xs">Batal</button>
              <button onClick={() => createMut.mutate()} disabled={newName.trim().length < 2 || createMut.isPending} className="btn-primary text-xs">Buat</button>
            </div>
          </div>
        )}
        <div className="space-y-1">
          {roles.map((r) => (
            <button key={r.id} onClick={() => loadDraft(r)}
              className={cn('w-full text-left px-3 py-2 rounded-lg border text-sm flex items-center justify-between gap-2',
                selectedId === r.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50')}>
              <span className="flex items-center gap-1.5 min-w-0">
                {r.isSuperAdmin ? <ShieldCheck size={13} className="text-blue-600 flex-shrink-0" /> : null}
                <span className="truncate">{r.name}</span>
              </span>
              <span className="text-[10px] text-gray-400 flex-shrink-0">{r.isSystem ? 'sistem' : 'custom'} · {r.userCount}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div>
        {!selected ? (
          <div className="card p-8 text-center text-sm text-gray-400">Pilih role untuk mengatur izin, atau buat role baru.</div>
        ) : selected.isSuperAdmin ? (
          <div className="card p-6 text-sm text-gray-600 flex items-center gap-2">
            <Lock size={16} className="text-gray-400" /> Role <b>{selected.name}</b> adalah super-admin — selalu memiliki akses penuh dan tidak dapat dibatasi.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="card p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Nama Role</label>
                  <input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="w-full border rounded-lg px-2.5 py-1.5 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Deskripsi</label>
                  <input value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} className="w-full border rounded-lg px-2.5 py-1.5 text-sm mt-1" />
                </div>
              </div>
              {selected.isSystem && <p className="text-[11px] text-amber-600">Role bawaan — izinnya boleh diubah, tapi role tidak dapat dihapus.</p>}
            </div>

            {/* Matriks modul */}
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500">
                    <th className="text-left px-3 py-2">Modul</th>
                    <th className="px-3 py-2 w-16 text-center">Lihat</th>
                    <th className="px-3 py-2 w-16 text-center">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(groups).map(([group, mods]) => (
                    <React.Fragment key={group}>
                      <tr className="bg-gray-50"><td colSpan={3} className="px-3 py-1.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{group}</td></tr>
                      {mods.map((m) => {
                        const p = draftPerms[m.key] ?? { view: false, edit: false };
                        return (
                          <tr key={m.key} className="border-b border-gray-50">
                            <td className="px-3 py-1.5 text-gray-700">{m.label}</td>
                            <td className="px-3 py-1.5 text-center">
                              <input type="checkbox" checked={p.view} onChange={(e) => setPerm(m.key, 'view', e.target.checked)} />
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <input type="checkbox" checked={p.edit} onChange={(e) => setPerm(m.key, 'edit', e.target.checked)} />
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Capabilities */}
            <div className="card p-4">
              <h4 className="text-xs font-semibold text-gray-600 mb-2">Hak Khusus</h4>
              <div className="space-y-1.5">
                {(catalog?.capabilities ?? []).map((c) => (
                  <label key={c.key} className="flex items-start gap-2 text-sm text-gray-700">
                    <input type="checkbox" className="mt-0.5" checked={draftCaps.has(c.key)}
                      onChange={(e) => setDraftCaps((prev) => { const n = new Set(prev); if (e.target.checked) n.add(c.key); else n.delete(c.key); return n; })} />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                {!selected.isSystem && (
                  <button
                    onClick={() => { if (confirm(`Hapus role "${selected.name}"?`)) deleteMut.mutate(selected.id); }}
                    disabled={selected.userCount > 0 || deleteMut.isPending}
                    title={selected.userCount > 0 ? 'Role masih dipakai user' : undefined}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg disabled:opacity-40">
                    <Trash2 size={13} /> Hapus Role
                  </button>
                )}
              </div>
              <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="btn-primary text-sm">
                {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
