import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, RefreshCw, ShieldOff, TriangleAlert } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
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
  active: { labelKey: 'mcp.tokens.statusActive', variant: 'success' },
  revoked: { labelKey: 'mcp.tokens.statusRevoked', variant: 'neutral' },
  expired: { labelKey: 'mcp.tokens.statusExpired', variant: 'warning' },
} as const;

function apiError(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } }).response?.data?.error || fallback;
}

/** Tampilan sekali pakai untuk token + signing secret (tidak dapat dilihat lagi). */
function RevealDialog({ revealed, onClose }: { revealed: Revealed | null; onClose: () => void }) {
  const { t } = useTranslation('aira');
  const [saved, setSaved] = useState(false);
  return (
    <Dialog open={revealed !== null} onOpenChange={(open) => { if (!open && saved) { setSaved(false); onClose(); } }}>
      <DialogContent size="md" hideClose>
        {revealed && (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{revealed.title}</DialogTitle>
              <DialogDescription>
                <Trans t={t} i18nKey="mcp.tokens.revealDescription" components={{ strong: <strong /> }} />
              </DialogDescription>
            </DialogHeader>

            {revealed.token && (
              <SecretField label={t('mcp.tokens.tokenField')} value={revealed.token} what={t('mcp.tokens.tokenWhat')} />
            )}
            <SecretField label={t('mcp.tokens.secretField')} value={revealed.signingSecret} what={t('mcp.tokens.secretWhat')} />

            <p className="flex items-start gap-2 rounded-md bg-warning-subtle px-3 py-2 text-xs text-warning-text">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{t('mcp.tokens.secretWarning')}</span>
            </p>

            <div className="flex items-center gap-2">
              <Checkbox id="mcp-secret-saved" checked={saved} onCheckedChange={(v) => setSaved(v === true)} />
              <Label htmlFor="mcp-secret-saved" className="text-sm font-normal text-foreground">
                {t('mcp.tokens.savedConfirm')}
              </Label>
            </div>

            <DialogFooter>
              <Button type="button" disabled={!saved} onClick={() => { setSaved(false); onClose(); }}>{t('mcp.tokens.done')}</Button>
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
  const { t } = useTranslation('aira');
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
      onCreated({ title: t('mcp.tokens.createdTitle'), name: d.name, token: d.token, signingSecret: d.signingSecret });
    },
    onError: (e) => setError(apiError(e, t('mcp.tokens.createFailed'))),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t('mcp.tokens.nameRequired'));
    setError('');
    create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !create.isPending && onClose()}>
      <DialogContent size="md">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t('mcp.tokens.createTitle')}</DialogTitle>
            <DialogDescription>{t('mcp.tokens.createDescription')}</DialogDescription>
          </DialogHeader>
          <Field label={t('mcp.tokens.nameLabel')} required hint={t('mcp.tokens.nameHint')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" />
          </Field>
          <Field label={t('mcp.tokens.defaultActorOptional')} hint={t('mcp.tokens.defaultActorHint')}>
            {(control) => (
              <Select value={actor} onValueChange={setActor}>
                <SelectTrigger {...control}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ACTOR}>{t('mcp.tokens.noActor')}</SelectItem>
                  {actorOptions.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('mcp.tokens.expiresOptional')} hint={t('mcp.tokens.expiresHint')}>
              {(control) => <DateInput id={control.id} value={expires} onChange={setExpires} min={new Date().toISOString().slice(0, 10)} />}
            </Field>
            <Field label={t('mcp.tokens.rateLimit')}>
              <Input type="number" inputMode="numeric" min={1} max={6000} value={rate} onChange={(e) => setRate(e.target.value)} />
            </Field>
          </div>
          {error && <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>{t('mcp.tokens.cancel')}</Button>
            <Button type="submit" loading={create.isPending}>{t('mcp.tokens.create')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TokenItem({ t, canEdit, onRotate, onRevoke }: { t: McpTokenRow; canEdit: boolean; onRotate: () => void; onRevoke: () => void }) {
  const { t: tr } = useTranslation('aira');
  const st = STATUS_BADGE[t.status];
  const live = t.status === 'active';
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0 flex-1 basis-64 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="break-all font-medium text-foreground">{t.name}</span>
          <Badge variant={st.variant}>{tr(st.labelKey)}</Badge>
        </div>
        <p className="font-mono text-xs text-muted-foreground">{t.prefix}…</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <dt>{tr('mcp.tokens.defaultActor')}</dt>
          <dd className="truncate text-foreground">{t.defaultActorName ?? tr('mcp.tokens.noActor')}</dd>
          <dt>{tr('mcp.tokens.expires')}</dt>
          <dd className="text-foreground">{t.expiresAt ? formatDate(t.expiresAt) : tr('mcp.tokens.none')}</dd>
          <dt>{tr('mcp.tokens.lastUsed')}</dt>
          <dd className="text-foreground">
            {t.lastUsedAt ? (
              <time dateTime={t.lastUsedAt} title={formatDateTime(t.lastUsedAt)}>
                {formatRelativeTime(t.lastUsedAt)}{t.lastUsedIp ? ` · ${t.lastUsedIp}` : ''}
              </time>
            ) : tr('mcp.tokens.never')}
          </dd>
          <dt>{tr('mcp.tokens.limit')}</dt>
          <dd className="text-foreground">{tr('mcp.tokens.perMinute', { rate: t.rateLimitPerMin })}</dd>
        </dl>
      </div>
      {canEdit && live && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onRotate}><RefreshCw aria-hidden />{tr('mcp.tokens.rotate')}</Button>
          <Button type="button" variant="outline" size="sm" onClick={onRevoke} className="text-danger-text"><ShieldOff aria-hidden />{tr('mcp.tokens.revoke')}</Button>
        </div>
      )}
    </li>
  );
}

/** Manajemen token MCP: buat (tampil sekali), cabut, putar signing secret. */
export function McpTokensCard() {
  const { t } = useTranslation('aira');
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
      setRevealed({ title: t('mcp.tokens.newSecretTitle'), name: d.name, signingSecret: d.signingSecret });
    },
    onError: (e) => toast.error(apiError(e, t('mcp.tokens.rotateFailed'))),
  });

  const revoke = useMutation({
    mutationFn: async (t: McpTokenRow) => api.post(`/ai/mcp/tokens/${t.id}/revoke`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MCP_TOKENS_KEY });
      qc.invalidateQueries({ queryKey: MCP_STATUS_KEY });
      toast.success(t('mcp.tokens.revoked'));
    },
    onError: (e) => toast.error(apiError(e, t('mcp.tokens.revokeFailed'))),
  });

  return (
    <SettingsCard
      title={t('mcp.tokens.title')}
      description={t('mcp.tokens.description')}
      actions={canEdit && <Button type="button" size="sm" onClick={() => setCreating(true)}><Plus aria-hidden />{t('mcp.tokens.create')}</Button>}
    >
      {isLoading ? (
        <LoadingState label={t('mcp.tokens.loading')} />
      ) : error ? (
        <p role="alert" className="text-sm text-danger-text">{apiError(error, t('mcp.tokens.loadFailed'))}</p>
      ) : !tokens || tokens.length === 0 ? (
        <EmptyState title={t('mcp.tokens.emptyTitle')} description={t('mcp.tokens.emptyDescription')} />
      ) : (
        <ul className="space-y-3" aria-label={t('mcp.tokens.listLabel')}>
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
        title={t('mcp.tokens.rotateTitle', { name: rotating?.name ?? '' })}
        description={t('mcp.tokens.rotateDescription')}
        confirmLabel={t('mcp.tokens.rotate')}
        onConfirm={() => (rotating ? rotate.mutateAsync(rotating) : undefined)}
      />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        tone="danger"
        title={t('mcp.tokens.revokeTitle', { name: revoking?.name ?? '' })}
        description={t('mcp.tokens.revokeDescription')}
        confirmLabel={t('mcp.tokens.revokeConfirm')}
        onConfirm={() => (revoking ? revoke.mutateAsync(revoking) : undefined)}
      />
    </SettingsCard>
  );
}
