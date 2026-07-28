import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../../lib/api';
import {
  Calendar, Lock, Unlock, Plus, CheckCircle2, ChevronRight, Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { cn } from '../../lib/utils';
import { ConfirmDialog } from '../../components/ConfirmDialog';

interface FiscalYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
  closedAt: string | null;
}

export const FiscalYearsTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const [confirmReopen, setConfirmReopen] = useState<string | null>(null);

  const { data: years, isLoading } = useQuery<FiscalYear[]>({
    queryKey: ['fiscal-years'],
    queryFn: async () => { const res = await api.get('/fiscal-years'); return res.data; }
  });

  const createMutation = useMutation({
    mutationFn: async (d: any) => api.post('/fiscal-years', d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] });
      setIsModalOpen(false); setNewName(''); setNewStart(''); setNewEnd('');
      toast.success('Tahun buku berhasil dibuat.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal membuat tahun buku.')
  });

  const closeMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/fiscal-years/${id}/close`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] });
      toast.success('Tahun buku berhasil ditutup.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal menutup tahun buku.')
  });

  const reopenMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/fiscal-years/${id}/reopen`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] });
      toast.success('Tahun buku berhasil dibuka kembali.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal membuka tahun buku.')
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Periode Akuntansi</h2>
          <p className="text-sm text-gray-500 mt-0.5">Kelola tahun buku dan proses tutup buku.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary">
          <Plus size={15} /> Tahun Buku Baru
        </button>
      </div>

      {isLoading ? (
        <div className="py-16 flex items-center justify-center text-gray-400 gap-2 text-sm">
          <Loader2 className="animate-spin" size={18} /> Memuat...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {years?.map((year) => (
            <div key={year.id} className={cn(
              'bg-white border rounded-xl p-5 transition-all',
              year.isClosed ? 'border-gray-200 opacity-70' : 'border-gray-200 shadow-sm'
            )}>
              <div className="flex items-center justify-between mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100">
                  {year.isClosed
                    ? <Lock size={14} className="text-gray-500" />
                    : <Unlock size={14} className="text-blue-500" />}
                </div>
                <span className={cn('badge', year.isClosed ? 'badge-gray' : 'badge-blue')}>
                  {year.isClosed ? 'Closed' : 'Open'}
                </span>
              </div>

              <h3 className="text-lg font-semibold text-gray-900">Tahun {year.name}</h3>
              <div className="flex items-center gap-1.5 text-gray-500 text-xs mt-2">
                <Calendar size={12} />
                <span>{format(new Date(year.startDate), 'dd MMM yyyy', { locale: id })}</span>
                <ChevronRight size={10} className="text-gray-300" />
                <span>{format(new Date(year.endDate), 'dd MMM yyyy', { locale: id })}</span>
              </div>

              {year.isClosed && year.closedAt && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-3">
                  <CheckCircle2 size={11} className="text-green-500" />
                  Ditutup {format(new Date(year.closedAt), 'Pp', { locale: id })}
                </div>
              )}

              <div className="mt-4 flex gap-2">
                {!year.isClosed ? (
                  <button
                    onClick={() => setConfirmClose(year.id)}
                    disabled={closeMutation.isPending}
                    className="w-full btn-secondary justify-center text-xs py-2 disabled:opacity-50"
                  >
                    <Lock size={13} /> Tutup Buku
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmReopen(year.id)}
                    disabled={reopenMutation.isPending}
                    className="w-full btn-secondary justify-center text-xs py-2 disabled:opacity-50"
                  >
                    <Unlock size={13} /> Buka Kembali
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmClose !== null}
        title="Tutup Tahun Buku"
        message="Yakin ingin menutup tahun buku ini? Jurnal penutup akan dibuat dan saldo revenue/expense akan direset."
        confirmLabel="Tutup Buku"
        variant="danger"
        onConfirm={() => { if (confirmClose) closeMutation.mutate(confirmClose); setConfirmClose(null); }}
        onCancel={() => setConfirmClose(null)}
      />

      <ConfirmDialog
        open={confirmReopen !== null}
        title="Buka Kembali Tahun Buku"
        message="Yakin ingin membuka kembali tahun buku ini? Jurnal penutup akan dihapus dan saldo revenue/expense akan dipulihkan."
        confirmLabel="Buka Kembali"
        variant="danger"
        onConfirm={() => { if (confirmReopen) reopenMutation.mutate(confirmReopen); setConfirmReopen(null); }}
        onCancel={() => setConfirmReopen(null)}
      />

      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fy-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onKeyDown={(e) => e.key === 'Escape' && setIsModalOpen(false)}
        >
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-6 w-full max-w-md">
            <h2 id="fy-modal-title" className="text-base font-semibold text-gray-900 mb-4">Tambah Tahun Buku</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="fy-name" className="block text-xs font-medium text-gray-700 mb-1">Nama Tahun</label>
                <input id="fy-name" type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="2027"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-400 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="fy-start" className="block text-xs font-medium text-gray-700 mb-1">Tanggal Mulai</label>
                  <input id="fy-start" type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-400 outline-none" />
                </div>
                <div>
                  <label htmlFor="fy-end" className="block text-xs font-medium text-gray-700 mb-1">Tanggal Selesai</label>
                  <input id="fy-end" type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-400 outline-none" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 btn-secondary justify-center">Batal</button>
              <button
                onClick={() => createMutation.mutate({ name: newName, startDate: newStart, endDate: newEnd })}
                disabled={!newName || !newStart || !newEnd || createMutation.isPending}
                className="flex-1 btn-primary justify-center"
              >
                {createMutation.isPending ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
