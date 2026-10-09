import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, RefreshCw, ShieldOff, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { can } from '@/lib/permissions';
import { formatDate, formatDateTime } from '@/lib/format';
import { formatRelativeTime } from '@/lib/auditDiff';
import { ConfirmDialog, DateInput, EmptyState, Field, LoadingState } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { CopyButton } from './CopyButton';
import { MCP_STATUS_KEY, MCP_TOKENS_KEY } from './keys';

export interface McpTokenRow {
  id: string;
  name: string;
  prefix: string;
  status: 'active' | 'revoked' | 'expired';
  defaultActorUserId: string | null;
  defaultActorName: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  createdAt: string;
  rateLimitPerMin: number;
}

interface Revealed {
  title: string;
  name: string;
  token?: string;
  signingSecret: string;
}

interface UserOption {
  id: string;
  fullName: string;
  isActive: boolean;
  airaEnabled?: boolean;
}

const NO_ACTOR = '__none';

const STATUS_BADGE = {
  active: { label: 'Aktif', variant: 'success' },
  revoked: { label: 'Dicabut', variant: 'neutral' },
  expired: { label: 'Kedaluwarsa', variant: 'warning' },
} as const;

function apiError(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } }).response?.data?.error || fallback;
}

/** Tampilan sekali pakai untuk token + signing secret (tidak dapat dilihat lagi). */
function RevealDialog({ revealed, onClose }: { revealed: Revealed | null; onClose: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <Dialog open={revealed !== null} onOpenChange={(open) => { if (!open && saved) { setSaved(false); onClose(); } }}>
      <DialogContent size="md" hideClose>
        {revealed && (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{revealed.title}</DialogTitle>
              <DialogDescription>
                Simpan sekarang di pengelola rahasia engine AIRA. Nilai ini <strong>hanya ditampilkan sekali</strong> dan tidak dapat dilihat lagi.
              </DialogDescription>
            </DialogHeader>

            {revealed.token && (
              <SecretField label="Token MCP (header Authorization: Bearer)" value={revealed.token} what="token MCP" />
            )}
            <SecretField label="Signing secret (menandatangani actor assertion)" value={revealed.signingSecret} what="signing secret" />

            <p className="flex items-start gap-2 rounded-md bg-warning-subtle px-3 py-2 text-xs text-warning-text">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Token dan signing secret setara kunci akses. Jangan dibagikan lewat chat; cabut atau putar bila bocor.</span>
            </p>

            <div className="flex items-center gap-2">
              <Checkbox id="mcp-secret-saved" checked={saved} onCheckedChange={(v) => setSaved(v === true)} />
              <Label htmlFor="mcp-secret-saved" className="text-sm font-normal text-foreground">
                Saya sudah menyimpan nilai di atas
              </Label>
            </div>

            <DialogFooter>
              <Button type="button" disabled={!saved} onClick={() => { setSaved(false); onClose(); }}>Selesai</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SecretField({ label, value, what }: { label: string; value: string; what: string }) {
  return (
    <Field label={label}>
      {(control) => (
        <div className="flex flex-wrap gap-2">
          <Input {...control} readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="min-w-48 flex-1 basis-48 font-mono text-xs" />
          <CopyButton value={value} what={what} />
        </div>
      )}
    </Field>
  );
}

function CreateDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (r: Revealed) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [actor, setActor] = useState(NO_ACTOR);
  const [expires, setExpires] = useState('');
  const [rate, setRate] = useState('120');
  const [error, setError] = useState('');

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ['users', 'aira-actor-options'],
    queryFn: async () => (await api.get('/users', { params: { limit: 200, sort: 'fullName' } })).data.data,
    enabled: open,
  });
  const actorOptions = users.filter((u) => u.isActive && u.airaEnabled);

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post('/ai/mcp/tokens', {
          name: name.trim(),
          defaultActorUserId: actor === NO_ACTOR ? null : actor,
          expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
          rateLimitPerMin: Number(rate) || 120,
        })
      ).data as { name: string; token: string; signingSecret: string },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: MCP_TOKENS_KEY });
      qc.invalidateQueries({ queryKey: MCP_STATUS_KEY });
      setName(''); setActor(NO_ACTOR); setExpires(''); setRate('120'); setError('');
      onCreated({ title: 'Token MCP dibuat', name: d.name, token: d.token, signingSecret: d.signingSecret });
    },
    onError: (e) => setError(apiError(e, 'Gagal membuat token.')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Nama token wajib diisi.');
    setError('');
    create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !create.isPending && onClose()}>
      <DialogContent size="md">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Buat token MCP</DialogTitle>
            <DialogDescription>Satu token per profil engine AIRA (mis. aira-dev). Token dan signing secret ditampilkan sekali setelah dibuat.</DialogDescription>
          </DialogHeader>
          <Field label="Nama / label" required hint="Mis. aira-dev.">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" />
          </Field>
          <Field label="Aktor default (opsional)" hint="Dipakai bila panggilan tanpa actor assertion (CLI / uji). Kosong = assertion wajib. Hanya pengguna yang diberi Akses AIRA.">
            {(control) => (
              <Select value={actor} onValueChange={setActor}>
                <SelectTrigger {...control}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ACTOR}>Tidak ada (assertion wajib)</SelectItem>
                  {actorOptions.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kedaluwarsa (opsional)" hint="Kosong = tidak kedaluwarsa.">
              {(control) => <DateInput id={control.id} value={expires} onChange={setExpires} min={new Date().toISOString().slice(0, 10)} />}
            </Field>
            <Field label="Batas panggilan / menit">
              <Input type="number" inputMode="numeric" min={1} max={6000} value={rate} onChange={(e) => setRate(e.target.value)} />
            </Field>
          </div>
          {error && <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>Batal</Button>
            <Button type="submit" loading={create.isPending}>Buat token</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TokenItem({ t, canEdit, onRotate, onRevoke }: { t: McpTokenRow; canEdit: boolean; onRotate: () => void; onRevoke: () => void }) {
  const st = STATUS_BADGE[t.status];
  const live = t.status === 'active';
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0 flex-1 basis-64 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="break-all font-medium text-foreground">{t.name}</span>
          <Badge variant={st.variant}>{st.label}</Badge>
        </div>
        <p className="font-mono text-xs text-muted-foreground">{t.prefix}…</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <dt>Aktor default</dt>
          <dd className="truncate text-foreground">{t.defaultActorName ?? 'Tidak ada (assertion wajib)'}</dd>
          <dt>Kedaluwarsa</dt>
          <dd className="text-foreground">{t.expiresAt ? formatDate(t.expiresAt) : 'Tidak ada'}</dd>
          <dt>Terakhir dipakai</dt>
          <dd className="text-foreground">
            {t.lastUsedAt ? (
              <time dateTime={t.lastUsedAt} title={formatDateTime(t.lastUsedAt)}>
                {formatRelativeTime(t.lastUsedAt)}{t.lastUsedIp ? ` · ${t.lastUsedIp}` : ''}
              </time>
            ) : 'Belum pernah'}
          </dd>
          <dt>Batas</dt>
          <dd className="text-foreground">{t.rateLimitPerMin} panggilan/menit</dd>
        </dl>
      </div>
      {canEdit && live && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onRotate}><RefreshCw aria-hidden />Putar secret</Button>
          <Button type="button" variant="outline" size="sm" onClick={onRevoke} className="text-danger-text"><ShieldOff aria-hidden />Cabut</Button>
        </div>
      )}
    </li>
  );
}

