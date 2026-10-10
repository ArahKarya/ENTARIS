import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import {
  Ban,
  Bell,
  CheckCheck,
  ClipboardCheck,
  CreditCard,
  FileWarning,
  Info,
  Loader2,
  Package,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { LOCALE, formatDateTime } from '../lib/format';
import { notificationLink, currentUserRole } from '../lib/notificationNav';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

const LIST_LIMIT = 10;
const POLL_MS = 60_000;

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return i18n.t('relativeTime.justNow', { ns: 'common' });
  if (minutes < 60) return i18n.t('relativeTime.minutesAgo', { ns: 'common', count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return i18n.t('relativeTime.hoursAgo', { ns: 'common', count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return i18n.t('relativeTime.daysAgo', { ns: 'common', count: days });
  return new Date(dateStr).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
}

type Tone = 'danger' | 'success' | 'warning' | 'info';

const TONE_CLASS: Record<Tone, string> = {
  danger: 'bg-danger-subtle text-danger-text',
  success: 'bg-success-subtle text-success-text',
  warning: 'bg-warning-subtle text-warning-text',
  info: 'bg-info-subtle text-info-text',
};

const TYPE_META: Record<string, { icon: LucideIcon; tone: Tone }> = {
  invoice_overdue: { icon: FileWarning, tone: 'danger' },
  payment_received: { icon: CreditCard, tone: 'success' },
  low_stock: { icon: Package, tone: 'warning' },
  approval_pending: { icon: ClipboardCheck, tone: 'warning' },
  approval_approved: { icon: CheckCheck, tone: 'success' },
  approval_rejected: { icon: Ban, tone: 'danger' },
  approval_revision: { icon: FileWarning, tone: 'warning' },
};

const FALLBACK_META = { icon: Info, tone: 'info' as Tone };

const iconButton =
  'relative inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card data-[state=open]:bg-accent data-[state=open]:text-foreground';

/** Move focus between notification rows with ↑ ↓ Home End. */
function handleRowKeys(e: KeyboardEvent<HTMLButtonElement>) {
  const list = e.currentTarget.closest('ul');
  if (!list) return;
  const items = Array.from(list.querySelectorAll<HTMLButtonElement>('button[data-notif]'));
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  const target =
    e.key === 'ArrowDown'
      ? items[Math.min(index + 1, items.length - 1)]
      : e.key === 'ArrowUp'
        ? items[Math.max(index - 1, 0)]
        : e.key === 'Home'
          ? items[0]
          : e.key === 'End'
            ? items[items.length - 1]
            : undefined;
  if (target) {
    e.preventDefault();
    target.focus();
  }
}

/** Topbar bell: unread badge + popover with the latest notifications. */
export const NotificationBell = () => {
  const { t } = useTranslation(['shell', 'common']);
  const [isOpen, setIsOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Unread count — poll every 60s
  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      const res = await api.get('/notifications/unread-count');
      return res.data;
    },
    refetchInterval: POLL_MS,
  });

  // Notifications list (only fetched while the popover is open)
  const list = useQuery({
    queryKey: ['notifications-list'],
    queryFn: async () => {
      const res = await api.get('/notifications');
      return res.data;
    },
    enabled: isOpen,
  });

  // The list loads after the panel opens: once rows arrive, move focus from the
  // panel itself to the first row (but never steal it from elsewhere).
  const hasRows = (list.data?.data?.length ?? 0) > 0;
  useEffect(() => {
    const panel = contentRef.current;
    if (isOpen && hasRows && panel && document.activeElement === panel) {
      panel.querySelector<HTMLElement>('button[data-notif]')?.focus();
    }
  }, [isOpen, hasRows]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
  };

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: invalidate,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: invalidate,
  });

  const unreadCount: number = unreadData?.count || 0;
  const notifications: Notification[] = (list.data?.data || []).slice(0, LIST_LIMIT);
  const badge = unreadCount > 9 ? '9+' : String(unreadCount);
  const triggerLabel =
    unreadCount > 0 ? t('notificationBell.triggerUnread', { count: unreadCount }) : t('notificationBell.triggerNone');

  const openNotification = (notif: Notification) => {
    if (!notif.isRead) markReadMutation.mutate(notif.id);
    const to = notificationLink(notif, currentUserRole());
    if (to) {
      setIsOpen(false);
      navigate(to);
    }
  };

  return (
    <PopoverPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
      <PopoverPrimitive.Trigger aria-label={triggerLabel} className={iconButton}>
        <Bell size={18} strokeWidth={1.75} aria-hidden />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] leading-none font-semibold text-danger-foreground ring-2 ring-card"
          >
            {badge}
          </span>
        )}
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={contentRef}
          align="end"
          sideOffset={6}
          collisionPadding={12}
          aria-labelledby="notif-popover-title"
          onOpenAutoFocus={(e) => {
            // Land on the first notification when there is one; else the panel itself.
            e.preventDefault();
            const first = contentRef.current?.querySelector<HTMLElement>('button[data-notif]');
            (first ?? contentRef.current)?.focus();
          }}
          tabIndex={-1}
          className={cn(
            'z-[var(--z-popover)] flex w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-[var(--shadow-2)] outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          <div className="flex items-center gap-2 border-b border-border py-2 pr-2 pl-4">
            <h2 id="notif-popover-title" className="flex-1 text-sm font-semibold text-foreground">
              {t('notificationBell.title')}
            </h2>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-primary transition-colors hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <CheckCheck size={14} aria-hidden />
                {t('notificationBell.markAllRead')}
              </button>
            )}
            <PopoverPrimitive.Close
              aria-label={t('notificationBell.close')}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X size={16} aria-hidden />
            </PopoverPrimitive.Close>
          </div>

          <div className="max-h-[min(24rem,calc(100dvh-10rem))] overflow-y-auto overscroll-contain">
            {list.isPending ? (
              <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin" aria-hidden />
                {t('notificationBell.loading')}
              </div>
            ) : list.isError ? (
              <div role="alert" className="px-4 py-8 text-center">
                <p className="text-sm font-medium text-foreground">{t('notificationBell.loadFailed')}</p>
                <button
                  type="button"
                  onClick={() => list.refetch()}
                  className="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t('common:actions.retry')}
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div role="status" className="flex flex-col items-center px-6 py-10 text-center">
                <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Bell size={24} strokeWidth={1.5} aria-hidden />
                </span>
                <p className="mt-3 text-sm font-semibold text-foreground">{t('notificationBell.emptyTitle')}</p>
                <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
                  {t('notificationBell.emptyDescription')}
                </p>
              </div>
            ) : (
              <ul aria-label={t('notificationBell.latest')} className="divide-y divide-border">
                {notifications.map((notif) => (
                  <li key={notif.id}>
                    <NotificationRow notif={notif} onOpen={() => openNotification(notif)} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-border px-2 py-1.5">
            <Link
              to="/notifications"
              onClick={() => setIsOpen(false)}
              className="flex h-8 items-center justify-center rounded-md text-sm font-medium text-primary transition-colors hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('notificationBell.viewAll')}
            </Link>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};

function NotificationRow({ notif, onOpen }: { notif: Notification; onOpen: () => void }) {
  const { t } = useTranslation('shell');
  const { icon: Icon, tone } = TYPE_META[notif.type] ?? FALLBACK_META;
  return (
    <button
      type="button"
      data-notif
      onClick={onOpen}
      onKeyDown={handleRowKeys}
      className={cn(
        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        !notif.isRead && 'bg-primary-subtle/50',
      )}
    >
      <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md', TONE_CLASS[tone])}>
        <Icon size={14} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn('truncate text-sm text-foreground', notif.isRead ? 'font-medium' : 'font-semibold')}>
            {notif.title}
          </span>
          {!notif.isRead && (
            <span className="size-2 shrink-0 rounded-full bg-primary">
              <span className="sr-only">{t('notificationBell.unread')}</span>
            </span>
          )}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs text-foreground-secondary">{notif.message}</span>
        <time dateTime={notif.createdAt} title={formatDateTime(notif.createdAt)} className="mt-1 block text-xs text-muted-foreground">
          {relativeTime(notif.createdAt)}
        </time>
      </span>
    </button>
  );
}
