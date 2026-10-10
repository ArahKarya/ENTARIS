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
import { TIER_LABEL } from '@/lib/mcpEndpoint';

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
const STATUS_FILTER = [
  { value: 'active', label: 'Aktif' },
  { value: 'inactive', label: 'Nonaktif' },
];

function apiError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } } };
  return e.response?.data?.error || fallback;
}

function UserStatus({ user, className }: { user: UserRow; className?: string }) {
  return <StatusBadge status={user.isActive ? 'Active' : 'Inactive'} className={className} />;
}

export const UserManagement = () => {
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
      toast.success(`Pengguna ${user.fullName} ${user.isActive ? 'diaktifkan' : 'dinonaktifkan'}.`);
    },
    onError: (err) => toast.error(apiError(err, 'Gagal mengubah status pengguna.')),
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => api.put(`/users/${id}`, { password }),
    onSuccess: () => toast.success('Kata sandi diatur ulang.'),
    onError: (err) => toast.error(apiError(err, 'Gagal mengatur ulang kata sandi.')),
  });

  const linkMutation = useMutation({
    mutationFn: async (user: UserRow) => ({ user, ...(await api.post(`/users/${user.id}/telegram-link`)).data }),
    onSuccess: (d: LinkInfo) => setLinkInfo(d),
    onError: (err) => toast.error(apiError(err, 'Gagal membuat kode tautan.')),
  });

  const unlinkMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}/telegram`),
    onSuccess: () => {
      invalidate();
      toast.success('Tautan Telegram diputus.');
    },
    onError: (err) => toast.error(apiError(err, 'Gagal memutus tautan.')),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/telegram-test`),
    onSuccess: (res) => toast.success(res.data?.message || 'Pesan uji terkirim.'),
    onError: (err) => toast.error(apiError(err, 'Tes gagal.')),
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
        header: 'Nama',
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
        header: 'Nama Pengguna',
        enableSorting: true,
        meta: { hideBelow: 'md', cellClassName: 'font-mono text-xs text-muted-foreground' },
        cell: ({ row }) => row.original.username,
      },
      {
        id: 'email',
        header: 'Email',
        enableSorting: true,
        meta: { hideBelow: 'lg', cellClassName: 'max-w-64 truncate text-muted-foreground' },
        cell: ({ row }) => row.original.email,
      },
      {
        id: 'role',
        header: 'Peran',
        enableSorting: true,
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <span className="whitespace-nowrap">{roleName(row.original.role)}</span>,
      },
      {
        id: 'supervisor',
        header: 'Atasan',
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
        header: 'Status',
        cell: ({ row }) => <UserStatus user={row.original} />,
      },
      {
        id: 'lastLoginAt',
        header: 'Login Terakhir',
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'lg', cellClassName: 'whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => {
          const at = row.original.lastLoginAt;
          if (!at) return <span>Belum pernah</span>;
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
            label={row.original.telegramLinked ? 'Tertaut' : 'Belum'}
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
              label={TIER_LABEL[row.original.airaTier ?? 'standard']}
              tone={row.original.airaTier === 'direct' ? 'warning' : row.original.airaTier === 'read' ? 'info' : 'success'}
              className="whitespace-nowrap"
            />
          ) : (
            <span className="text-muted-foreground">Nonaktif</span>
          ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const u = row.original;
          const isSelf = u.id === selfId;
          return (
            <RowActions
              label={`Aksi untuk ${u.fullName}`}
              actions={[
                { label: 'Ubah', icon: Pencil, hidden: !canEdit, onSelect: () => setForm({ open: true, user: u }) },
                {
                  label: 'Atur ulang kata sandi',
                  icon: KeyRound,
                  hidden: !canEdit,
                  onSelect: () => openPending({ kind: 'reset', user: u }),
                },
                {
                  label: u.telegramLinked ? 'Tautkan ulang Telegram' : 'Hubungkan Telegram',
                  icon: Send,
                  hidden: !canEdit,
                  onSelect: () => linkMutation.mutate(u),
                },
                {
                  label: 'Tes Telegram',
                  icon: Send,
                  hidden: !canEdit || !u.telegramLinked,
                  onSelect: () => testMutation.mutate(u.id),
                },
                {
                  label: 'Aktifkan',
                  icon: ToggleLeft,
                  hidden: !canEdit || u.isActive,
                  onSelect: () => openPending({ kind: 'toggle', user: u }),
                },
                {
                  label: 'Putuskan Telegram',
                  icon: Link2Off,
                  tone: 'danger',
                  hidden: !canEdit || !u.telegramLinked,
                  onSelect: () => openPending({ kind: 'unlink', user: u }),
                },
                {
                  label: isSelf ? 'Nonaktifkan (akun sendiri)' : 'Nonaktifkan',
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
    [canEdit, selfId, roleName, linkMutation, testMutation],
  );

  const dialogCopy = pending ? confirmCopy(pending) : null;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Manajemen Pengguna"
        description="Kelola akun, peran dan status pengguna aplikasi."
        actions={
          canEdit ? (
            <Button onClick={() => setForm({ open: true, user: null })}>
              <Plus aria-hidden />
              Tambah Pengguna
            </Button>
          ) : undefined
        }
      />

      <section aria-label="Ringkasan pengguna sesuai filter" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Jumlah Pengguna"
          icon={Users}
          loading={!summary && !summaryQuery.isError}
          value={summary ? formatNumber(summary.total) : '—'}
        />
        <StatCard
          label="Aktif"
          icon={UserCheck}
          loading={!summary && !summaryQuery.isError}
          value={summary ? formatNumber(summary.active) : '—'}
          hint="dapat masuk ke aplikasi"
        />
        <StatCard
          label="Nonaktif"
          icon={UserX}
          loading={!summary && !summaryQuery.isError}
          value={summary ? formatNumber(summary.inactive) : '—'}
          hint="akses diblokir"
        />
        <StatCard
          label="Telegram Tertaut"
          icon={Send}
          loading={!summary && !summaryQuery.isError}
          value={summary ? formatNumber(summary.telegramLinked) : '—'}
          hint="menerima notifikasi"
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari pengguna"
          searchPlaceholder="Cari nama, email atau nama pengguna"
          status={{ options: STATUS_FILTER }}
        >
          <ComboboxFilter
            label="Peran"
            allLabel="Semua peran"
            value={list.filters.role}
            onChange={(v) => list.setFilter('role', v)}
            options={roleOptions}
            loading={rolesQuery.isLoading}
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, total)}
          label="Daftar pengguna"
          itemLabel="pengguna"
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
            title: 'Belum ada pengguna',
            description: 'Akun pengguna yang Anda buat akan muncul di sini.',
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
            label="Kata sandi baru"
            required
            error={passwordErr}
            hint="Minimal 8 karakter, berisi huruf besar, angka dan karakter spesial."
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
                <DialogTitle>Hubungkan Telegram</DialogTitle>
                <DialogDescription>{linkInfo.user.fullName}</DialogDescription>
              </DialogHeader>
              {linkUserLive?.telegramLinked ? (
                <div className="space-y-3 text-sm">
                  <p role="status" className="rounded-md bg-success-subtle px-3 py-2 text-success-text">
                    Telegram <b>{linkInfo.user.fullName}</b> sudah tertaut. Notifikasi akan dikirim ke pesan pribadinya.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testMutation.mutate(linkInfo.user.id)}
                    loading={testMutation.isPending}
                  >
                    <Send aria-hidden />
                    Kirim pesan uji
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  <p className="text-muted-foreground">
                    Minta <b className="text-foreground">{linkInfo.user.fullName}</b> melakukan langkah berikut di ponselnya:
                  </p>
                  <ol className="ml-5 list-decimal space-y-1 text-muted-foreground">
                    <li>
                      Buka tautan bot di bawah lalu tekan <b>Start</b> (atau kirim{' '}
                      <code className="font-mono">/start {linkInfo.code}</code> ke bot).
                    </li>
                    <li>
                      Status berubah menjadi <b>Tertaut</b> dalam kurang dari 1 menit.
                    </li>
                  </ol>
                  {linkInfo.deepLink ? (
                    <div className="flex items-center gap-2">
                      <Input readOnly value={linkInfo.deepLink} aria-label="Tautan bot" className="font-mono text-xs" />
                      <Button
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(linkInfo.deepLink!);
                          toast.success('Tautan disalin.');
                        }}
                      >
                        <Copy aria-hidden />
                        Salin
                      </Button>
                    </div>
                  ) : (
                    <p className="rounded-md bg-warning-subtle px-3 py-2 text-warning-text">
                      Bot belum dikonfigurasi. Atur dulu di <b>Pengaturan → Notifikasi</b>. Kode tautan:{' '}
                      <code className="font-mono">{linkInfo.code}</code>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground" aria-live="polite">
                    Menunggu pengguna menekan Start… status diperbarui otomatis.
                  </p>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setLinkInfo(null)}>
                  Tutup
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

function confirmCopy(p: Pending): {
  title: string;
  description: string;
  confirmLabel: string;
  tone: 'default' | 'danger';
} {
  const name = p.user.fullName;
  switch (p.kind) {
    case 'reset':
      return {
        title: `Atur ulang kata sandi ${name}?`,
        description: 'Kata sandi lama langsung tidak berlaku. Sampaikan kata sandi baru kepada pengguna secara aman.',
        confirmLabel: 'Atur ulang',
        tone: 'default',
      };
    case 'unlink':
      return {
        title: `Putuskan Telegram ${name}?`,
        description: 'Pengguna tidak lagi menerima notifikasi Telegram sampai ditautkan ulang.',
        confirmLabel: 'Putuskan',
        tone: 'danger',
      };
    case 'toggle':
      return p.user.isActive
        ? {
            title: `Nonaktifkan ${name}?`,
            description: 'Pengguna tidak dapat masuk ke aplikasi sampai diaktifkan kembali. Data dan riwayatnya tetap tersimpan.',
            confirmLabel: 'Nonaktifkan',
            tone: 'danger',
          }
        : {
            title: `Aktifkan ${name}?`,
            description: 'Pengguna dapat masuk kembali dengan kata sandinya.',
            confirmLabel: 'Aktifkan',
            tone: 'default',
          };
  }
}
