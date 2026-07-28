import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { X, Loader2, ExternalLink, BookOpen } from 'lucide-react';
import { formatRupiah, formatDate } from '../../lib/formatters';
import { cn } from '../../lib/utils';

interface LedgerDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string | null;
  accountName: string;
  startDate?: string;
  endDate?: string;
}

const LedgerDetailDrawer: React.FC<LedgerDetailDrawerProps> = ({
  isOpen,
  onClose,
  accountId,
  accountName,
  startDate,
  endDate,
}) => {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['ledger-detail', accountId, startDate, endDate],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (accountId) params.accountId = accountId;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const r = await api.get('/reports/ledger-detail', { params });
      return r.data;
    },
    enabled: isOpen && !!accountId,
  });

  const handleReferenceClick = (referenceType: string, _referenceId: string) => {
    // Navigate to related page based on reference type
    if (referenceType === 'JournalEntry' || referenceType === 'journal') {
      navigate('/gl');
    } else if (referenceType === 'SalesInvoice' || referenceType === 'sales') {
      navigate('/sales');
    } else if (referenceType === 'PurchaseInvoice' || referenceType === 'purchase') {
      navigate('/purchase');
    } else if (referenceType === 'Payment' || referenceType === 'payment') {
      navigate('/payments');
    } else {
      navigate('/gl');
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[100vw] sm:max-w-2xl border-l shadow-2xl flex flex-col overflow-hidden transition-transform"
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          borderColor: 'var(--color-border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-5 border-b shrink-0"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <BookOpen size={16} className="text-blue-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                {accountName}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                {data?.accountNumber || ''} &middot; Detail Buku Besar
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
          >
            <X size={16} style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="py-16 flex items-center justify-center gap-2">
              <Loader2 className="animate-spin" size={18} style={{ color: 'var(--color-text-muted)' }} />
              <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Memuat data...</span>
            </div>
          ) : !data?.entries || data.entries.length === 0 ? (
            <div className="py-16 text-center" style={{ color: 'var(--color-text-muted)' }}>
              <BookOpen size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">Tidak ada transaksi pada periode ini</p>
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="text-xs uppercase tracking-wide"
                    style={{
                      backgroundColor: 'var(--color-bg-secondary)',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    <th className="text-left px-3 py-2.5">Tanggal</th>
                    <th className="text-left px-3 py-2.5">Referensi</th>
                    <th className="text-left px-3 py-2.5">Keterangan</th>
                    <th className="text-right px-3 py-2.5">Debit</th>
                    <th className="text-right px-3 py-2.5">Kredit</th>
                    <th className="text-right px-3 py-2.5">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((entry: any) => (
                    <tr
                      key={entry.id}
                      className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                      style={{ borderColor: 'var(--color-border)' }}
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>
                        {formatDate(entry.date)}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => handleReferenceClick(entry.referenceType, entry.referenceId)}
                          className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline text-xs font-medium"
                        >
                          {entry.referenceType}
                          <ExternalLink size={10} />
                        </button>
                      </td>
                      <td
                        className="px-3 py-2.5 max-w-[200px] truncate"
                        style={{ color: 'var(--color-text-secondary)' }}
                        title={entry.description || ''}
                      >
                        {entry.description || '-'}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2.5 text-right tabular-nums whitespace-nowrap',
                          entry.debit > 0 ? 'text-blue-600' : ''
                        )}
                        style={entry.debit <= 0 ? { color: 'var(--color-text-muted)' } : undefined}
                      >
                        {entry.debit > 0 ? formatRupiah(entry.debit) : '-'}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2.5 text-right tabular-nums whitespace-nowrap',
                          entry.credit > 0 ? 'text-green-600' : ''
                        )}
                        style={entry.credit <= 0 ? { color: 'var(--color-text-muted)' } : undefined}
                      >
                        {entry.credit > 0 ? formatRupiah(entry.credit) : '-'}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2.5 text-right tabular-nums whitespace-nowrap font-medium',
                          entry.runningBalance < 0 ? 'text-red-600' : ''
                        )}
                        style={entry.runningBalance >= 0 ? { color: 'var(--color-text-primary)' } : undefined}
                      >
                        {formatRupiah(Math.abs(entry.runningBalance))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default LedgerDetailDrawer;
