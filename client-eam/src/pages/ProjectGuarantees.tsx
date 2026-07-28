import { Fragment, useState, useMemo } from 'react';
import { Search, ShieldCheck, Loader2, Undo2, XCircle, AlertTriangle, CheckCircle2, Flame, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { formatRupiah, formatDate } from '../lib/formatters';
import ProjectGuaranteeModal from '../components/ProjectGuaranteeModal';
import SettleGuaranteeModal from '../components/SettleGuaranteeModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { can, cap } from '../lib/permissions';
import { toast } from 'sonner';

// Uang Jaminan Proyek: setoran jaminan (tender/pelaksanaan) ke pemberi proyek.
// Status: Disetor → Selesai (via settlement kembali/hangus) | Dibatalkan.
export const ProjectGuarantees = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [settleTarget, setSettleTarget] = useState<any | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; guaranteeNumber: string } | null>(null);
  const [cancelSettlementTarget, setCancelSettlementTarget] = useState<{ id: string; label: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const canEdit = can('project_guarantee', 'edit');
  const canCancel = cap('doc.cancel');

  const { data, isLoading } = useQuery({
    queryKey: ['project-guarantees'],
    queryFn: async () => {
      const res = await api.get('/project-guarantees');
      return res.data;
    },
  });
  const guarantees = data?.data ?? [];
  const summary = data?.summary ?? { totalDeposited: 0, totalReturned: 0, totalForfeited: 0, totalOutstanding: 0, activeCount: 0 };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['project-guarantees'] });
    queryClient.invalidateQueries({ queryKey: ['journals'] });
    queryClient.invalidateQueries({ queryKey: ['coa'] });
  };

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/project-guarantees/${id}/cancel`),
    onSuccess: () => { toast.success('Uang jaminan dibatalkan.'); invalidate(); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal membatalkan uang jaminan.'),
  });

  const cancelSettlementMutation = useMutation({
    mutationFn: (id: string) => api.post(`/project-guarantees/settlements/${id}/cancel`),
    onSuccess: () => { toast.success('Settlement dibatalkan.'); invalidate(); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal membatalkan settlement.'),
  });

  const filtered = useMemo(() => {
    if (!searchTerm) return guarantees;
    const q = searchTerm.toLowerCase();
    return guarantees.filter((g: any) =>
      g.guaranteeNumber?.toLowerCase().includes(q) ||
      g.party?.name?.toLowerCase().includes(q) ||
      g.projectName?.toLowerCase().includes(q) ||
      g.referenceNo?.toLowerCase().includes(q)
    );
  }, [guarantees, searchTerm]);

  const now = new Date();

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Uang Jaminan Proyek</h1>
          <p className="text-sm text-gray-500 mt-0.5">Setoran jaminan tender/pelaksanaan ke pemberi proyek.</p>
        </div>
        {canEdit && (
          <button className="btn-primary bg-teal-600 hover:bg-teal-700 self-start" onClick={() => setIsModalOpen(true)}>
            <ShieldCheck size={15} /> Setor Jaminan
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-50 rounded-lg"><ShieldCheck size={16} className="text-teal-600" /></div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Disetor</p>
              <p className="text-lg font-bold text-gray-900 font-mono tabular-nums">{formatRupiah(summary.totalDeposited)}</p>
            </div>
          </div>
        </div>
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg"><CheckCircle2 size={16} className="text-green-600" /></div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Dikembalikan</p>
              <p className="text-lg font-bold text-green-600 font-mono tabular-nums">{formatRupiah(summary.totalReturned)}</p>
            </div>
          </div>
        </div>
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg"><Flame size={16} className="text-red-500" /></div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Hangus</p>
              <p className="text-lg font-bold text-red-500 font-mono tabular-nums">{formatRupiah(summary.totalForfeited)}</p>
            </div>
          </div>
        </div>
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg"><AlertTriangle size={16} className="text-amber-500" /></div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sisa di Luar</p>
              <p className="text-lg font-bold text-amber-600 font-mono tabular-nums">{formatRupiah(summary.totalOutstanding)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Cari nomor, proyek, atau pihak..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col" className="w-8"></th>
                <th scope="col">Tanggal</th>
                <th scope="col">No. Dokumen</th>
                <th scope="col">Pemberi Proyek</th>
                <th scope="col">Proyek</th>
                <th scope="col" className="text-center">Jenis</th>
                <th scope="col">Jatuh Tempo</th>
                <th scope="col" className="text-right">Jumlah</th>
                <th scope="col" className="text-right">Sisa</th>
                <th scope="col" className="text-center">Status</th>
                <th scope="col" className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
                    Memuat data uang jaminan...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center">
                    <ShieldCheck className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Belum ada uang jaminan proyek.</p>
                    {canEdit && (
                      <button onClick={() => setIsModalOpen(true)} className="mt-3 text-xs text-teal-600 hover:text-teal-700 font-medium">
                        + Setor jaminan pertama
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((g: any) => {
                  const isCancelled = g.status === 'Dibatalkan';
                  const isDone = g.status === 'Selesai';
                  const outstanding = g.outstanding ?? 0;
                  const activeSettlements = (g.settlements || []).filter((s: any) => !s.isCancelled);
                  const dueDate = g.expectedReturnDate ? new Date(g.expectedReturnDate) : null;
                  const isOverdue = !isCancelled && !isDone && dueDate !== null && dueDate < now;
                  const isExpanded = expandedId === g.id;

                  return (
                    <Fragment key={g.id}>
                      <tr className={isCancelled ? 'opacity-50' : ''}>
                        <td>
                          {activeSettlements.length > 0 && (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : g.id)}
                              className="p-1 hover:bg-gray-100 rounded text-gray-400"
                              title="Riwayat settlement"
                            >
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          )}
                        </td>
                        <td className="text-gray-500 whitespace-nowrap">{formatDate(g.date)}</td>
                        <td className="whitespace-nowrap">
                          <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">{g.guaranteeNumber}</span>
                        </td>
                        <td><span className="font-medium text-gray-800">{g.party?.name ?? '—'}</span></td>
                        <td>
                          <span className="text-gray-700">{g.projectName}</span>
                          {g.referenceNo && <span className="block text-[11px] text-gray-400">{g.referenceNo}</span>}
                        </td>
                        <td className="text-center"><span className="badge badge-blue">{g.guaranteeType}</span></td>
                        <td className="whitespace-nowrap">
                          {dueDate ? (
                            <span className={cn('text-xs', isOverdue ? 'text-red-600 font-semibold' : 'text-gray-500')}>
                              {formatDate(g.expectedReturnDate)}
                              {isOverdue && <span className="block text-[10px] uppercase">Lewat tempo</span>}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="text-right font-mono font-medium text-gray-900 tabular-nums">{formatRupiah(Number(g.amount))}</td>
                        <td className="text-right">
                          <span className={cn('font-mono font-medium tabular-nums', outstanding > 0.01 && !isCancelled ? 'text-amber-600' : 'text-gray-400')}>
                            {formatRupiah(isCancelled ? 0 : outstanding)}
                          </span>
                        </td>
                        <td className="text-center">
                          <span className={cn('badge', isCancelled ? 'badge-red' : isDone ? 'badge-green' : 'badge-yellow')}>
                            {g.status}
                          </span>
                        </td>
                        <td>
                          {!isCancelled && (
                            <div className="flex items-center gap-0.5">
                              {canEdit && !isDone && outstanding > 0.01 && (
                                <button
                                  onClick={() => setSettleTarget(g)}
                                  className="p-1.5 hover:bg-teal-50 rounded text-gray-400 hover:text-teal-600 transition-colors"
                                  title="Settlement (kembali/hangus)"
                                >
                                  <Undo2 size={16} />
                                </button>
                              )}
                              {canCancel && activeSettlements.length === 0 && (
                                <button
                                  onClick={() => setCancelTarget({ id: g.id, guaranteeNumber: g.guaranteeNumber })}
                                  className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                                  title="Batalkan setoran"
                                >
                                  <XCircle size={16} />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                      {isExpanded && activeSettlements.length > 0 && (
                        <tr>
                          <td colSpan={11} className="bg-gray-50/60 px-6 py-3">
                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Riwayat Settlement</p>
                            <div className="space-y-1.5">
                              {activeSettlements.map((s: any) => (
                                <div key={s.id} className="flex items-center justify-between text-xs bg-white border border-gray-100 rounded-lg px-3 py-2">
                                  <div className="flex items-center gap-3">
                                    <span className="text-gray-500">{formatDate(s.date)}</span>
                                    {Number(s.returnAmount) > 0 && (
                                      <span className="text-green-600 font-mono">Kembali {formatRupiah(Number(s.returnAmount))}{s.returnAccount ? ` → ${s.returnAccount.name}` : ''}</span>
                                    )}
                                    {Number(s.forfeitAmount) > 0 && (
                                      <span className="text-red-500 font-mono">Hangus {formatRupiah(Number(s.forfeitAmount))}{s.forfeitAccount ? ` → ${s.forfeitAccount.name}` : ''}</span>
                                    )}
                                    {s.notes && <span className="text-gray-400">({s.notes})</span>}
                                  </div>
                                  {canCancel && (
                                    <button
                                      onClick={() => setCancelSettlementTarget({ id: s.id, label: `${formatDate(s.date)} — ${formatRupiah(Number(s.returnAmount) + Number(s.forfeitAmount))}` })}
                                      className="p-1 hover:bg-red-50 rounded text-gray-300 hover:text-red-500 transition-colors"
                                      title="Batalkan settlement ini"
                                    >
                                      <XCircle size={14} />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ProjectGuaranteeModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      {/* Conditional mount = fresh state per open; key ties to guarantee id. */}
      {settleTarget && (
        <SettleGuaranteeModal
          key={settleTarget.id}
          isOpen={true}
          onClose={() => setSettleTarget(null)}
          guarantee={settleTarget}
        />
      )}

      <ConfirmDialog
        open={cancelTarget !== null}
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => {
          if (cancelTarget) {
            cancelMutation.mutate(cancelTarget.id);
            setCancelTarget(null);
          }
        }}
        title="Batalkan Uang Jaminan"
        message={`Apakah Anda yakin ingin membatalkan setoran ${cancelTarget?.guaranteeNumber}? Saldo akun akan dikembalikan seperti sebelum setor.`}
        confirmLabel="Ya, Batalkan"
        variant="danger"
      />

      <ConfirmDialog
        open={cancelSettlementTarget !== null}
        onCancel={() => setCancelSettlementTarget(null)}
        onConfirm={() => {
          if (cancelSettlementTarget) {
            cancelSettlementMutation.mutate(cancelSettlementTarget.id);
            setCancelSettlementTarget(null);
          }
        }}
        title="Batalkan Settlement"
        message={`Batalkan settlement ${cancelSettlementTarget?.label}? Jurnal settlement di-reverse dan sisa jaminan kembali bertambah.`}
        confirmLabel="Ya, Batalkan"
        variant="danger"
      />
    </div>
  );
};
