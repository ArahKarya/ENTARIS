/** Notifications (/notifications), paged; the topbar bell still uses the unpaged call. */
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
  NotebookPen,
  Package,
  ShieldCheck,
  Truck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import type shellId from '@/locales/id/shell.json';
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

type TypeKey = keyof (typeof shellId)['notifications']['types'];

interface TypeMeta {
  label: string;
  tone: StatusTone;
  icon: LucideIcon;
}

const ENDPOINT = '/notifications';
const FILTER_KEYS = ['isRead', 'type'] as const;
const readFilter = () => [
  { value: 'false', label: i18n.t('notifications.unread', { ns: 'shell' }) },
  { value: 'true', label: i18n.t('notifications.read', { ns: 'shell' }) },
];
const ALL = '__all__';

/** Label: `shell:notifications.types.<key>`. */
const TYPE_META: Record<string, { key: TypeKey; tone: StatusTone; icon: LucideIcon }> = {
  invoice_overdue: { key: 'invoice_overdue', tone: 'danger', icon: FileWarning },
  payment_received: { key: 'payment_received', tone: 'success', icon: CreditCard },
  low_stock: { key: 'low_stock', tone: 'warning', icon: Package },
  approval_pending: { key: 'approval_pending', tone: 'warning', icon: ClipboardCheck },
  approval_approved: { key: 'approval_approved', tone: 'success', icon: CheckCheck },
  approval_rejected: { key: 'approval_rejected', tone: 'danger', icon: Ban },
  approval_revision: { key: 'approval_revision', tone: 'warning', icon: FileWarning },
  quotation_expiring: { key: 'quotation_expiring', tone: 'warning', icon: CalendarClock },
  guarantee_due: { key: 'guarantee_due', tone: 'warning', icon: ShieldCheck },
  po_overdue: { key: 'po_overdue', tone: 'danger', icon: Truck },
  cash_book_draft: { key: 'cash_book_draft', tone: 'info', icon: NotebookPen },
  wo_overdue: { key: 'wo_overdue', tone: 'danger', icon: Wrench },
  wo_assigned: { key: 'wo_assigned', tone: 'info', icon: Wrench },
  wo_completed: { key: 'wo_completed', tone: 'success', icon: Wrench },
  mr_pending: { key: 'mr_pending', tone: 'warning', icon: ClipboardCheck },
  mr_approved: { key: 'mr_approved', tone: 'success', icon: CheckCheck },
  mr_rejected: { key: 'mr_rejected', tone: 'danger', icon: Ban },
  calibration_due: { key: 'calibration_due', tone: 'warning', icon: CalendarClock },
  document_expiring: { key: 'document_expiring', tone: 'warning', icon: CalendarClock },
  rental_expiring: { key: 'rental_expiring', tone: 'warning', icon: CalendarClock },
  system: { key: 'system', tone: 'neutral', icon: Info },
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
  const meta = TYPE_META[type];
  if (!meta) return { label: type.replace(/_/g, ' '), tone: 'neutral', icon: Info };
  return { label: i18n.t(`notifications.types.${meta.key}`, { ns: 'shell' }), tone: meta.tone, icon: meta.icon };
}

/** "Baru saja" / "5 menit lalu" / "3 jam lalu" / "2 hari lalu", then the date. */
function relativeTime(value: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(value).getTime()) / 60000);
  if (minutes < 1) return i18n.t('relativeTime.justNow', { ns: 'common' });
  if (minutes < 60) return i18n.t('relativeTime.minutesAgo', { ns: 'common', count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return i18n.t('relativeTime.hoursAgo', { ns: 'common', count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return i18n.t('relativeTime.daysAgo', { ns: 'common', count: days });
  return formatDate(value);
}

export const Notifications = () => {
  const { t } = useTranslation(['shell', 'common']);
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
    onError: () => toast.error(t('notifications.markFailed')),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.patch(`${ENDPOINT}/read-all`),
    onSuccess: () => {
      invalidate();
      toast.success(t('notifications.allMarked'));
    },
    onError: () => toast.error(t('notifications.markAllFailed')),
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
        header: t('notifications.columns.notification'),
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
                      <span className="sr-only">{t('notifications.unreadPrefix')} </span>
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
        header: t('notifications.columns.type'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => {
          const meta = typeMeta(row.original.type);
          return <StatusBadge tone={meta.tone} label={meta.label} />;
        },
      },
      {
        id: 'createdAt',
        header: t('notifications.columns.time'),
        meta: { hideBelow: 'sm', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => (
          <time dateTime={row.original.createdAt} title={formatDateTime(row.original.createdAt)}>
            {relativeTime(row.original.createdAt)}
          </time>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('common:labels.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const n = row.original;
          const hasLink = !!notificationLink(n, currentUserRole());
          return (
            <RowActions
              label={t('notifications.rowActions', { title: n.title })}
              actions={[
                { label: t('common:actions.open'), icon: ExternalLink, hidden: !hasLink, onSelect: () => openNotification(n) },
                { label: t('notifications.markRead'), icon: CheckCheck, hidden: n.isRead, onSelect: () => markRead.mutate(n.id) },
              ]}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );

  const unreadCount = listQuery.data?.unreadCount;
  const typeOptions = typesQuery.data ?? [];

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={t('notifications.title')}
        description={
          unreadCount === undefined
            ? t('notifications.description')
            : unreadCount > 0
              ? t('notifications.unreadCount', { count: unreadCount, formatted: formatNumber(unreadCount) })
              : t('notifications.allRead')
        }
        actions={
          <Button
            variant="outline"
            onClick={() => markAllRead.mutate()}
            loading={markAllRead.isPending}
            disabled={!unreadCount}
          >
            <CheckCheck aria-hidden />
            {t('notifications.markAllRead')}
          </Button>
        }
      />

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('notifications.searchLabel')}
          searchPlaceholder={t('notifications.searchPlaceholder')}
          status={{
            key: 'isRead',
            options: readFilter(),
            label: t('notifications.readStatus'),
            allLabel: t('common:filters.allStatuses'),
          }}
        >
          <div className="w-[calc(50%-0.25rem)] sm:w-56">
            <label htmlFor="notifications-type" className="sr-only">
              {t('notifications.typeFilter')}
            </label>
            <Select
              value={list.filters.type || ALL}
              onValueChange={(v) => list.setFilter('type', v === ALL ? '' : v)}
            >
              <SelectTrigger id="notifications-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('notifications.allTypes')}</SelectItem>
                {/* Keep a filtered type selectable even if it no longer has rows. */}
                {list.filters.type && !typeOptions.some((opt) => opt.type === list.filters.type) && (
                  <SelectItem value={list.filters.type}>{typeMeta(list.filters.type).label}</SelectItem>
                )}
                {typeOptions.map((opt) => (
                  <SelectItem key={opt.type} value={opt.type}>
                    {typeMeta(opt.type).label} ({formatNumber(opt.count)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </FilterBar>

        <DataTable
          {...listTableProps(list, listQuery.data?.total)}
          label={t('notifications.tableLabel')}
          itemLabel={t('notifications.itemLabel')}
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
            title: t('notifications.emptyTitle'),
            description: t('notifications.emptyDescription'),
          }}
        />
      </div>
    </div>
  );
};

