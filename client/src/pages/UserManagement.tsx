/**
 * User management (/users). Writes are hidden without users:edit. The server never sends password
 * hashes and sends Telegram chat ids as a boolean; lockout is not modelled, so there is no unlock action.
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Copy,
  KeyRound,
  Link2Off,
  Pencil,
  Plus,
  Send,
  ToggleLeft,
  ToggleRight,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import api from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { formatRelativeTime } from '@/lib/auditDiff';
import { passwordError } from '@/lib/userValidation';
import { can, getStoredUser } from '@/lib/permissions';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { initials, roleLabel } from '@/components/shell/role-label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ComboboxFilter,
  ConfirmDialog,
  DataTable,
  Field,
  FilterBar,
  PageHeader,
  RowActions,
  StatCard,
  StatusBadge,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import UserFormModal from '@/components/UserFormModal';

interface UserRow {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  telegramLinked?: boolean;
  supervisor?: { id: string; fullName: string } | null;
  airaEnabled?: boolean;
  airaTier?: 'read' | 'standard' | 'direct';
  airaJabatan?: string | null;
}

interface UserSummary {
  total: number;
  active: number;
  inactive: number;
  telegramLinked: number;
}

interface RoleOption {
  key: string;
  name: string;
}

interface LinkInfo {
  user: UserRow;
  code: string;
  deepLink: string | null;
  botUsername: string | null;
}

type Pending =
  | { kind: 'toggle'; user: UserRow }
  | { kind: 'reset'; user: UserRow }
  | { kind: 'unlink'; user: UserRow };

const ENDPOINT = '/users';
const FILTER_KEYS = ['role', 'status'] as const;

function apiError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } } };
  return e.response?.data?.error || fallback;
}

function UserStatus({ user, className }: { user: UserRow; className?: string }) {
  return <StatusBadge status={user.isActive ? 'Active' : 'Inactive'} className={className} />;
}

export const UserManagement = () => {
  const { t } = useTranslation('settings');
  const statusFilter = [
    { value: 'active', label: t('users.status.active') },
    { value: 'inactive', label: t('users.status.inactive') },
  ];
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'createdAt', desc: true } });
  const [density, setDensity] = useTableDensity();
  const queryClient = useQueryClient();
  const canEdit = can('users', 'edit');
  const selfId = getStoredUser()?.id;

  const [form, setForm] = useState<{ open: boolean; user: UserRow | null }>({ open: false, user: null });
  const [pending, setPending] = useState<Pending | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordErr, setPasswordErr] = useState<string | undefined>();
  const [linkInfo, setLinkInfo] = useState<LinkInfo | null>(null);

  const usersQuery = useQuery({
    queryKey: ['users', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<UserRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
    // Saat dialog tautan Telegram terbuka, refresh berkala untuk mendeteksi status "Tertaut".
    refetchInterval: linkInfo ? 4000 : false,
  });

  const summaryQuery = useQuery({
    queryKey: ['users', 'summary', list.filterParams],
    queryFn: async () => (await api.get<UserSummary>(`${ENDPOINT}/summary`, { params: list.filterParams })).data,
    placeholderData: keepPreviousData,
  });

  const rolesQuery = useQuery<RoleOption[]>({
    queryKey: ['roles-assignable'],
    queryFn: async () => (await api.get('/roles/assignable')).data,
  });

  const roleName = useMemo(() => {
    const names = new Map((rolesQuery.data ?? []).map((r) => [r.key, r.name]));
    return (key: string) => {
      const label = roleLabel(key);
      return label !== key ? label : names.get(key) ?? key;
    };
  }, [rolesQuery.data]);

  const roleOptions = useMemo(
    () => (rolesQuery.data ?? []).map((r) => ({ value: r.key, label: roleName(r.key) })),
    [rolesQuery.data, roleName],
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => (await api.patch<UserRow>(`/users/${id}/toggle`)).data,
    onSuccess: (user) => {
      invalidate();
      toast.success(user.isActive ? t('users.toast.activated', { name: user.fullName }) : t('users.toast.deactivated', { name: user.fullName }));
    },
    onError: (err) => toast.error(apiError(err, t('users.toast.toggleError'))),
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => api.put(`/users/${id}`, { password }),
    onSuccess: () => toast.success(t('users.toast.passwordReset')),
    onError: (err) => toast.error(apiError(err, t('users.toast.passwordResetError'))),
  });

  const linkMutation = useMutation({
    mutationFn: async (user: UserRow) => ({ user, ...(await api.post(`/users/${user.id}/telegram-link`)).data }),
    onSuccess: (d: LinkInfo) => setLinkInfo(d),
    onError: (err) => toast.error(apiError(err, t('users.toast.linkError'))),
  });

  const unlinkMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}/telegram`),
    onSuccess: () => {
      invalidate();
      toast.success(t('users.toast.unlinked'));
    },
    onError: (err) => toast.error(apiError(err, t('users.toast.unlinkError'))),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/telegram-test`),
    onSuccess: (res) => toast.success(res.data?.message || t('users.toast.testSent')),
    onError: (err) => toast.error(apiError(err, t('users.toast.testError'))),
  });

  const openPending = (p: Pending) => {
    setNewPassword('');
    setPasswordErr(undefined);
    setPending(p);
  };

  const confirmPending = async () => {
    if (!pending) return;
    if (pending.kind === 'toggle') return toggleMutation.mutateAsync(pending.user.id);
    if (pending.kind === 'unlink') return unlinkMutation.mutateAsync(pending.user.id);
    const err = passwordError(newPassword);
    if (err) {
      setPasswordErr(err);
      throw new Error(err);
    }
    return resetMutation.mutateAsync({ id: pending.user.id, password: newPassword });
  };

  const users = usersQuery.data?.data;
  const total = usersQuery.data?.total;
  const summary = summaryQuery.data;
  const linkUserLive = linkInfo ? users?.find((u) => u.id === linkInfo.user.id) : null;

  const columns = useMemo<ColumnDef<UserRow>[]>(
    () => [
      {
        id: 'fullName',
        header: t('users.columns.name'),
        enableSorting: true,
        meta: { cellClassName: 'min-w-0 max-w-72' },
        cell: ({ row }) => {
          const u = row.original;
          return (
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary-subtle-foreground"
              >
                {initials(u.fullName)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{u.fullName}</p>
                <p className="truncate text-xs text-muted-foreground lg:hidden">{u.email}</p>
                <p className="truncate text-xs text-muted-foreground sm:hidden">{roleName(u.role)}</p>
              </div>
            </div>
          );
        },
      },
      {
        id: 'username',
        header: t('users.columns.username'),
        enableSorting: true,
        meta: { hideBelow: 'md', cellClassName: 'font-mono text-xs text-muted-foreground' },
        cell: ({ row }) => row.original.username,
      },
      {
        id: 'email',
        header: t('users.columns.email'),
        enableSorting: true,
        meta: { hideBelow: 'lg', cellClassName: 'max-w-64 truncate text-muted-foreground' },
        cell: ({ row }) => row.original.email,
      },
      {
        id: 'role',
        header: t('users.columns.role'),
        enableSorting: true,
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <span className="whitespace-nowrap">{roleName(row.original.role)}</span>,
      },
      {
        id: 'supervisor',
        header: t('users.columns.supervisor'),
        meta: { hideBelow: 'lg', cellClassName: 'max-w-48 truncate whitespace-nowrap' },
        cell: ({ row }) =>
          row.original.supervisor ? (
            <span title={row.original.supervisor.fullName}>{row.original.supervisor.fullName}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'status',
        header: t('users.columns.status'),
        cell: ({ row }) => <UserStatus user={row.original} />,
      },
      {
        id: 'lastLoginAt',
        header: t('users.columns.lastLogin'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'lg', cellClassName: 'whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => {
          const at = row.original.lastLoginAt;
          if (!at) return <span>{t('users.never')}</span>;
          return (
            <time dateTime={at} title={formatDateTime(at)}>
              {formatRelativeTime(at)}
            </time>
          );
        },
      },
      {
        id: 'telegram',
        header: 'Telegram',
        meta: { hideBelow: 'xl' },
        cell: ({ row }) => (
          <StatusBadge
            label={row.original.telegramLinked ? t('users.telegram.linked') : t('users.telegram.notLinked')}
            tone={row.original.telegramLinked ? 'success' : 'neutral'}
          />
        ),
      },
      {
        id: 'aira',
        header: 'AIRA',
        meta: { hideBelow: 'lg' },
        cell: ({ row }) =>
          row.original.airaEnabled ? (
            <StatusBadge
              label={t(`users.airaTier.${row.original.airaTier ?? 'standard'}`)}
              tone={row.original.airaTier === 'direct' ? 'warning' : row.original.airaTier === 'read' ? 'info' : 'success'}
              className="whitespace-nowrap"
            />
          ) : (
            <span className="text-muted-foreground">{t('users.status.inactive')}</span>
          ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('users.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const u = row.original;
          const isSelf = u.id === selfId;
          return (
            <RowActions
              label={t('users.actions.menuLabel', { name: u.fullName })}
              actions={[
                { label: t('users.actions.edit'), icon: Pencil, hidden: !canEdit, onSelect: () => setForm({ open: true, user: u }) },
                {
                  label: t('users.actions.resetPassword'),
                  icon: KeyRound,
                  hidden: !canEdit,
                  onSelect: () => openPending({ kind: 'reset', user: u }),
                },
                {
                  label: u.telegramLinked ? t('users.actions.relinkTelegram') : t('users.actions.linkTelegram'),
                  icon: Send,
                  hidden: !canEdit,
                  onSelect: () => linkMutation.mutate(u),
                },
                {
                  label: t('users.actions.testTelegram'),
                  icon: Send,
                  hidden: !canEdit || !u.telegramLinked,
                  onSelect: () => testMutation.mutate(u.id),
                },
                {
                  label: t('users.actions.activate'),
                  icon: ToggleLeft,
                  hidden: !canEdit || u.isActive,
                  onSelect: () => openPending({ kind: 'toggle', user: u }),
                },
                {
                  label: t('users.actions.unlinkTelegram'),
                  icon: Link2Off,
                  tone: 'danger',
                  hidden: !canEdit || !u.telegramLinked,
                  onSelect: () => openPending({ kind: 'unlink', user: u }),
                },
                {
                  label: isSelf ? t('users.actions.deactivateSelf') : t('users.actions.deactivate'),
                  icon: ToggleRight,
                  tone: 'danger',
                  disabled: isSelf,
                  hidden: !canEdit || !u.isActive,
                  onSelect: () => openPending({ kind: 'toggle', user: u }),
                },
              ]}
            />
          );
        },
      },
    ],
    [canEdit, selfId, roleName, linkMutation, testMutation, t],
  );

  const dialogCopy = pending ? confirmCopy(pending, t) : null;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={t('users.title')}
        description={t('users.description')}
        actions={
          canEdit ? (
            <Button onClick={() => setForm({ open: true, user: null })}>
              <Plus aria-hidden />
              {t('users.add')}
            </Button>
          ) : undefined
        }
      />

      <section aria-label={t('users.summary.label')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('users.summary.total')}
          icon={Users}
          loading={!summary && !summaryQuery.isError}
          value={summary ? formatNumber(summary.total) : '—'}
        />
        <StatCard
          label={t('users.status.active')}
          icon={UserCheck}
          loading={!summary && !summaryQuery.isError}
          value={summary ? formatNumber(summary.active) : '—'}
          hint={t('users.summary.activeHint')}
        />
        <StatCard
          label={t('users.status.inactive')}
          icon={UserX}
          loading={!summary && !summaryQuery.isError}
          value={summary ? formatNumber(summary.inactive) : '—'}
          hint={t('users.summary.inactiveHint')}
        />
        <StatCard
          label={t('users.summary.telegramLinked')}
          icon={Send}
          loading={!summary && !summaryQuery.isError}
          value={summary ? formatNumber(summary.telegramLinked) : '—'}
          hint={t('users.summary.telegramHint')}
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('users.search.label')}
          searchPlaceholder={t('users.search.placeholder')}
          status={{ options: statusFilter }}
        >
          <ComboboxFilter
            label={t('users.columns.role')}
            allLabel={t('users.filter.allRoles')}
            value={list.filters.role}
            onChange={(v) => list.setFilter('role', v)}
            options={roleOptions}
            loading={rolesQuery.isLoading}
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, total)}
          label={t('users.table.label')}
          itemLabel={t('users.table.itemLabel')}
          columns={columns}
          data={users}
          getRowId={(row) => row.id}
          loading={usersQuery.isLoading}
          fetching={usersQuery.isFetching && usersQuery.isPlaceholderData}
          error={usersQuery.error}
          onRetry={() => usersQuery.refetch()}
          onRowClick={canEdit ? (row) => setForm({ open: true, user: row }) : undefined}
          rowClassName={(row) => (row.isActive ? undefined : 'text-muted-foreground')}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: t('users.empty.title'),
            description: t('users.empty.description'),
          }}
        />
      </div>

      <UserFormModal
        isOpen={form.open}
        editUser={form.user}
        onClose={() => setForm({ open: false, user: null })}
      />

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={dialogCopy?.title ?? ''}
        description={dialogCopy?.description}
        tone={dialogCopy?.tone}
        confirmLabel={dialogCopy?.confirmLabel}
        onConfirm={confirmPending}
      >
        {pending?.kind === 'reset' && (
          <Field
            label={t('users.reset.newPassword')}
            required
            error={passwordErr}
            hint={t('users.reset.hint')}
          >
            <Input
              type="password"
              value={newPassword}
              autoComplete="new-password"
              onChange={(e) => {
                setNewPassword(e.target.value);
                setPasswordErr(undefined);
              }}
            />
          </Field>
        )}
      </ConfirmDialog>

      <Dialog open={linkInfo !== null} onOpenChange={(open) => !open && setLinkInfo(null)}>
        <DialogContent size="md">
          {linkInfo && (
            <>
              <DialogHeader>
                <DialogTitle>{t('users.actions.linkTelegram')}</DialogTitle>
                <DialogDescription>{linkInfo.user.fullName}</DialogDescription>
              </DialogHeader>
              {linkUserLive?.telegramLinked ? (
                <div className="space-y-3 text-sm">
                  <p role="status" className="rounded-md bg-success-subtle px-3 py-2 text-success-text">
                    <Trans t={t} i18nKey="users.link.linked" values={{ name: linkInfo.user.fullName }} components={{ b: <b /> }} />
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testMutation.mutate(linkInfo.user.id)}
                    loading={testMutation.isPending}
                  >
                    <Send aria-hidden />
                    {t('users.link.sendTest')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  <p className="text-muted-foreground">
                    <Trans t={t} i18nKey="users.link.intro" values={{ name: linkInfo.user.fullName }} components={{ b: <b className="text-foreground" /> }} />
                  </p>
                  <ol className="ml-5 list-decimal space-y-1 text-muted-foreground">
                    <li>
                      <Trans t={t} i18nKey="users.link.step1" values={{ command: `/start ${linkInfo.code}` }} components={{ b: <b />, code: <code className="font-mono" /> }} />
                    </li>
                    <li>
                      <Trans t={t} i18nKey="users.link.step2" components={{ b: <b /> }} />
                    </li>
                  </ol>
                  {linkInfo.deepLink ? (
                    <div className="flex items-center gap-2">
                      <Input readOnly value={linkInfo.deepLink} aria-label={t('users.link.botLink')} className="font-mono text-xs" />
                      <Button
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(linkInfo.deepLink!);
                          toast.success(t('users.link.copied'));
                        }}
                      >
                        <Copy aria-hidden />
                        {t('users.link.copy')}
                      </Button>
                    </div>
                  ) : (
                    <p className="rounded-md bg-warning-subtle px-3 py-2 text-warning-text">
                      <Trans t={t} i18nKey="users.link.botNotConfigured" values={{ code: linkInfo.code }} components={{ b: <b />, code: <code className="font-mono" /> }} />
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground" aria-live="polite">
                    {t('users.link.waiting')}
                  </p>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setLinkInfo(null)}>
                  {t('users.link.close')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

function confirmCopy(p: Pending, t: TFunction<'settings'>): {
  title: string;
  description: string;
  confirmLabel: string;
  tone: 'default' | 'danger';
} {
  const name = p.user.fullName;
  switch (p.kind) {
    case 'reset':
      return {
        title: t('users.confirm.reset.title', { name }),
        description: t('users.confirm.reset.description'),
        confirmLabel: t('users.confirm.reset.confirm'),
        tone: 'default',
      };
    case 'unlink':
      return {
        title: t('users.confirm.unlink.title', { name }),
        description: t('users.confirm.unlink.description'),
        confirmLabel: t('users.confirm.unlink.confirm'),
        tone: 'danger',
      };
    case 'toggle':
      return p.user.isActive
        ? {
            title: t('users.confirm.deactivate.title', { name }),
            description: t('users.confirm.deactivate.description'),
            confirmLabel: t('users.confirm.deactivate.confirm'),
            tone: 'danger',
          }
        : {
            title: t('users.confirm.activate.title', { name }),
            description: t('users.confirm.activate.description'),
            confirmLabel: t('users.confirm.activate.confirm'),
            tone: 'default',
          };
  }
}