/** Manajemen token MCP: buat (tampil sekali), cabut, putar signing secret. */
export function McpTokensCard() {
  const qc = useQueryClient();
  const canEdit = can('settings', 'edit');
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [rotating, setRotating] = useState<McpTokenRow | null>(null);
  const [revoking, setRevoking] = useState<McpTokenRow | null>(null);

  const { data: tokens, isLoading, error } = useQuery<McpTokenRow[]>({
    queryKey: MCP_TOKENS_KEY,
    queryFn: async () => (await api.get('/ai/mcp/tokens')).data,
  });

  const rotate = useMutation({
    mutationFn: async (t: McpTokenRow) => (await api.post(`/ai/mcp/tokens/${t.id}/rotate-secret`)).data as { name: string; signingSecret: string },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: MCP_TOKENS_KEY });
      setRevealed({ title: 'Signing secret baru', name: d.name, signingSecret: d.signingSecret });
    },
    onError: (e) => toast.error(apiError(e, 'Gagal memutar signing secret.')),
  });

  const revoke = useMutation({
    mutationFn: async (t: McpTokenRow) => api.post(`/ai/mcp/tokens/${t.id}/revoke`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MCP_TOKENS_KEY });
      qc.invalidateQueries({ queryKey: MCP_STATUS_KEY });
      toast.success('Token dicabut. Panggilan dengan token ini ditolak.');
    },
    onError: (e) => toast.error(apiError(e, 'Gagal mencabut token.')),
  });

  return (
    <SettingsCard
      title="Token MCP"
      description="Satu token per profil engine AIRA. Identitas pengguna dikirim per pesan lewat actor assertion bertanda tangan (HMAC dengan signing secret token)."
      actions={canEdit && <Button type="button" size="sm" onClick={() => setCreating(true)}><Plus aria-hidden />Buat token</Button>}
    >
      {isLoading ? (
        <LoadingState label="Memuat token MCP…" />
      ) : error ? (
        <p role="alert" className="text-sm text-danger-text">{apiError(error, 'Gagal memuat token.')}</p>
      ) : !tokens || tokens.length === 0 ? (
        <EmptyState title="Belum ada token" description="Buat token untuk menghubungkan profil engine AIRA ke Entaris." />
      ) : (
        <ul className="space-y-3" aria-label="Daftar token MCP">
          {tokens.map((t) => (
            <TokenItem key={t.id} t={t} canEdit={canEdit} onRotate={() => setRotating(t)} onRevoke={() => setRevoking(t)} />
          ))}
        </ul>
      )}

      <CreateDialog open={creating} onClose={() => setCreating(false)} onCreated={(r) => { setCreating(false); setRevealed(r); }} />
      <RevealDialog revealed={revealed} onClose={() => setRevealed(null)} />

      <ConfirmDialog
        open={rotating !== null}
        onOpenChange={(o) => !o && setRotating(null)}
        tone="danger"
        title={`Putar signing secret "${rotating?.name ?? ''}"?`}
        description="Secret lama berhenti berlaku seketika; actor assertion yang ditandatangani dengan secret lama akan ditolak sampai engine AIRA memakai secret baru."
        confirmLabel="Putar secret"
        onConfirm={() => (rotating ? rotate.mutateAsync(rotating) : undefined)}
      />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        tone="danger"
        title={`Cabut token "${revoking?.name ?? ''}"?`}
        description="Token tidak dapat dipakai lagi dan pencabutan tidak dapat dibatalkan. Buat token baru bila engine AIRA masih perlu terhubung."
        confirmLabel="Cabut token"
        onConfirm={() => (revoking ? revoke.mutateAsync(revoking) : undefined)}
      />
    </SettingsCard>
  );
}
