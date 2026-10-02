import { useState } from 'react';
import { Plus, Search, Truck, ChevronLeft, ChevronRight, AlertCircle, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { formatDate } from '../lib/formatters';
import { useDebounce } from '../hooks/useDebounce';
import TableRowSkeleton from '../components/TableRowSkeleton';
import Select from '../components/Select';
import TemporaryDeliveryNoteModal from '../components/TemporaryDeliveryNoteModal';
import TemporaryDeliveryNoteDrawer, { SJS_STATUS } from '../components/TemporaryDeliveryNoteDrawer';
import { can } from '../lib/permissions';

const PAGE_SIZE = 25;
const REMINDER_DAYS = 7; // keputusan Ndoro: pengingat SJS Terbuka > 7 hari

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'Open', label: 'Terbuka' },
  { value: 'Linked', label: 'Tertaut' },
  { value: 'Cancelled', label: 'Dibatalkan' },
];

export default function TemporaryDeliveryNotes() {
  const [searchTerm, setSearchTerm] = useState('');
  const debounced = useDebounce(searchTerm, 200);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canCreate = can("delivery_order", "edit");

  const { data: summary } = useQuery({
    queryKey: ['temporary-delivery-notes-summary'],
    queryFn: async () => (await api.get(`/temporary-delivery-notes/summary?days=${REMINDER_DAYS}`)).data as { open: number; overdue: number },
    refetchInterval: 60_000,
  });

  const { data: resp, isLoading, isError } = useQuery({
    queryKey: ['temporary-delivery-notes', debounced, status, page],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (debounced) p.set('search', debounced);
      if (status) p.set('status', status);
      return (await api.get(`/temporary-delivery-notes?${p.toString()}`)).data as { data: any[]; total: number };
    },
  });

  const rows = resp?.data ?? [];
  const totalPages = Math.max(1, Math.ceil((resp?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Barang dikirim sebelum produksi diinput. <b>Tidak memotong stok, tanpa jurnal, tidak bisa diinvoice.</b> Tautkan ke surat jalan resmi setelah produksi selesai.
        </p>
        {canCreate && (
          <button className="btn-primary self-start whitespace-nowrap" onClick={() => setCreateOpen(true)}>
            <Plus size={15} /> Buat Surat Jalan Sementara
          </button>
        )}
      </div>

      {summary && summary.open > 0 && (
        <div className={cn('flex items-center gap-2 text-sm rounded-lg px-3 py-2 border',
          summary.overdue > 0 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800')}>
          <Clock size={15} />
          <span>
            <b>{summary.open}</b> surat jalan sementara masih Terbuka (belum ditautkan ke surat jalan resmi)
            {summary.overdue > 0 && <> — <b>{summary.overdue}</b> sudah lebih dari {REMINDER_DAYS} hari</>}.
          </span>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap filter-bar">
        <div className="relative flex-1 min-w-0 sm:max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" placeholder="Cari nomor, pelanggan, no. mobil..." value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-44">
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Tanggal</th>
                <th scope="col">Nomor</th>
                <th scope="col">Pelanggan</th>
                <th scope="col">No. Mobil</th>
                <th scope="col">Barang</th>
                <th scope="col" className="text-center">Status</th>
                <th scope="col">DO Resmi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableRowSkeleton columns={7} rows={6} />
              ) : isError ? (
                <tr><td colSpan={7} className="py-12 text-center">
                  <AlertCircle className="w-8 h-8 text-red-300 mx-auto mb-2" />
                  <p className="text-sm text-red-500">Gagal memuat daftar surat jalan sementara.</p>
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="py-16 text-center">
                  <Truck className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Belum ada surat jalan sementara.</p>
                </td></tr>
              ) : (
                rows.map((r: any) => {
                  const sc = SJS_STATUS[r.status] ?? SJS_STATUS.Open;
                  const stale = r.status === 'Open' && r.umur_hari > REMINDER_DAYS;
                  return (
                    <tr key={r.id} onClick={() => setSelectedId(r.id)} className="cursor-pointer">
                      <td className="text-gray-500 whitespace-nowrap">{formatDate(r.date)}</td>
                      <td className="whitespace-nowrap">
                        <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">{r.number}</span>
                      </td>
                      <td className="font-medium text-gray-800">{r.customerName}</td>
                      <td className="font-mono text-xs text-gray-600 uppercase whitespace-nowrap">{r.nomorMobil || <span className="text-gray-300">—</span>}</td>
                      <td className="text-xs text-gray-600 max-w-xs truncate" title={r.ringkasan}>{r.ringkasan}</td>
                      <td className="text-center whitespace-nowrap">
                        <span className={sc.badge}>{sc.label}</span>
                        {stale && <span className="block text-[10px] text-red-600 mt-0.5">{r.umur_hari} hari</span>}
                      </td>
                      <td>{r.doNumber ? <span className="font-mono text-xs text-green-700">{r.doNumber}</span> : <span className="text-gray-300 text-xs">—</span>}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {(resp?.total ?? 0) > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
            <p className="text-xs text-gray-400">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, resp?.total ?? 0)} dari {resp?.total ?? 0}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30" aria-label="Sebelumnya"><ChevronLeft size={16} /></button>
              <span className="text-xs text-gray-500 px-2">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30" aria-label="Berikutnya"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>

      {createOpen && <TemporaryDeliveryNoteModal onClose={() => setCreateOpen(false)} />}
      <TemporaryDeliveryNoteDrawer noteId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
