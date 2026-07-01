import { useState, useMemo } from 'react';
import {
  Wrench, Plus, Loader2, X, Calendar, ClipboardList, UserPlus, Play, CheckCircle2,
  Lock, XCircle, Package, Image as ImageIcon, AlertTriangle, Pencil, FilePlus, ListChecks,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { formatRupiah, formatDate } from '../../lib/formatters';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { can } from '../../lib/permissions';
import { toast } from 'sonner';
import { PhotoUploadModal } from './maintenance/PhotoUploadModal';
import { ChecklistEditor, type ChecklistItem } from './maintenance/ChecklistEditor';
import { CreateMrModal } from './materialRequest/CreateMrModal';
import { MR_STATUS_LABELS, MR_STATUS_BADGE, type MrStatus } from './materialRequest/types';

// Prefill payload for opening CreateWorkOrderModal from a due/overdue schedule.
type WoPrefill = {
  assetId: string;
  type: WoType;
  scheduleId: string;
  dueAt: string; // yyyy-mm-dd for <input type="date">
};

// GA Maintenance & Work Order — preventive schedules + corrective/preventive work orders.
// Two tabs: "Work Order" (lifecycle OPEN→ASSIGNED→IN_PROGRESS→DONE→CLOSED + CANCELLED)
// and "Jadwal Preventive" (interval-based next-due tracking). Read actions gated by view,
// write actions by can('ga_maintenance','edit').

type Tab = 'wo' | 'schedules';

type WoStatus = 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'DONE' | 'CLOSED' | 'CANCELLED';
type WoPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type WoType = 'PREVENTIVE' | 'CORRECTIVE';

const STATUS_LABELS: Record<WoStatus, string> = {
  OPEN: 'Terbuka',
  ASSIGNED: 'Ditugaskan',
  IN_PROGRESS: 'Dikerjakan',
  DONE: 'Selesai',
  CLOSED: 'Ditutup',
  CANCELLED: 'Dibatalkan',
};

const STATUS_BADGE: Record<WoStatus, string> = {
  OPEN: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  ASSIGNED: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  IN_PROGRESS: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  DONE: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  CLOSED: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  CANCELLED: 'bg-red-50 text-red-700 ring-1 ring-red-200',
};

const PRIORITY_LABELS: Record<WoPriority, string> = {
  LOW: 'Rendah',
  MEDIUM: 'Sedang',
  HIGH: 'Tinggi',
  URGENT: 'Mendesak',
};

const PRIORITY_BADGE: Record<WoPriority, string> = {
  LOW: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
  MEDIUM: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  HIGH: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  URGENT: 'bg-red-50 text-red-700 ring-1 ring-red-200',
};

const STATUS_FILTERS: WoStatus[] = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'CLOSED', 'CANCELLED'];

export const GaMaintenancePage = () => {
  const [tab, setTab] = useState<Tab>('wo');
  const canEdit = can('ga_maintenance', 'edit');

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Maintenance &amp; Work Order</h1>
          <p className="text-sm text-gray-500 mt-0.5">Perawatan preventif &amp; perintah kerja perbaikan aset GA.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        <TabButton active={tab === 'wo'} onClick={() => setTab('wo')} icon={<ClipboardList size={15} />} label="Work Order" />
        <TabButton active={tab === 'schedules'} onClick={() => setTab('schedules')} icon={<Calendar size={15} />} label="Jadwal Preventive" />
      </div>

      {tab === 'wo' ? <WorkOrderTab canEdit={canEdit} /> : <SchedulesTab canEdit={canEdit} />}
    </div>
  );
};

const TabButton = ({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
      active ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700',
    )}
  >
    {icon} {label}
  </button>
);

// ─────────────────────────────────────────────────────────────────────
// WORK ORDER TAB
// ─────────────────────────────────────────────────────────────────────

