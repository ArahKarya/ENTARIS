/**
 * Notifikasi (/notifications) — list-kit page (see pages/SalesInvoices.tsx).
 *
 * URL: ?q= (title/message) &isRead=true|false &type=<notification type> &page/size.
 * Data: GET /notifications in paged mode ({ data, total, page, limit, unreadCount })
 * and GET /notifications/types for the type filter. The topbar bell keeps
 * using the legacy unpaged call.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Ban,
  CalendarClock,
  CheckCheck,
  ClipboardCheck,
  CreditCard,
  ExternalLink,
  FileWarning,
  Info,
  Package,
  ShieldCheck,
  Truck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import type { StatusTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import { notificationLink, currentUserRole } from '@/lib/notificationNav';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DataTable,
  FilterBar,
  PageHeader,
  RowActions,
  StatusBadge,
  listTableProps,
  type Paginated,
} from '@/components/shared';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

type NotificationPage = Paginated<NotificationRow> & { unreadCount: number };

interface TypeCount {
  type: string;
  count: number;
}

interface TypeMeta {
  label: string;
  tone: StatusTone;
  icon: LucideIcon;
}

const ENDPOINT = '/notifications';
const FILTER_KEYS = ['isRead', 'type'] as const;
const READ_FILTER = [
  { value: 'false', label: 'Belum dibaca' },
  { value: 'true', label: 'Sudah dibaca' },
];
const ALL = '__all__';

const TYPE_META: Record<string, TypeMeta> = {
  invoice_overdue: { label: 'Faktur Jatuh Tempo', tone: 'danger', icon: FileWarning },
  payment_received: { label: 'Pembayaran', tone: 'success', icon: CreditCard },
  low_stock: { label: 'Stok Rendah', tone: 'warning', icon: Package },
  approval_pending: { label: 'Menunggu Persetujuan', tone: 'warning', icon: ClipboardCheck },
  approval_approved: { label: 'Disetujui', tone: 'success', icon: CheckCheck },
  approval_rejected: { label: 'Ditolak', tone: 'danger', icon: Ban },
  approval_revision: { label: 'Perlu Revisi', tone: 'warning', icon: FileWarning },
  quotation_expiring: { label: 'Penawaran Kedaluwarsa', tone: 'warning', icon: CalendarClock },
  guarantee_due: { label: 'Jaminan Jatuh Tempo', tone: 'warning', icon: ShieldCheck },
  po_overdue: { label: 'PO Terlambat', tone: 'danger', icon: Truck },
  wo_overdue: { label: 'WO Terlambat', tone: 'danger', icon: Wrench },
  wo_assigned: { label: 'WO Ditugaskan', tone: 'info', icon: Wrench },
  wo_completed: { label: 'WO Selesai', tone: 'success', icon: Wrench },
  mr_pending: { label: 'Permintaan Material', tone: 'warning', icon: ClipboardCheck },
  mr_approved: { label: 'Permintaan Disetujui', tone: 'success', icon: CheckCheck },
  mr_rejected: { label: 'Permintaan Ditolak', tone: 'danger', icon: Ban },
  calibration_due: { label: 'Kalibrasi', tone: 'warning', icon: CalendarClock },
  document_expiring: { label: 'Dokumen Kedaluwarsa', tone: 'warning', icon: CalendarClock },
  rental_expiring: { label: 'Sewa Berakhir', tone: 'warning', icon: CalendarClock },
  system: { label: 'Sistem', tone: 'neutral', icon: Info },
};

const ICON_TONE: Record<StatusTone, string> = {
  neutral: 'bg-neutral-subtle text-neutral-text',
  primary: 'bg-primary-subtle text-primary-subtle-foreground',
  info: 'bg-info-subtle text-info-text',
  success: 'bg-success-subtle text-success-text',
  warning: 'bg-warning-subtle text-warning-text',
  danger: 'bg-danger-subtle text-danger-text',
};

function typeMeta(type: string): TypeMeta {
  return TYPE_META[type] ?? { label: type.replace(/_/g, ' '), tone: 'neutral', icon: Info };
}

/** "Baru saja" / "5 menit lalu" / "3 jam lalu" / "2 hari lalu", then the date. */
function relativeTime(value: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'Baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return formatDate(value);
}

