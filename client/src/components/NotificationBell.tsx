import { useState, useRef, useEffect } from 'react';
import { Bell, FileWarning, CreditCard, Package, Info, CheckCheck, X, ClipboardCheck, Ban } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { notificationLink, currentUserRole } from '../lib/notificationNav';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  metadata?: any;
  createdAt: string;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

function notificationIcon(type: string) {
  switch (type) {
    case 'invoice_overdue':
      return <FileWarning size={14} className="text-red-500" />;
    case 'payment_received':
      return <CreditCard size={14} className="text-green-500" />;
    case 'low_stock':
      return <Package size={14} className="text-amber-500" />;
    case 'approval_pending':
      return <ClipboardCheck size={14} className="text-amber-500" />;
    case 'approval_approved':
      return <CheckCheck size={14} className="text-green-500" />;
    case 'approval_rejected':
      return <Ban size={14} className="text-red-500" />;
    case 'approval_revision':
      return <FileWarning size={14} className="text-amber-500" />;
    default:
      return <Info size={14} className="text-blue-500" />;
  }
}

export const NotificationBell = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Unread count — poll every 60s
  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      const res = await api.get('/notifications/unread-count');
      return res.data;
    },
    refetchInterval: 60000,
  });

  // Notifications list (only fetch when dropdown is open)
  const { data: notificationsData } = useQuery({
    queryKey: ['notifications-list'],
    queryFn: async () => {
      const res = await api.get('/notifications');
      return res.data;
    },
    enabled: isOpen,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
    },
  });

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const unreadCount = unreadData?.count || 0;
  const notifications: Notification[] = (notificationsData?.data || []).slice(0, 10);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 relative"
        style={{ color: 'var(--color-text-muted)' }}
        title="Notifikasi"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-10 z-[80] w-80 rounded-xl shadow-xl border animate-in fade-in slide-in-from-top-1"
          style={{
            backgroundColor: 'var(--color-bg-primary)',
            borderColor: 'var(--color-border)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Notifikasi
            </h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllReadMutation.mutate()}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors"
                  disabled={markAllReadMutation.isPending}
                >
                  <CheckCheck size={12} />
                  Tandai semua dibaca
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center">
                <Bell size={24} className="mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Belum ada notifikasi.
                </p>
              </div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => {
                    if (!notif.isRead) markReadMutation.mutate(notif.id);
                    const to = notificationLink(notif, currentUserRole());
                    if (to) { setIsOpen(false); navigate(to); }
                  }}
                  className={cn(
                    'w-full flex items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50',
                    !notif.isRead && 'bg-blue-50/50 dark:bg-blue-900/10'
                  )}
                  style={{ borderBottom: '1px solid var(--color-border-light)' }}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {notificationIcon(notif.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p
                        className={cn('text-xs font-medium truncate', !notif.isRead && 'font-semibold')}
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {notif.title}
                      </p>
                      {!notif.isRead && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>
                      {notif.message}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      {relativeTime(notif.createdAt)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t px-4 py-2" style={{ borderColor: 'var(--color-border)' }}>
            <Link
              to="/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Lihat Semua &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