const WorkOrderTab = ({ canEdit }: { canEdit: boolean }) => {
  const [statusFilter, setStatusFilter] = useState<WoStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<WoPriority | ''>('');
  const [typeFilter, setTypeFilter] = useState<WoType | ''>('');
  const [mineOnly, setMineOnly] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['ga-work-orders', statusFilter, priorityFilter, typeFilter, mineOnly],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      if (typeFilter) params.type = typeFilter;
      if (mineOnly) params.mine = 'true';
      const res = await api.get('/ga/maintenance/work-orders', { params });
      return res.data as any[];
    },
  });
  const workOrders = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Status filter chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={statusFilter === ''} onClick={() => setStatusFilter('')}>Semua</Chip>
          {STATUS_FILTERS.map((s) => (
            <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>{STATUS_LABELS[s]}</Chip>
          ))}
        </div>
        {canEdit && (
          <button className="btn-primary bg-teal-600 hover:bg-teal-700 self-start" onClick={() => setIsCreateOpen(true)}>
            <Plus size={15} /> Buat Work Order
          </button>
        )}
      </div>

      {/* Secondary filters: priority / type / mine */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Prioritas</span>
          <select
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as WoPriority | '')}
          >
            <option value="">Semua</option>
            {(Object.keys(PRIORITY_LABELS) as WoPriority[]).map((p) => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Tipe</span>
          <select
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as WoType | '')}
          >
            <option value="">Semua</option>
            <option value="CORRECTIVE">Korektif</option>
            <option value="PREVENTIVE">Preventif</option>
          </select>
        </div>
        <Chip active={mineOnly} onClick={() => setMineOnly((v) => !v)}>WO Saya</Chip>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Kode</th>
                <th scope="col">Aset</th>
                <th scope="col">Judul</th>
                <th scope="col" className="text-center">Tipe</th>
                <th scope="col" className="text-center">Prioritas</th>
                <th scope="col" className="text-center">Status</th>
                <th scope="col">Teknisi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
                    Memuat work order...
                  </td>
                </tr>
              ) : workOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <Wrench className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Belum ada work order.</p>
                  </td>
                </tr>
              ) : (
                workOrders.map((wo: any) => (
                  <tr key={wo.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setDetailId(wo.id)}>
                    <td className="whitespace-nowrap">
                      <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">{wo.code}</span>
                    </td>
                    <td>
                      <span className="font-medium text-gray-800">{wo.asset?.name ?? '—'}</span>
                      {wo.asset?.code && <span className="block text-[11px] text-gray-400 font-mono">{wo.asset.code}</span>}
                    </td>
                    <td><span className="text-gray-700">{wo.title}</span></td>
                    <td className="text-center">
                      <span className="text-xs text-gray-600">{wo.type === 'PREVENTIVE' ? 'Preventif' : 'Korektif'}</span>
                    </td>
                    <td className="text-center">
                      <span className={cn('inline-block text-xs font-medium px-2 py-0.5 rounded-full', PRIORITY_BADGE[wo.priority as WoPriority])}>
                        {PRIORITY_LABELS[wo.priority as WoPriority] ?? wo.priority}
                      </span>
                    </td>
                    <td className="text-center">
                      <span className={cn('inline-block text-xs font-medium px-2 py-0.5 rounded-full', STATUS_BADGE[wo.status as WoStatus])}>
                        {STATUS_LABELS[wo.status as WoStatus] ?? wo.status}
                      </span>
                    </td>
                    <td className="text-gray-600 text-sm">{wo.assignedToId ? (wo.assignedToName ?? '—') : <span className="text-gray-300">—</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isCreateOpen && <CreateWorkOrderModal onClose={() => setIsCreateOpen(false)} />}
      {detailId && <WorkOrderDetailDrawer id={detailId} canEdit={canEdit} onClose={() => setDetailId(null)} />}
    </div>
  );
};

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={cn(
      'text-xs font-medium px-3 py-1.5 rounded-full transition-colors',
      active ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
    )}
  >
    {children}
  </button>
);

// ─────────────────────────────────────────────────────────────────────
// WORK ORDER DETAIL DRAWER
// ─────────────────────────────────────────────────────────────────────