export const Notifications = () => {
  const list = useListState({ filters: FILTER_KEYS });
  const [density, setDensity] = useTableDensity();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const listQuery = useQuery({
    queryKey: ['notifications', 'list', list.params],
    queryFn: async () => (await api.get<NotificationPage>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });

  const typesQuery = useQuery({
    queryKey: ['notifications', 'types'],
    queryFn: async () => (await api.get<{ data: TypeCount[] }>(`${ENDPOINT}/types`)).data.data,
    staleTime: 60_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-all'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`${ENDPOINT}/${id}/read`),
    onSuccess: invalidate,
    onError: () => toast.error('Gagal menandai notifikasi.'),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.patch(`${ENDPOINT}/read-all`),
    onSuccess: () => {
      invalidate();
      toast.success('Semua notifikasi ditandai sudah dibaca.');
    },
    onError: () => toast.error('Gagal menandai semua notifikasi.'),
  });

  const openNotification = (n: NotificationRow) => {
    if (!n.isRead) markRead.mutate(n.id);
    const to = notificationLink(n, currentUserRole());
    if (to) navigate(to);
  };

  const columns = useMemo<ColumnDef<NotificationRow>[]>(
    () => [
      {
        id: 'notification',
        header: 'Notifikasi',
        meta: { cellClassName: 'min-w-56' },
        cell: ({ row }) => {
          const n = row.original;
          const meta = typeMeta(n.type);
          const Icon = meta.icon;
          return (
            <div className="flex items-start gap-3">
              <span
                className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md', ICON_TONE[meta.tone])}
                aria-hidden
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('break-words text-foreground', n.isRead ? 'font-normal' : 'font-semibold')}>
                  {!n.isRead && (
                    <>
                      <span className="mr-1.5 inline-block size-2 rounded-full bg-primary align-middle" aria-hidden />
                      <span className="sr-only">Belum dibaca: </span>
                    </>
                  )}
                  {n.title}
                </p>
                <p className="line-clamp-2 text-sm break-words text-muted-foreground group-data-[density=compact]/table:line-clamp-1">
                  {n.message}
                </p>
                {/* Mobile: type and time stacked here because their columns are hidden. */}
                <div className="mt-1 flex flex-wrap items-center gap-2 sm:hidden">
                  <StatusBadge tone={meta.tone} label={meta.label} />
                  <span className="text-xs text-muted-foreground">{relativeTime(n.createdAt)}</span>
                </div>
              </div>
            </div>
          );
        },
      },
      {
        id: 'type',
        header: 'Jenis',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => {
          const meta = typeMeta(row.original.type);
          return <StatusBadge tone={meta.tone} label={meta.label} />;
        },
      },
      {
        id: 'createdAt',
        header: 'Waktu',
        meta: { hideBelow: 'sm', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => (
          <time dateTime={row.original.createdAt} title={formatDateTime(row.original.createdAt)}>
            {relativeTime(row.original.createdAt)}
          </time>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const n = row.original;
          const hasLink = !!notificationLink(n, currentUserRole());
          return (
            <RowActions
              label={`Aksi untuk notifikasi ${n.title}`}
              actions={[
                { label: 'Buka', icon: ExternalLink, hidden: !hasLink, onSelect: () => openNotification(n) },
                { label: 'Tandai sudah dibaca', icon: CheckCheck, hidden: n.isRead, onSelect: () => markRead.mutate(n.id) },
              ]}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const unreadCount = listQuery.data?.unreadCount;
  const typeOptions = typesQuery.data ?? [];

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Notifikasi"
        description={
          unreadCount === undefined
            ? 'Pemberitahuan sistem untuk akun Anda.'
            : unreadCount > 0
              ? `${formatNumber(unreadCount)} notifikasi belum dibaca.`
              : 'Semua notifikasi sudah dibaca.'
        }
        actions={
          <Button
            variant="outline"
            onClick={() => markAllRead.mutate()}
            loading={markAllRead.isPending}
            disabled={!unreadCount}
          >
            <CheckCheck aria-hidden />
            Tandai Semua Dibaca
          </Button>
        }
      />

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari notifikasi"
          searchPlaceholder="Cari judul atau isi notifikasi"
          status={{ key: 'isRead', options: READ_FILTER, label: 'Status baca', allLabel: 'Semua status' }}
        >
          <div className="w-[calc(50%-0.25rem)] sm:w-56">
            <label htmlFor="notifications-type" className="sr-only">
              Jenis notifikasi
            </label>
            <Select
              value={list.filters.type || ALL}
              onValueChange={(v) => list.setFilter('type', v === ALL ? '' : v)}
            >
              <SelectTrigger id="notifications-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Semua jenis</SelectItem>
                {/* Keep a filtered type selectable even if it no longer has rows. */}
                {list.filters.type && !typeOptions.some((t) => t.type === list.filters.type) && (
                  <SelectItem value={list.filters.type}>{typeMeta(list.filters.type).label}</SelectItem>
                )}
                {typeOptions.map((t) => (
                  <SelectItem key={t.type} value={t.type}>
                    {typeMeta(t.type).label} ({formatNumber(t.count)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </FilterBar>

        <DataTable
          {...listTableProps(list, listQuery.data?.total)}
          label="Daftar notifikasi"
          itemLabel="notifikasi"
          columns={columns}
          data={listQuery.data?.data}
          getRowId={(row) => row.id}
          loading={listQuery.isLoading}
          fetching={listQuery.isFetching && listQuery.isPlaceholderData}
          error={listQuery.error}
          onRetry={() => listQuery.refetch()}
          onRowClick={openNotification}
          rowClassName={(row) => (row.isRead ? undefined : 'bg-primary-subtle/40')}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: 'Belum ada notifikasi',
            description: 'Pemberitahuan jatuh tempo, stok, dan persetujuan akan muncul di sini.',
          }}
        />
      </div>
    </div>
  );
};

