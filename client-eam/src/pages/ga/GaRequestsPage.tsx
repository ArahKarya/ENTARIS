import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Loader2, Plus, Wrench, ReceiptText, Check, X, Ban, AlertTriangle,
} from 'lucide-react';
import api from '../../lib/api';
import { formatDate, formatRupiah } from '../../lib/formatters';
import { can } from '../../lib/permissions';
import { CreateRequestModal } from './requests/CreateRequestModal';
import {
  REQ_STATUS_LABELS, REQ_STATUS_BADGE, REQ_STATUS_FILTERS,
  SERVICE_TYPE_LABELS, TAX_TYPE_LABELS, URGENSI_LABELS, URGENSI_BADGE,
  apiErrorMessage,
  type ReqStatus, type ServiceRequestRow, type TaxRequestRow, type UnifiedRow,
} from './requests/types';

type KindFilter = '' | 'SERVICE' | 'TAX';

/**
 * Panel pengajuan terpusat: satu tempat untuk mengajukan servis kendaraan &
 * pajak/STNK/KIR (tanpa harus buka halaman kendaraan dulu) sekaligus memantau
 * status semua pengajuan. Approve/reject dikerjakan dari sini juga.
 */
/** Dipakai sebagai TAB di dalam halaman Maintenance & Work Order. */
export function RequestsTab() {
  const canEdit = can('ga_vehicle', 'edit');
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<ReqStatus | ''>('SUBMITTED');
  const [kindFilter, setKindFilter] = useState<KindFilter>('');
  const [createMode, setCreateMode] = useState<'SERVICE' | 'TAX' | null>(null);

  const svcQuery = useQuery<ServiceRequestRow[]>({
    queryKey: ['ga-service-requests', statusFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      return (await api.get('/ga/vehicle/service-requests', { params })).data;
    },
  });

  const taxQuery = useQuery<TaxRequestRow[]>({
    queryKey: ['ga-tax-requests', statusFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      return (await api.get('/ga/vehicle/tax-requests', { params })).data;
    },
  });

  const isLoading = svcQuery.isLoading || taxQuery.isLoading;

  const rows = useMemo<UnifiedRow[]>(() => {
    const svc: UnifiedRow[] = (svcQuery.data ?? []).map((r) => ({
      kind: 'SERVICE',
      id: r.id,
      status: r.status,
      urgensi: r.urgensi,
      jenis: SERVICE_TYPE_LABELS[r.jenisService] ?? r.jenisService,
      keterangan: r.deskripsi,
      assetLabel: r.asset ? `${r.asset.code} — ${r.asset.name}` : '—',
      nominal: null,
      createdAt: r.createdAt,
      tindakLanjut: r.workOrder ? `WO ${r.workOrder.code}` : r.rejectedReason ? `Ditolak: ${r.rejectedReason}` : null,
    }));
    const tax: UnifiedRow[] = (taxQuery.data ?? []).map((r) => ({
      kind: 'TAX',
      id: r.id,
      status: r.status,
      urgensi: r.urgensi,
      jenis: `${TAX_TYPE_LABELS[r.type] ?? r.type} ${r.periodYear}`,
      keterangan: r.deskripsi || `Jatuh tempo ${formatDate(r.dueDate)}`,
      assetLabel: r.asset ? `${r.asset.code} — ${r.asset.name}` : '—',
      nominal: r.estimatedAmount != null ? Number(r.estimatedAmount) : null,
      createdAt: r.createdAt,
      tindakLanjut: r.tax ? `Pajak ${r.tax.periodYear} (${r.tax.status})` : r.rejectedReason ? `Ditolak: ${r.rejectedReason}` : null,
    }));
    const all = [...svc, ...tax].filter((r) => !kindFilter || r.kind === kindFilter);
    return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [svcQuery.data, taxQuery.data, kindFilter]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['ga-service-requests'] });
    queryClient.invalidateQueries({ queryKey: ['ga-tax-requests'] });
  };

  const basePath = (r: UnifiedRow) =>
    r.kind === 'SERVICE' ? '/ga/vehicle/service-requests' : '/ga/vehicle/tax-requests';

  const approve = useMutation({
    mutationFn: (r: UnifiedRow) => api.patch(`${basePath(r)}/${r.id}/approve`),
    onSuccess: () => { toast.success('Pengajuan disetujui.'); refresh(); },
    onError: (e) => toast.error(apiErrorMessage(e, 'Gagal approve.')),
  });

  const reject = useMutation({
    mutationFn: ({ row, reason }: { row: UnifiedRow; reason: string }) =>
      api.patch(`${basePath(row)}/${row.id}/reject`, { reason }),
    onSuccess: () => { toast.success('Pengajuan ditolak.'); refresh(); },
    onError: (e) => toast.error(apiErrorMessage(e, 'Gagal reject.')),
  });

  const cancel = useMutation({
    mutationFn: (r: UnifiedRow) => api.patch(`${basePath(r)}/${r.id}/cancel`),
    onSuccess: () => { toast.success('Pengajuan dibatalkan.'); refresh(); },
    onError: (e) => toast.error(apiErrorMessage(e, 'Gagal cancel.')),
  });

  const handleReject = (row: UnifiedRow) => {
    const reason = window.prompt('Alasan penolakan:');
    if (!reason || !reason.trim()) return;
    reject.mutate({ row, reason: reason.trim() });
  };

  // Ringkasan cepat (dihitung dari data yang tampil).
  const counts = useMemo(() => {
    const submitted = rows.filter((r) => r.status === 'SUBMITTED').length;
    const urgent = rows.filter((r) => r.status === 'SUBMITTED' && (r.urgensi === 'URGENT' || r.urgensi === 'HIGH')).length;
    const approved = rows.filter((r) => r.status === 'APPROVED').length;
    return { submitted, urgent, approved, total: rows.length };
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Ajukan servis kendaraan atau pajak/STNK/KIR di sini; setelah disetujui, tindak lanjutnya
          muncul sebagai Work Order / catatan pajak.
        </p>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCreateMode('SERVICE')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
            >
              <Plus size={16} /> Ajukan Servis
            </button>
            <button
              onClick={() => setCreateMode('TAX')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
            >
              <Plus size={16} /> Ajukan Pajak / KIR
            </button>
          </div>
        )}
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Menunggu Approval" value={counts.submitted} tone="blue" />
        <StatCard label="Mendesak" value={counts.urgent} tone="red" icon={<AlertTriangle size={14} />} />
        <StatCard label="Disetujui" value={counts.approved} tone="teal" />
        <StatCard label="Total Tampil" value={counts.total} tone="gray" />
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          <Chip active={statusFilter === ''} onClick={() => setStatusFilter('')}>Semua Status</Chip>
          {REQ_STATUS_FILTERS.map((s) => (
            <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {REQ_STATUS_LABELS[s]}
            </Chip>
          ))}
        </div>
        <span className="mx-1 h-5 w-px bg-gray-200 hidden md:block" />
        <div className="flex flex-wrap gap-2">
          <Chip active={kindFilter === ''} onClick={() => setKindFilter('')}>Semua Jenis</Chip>
          <Chip active={kindFilter === 'SERVICE'} onClick={() => setKindFilter('SERVICE')}>Servis</Chip>
          <Chip active={kindFilter === 'TAX'} onClick={() => setKindFilter('TAX')}>Pajak / KIR</Chip>
        </div>
      </div>

      {/* Tabel */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
        {isLoading ? (
          <div className="p-10 flex justify-center text-gray-400"><Loader2 className="animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">Tidak ada pengajuan pada filter ini.</div>
        ) : (
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Tanggal</th>
                <th className="text-left px-4 py-3 font-medium">Jenis</th>
                <th className="text-left px-4 py-3 font-medium">Kendaraan</th>
                <th className="text-left px-4 py-3 font-medium">Keterangan</th>
                <th className="text-right px-4 py-3 font-medium">Estimasi</th>
                <th className="text-center px-4 py-3 font-medium">Urgensi</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Tindak Lanjut</th>
                {canEdit && <th className="text-center px-4 py-3 font-medium">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-gray-900 font-medium">
                      {r.kind === 'SERVICE'
                        ? <Wrench size={13} className="text-teal-600" />
                        : <ReceiptText size={13} className="text-indigo-600" />}
                      {r.jenis}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.assetLabel}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={r.keterangan}>{r.keterangan}</td>
                  <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">
                    {r.nominal != null ? formatRupiah(r.nominal) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${URGENSI_BADGE[r.urgensi]}`}>
                      {URGENSI_LABELS[r.urgensi]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${REQ_STATUS_BADGE[r.status]}`}>
                      {REQ_STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate" title={r.tindakLanjut ?? ''}>
                    {r.tindakLanjut ?? '—'}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {r.status === 'SUBMITTED' && (
                          <>
                            <IconBtn title="Setujui" tone="teal" onClick={() => approve.mutate(r)}>
                              <Check size={14} />
                            </IconBtn>
                            <IconBtn title="Tolak" tone="red" onClick={() => handleReject(r)}>
                              <X size={14} />
                            </IconBtn>
                            <IconBtn title="Batalkan" tone="gray" onClick={() => cancel.mutate(r)}>
                              <Ban size={14} />
                            </IconBtn>
                          </>
                        )}
                        {r.status === 'APPROVED' && (
                          <IconBtn title="Batalkan" tone="gray" onClick={() => cancel.mutate(r)}>
                            <Ban size={14} />
                          </IconBtn>
                        )}
                        {['REJECTED', 'COMPLETED', 'CANCELLED'].includes(r.status) && (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {createMode && <CreateRequestModal mode={createMode} onClose={() => setCreateMode(null)} />}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded-full font-medium ${
        active ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

const TONE_CARD: Record<string, string> = {
  blue: 'text-blue-700',
  red: 'text-red-600',
  teal: 'text-teal-700',
  gray: 'text-gray-700',
};

function StatCard({ label, value, tone, icon }: { label: string; value: number; tone: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
      <p className="text-xs text-gray-500 flex items-center gap-1">{icon}{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${TONE_CARD[tone] ?? 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

const TONE_BTN: Record<string, string> = {
  teal: 'text-teal-600 hover:bg-teal-50',
  red: 'text-red-600 hover:bg-red-50',
  gray: 'text-gray-500 hover:bg-gray-100',
};

function IconBtn({
  title, tone, onClick, children,
}: { title: string; tone: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} className={`p-1.5 rounded-md ${TONE_BTN[tone]}`}>
      {children}
    </button>
  );
}
