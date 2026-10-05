import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, ShieldCheck, Lock, KeyRound } from 'lucide-react';
import api from '../../lib/api';
import { cn } from '../../lib/utils';
import { ConfirmDialog, EmptyState, Field, LoadingState } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { SettingsCard } from '../../components/settings/SettingsCard';
import { SaveBar } from '../../components/settings/SaveBar';
import { PermissionMatrix } from '../../components/settings/PermissionMatrix';
import {
  draftFromRole, groupModules, isCapsDirty, isPermDraftDirty, toPermissionsPayload, type PermDraft,
} from '../../components/settings/permissionMatrixState';

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

const MIN_NAME = 2;

export const RolePermissionsTab: React.FC = () => {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftPerms, setDraftPerms] = useState<PermDraft>({});
  const [draftCaps, setDraftCaps] = useState<Set<string>>(new Set());
  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNameTouched, setNewNameTouched] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: catalog } = useQuery<Catalog>({
    queryKey: ['roles-catalog'],
    queryFn: async () => (await api.get('/roles/catalog')).data,
  });
  const { data: roles = [], isLoading } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: async () => (await api.get('/roles')).data,
  });

  const selected = roles.find((r) => r.id === selectedId) || null;

  const groups = useMemo(
    () => groupModules(catalog?.modules ?? [], selected?.permissions.map((p) => p.module) ?? []),
    [catalog, selected],
  );

  const loadDraft = (r: Role) => {
    setSelectedId(r.id);
    setDraftPerms(draftFromRole(r.permissions));
    setDraftCaps(new Set(r.caps));
    setDraftName(r.name);
    setDraftDesc(r.description ?? '');
  };

  const dirty = !!selected && (
    draftName !== selected.name ||
    draftDesc !== (selected.description ?? '') ||
    isPermDraftDirty(selected.permissions, draftPerms) ||
    isCapsDirty(selected.caps, draftCaps)
  );
  const nameError = selected && draftName.trim().length < MIN_NAME ? `Nama peran minimal ${MIN_NAME} karakter.` : undefined;
  const newNameError = newNameTouched && newName.trim().length < MIN_NAME ? `Nama peran minimal ${MIN_NAME} karakter.` : undefined;

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      return api.put(`/roles/${selected.id}`, {
        name: draftName,
        description: draftDesc,
        permissions: toPermissionsPayload(draftPerms),
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
      setCreating(false); setNewName(''); setNewNameTouched(false);
      qc.invalidateQueries({ queryKey: ['roles'] }).then(() => {
        const id: string | undefined = res?.data?.id;
        if (!id) return;
        const fresh = qc.getQueryData<Role[]>(['roles'])?.find((r) => r.id === id);
        if (fresh) loadDraft(fresh);
        else setSelectedId(id);
      });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Gagal membuat role.'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/roles/${id}`),
    onSuccess: () => { toast.success('Role dihapus.'); setSelectedId(null); qc.invalidateQueries({ queryKey: ['roles'] }); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Gagal menghapus role.'),
  });

  const toggleCap = (key: string, on: boolean) =>
    setDraftCaps((prev) => {
      const next = new Set(prev);
      if (on) next.add(key); else next.delete(key);
      return next;
    });

  const submitCreate = () => {
    setNewNameTouched(true);
    if (newName.trim().length < MIN_NAME) return;
    createMut.mutate();
  };

  if (isLoading) return <LoadingState />;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
      <SettingsCard
        title="Peran"
        className="self-start"
        actions={!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden /> Peran Baru
          </Button>
        )}
        contentClassName="space-y-3"
      >
        {creating && (
          <form
            noValidate
            className="space-y-2 rounded-lg border border-border p-3"
            onSubmit={(e) => { e.preventDefault(); submitCreate(); }}
          >
            <Field label="Nama peran baru" required error={newNameError}>
              {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves to the first field when the dialog/inline editor opens */}
              <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="mis. Kasir" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setCreating(false); setNewName(''); setNewNameTouched(false); }}>Batal</Button>
              <Button type="submit" size="sm" loading={createMut.isPending}>Buat</Button>
            </div>
          </form>
        )}
        <ul className="space-y-1" aria-label="Daftar peran">
          {roles.map((r) => {
            const isActive = selectedId === r.id;
            return (
              <li key={r.id}>
                {/* eslint-disable-next-line jsx-a11y/control-has-associated-label -- accessible name comes from the button's text children */}
                <button
                  type="button"
                  onClick={() => loadDraft(r)}
                  aria-current={isActive ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive ? 'border-primary bg-primary-subtle text-primary-subtle-foreground' : 'border-border hover:bg-accent',
                  )}
                >
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {r.isSuperAdmin && <ShieldCheck className="size-3.5 shrink-0 text-primary" aria-label="Super-admin" />}
                      <span className="truncate font-medium">{r.name}</span>
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {r.isSystem ? 'Sistem' : 'Kustom'} · {r.userCount} pengguna
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </SettingsCard>

      <div className="min-w-0 space-y-5">
        {!selected ? (
          <SettingsCard title="Hak akses">
            <EmptyState compact icon={KeyRound} title="Pilih peran" description="Pilih peran di daftar untuk mengatur izin, atau buat peran baru." />
          </SettingsCard>
        ) : selected.isSuperAdmin ? (
          <SettingsCard title={selected.name}>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="size-4 shrink-0" aria-hidden />
              Peran ini adalah super-admin — selalu memiliki akses penuh dan tidak dapat dibatasi.
            </p>
          </SettingsCard>
        ) : (
          <>
            <SettingsCard
              title="Detail Peran"
              actions={selected.isSystem
                ? <Badge variant="warning">Peran bawaan</Badge>
                : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-danger-text"
                    onClick={() => setConfirmDelete(true)}
                    disabled={selected.userCount > 0 || deleteMut.isPending}
                    title={selected.userCount > 0 ? 'Peran masih dipakai pengguna' : undefined}
                  >
                    <Trash2 aria-hidden /> Hapus Peran
                  </Button>
                )}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nama peran" required error={nameError}>
                  <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} />
                </Field>
                <Field label="Deskripsi">
                  <Input value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} />
                </Field>
              </div>
              {selected.isSystem && (
                <p className="mt-3 text-xs text-muted-foreground">Peran bawaan — izinnya boleh diubah, tetapi peran tidak dapat dihapus.</p>
              )}
              {!selected.isSystem && selected.userCount > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">Peran masih dipakai {selected.userCount} pengguna sehingga tidak dapat dihapus.</p>
              )}
            </SettingsCard>

            <SettingsCard
              title="Hak Akses Modul"
              description="Ubah otomatis menyertakan Lihat; mencabut Lihat juga mencabut Ubah. Gunakan kotak di header untuk memilih sekaligus."
            >
              <PermissionMatrix groups={groups} draft={draftPerms} onChange={setDraftPerms} caption={selected.name} />
            </SettingsCard>

            <SettingsCard title="Hak Khusus" description="Kemampuan sensitif di luar hak modul.">
              {(catalog?.capabilities ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Tidak ada hak khusus.</p>
              ) : (
                <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {(catalog?.capabilities ?? []).map((c) => (
                    <li key={c.key}>
                      <label className="flex items-start gap-2.5 rounded-md p-1.5 text-sm text-foreground hover:bg-accent">
                        <Checkbox className="mt-0.5" checked={draftCaps.has(c.key)} onCheckedChange={(v) => toggleCap(c.key, v === true)} />
                        <span>
                          {c.label}
                          <span className="block font-mono text-xs text-muted-foreground">{c.key}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </SettingsCard>

            <SaveBar
              dirty={dirty}
              saveDisabled={!!nameError}
              saving={saveMut.isPending}
              onSave={() => setConfirmSave(true)}
              onReset={() => loadDraft(selected)}
              saveLabel="Simpan Perubahan"
            />

            <ConfirmDialog
              open={confirmSave}
              onOpenChange={setConfirmSave}
              title={`Simpan hak akses ${draftName}?`}
              description={selected.userCount > 0
                ? `Perubahan langsung berlaku untuk ${selected.userCount} pengguna dengan peran ini.`
                : 'Perubahan berlaku untuk pengguna yang nanti diberi peran ini.'}
              confirmLabel="Simpan"
              loading={saveMut.isPending}
              onConfirm={() => saveMut.mutateAsync()}
            />

            <ConfirmDialog
              open={confirmDelete}
              onOpenChange={setConfirmDelete}
              tone="danger"
              title={`Hapus peran "${selected.name}"?`}
              description="Peran yang dihapus tidak dapat dipulihkan."
              confirmLabel="Hapus Peran"
              loading={deleteMut.isPending}
              onConfirm={() => deleteMut.mutateAsync(selected.id)}
            />
          </>
        )}
      </div>
    </div>
  );
};