const WorkOrderDetailDrawer = ({ id, canEdit, onClose }: { id: string; canEdit: boolean; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [partOpen, setPartOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [mrOpen, setMrOpen] = useState(false);

  const { data: wo, isLoading } = useQuery({
    queryKey: ['ga-wo', id],
    queryFn: async () => {
      const res = await api.get(`/ga/maintenance/work-orders/${id}`);
      return res.data as any;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ga-wo', id] });
    queryClient.invalidateQueries({ queryKey: ['ga-work-orders'] });
  };

  const startMutation = useMutation({
    mutationFn: () => api.patch(`/ga/maintenance/work-orders/${id}/start`),
    onSuccess: () => { toast.success('Work order dimulai.'); invalidate(); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal memulai work order.'),
  });

  const closeMutation = useMutation({
    mutationFn: () => api.patch(`/ga/maintenance/work-orders/${id}/close`),
    onSuccess: () => { toast.success('Work order ditutup.'); invalidate(); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal menutup work order.'),
  });

  const status = wo?.status as WoStatus | undefined;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl bg-white h-full shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-50 rounded-lg"><Wrench size={16} className="text-teal-600" /></div>
            <div>
              <p className="font-mono text-xs text-gray-500">{wo?.code ?? '...'}</p>
              <h2 className="text-base font-semibold text-gray-900">{wo?.title ?? 'Detail Work Order'}</h2>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><X size={18} /></button>
        </div>

        {isLoading || !wo ? (
          <div className="py-20 text-center text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
            Memuat detail...
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('inline-block text-xs font-medium px-2.5 py-1 rounded-full', STATUS_BADGE[status!])}>
                {STATUS_LABELS[status!]}
              </span>
              <span className={cn('inline-block text-xs font-medium px-2.5 py-1 rounded-full', PRIORITY_BADGE[wo.priority as WoPriority])}>
                {PRIORITY_LABELS[wo.priority as WoPriority]}
              </span>
              <span className="inline-block text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                {wo.type === 'PREVENTIVE' ? 'Preventif' : 'Korektif'}
              </span>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Info label="Aset" value={wo.asset ? `${wo.asset.name} (${wo.asset.code})` : '—'} />
              <Info label="Total Biaya" value={formatRupiah(Number(wo.totalCost ?? 0))} mono />
              <Info label="Dilaporkan" value={formatDate(wo.reportedAt)} />
              <Info label="Jatuh Tempo" value={wo.dueAt ? formatDate(wo.dueAt) : '—'} />
              <Info label="Mulai" value={wo.startedAt ? formatDate(wo.startedAt) : '—'} />
              <Info label="Selesai" value={wo.completedAt ? formatDate(wo.completedAt) : '—'} />
              <Info label="Komponen" value={wo.component || '—'} />
            </div>

            {wo.description && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Deskripsi</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{wo.description}</p>
              </div>
            )}

            {wo.resolution && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Penyelesaian</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{wo.resolution}</p>
              </div>
            )}

            {/* Lifecycle actions */}
            {canEdit && status && !['CLOSED', 'CANCELLED'].includes(status) && (
              <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                {['OPEN', 'ASSIGNED'].includes(status) && (
                  <ActionBtn onClick={() => setAssignOpen(true)} icon={<UserPlus size={14} />} label={status === 'ASSIGNED' ? 'Ubah Teknisi' : 'Assign'} />
                )}
                {status === 'ASSIGNED' && (
                  <ActionBtn onClick={() => startMutation.mutate()} loading={startMutation.isPending} icon={<Play size={14} />} label="Mulai" color="amber" />
                )}
                {['ASSIGNED', 'IN_PROGRESS'].includes(status) && (
                  <ActionBtn onClick={() => setCompleteOpen(true)} icon={<CheckCircle2 size={14} />} label="Selesaikan" color="teal" />
                )}
                {status === 'DONE' && (
                  <ActionBtn onClick={() => setCloseConfirm(true)} loading={closeMutation.isPending} icon={<Lock size={14} />} label="Tutup" color="green" />
                )}
                <ActionBtn onClick={() => setCancelOpen(true)} icon={<XCircle size={14} />} label="Batalkan" color="red" />
                <ActionBtn onClick={() => setMrOpen(true)} icon={<FilePlus size={14} />} label="Minta Sparepart / MR" />
              </div>
            )}

            {/* Parts */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Package size={13} /> Pemakaian Part
                </p>
                {canEdit && status && !['CLOSED', 'CANCELLED'].includes(status) && (
                  <button onClick={() => setPartOpen(true)} className="text-xs text-teal-600 hover:text-teal-700 font-medium">+ Tambah part</button>
                )}
              </div>
              {wo.parts?.length ? (
                <div className="space-y-1.5">
                  {wo.parts.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between text-xs bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                      <span className="text-gray-700">
                        {p.inventoryItem?.name ?? '—'}
                        <span className="text-gray-400 ml-1">({Number(p.quantity)} {p.inventoryItem?.uom ?? ''})</span>
                      </span>
                      <span className="font-mono text-gray-600">{formatRupiah(Number(p.quantity) * Number(p.unitCost))}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">Belum ada part dipakai.</p>
              )}
            </div>

            {/* Checklist (read-only, shown when WO has a saved checklist) */}
            {Array.isArray(wo.checklist) && wo.checklist.length > 0 && (
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <ListChecks size={13} /> Checklist
                </p>
                <div className="space-y-1.5">
                  {(wo.checklist as ChecklistItem[]).map((c) => (
                    <div key={c.id} className="flex items-start gap-2 text-sm bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                      {c.done ? (
                        <CheckCircle2 size={15} className="text-teal-600 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle size={15} className="text-gray-300 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <span className="text-gray-700">
                          {c.label}
                          {c.required && <span className="ml-1 text-[10px] font-medium text-red-500 uppercase">wajib</span>}
                        </span>
                        {c.notes && <span className="block text-[11px] text-gray-400">{c.notes}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Photos */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ImageIcon size={13} /> Foto ({wo.photos?.length ?? 0})
                </p>
                {canEdit && status && !['CLOSED', 'CANCELLED'].includes(status) && (wo.photos?.length ?? 0) < 6 && (
                  <button onClick={() => setPhotoOpen(true)} className="text-xs text-teal-600 hover:text-teal-700 font-medium">+ Tambah Foto</button>
                )}
              </div>
              {wo.photos?.length ? (
                <div className="grid grid-cols-3 gap-2">
                  {wo.photos.map((ph: any) => (
                    <div key={ph.id} className="relative">
                      <img src={`/uploads/${ph.filePath}`} alt={ph.caption ?? ph.type} className="w-full h-24 object-cover rounded-lg border border-gray-200" />
                      <span className="absolute top-1 left-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-black/60 text-white">
                        {ph.type === 'BEFORE' ? 'Sebelum' : 'Sesudah'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">Belum ada foto.</p>
              )}
            </div>

            {/* Cross-ref: Material Requests terkait WO ini */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <FilePlus size={13} /> Permintaan Barang (MR)
              </p>
              {wo.materialRequests?.length ? (
                <div className="space-y-1.5">
                  {wo.materialRequests.map((mr: { id: string; code: string; status: MrStatus; _count?: { items: number } }) => (
                    <div key={mr.id} className="flex items-center justify-between text-xs bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                      <span className="font-mono text-gray-700">
                        {mr.code}
                        <span className="text-gray-400 ml-1">({mr._count?.items ?? 0} item)</span>
                      </span>
                      <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', MR_STATUS_BADGE[mr.status as MrStatus])}>
                        {MR_STATUS_LABELS[mr.status as MrStatus]}
                      </span>
                    </div>
                  ))}
                  <p className="text-[11px] text-gray-400 mt-1">Kelola detail MR di menu Permintaan Barang (MR).</p>
                </div>
              ) : (
                <p className="text-xs text-gray-400">Belum ada permintaan barang untuk WO ini.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {assignOpen && <AssignModal id={id} onClose={() => setAssignOpen(false)} onDone={invalidate} />}
      {completeOpen && <CompleteModal id={id} onClose={() => setCompleteOpen(false)} onDone={invalidate} />}
      {partOpen && <AddPartModal id={id} onClose={() => setPartOpen(false)} onDone={invalidate} />}
      {photoOpen && <PhotoUploadModal id={id} onClose={() => setPhotoOpen(false)} onDone={invalidate} />}
      {cancelOpen && <CancelModal id={id} onClose={() => setCancelOpen(false)} onDone={() => { invalidate(); onClose(); }} />}
      {mrOpen && wo && (
        <CreateMrModal
          woContext={{ workOrderId: id, assetId: wo.asset?.id ?? null, woCode: wo.code }}
          onClose={() => { setMrOpen(false); invalidate(); }}
        />
      )}

      <ConfirmDialog
        open={closeConfirm}
        onCancel={() => setCloseConfirm(false)}
        onConfirm={() => { closeMutation.mutate(); setCloseConfirm(false); }}
        title="Tutup Work Order"
        message={`Tutup work order ${wo?.code}? Setelah ditutup tidak bisa diubah lagi.`}
        confirmLabel="Ya, Tutup"
      />
    </div>
  );
};

const Info = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div>
    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
    <p className={cn('text-sm text-gray-800', mono && 'font-mono tabular-nums')}>{value}</p>
  </div>
);

const ActionBtn = ({
  onClick, icon, label, color = 'gray', loading,
}: { onClick: () => void; icon: React.ReactNode; label: string; color?: 'gray' | 'teal' | 'amber' | 'green' | 'red'; loading?: boolean }) => {
  const colors: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    teal: 'bg-teal-600 text-white hover:bg-teal-700',
    amber: 'bg-amber-500 text-white hover:bg-amber-600',
    green: 'bg-green-600 text-white hover:bg-green-700',
    red: 'bg-red-50 text-red-600 hover:bg-red-100',
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn('flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50', colors[color])}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon} {label}
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────
// SHARED MODAL SHELL
// ─────────────────────────────────────────────────────────────────────

const ModalShell = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><X size={18} /></button>
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>
);

const fieldClass = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500';
const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

const useAssets = () =>
  useQuery({
    queryKey: ['ga-assets-select'],
    queryFn: async () => {
      const res = await api.get('/ga/assets', { params: { limit: 500 } });
      return (res.data as any[]) ?? [];
    },
  });

const useTechnicians = () =>
  useQuery({
    queryKey: ['ga-technicians'],
    queryFn: async () => {
      const res = await api.get('/users', { params: { limit: 200 } });
      return (res.data?.data as any[]) ?? [];
    },
  });

// ─────────────────────────────────────────────────────────────────────
// CREATE WORK ORDER MODAL
// ─────────────────────────────────────────────────────────────────────

const CreateWorkOrderModal = ({ prefill, onClose }: { prefill?: WoPrefill; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const { data: assets } = useAssets();
  const [form, setForm] = useState({
    assetId: prefill?.assetId ?? '',
    type: prefill?.type ?? ('CORRECTIVE' as WoType),
    priority: 'MEDIUM' as WoPriority,
    title: '',
    description: '',
    component: '',
    dueAt: prefill?.dueAt ?? '',
  });
  const scheduleId = prefill?.scheduleId;

  const mutation = useMutation({
    mutationFn: () => api.post('/ga/maintenance/work-orders', {
      assetId: form.assetId,
      type: form.type,
      priority: form.priority,
      title: form.title,
      description: form.description || null,
      component: form.component || null,
      scheduleId: scheduleId ?? null,
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
    }),
    onSuccess: () => {
      toast.success('Work order dibuat.');
      queryClient.invalidateQueries({ queryKey: ['ga-work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['ga-schedules'] });
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal membuat work order.'),
  });

  const submit = () => {
    if (!form.assetId) return toast.error('Aset wajib dipilih.');
    if (!form.title.trim()) return toast.error('Judul wajib diisi.');
    mutation.mutate();
  };

  return (
    <ModalShell title={scheduleId ? 'Buat WO dari Jadwal' : 'Buat Work Order'} onClose={onClose}>
      <div className="space-y-4">
        {scheduleId && (
          <div className="flex items-start gap-2 text-xs text-teal-700 bg-teal-50 rounded-lg p-3">
            <Calendar size={14} className="mt-0.5 shrink-0" />
            <span>WO ini terhubung ke jadwal preventif. Saat WO selesai, jadwal otomatis bergulir ke jatuh tempo berikutnya.</span>
          </div>
        )}
        <div>
          <label className={labelClass}>Aset *</label>
          <select
            className={fieldClass}
            value={form.assetId}
            disabled={!!prefill?.assetId}
            onChange={(e) => setForm({ ...form, assetId: e.target.value })}
          >
            <option value="">— Pilih aset —</option>
            {(assets ?? []).map((a: any) => (
              <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Tipe</label>
            <select className={fieldClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as WoType })}>
              <option value="CORRECTIVE">Korektif</option>
              <option value="PREVENTIVE">Preventif</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Prioritas</label>
            <select className={fieldClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as WoPriority })}>
              {(Object.keys(PRIORITY_LABELS) as WoPriority[]).map((p) => (
                <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelClass}>Judul *</label>
          <input className={fieldClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Contoh: Perbaikan AC ruang server" />
        </div>
        <div>
          <label className={labelClass}>Komponen (opsional)</label>
          <input className={fieldClass} value={form.component} onChange={(e) => setForm({ ...form, component: e.target.value })} placeholder="Contoh: V-belt, bearing, kompresor" />
        </div>
        <div>
          <label className={labelClass}>Jatuh Tempo (opsional)</label>
          <input type="date" className={fieldClass} value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Deskripsi</label>
          <textarea className={fieldClass} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
          <button onClick={submit} disabled={mutation.isPending} className="btn-primary bg-teal-600 hover:bg-teal-700 disabled:opacity-50">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />} Simpan
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

// ─────────────────────────────────────────────────────────────────────
// ASSIGN MODAL
// ─────────────────────────────────────────────────────────────────────

const AssignModal = ({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) => {
  const { data: techs } = useTechnicians();
  const [assignedToId, setAssignedToId] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.patch(`/ga/maintenance/work-orders/${id}/assign`, { assignedToId }),
    onSuccess: () => { toast.success('Teknisi ditugaskan.'); onDone(); onClose(); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal assign work order.'),
  });

  return (
    <ModalShell title="Assign Teknisi" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Teknisi *</label>
          <select className={fieldClass} value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
            <option value="">— Pilih teknisi —</option>
            {(techs ?? []).map((u: any) => (
              <option key={u.id} value={u.id}>{u.fullName} ({u.username})</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
          <button onClick={() => { if (!assignedToId) return toast.error('Teknisi wajib dipilih.'); mutation.mutate(); }} disabled={mutation.isPending} className="btn-primary bg-teal-600 hover:bg-teal-700 disabled:opacity-50">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />} Tugaskan
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

// ─────────────────────────────────────────────────────────────────────
// COMPLETE MODAL
// ─────────────────────────────────────────────────────────────────────

const CompleteModal = ({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) => {
  const [form, setForm] = useState({ resolution: '', laborHours: '', laborCost: '', externalVendor: '', externalCost: '' });
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);

  const mutation = useMutation({
    mutationFn: () => api.patch(`/ga/maintenance/work-orders/${id}/complete`, {
      resolution: form.resolution || null,
      checklist: checklist.length
        ? checklist.map((c) => ({ id: c.id, label: c.label, required: c.required, done: c.done, notes: c.notes || null }))
        : null,
      laborHours: form.laborHours ? Number(form.laborHours) : null,
      laborCost: form.laborCost ? Number(form.laborCost) : null,
      externalVendor: form.externalVendor || null,
      externalCost: form.externalCost ? Number(form.externalCost) : null,
    }),
    onSuccess: () => { toast.success('Work order selesai.'); onDone(); onClose(); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal menyelesaikan work order.'),
  });

  const submit = () => {
    if (checklist.some((c) => !c.label.trim())) return toast.error('Setiap item checklist wajib punya label.');
    mutation.mutate();
  };

  return (
    <ModalShell title="Selesaikan Work Order" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Penyelesaian / Resolusi</label>
          <textarea className={fieldClass} rows={3} value={form.resolution} onChange={(e) => setForm({ ...form, resolution: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Jam Kerja</label>
            <input type="number" min="0" className={fieldClass} value={form.laborHours} onChange={(e) => setForm({ ...form, laborHours: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Biaya Tenaga (Rp)</label>
            <input type="number" min="0" className={fieldClass} value={form.laborCost} onChange={(e) => setForm({ ...form, laborCost: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Vendor Eksternal</label>
            <input className={fieldClass} value={form.externalVendor} onChange={(e) => setForm({ ...form, externalVendor: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Biaya Eksternal (Rp)</label>
            <input type="number" min="0" className={fieldClass} value={form.externalCost} onChange={(e) => setForm({ ...form, externalCost: e.target.value })} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Checklist Penyelesaian</label>
          <p className="text-[11px] text-gray-400 mb-2">Item bertanda "Wajib" harus dicentang "Selesai" sebelum WO bisa ditutup.</p>
          <ChecklistEditor items={checklist} onChange={setChecklist} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
          <button onClick={submit} disabled={mutation.isPending} className="btn-primary bg-teal-600 hover:bg-teal-700 disabled:opacity-50">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />} Tandai Selesai
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

// ─────────────────────────────────────────────────────────────────────
// ADD PART MODAL
// ─────────────────────────────────────────────────────────────────────

const AddPartModal = ({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) => {
  const { data: items } = useQuery({
    queryKey: ['ga-inventory-items-select'],
    queryFn: async () => {
      const res = await api.get('/ga/inventory/items', { params: { limit: 500 } });
      return (res.data as any[]) ?? [];
    },
  });
  const { data: locations } = useQuery({
    queryKey: ['ga-locations-select'],
    queryFn: async () => {
      const res = await api.get('/ga/master/locations');
      return (res.data as any[]) ?? [];
    },
  });
  const [form, setForm] = useState({ inventoryItemId: '', fromLocationId: '', quantity: '', unitCost: '' });

  const mutation = useMutation({
    mutationFn: () => api.post(`/ga/maintenance/work-orders/${id}/parts`, {
      inventoryItemId: form.inventoryItemId,
      fromLocationId: form.fromLocationId || null,
      quantity: Number(form.quantity),
      unitCost: Number(form.unitCost) || 0,
    }),
    onSuccess: (res: any) => {
      if (res.data?.warning) toast.warning(res.data.warning);
      else toast.success('Part dicatat.');
      onDone();
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal mencatat part.'),
  });

  const submit = () => {
    if (!form.inventoryItemId) return toast.error('Item wajib dipilih.');
    if (!form.quantity || Number(form.quantity) <= 0) return toast.error('Qty harus lebih dari 0.');
    mutation.mutate();
  };

  return (
    <ModalShell title="Tambah Pemakaian Part" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Item Inventory *</label>
          <select className={fieldClass} value={form.inventoryItemId} onChange={(e) => setForm({ ...form, inventoryItemId: e.target.value })}>
            <option value="">— Pilih item —</option>
            {(items ?? []).map((it: any) => (
              <option key={it.id} value={it.id}>{it.sku} — {it.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Lokasi Asal (opsional, kurangi stok)</label>
          <select className={fieldClass} value={form.fromLocationId} onChange={(e) => setForm({ ...form, fromLocationId: e.target.value })}>
            <option value="">— Tanpa pengurangan stok —</option>
            {(locations ?? []).map((l: any) => (
              <option key={l.id} value={l.id}>{l.code} — {l.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Qty *</label>
            <input type="number" min="0" step="any" className={fieldClass} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Harga Satuan (Rp)</label>
            <input type="number" min="0" className={fieldClass} value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
          <button onClick={submit} disabled={mutation.isPending} className="btn-primary bg-teal-600 hover:bg-teal-700 disabled:opacity-50">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />} Tambah
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

// ─────────────────────────────────────────────────────────────────────
// CANCEL MODAL
// ─────────────────────────────────────────────────────────────────────

const CancelModal = ({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) => {
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.patch(`/ga/maintenance/work-orders/${id}/cancel`, { reason }),
    onSuccess: () => { toast.success('Work order dibatalkan.'); onDone(); onClose(); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal membatalkan work order.'),
  });

  return (
    <ModalShell title="Batalkan Work Order" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>Work order yang dibatalkan tidak bisa dikembalikan.</span>
        </div>
        <div>
          <label className={labelClass}>Alasan Pembatalan *</label>
          <textarea className={fieldClass} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Tutup</button>
          <button onClick={() => { if (!reason.trim()) return toast.error('Alasan wajib diisi.'); mutation.mutate(); }} disabled={mutation.isPending} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />} Batalkan WO
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

// ─────────────────────────────────────────────────────────────────────
// SCHEDULES TAB
// ─────────────────────────────────────────────────────────────────────

const SchedulesTab = ({ canEdit }: { canEdit: boolean }) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editSchedule, setEditSchedule] = useState<ScheduleRow | null>(null);
  const [woPrefill, setWoPrefill] = useState<WoPrefill | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['ga-schedules'],
    queryFn: async () => {
      const res = await api.get('/ga/maintenance/schedules');
      return (res.data as any[]) ?? [];
    },
  });
  const schedules = data ?? [];
  const now = useMemo(() => new Date(), []);

  const intervalLabel = (s: any) => {
    if (s.intervalDays) return `${s.intervalDays} hari`;
    if (s.intervalHours) return `${s.intervalHours} jam`;
    if (s.intervalKm) return `${s.intervalKm} km`;
    return '—';
  };

  // Format an ISO/date string to yyyy-mm-dd for <input type="date"> prefill.
  const toDateInput = (v: string | null) => (v ? new Date(v).toISOString().slice(0, 10) : '');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {canEdit && (
          <button className="btn-primary bg-teal-600 hover:bg-teal-700" onClick={() => setIsCreateOpen(true)}>
            <Plus size={15} /> Buat Jadwal
          </button>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Aset</th>
                <th scope="col">Interval</th>
                <th scope="col">Jatuh Tempo Berikutnya</th>
                <th scope="col">Catatan</th>
                <th scope="col" className="text-center">Status</th>
                {canEdit && <th scope="col" className="text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={canEdit ? 6 : 5} className="py-16 text-center text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
                    Memuat jadwal...
                  </td>
                </tr>
              ) : schedules.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 6 : 5} className="py-16 text-center">
                    <Calendar className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Belum ada jadwal preventive.</p>
                  </td>
                </tr>
              ) : (
                schedules.map((s: any) => {
                  const due = s.nextDueAt ? new Date(s.nextDueAt) : null;
                  const isOverdue = s.isActive && due !== null && due < now;
                  const isDueSoon = s.isActive && due !== null && !isOverdue && (due.getTime() - now.getTime()) < 7 * 24 * 3600 * 1000;
                  const canMakeWo = s.isActive && (isOverdue || isDueSoon);
                  return (
                    <tr key={s.id} className={!s.isActive ? 'opacity-50' : ''}>
                      <td>
                        <span className="font-medium text-gray-800">{s.asset?.name ?? '—'}</span>
                        {s.asset?.code && <span className="block text-[11px] text-gray-400 font-mono">{s.asset.code}</span>}
                      </td>
                      <td className="text-gray-700">{intervalLabel(s)}</td>
                      <td className="whitespace-nowrap">
                        <span className={cn('text-sm', isOverdue ? 'text-red-600 font-semibold' : isDueSoon ? 'text-amber-600 font-medium' : 'text-gray-600')}>
                          {formatDate(s.nextDueAt)}
                          {isOverdue && <span className="block text-[10px] uppercase">Lewat tempo</span>}
                          {isDueSoon && <span className="block text-[10px] uppercase">Segera jatuh tempo</span>}
                        </span>
                      </td>
                      <td className="text-gray-500 text-sm">{s.notes || <span className="text-gray-300">—</span>}</td>
                      <td className="text-center">
                        <span className={cn('inline-block text-xs font-medium px-2 py-0.5 rounded-full', s.isActive ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : 'bg-gray-100 text-gray-500 ring-1 ring-gray-200')}>
                          {s.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {canMakeWo && s.asset?.id && (
                              <button
                                onClick={() => setWoPrefill({ assetId: s.asset.id, type: 'PREVENTIVE', scheduleId: s.id, dueAt: toDateInput(s.nextDueAt) })}
                                className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700"
                              >
                                <FilePlus size={13} /> Buat WO
                              </button>
                            )}
                            <button
                              onClick={() => setEditSchedule(s)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
                            >
                              <Pencil size={13} /> Edit
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isCreateOpen && <CreateScheduleModal onClose={() => setIsCreateOpen(false)} />}
      {editSchedule && <EditScheduleModal schedule={editSchedule} onClose={() => setEditSchedule(null)} />}
      {woPrefill && <CreateWorkOrderModal prefill={woPrefill} onClose={() => setWoPrefill(null)} />}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// CREATE SCHEDULE MODAL
// ─────────────────────────────────────────────────────────────────────

const CreateScheduleModal = ({ onClose }: { onClose: () => void }) => {
  const queryClient = useQueryClient();
  const { data: assets } = useAssets();
  const [form, setForm] = useState({ assetId: '', intervalDays: '', intervalHours: '', intervalKm: '', nextDueAt: '', notes: '' });

  const mutation = useMutation({
    mutationFn: () => api.post('/ga/maintenance/schedules', {
      assetId: form.assetId,
      intervalDays: form.intervalDays ? Number(form.intervalDays) : null,
      intervalHours: form.intervalHours ? Number(form.intervalHours) : null,
      intervalKm: form.intervalKm ? Number(form.intervalKm) : null,
      nextDueAt: form.nextDueAt,
      notes: form.notes || null,
    }),
    onSuccess: () => {
      toast.success('Jadwal dibuat.');
      queryClient.invalidateQueries({ queryKey: ['ga-schedules'] });
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal membuat jadwal.'),
  });

  const submit = () => {
    if (!form.assetId) return toast.error('Aset wajib dipilih.');
    if (!form.intervalDays && !form.intervalHours && !form.intervalKm) return toast.error('Isi salah satu interval (hari, jam, atau km).');
    if (!form.nextDueAt) return toast.error('Tanggal jatuh tempo berikutnya wajib diisi.');
    mutation.mutate();
  };

  return (
    <ModalShell title="Buat Jadwal Preventive" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Aset *</label>
          <select className={fieldClass} value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })}>
            <option value="">— Pilih aset —</option>
            {(assets ?? []).map((a: any) => (
              <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-2">Isi salah satu interval di bawah ini.</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Interval Hari</label>
              <input type="number" min="0" className={fieldClass} value={form.intervalDays} onChange={(e) => setForm({ ...form, intervalDays: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Interval Jam</label>
              <input type="number" min="0" className={fieldClass} value={form.intervalHours} onChange={(e) => setForm({ ...form, intervalHours: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Interval Km</label>
              <input type="number" min="0" className={fieldClass} value={form.intervalKm} onChange={(e) => setForm({ ...form, intervalKm: e.target.value })} />
            </div>
          </div>
        </div>
        <div>
          <label className={labelClass}>Jatuh Tempo Berikutnya *</label>
          <input type="date" className={fieldClass} value={form.nextDueAt} onChange={(e) => setForm({ ...form, nextDueAt: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Catatan</label>
          <textarea className={fieldClass} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
          <button onClick={submit} disabled={mutation.isPending} className="btn-primary bg-teal-600 hover:bg-teal-700 disabled:opacity-50">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />} Simpan
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

// ─────────────────────────────────────────────────────────────────────
// EDIT SCHEDULE MODAL
// ─────────────────────────────────────────────────────────────────────

type ScheduleRow = {
  id: string;
  intervalDays: number | null;
  intervalHours: number | null;
  intervalKm: number | null;
  nextDueAt: string | null;
  notes: string | null;
  isActive: boolean;
  asset?: { id: string; code?: string; name?: string } | null;
};

const EditScheduleModal = ({ schedule, onClose }: { schedule: ScheduleRow; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const toDateInput = (v: string | null) => (v ? new Date(v).toISOString().slice(0, 10) : '');
  const [form, setForm] = useState({
    intervalDays: schedule.intervalDays != null ? String(schedule.intervalDays) : '',
    intervalHours: schedule.intervalHours != null ? String(schedule.intervalHours) : '',
    intervalKm: schedule.intervalKm != null ? String(schedule.intervalKm) : '',
    nextDueAt: toDateInput(schedule.nextDueAt),
    notes: schedule.notes ?? '',
    isActive: !!schedule.isActive,
  });

  const mutation = useMutation({
    mutationFn: () => api.put(`/ga/maintenance/schedules/${schedule.id}`, {
      intervalDays: form.intervalDays ? Number(form.intervalDays) : null,
      intervalHours: form.intervalHours ? Number(form.intervalHours) : null,
      intervalKm: form.intervalKm ? Number(form.intervalKm) : null,
      nextDueAt: form.nextDueAt || undefined,
      notes: form.notes || null,
      isActive: form.isActive,
    }),
    onSuccess: () => {
      toast.success('Jadwal diperbarui.');
      queryClient.invalidateQueries({ queryKey: ['ga-schedules'] });
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal memperbarui jadwal.'),
  });

  const submit = () => {
    if (!form.intervalDays && !form.intervalHours && !form.intervalKm) {
      return toast.error('Isi salah satu interval (hari, jam, atau km).');
    }
    mutation.mutate();
  };

  return (
    <ModalShell title="Edit Jadwal Preventive" onClose={onClose}>
      <div className="space-y-4">
        <div className="text-sm text-gray-600">
          <span className="font-medium text-gray-800">{schedule.asset?.name ?? '—'}</span>
          {schedule.asset?.code && <span className="ml-1 text-xs font-mono text-gray-400">({schedule.asset.code})</span>}
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-2">Isi salah satu interval di bawah ini.</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Interval Hari</label>
              <input type="number" min="0" className={fieldClass} value={form.intervalDays} onChange={(e) => setForm({ ...form, intervalDays: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Interval Jam</label>
              <input type="number" min="0" className={fieldClass} value={form.intervalHours} onChange={(e) => setForm({ ...form, intervalHours: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Interval Km</label>
              <input type="number" min="0" className={fieldClass} value={form.intervalKm} onChange={(e) => setForm({ ...form, intervalKm: e.target.value })} />
            </div>
          </div>
        </div>
        <div>
          <label className={labelClass}>Jatuh Tempo Berikutnya</label>
          <input type="date" className={fieldClass} value={form.nextDueAt} onChange={(e) => setForm({ ...form, nextDueAt: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Catatan</label>
          <textarea className={fieldClass} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          Jadwal aktif
        </label>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
          <button onClick={submit} disabled={mutation.isPending} className="btn-primary bg-teal-600 hover:bg-teal-700 disabled:opacity-50">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />} Simpan
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
