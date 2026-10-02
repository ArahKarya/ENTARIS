import { useState } from 'react';
import { Plus, Repeat, Play, Pause, Pencil, Loader2, CalendarClock, Clock } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { formatDate } from '../lib/formatters';
import RecurringTemplateModal from '../components/RecurringTemplateModal';

interface RecurringTemplate {
  id: string;
  name: string;
  templateType: string;
  frequency: string;
  dayOfMonth?: number | null;
  nextRunDate: string;
  lastRunDate?: string | null;
  isActive: boolean;
  templateData: any;
  createdBy: string;
  user?: { fullName: string };
  createdAt: string;
  updatedAt: string;
}

const typeLabels: Record<string, { label: string; color: string }> = {
  journal: { label: 'Jurnal', color: 'badge-purple' },
  sales_invoice: { label: 'Invoice Penjualan', color: 'badge-blue' },
  purchase_invoice: { label: 'Invoice Pembelian', color: 'badge-orange' },
};

const frequencyLabels: Record<string, string> = {
  daily: 'Harian',
  weekly: 'Mingguan',
  monthly: 'Bulanan',
  quarterly: 'Triwulan',
  yearly: 'Tahunan',
};

export const RecurringTransactions = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<RecurringTemplate | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['recurring-templates'],
    queryFn: async () => {
      const res = await api.get('/recurring');
      return res.data.data as RecurringTemplate[];
    },
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/recurring/${id}/execute`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['recurring-templates'] });
      if (res.data.success) {
        toast.success('Template berhasil dieksekusi.');
      } else {
        toast.error(res.data.error || 'Gagal mengeksekusi template.');
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Gagal mengeksekusi template.');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/recurring/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-templates'] });
      toast.success('Status template diperbarui.');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Gagal mengubah status template.');
    },
  });

  const handleEdit = (template: RecurringTemplate) => {
    setEditTemplate(template);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditTemplate(null);
  };

  const templates = data || [];

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Transaksi Berulang
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            Kelola template transaksi otomatis berdasarkan jadwal.
          </p>
        </div>
        <button
          className="btn-primary self-start"
          onClick={() => { setEditTemplate(null); setIsModalOpen(true); }}
        >
          <Plus size={15} /> Buat Template
        </button>
      </div>

      {/* Table */}
      <div
        className="border rounded-xl overflow-hidden"
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          borderColor: 'var(--color-border)',
        }}
      >
        {isLoading ? (
          <div className="py-16 text-center">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Memuat data...</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="py-16 text-center">
            <Repeat size={28} className="mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Belum ada template transaksi berulang.
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Nama</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Tipe</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Frekuensi</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Jadwal Berikutnya</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Terakhir Dijalankan</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Status</th>
                  <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => {
                  const typeInfo = typeLabels[t.templateType] || typeLabels.journal;
                  return (
                    <tr
                      key={t.id}
                      className={cn(
                        'border-b transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/30',
                        !t.isActive && 'opacity-50'
                      )}
                      style={{ borderColor: 'var(--color-border-light)' }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Repeat size={14} className="text-gray-400 flex-shrink-0" />
                          <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                            {t.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('badge rounded-full text-xs', typeInfo!.color)}>
                          {typeInfo!.label}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                        {frequencyLabels[t.frequency] || t.frequency}
                        {t.dayOfMonth && t.frequency === 'monthly' && (
                          <span className="text-xs ml-1" style={{ color: 'var(--color-text-muted)' }}>
                            (tgl {t.dayOfMonth})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                          <CalendarClock size={12} className="text-gray-400" />
                          {formatDate(t.nextRunDate)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {t.lastRunDate ? (
                          <div className="flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                            <Clock size={12} className="text-gray-400" />
                            {formatDate(t.lastRunDate)}
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'badge rounded-full text-xs',
                          t.isActive ? 'badge-green' : 'badge-gray'
                        )}>
                          {t.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEdit(t)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            style={{ color: 'var(--color-text-muted)' }}
                            title="Edit"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => executeMutation.mutate(t.id)}
                            disabled={executeMutation.isPending}
                            className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 transition-colors"
                            title="Jalankan Sekarang"
                          >
                            <Play size={13} />
                          </button>
                          <button
                            onClick={() => toggleMutation.mutate({ id: t.id, isActive: !t.isActive })}
                            disabled={toggleMutation.isPending}
                            className={cn(
                              'p-1.5 rounded-lg transition-colors',
                              t.isActive
                                ? 'hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-600'
                                : 'hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600'
                            )}
                            title={t.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                          >
                            <Pause size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <RecurringTemplateModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        editTemplate={editTemplate}
      />
    </div>
  );
};
