import { useState } from 'react';
import { Plus, PackageSearch, Loader2, Wrench } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { formatDate } from '../../lib/formatters';
import { can } from '../../lib/permissions';
import { CreateMrModal } from './materialRequest/CreateMrModal';
import { MrDetailDrawer } from './materialRequest/MrDetailDrawer';
import {
  MR_STATUS_LABELS,
  MR_STATUS_BADGE,
  MR_STATUS_FILTERS,
  type MrStatus,
  type MrListRow,
} from './materialRequest/types';

export function GaMaterialRequestPage() {
  const canEdit = can('ga_material_request', 'edit');
  const [statusFilter, setStatusFilter] = useState<MrStatus | ''>('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery<MrListRow[]>({
    queryKey: ['ga-material-requests', statusFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      return (await api.get('/ga/material-requests', { params })).data;
    },
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <PackageSearch className="text-teal-600" /> Permintaan Barang (MR)
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Surat permintaan barang &amp; pengadaan sparepart maintenance — dari permintaan sampai barang masuk stok.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
          >
            <Plus size={16} /> Buat MR
          </button>
        )}
      </div>

      {/* Filter status */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Chip active={statusFilter === ''} onClick={() => setStatusFilter('')}>
          Semua
        </Chip>
        {MR_STATUS_FILTERS.map((s) => (
          <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
            {MR_STATUS_LABELS[s]}
          </Chip>
        ))}
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-10 flex justify-center text-gray-400">
            <Loader2 className="animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">Belum ada permintaan barang.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Kode</th>
                <th className="text-left px-4 py-3 font-medium">Aset / Mesin</th>
                <th className="text-left px-4 py-3 font-medium">WO</th>
                <th className="text-center px-4 py-3 font-medium">Item</th>
                <th className="text-left px-4 py-3 font-medium">Tanggal</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.map((mr) => (
                <tr key={mr.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setDetailId(mr.id)}>
                  <td className="px-4 py-3 font-medium text-gray-900">{mr.code}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {mr.asset ? `${mr.asset.code} — ${mr.asset.name}` : mr.machineTarget || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {mr.workOrder ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Wrench size={12} /> {mr.workOrder.code}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700">{mr._count?.items ?? mr.items.length}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(mr.createdAt)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${MR_STATUS_BADGE[mr.status]}`}>
                      {MR_STATUS_LABELS[mr.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isCreateOpen && <CreateMrModal onClose={() => setIsCreateOpen(false)} />}
      {detailId && <MrDetailDrawer id={detailId} canEdit={canEdit} onClose={() => setDetailId(null)} />}
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
