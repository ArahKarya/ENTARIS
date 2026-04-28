import { useState, useMemo } from 'react';
import { Search, Wallet, Loader2, CheckCircle2, DollarSign, AlertTriangle, XCircle, Undo2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { formatRupiah, formatDate } from '../lib/formatters';
import VendorDepositModal from '../components/VendorDepositModal';
import RefundVendorDepositModal from '../components/RefundVendorDepositModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { toast } from 'sonner';

export const VendorDeposits = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; paymentNumber: string } | null>(null);
  const [refundTarget, setRefundTarget] = useState<any | null>(null);
  const queryClient = useQueryClient();

  const { data: deposits, isLoading } = useQuery({
    queryKey: ['vendor-deposits'],
    queryFn: async () => {
      const res = await api.get('/vendor-deposits');
      return res.data.data ?? res.data;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/vendor-deposits/${id}/cancel`),
    onSuccess: () => {
      toast.success('Uang muka vendor berhasil dibatalkan.');
      queryClient.invalidateQueries({ queryKey: ['vendor-deposits'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Gagal membatalkan uang muka.');
    },
  });

  const filtered = useMemo(() => {
    if (!deposits) return [];
    if (!searchTerm) return deposits;
    const q = searchTerm.toLowerCase();
    return deposits.filter((d: any) =>
      d.paymentNumber?.toLowerCase().includes(q) ||
      d.party?.name?.toLowerCase().includes(q)
    );
  }, [deposits, searchTerm]);

  const summary = useMemo(() => {
    if (!deposits) return { totalDeposit: 0, totalApplied: 0, totalRemaining: 0, activeCount: 0 };
    let totalDeposit = 0, totalApplied = 0, totalRemaining = 0, activeCount = 0;
    for (const d of deposits) {
      if (d.status === 'Cancelled') continue;
      totalDeposit += Number(d.amount);
      totalApplied += d.totalApplied ?? 0;
      totalRemaining += d.remaining ?? 0;
      if ((d.remaining ?? 0) > 0.01) activeCount++;
    }
    return { totalDeposit, totalApplied, totalRemaining, activeCount };
  }, [deposits]);

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Uang Muka Vendor</h1>
          <p className="text-sm text-gray-500 mt-0.5">Kelola deposit dan uang muka ke supplier.</p>
        </div>
        <button className="btn-primary bg-amber-500 hover:bg-amber-600 self-start" onClick={() => setIsModalOpen(true)}>
          <Wallet size={15} /> Buat Uang Muka
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg">
              <Wallet size={16} className="text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Deposit</p>
              <p className="text-lg font-bold text-gray-900 font-mono tabular-nums">{formatRupiah(summary.totalDeposit)}</p>
            </div>
          </div>
        </div>
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <CheckCircle2 size={16} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sudah Digunakan</p>
              <p className="text-lg font-bold text-green-600 font-mono tabular-nums">{formatRupiah(summary.totalApplied)}</p>
            </div>
          </div>
        </div>
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <DollarSign size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sisa Deposit</p>
              <p className="text-lg font-bold text-blue-600 font-mono tabular-nums">{formatRupiah(summary.totalRemaining)}</p>
            </div>
          </div>
        </div>
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-50 rounded-lg">
              <AlertTriangle size={16} className="text-orange-500" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Deposit Aktif</p>
              <p className="text-lg font-bold text-orange-500">{summary.activeCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Cari nomor deposit atau supplier..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Tanggal</th>
                <th scope="col">No. Dokumen</th>
                <th scope="col">Supplier</th>
                <th scope="col" className="text-right">Jumlah Deposit</th>
                <th scope="col" className="text-right">Digunakan</th>
                <th scope="col" className="text-right">Sisa</th>
                <th scope="col" className="text-center">Status</th>
                <th scope="col" className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
                    Memuat data uang muka...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <Wallet className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Belum ada uang muka vendor.</p>
                    <button
                      onClick={() => setIsModalOpen(true)}
                      className="mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      + Buat uang muka pertama
                    </button>
                  </td>
                </tr>
              ) : (
                filtered.map((dep: any) => {
                  const remaining = dep.remaining ?? 0;
                  const totalApplied = dep.totalApplied ?? 0;
                  const isCancelled = dep.status === 'Cancelled';
                  const isFullyUsed = remaining < 0.01 && !isCancelled;

                  return (
                    <tr key={dep.id} className={isCancelled ? 'opacity-50' : ''}>
                      <td className="text-gray-500 whitespace-nowrap">{formatDate(dep.date)}</td>
                      <td className="whitespace-nowrap">
                        <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">{dep.paymentNumber}</span>
                      </td>
                      <td>
                        <span className="font-medium text-gray-800">{dep.party?.name ?? '—'}</span>
                      </td>
                      <td className="text-right font-mono font-medium text-gray-900 tabular-nums">{formatRupiah(Number(dep.amount))}</td>
                      <td className="text-right font-mono text-green-600 tabular-nums">{formatRupiah(totalApplied)}</td>
                      <td className="text-right">
                        <span className={cn('font-mono font-medium tabular-nums', remaining > 0.01 ? 'text-amber-600' : 'text-gray-400')}>
                          {formatRupiah(remaining)}
                        </span>
                      </td>
                      <td className="text-center">
                        <span className={cn(
                          'badge',
                          isCancelled ? 'badge-red' :
                          isFullyUsed ? 'badge-green' :
                          totalApplied > 0 ? 'badge-yellow' : 'badge-blue'
                        )}>
                          {isCancelled ? 'Dibatalkan' :
                           isFullyUsed ? 'Terpakai' :
                           totalApplied > 0 ? 'Sebagian' : 'Aktif'}
                        </span>
                      </td>
                      <td>
                        {!isCancelled && (
                          <div className="flex items-center gap-0.5">
                            {remaining > 0.01 && (
                              <button
                                onClick={() => setRefundTarget(dep)}
                                className="p-1.5 hover:bg-orange-50 rounded text-gray-400 hover:text-orange-600 transition-colors"
                                title="Refund / Offset"
                              >
                                <Undo2 size={16} />
                              </button>
                            )}
                            <button
                              onClick={() => setCancelTarget({ id: dep.id, paymentNumber: dep.paymentNumber })}
                              className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                              title="Batalkan"
                            >
                              <XCircle size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <VendorDepositModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      <RefundVendorDepositModal
        isOpen={refundTarget !== null}
        onClose={() => setRefundTarget(null)}
        deposit={refundTarget}
      />

      <ConfirmDialog
        open={cancelTarget !== null}
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => {
          if (cancelTarget) {
            cancelMutation.mutate(cancelTarget.id);
            setCancelTarget(null);
          }
        }}
        title="Batalkan Uang Muka"
        message={`Apakah Anda yakin ingin membatalkan uang muka ${cancelTarget?.paymentNumber}? Saldo akun dan deposit vendor akan dikembalikan.`}
        confirmLabel="Ya, Batalkan"
        variant="danger"
      />
    </div>
  );
};
