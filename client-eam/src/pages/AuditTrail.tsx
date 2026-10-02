import { useState } from 'react';
import { Search, Loader2, ScrollText, ChevronDown, ChevronRight, ChevronLeft, Download, BarChart3 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { formatDate, formatTime } from '../lib/formatters';
import { exportToExcel } from '../lib/exportExcel';
import Select from '../components/Select';

interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValues: any;
  newValues: any;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: {
    fullName: string;
    email: string;
  };
}

const ACTION_OPTIONS = [
  { value: '', label: 'Semua Aksi' },
  { value: 'CREATE', label: 'CREATE' },
  { value: 'UPDATE', label: 'UPDATE' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'LOGIN', label: 'LOGIN' },
];

export const AuditTrail = () => {
  const [page, setPage] = useState(1);
  const [filterUserId, setFilterUserId] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterEntityType, setFilterEntityType] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const limit = 25;

  // Fetch users for filter dropdown
  const { data: usersData } = useQuery({
    queryKey: ['users-for-filter'],
    queryFn: async () => {
      const response = await api.get('/users', { params: { limit: 200 } });
      return response.data.data ?? [];
    },
  });

  // Fetch audit logs
  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, filterUserId, filterAction, filterEntityType, filterStartDate, filterEndDate],
    queryFn: async () => {
      const params: any = { page, limit };
      if (filterUserId) params.userId = filterUserId;
      if (filterAction) params.action = filterAction;
      if (filterEntityType) params.entityType = filterEntityType;
      if (filterStartDate) params.startDate = filterStartDate;
      if (filterEndDate) params.endDate = filterEndDate;
      const response = await api.get('/audit-logs', { params });
      return response.data;
    },
  });

  const logs: AuditLogEntry[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const actionBadge = (action: string) => {
    switch (action) {
      case 'CREATE':
        return <span className="badge badge-green">CREATE</span>;
      case 'UPDATE':
        return <span className="badge badge-blue">UPDATE</span>;
      case 'DELETE':
        return <span className="badge badge-red">DELETE</span>;
      case 'LOGIN':
        return <span className="badge badge-gray">LOGIN</span>;
      default:
        return <span className="badge badge-gray">{action}</span>;
    }
  };

  const handleResetFilters = () => {
    setFilterUserId('');
    setFilterAction('');
    setFilterEntityType('');
    setFilterStartDate('');
    setFilterEndDate('');
    setPage(1);
  };

  const selectCls = 'border rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const inputCls = 'border rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>Jejak Audit</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Riwayat aktivitas pengguna di aplikasi.</p>
      </div>

      {/* Filter Bar */}
      <div
        className="rounded-xl border p-4"
        style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex flex-wrap items-end gap-3">
          {/* User filter */}
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Pengguna</label>
            <Select
              value={filterUserId}
              onChange={(e) => { setFilterUserId(e.target.value); setPage(1); }}
              className={cn(selectCls, 'w-full')}
              style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            >
              <option value="">Semua Pengguna</option>
              {(usersData ?? []).map((u: any) => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
            </Select>
          </div>

          {/* Action filter */}
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Aksi</label>
            <Select
              value={filterAction}
              onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
              className={cn(selectCls, 'w-full')}
              style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            >
              {ACTION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </div>

          {/* Entity type filter */}
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Tipe Entitas</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                value={filterEntityType}
                onChange={(e) => { setFilterEntityType(e.target.value); setPage(1); }}
                placeholder="e.g. sales, users"
                className={cn(inputCls, 'w-full pl-9')}
                style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              />
            </div>
          </div>

          {/* Date range */}
          <div className="min-w-[130px]">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Dari Tanggal</label>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => { setFilterStartDate(e.target.value); setPage(1); }}
              className={cn(inputCls, 'w-full')}
              style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            />
          </div>
          <div className="min-w-[130px]">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Sampai Tanggal</label>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => { setFilterEndDate(e.target.value); setPage(1); }}
              className={cn(inputCls, 'w-full')}
              style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            />
          </div>

          {/* Reset & Export */}
          <button
            onClick={handleResetFilters}
            className="btn-secondary text-xs"
          >
            Reset
          </button>
          <button
            onClick={() => {
              if (!logs.length) return;
              exportToExcel(
                logs.map((l) => ({
                  Waktu: new Date(l.createdAt).toLocaleString('id-ID'),
                  Pengguna: l.user?.fullName ?? '-',
                  Email: l.user?.email ?? '-',
                  Aksi: l.action,
                  Entitas: l.entityType,
                  'ID Entitas': l.entityId,
                  'IP Address': l.ipAddress ?? '-',
                  Data: l.newValues ? JSON.stringify(l.newValues) : '-',
                })),
                `audit-log-${new Date().toISOString().slice(0, 10)}`
              );
            }}
            className="btn-secondary text-xs flex items-center gap-1"
          >
            <Download size={13} /> Export
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      {!isLoading && total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {['CREATE', 'UPDATE', 'DELETE', 'LOGIN'].map((action) => {
            const count = logs.filter((l) => l.action === action).length;
            const colors: Record<string, string> = { CREATE: 'text-green-600', UPDATE: 'text-blue-600', DELETE: 'text-red-600', LOGIN: 'text-gray-500' };
            return (
              <div key={action} className="card p-3 flex items-center gap-3">
                <BarChart3 size={16} className={colors[action]} />
                <div>
                  <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{action}</p>
                  <p className={cn('text-lg font-bold', colors[action])}>{count}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
      >
        <div className="table-responsive">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                <th className="w-8 px-2 py-3"></th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Waktu</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Pengguna</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Aksi</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Entitas</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>ID Entitas</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Memuat data audit...</p>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <ScrollText className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Tidak ada data audit log.</p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <>
                    <tr
                      key={log.id}
                      className={cn(
                        'border-b transition-colors cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-800/30',
                        expandedRow === log.id && 'bg-gray-50/80 dark:bg-gray-800/40'
                      )}
                      style={{ borderColor: 'var(--color-border)' }}
                      onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                    >
                      <td className="px-2 py-3 text-center" style={{ color: 'var(--color-text-muted)' }}>
                        {expandedRow === log.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>
                        <div className="text-xs">{formatDate(log.createdAt)}</div>
                        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{formatTime(log.createdAt)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>{log.user?.fullName ?? '-'}</div>
                        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{log.user?.email ?? ''}</div>
                      </td>
                      <td className="px-4 py-3">{actionBadge(log.action)}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>{log.entityType}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {log.entityId.length > 12 ? `${log.entityId.slice(0, 8)}...` : log.entityId}
                      </td>
                    </tr>
                    {expandedRow === log.id && (
                      <tr key={`${log.id}-detail`} style={{ borderColor: 'var(--color-border)' }} className="border-b">
                        <td colSpan={6} className="px-6 py-4" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                          <div className="space-y-3">
                            {log.ipAddress && (
                              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                <span className="font-medium">IP Address:</span> {log.ipAddress}
                                {log.userAgent && <span className="ml-3">| {log.userAgent.slice(0, 80)}</span>}
                              </p>
                            )}
                            {log.action === 'UPDATE' && log.oldValues && log.newValues ? (
                              <div>
                                <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>Perubahan:</p>
                                <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
                                        <th className="text-left px-3 py-1.5 font-medium" style={{ color: 'var(--color-text-muted)' }}>Field</th>
                                        <th className="text-left px-3 py-1.5 font-medium text-red-500">Sebelum</th>
                                        <th className="text-left px-3 py-1.5 font-medium text-green-600">Sesudah</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {Object.keys(log.newValues).map((key) => {
                                        const oldVal = log.oldValues?.[key];
                                        const newVal = log.newValues[key];
                                        const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);
                                        if (!changed) return null;
                                        return (
                                          <tr key={key} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                                            <td className="px-3 py-1.5 font-mono" style={{ color: 'var(--color-text-secondary)' }}>{key}</td>
                                            <td className="px-3 py-1.5 bg-red-50/50 dark:bg-red-950/10" style={{ color: 'var(--color-text-secondary)' }}>
                                              {oldVal !== undefined ? String(oldVal) : '—'}
                                            </td>
                                            <td className="px-3 py-1.5 bg-green-50/50 dark:bg-green-950/10" style={{ color: 'var(--color-text-secondary)' }}>
                                              {newVal !== undefined ? String(newVal) : '—'}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ) : log.newValues ? (
                              <div>
                                <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Data:</p>
                                <pre
                                  className="text-xs rounded-lg p-3 overflow-x-auto border max-h-60"
                                  style={{
                                    backgroundColor: 'var(--color-bg-primary)',
                                    borderColor: 'var(--color-border)',
                                    color: 'var(--color-text-secondary)',
                                  }}
                                >
                                  <code>{JSON.stringify(log.newValues, null, 2)}</code>
                                </pre>
                              </div>
                            ) : null}
                            {!log.newValues && !log.oldValues && !log.ipAddress && (
                              <p className="text-xs italic" style={{ color: 'var(--color-text-muted)' }}>Tidak ada detail tambahan.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            className="flex items-center justify-between px-4 py-3 border-t"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Menampilkan {(page - 1) * limit + 1}-{Math.min(page * limit, total)} dari {total} entri
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-medium px-2" style={{ color: 'var(--color-text-secondary)' }}>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
