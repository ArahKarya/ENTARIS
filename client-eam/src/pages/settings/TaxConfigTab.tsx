import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../../lib/api';
import {
  Plus, Loader2, Edit2, Trash2, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import Select from '../../components/Select';

interface TaxConfig {
  id: string;
  name: string;
  rate: number;
  type: string;
  accountId: string | null;
  isActive: boolean;
}

export const TaxConfigTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', rate: '', type: 'sales', accountId: '' });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: configs, isLoading } = useQuery<TaxConfig[]>({
    queryKey: ['tax-configs'],
    queryFn: async () => { const res = await api.get('/tax/config'); return res.data; },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => api.post('/tax/config', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-configs'] });
      setIsModalOpen(false);
      resetForm();
      toast.success('Konfigurasi pajak berhasil dibuat.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal membuat konfigurasi pajak.'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => api.put(`/tax/config/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-configs'] });
      setEditingId(null);
      setIsModalOpen(false);
      resetForm();
      toast.success('Konfigurasi pajak berhasil diperbarui.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal memperbarui konfigurasi pajak.'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/tax/config/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-configs'] });
      toast.success('Konfigurasi pajak dinonaktifkan.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal menghapus konfigurasi pajak.'),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/tax/config/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-configs'] });
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal mengubah status.'),
  });

  const resetForm = () => {
    setFormData({ name: '', rate: '', type: 'sales', accountId: '' });
    setEditingId(null);
  };

  const handleEdit = (config: TaxConfig) => {
    setEditingId(config.id);
    setFormData({
      name: config.name,
      rate: String(config.rate),
      type: config.type,
      accountId: config.accountId || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = () => {
    const data = {
      name: formData.name,
      rate: parseFloat(formData.rate),
      type: formData.type,
      accountId: formData.accountId || null,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const typeLabels: Record<string, { label: string; color: string }> = {
    sales: { label: 'Penjualan', color: 'badge-blue' },
    purchase: { label: 'Pembelian', color: 'badge-yellow' },
    withholding: { label: 'Pemotongan', color: 'badge-purple' },
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Konfigurasi Pajak</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Kelola tarif PPN, PPh, dan pajak lainnya.
          </p>
        </div>
        <button onClick={() => { resetForm(); setIsModalOpen(true); }} className="btn-primary">
          <Plus size={15} /> Tambah Pajak
        </button>
      </div>

      {isLoading ? (
        <div className="py-16 flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          <Loader2 className="animate-spin" size={18} /> Memuat...
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Nama Pajak</th>
                <th className="text-right">Tarif (%)</th>
                <th className="text-center">Tipe</th>
                <th className="text-center">Status</th>
                <th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {(!configs || configs.length === 0) ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center" style={{ color: 'var(--color-text-muted)' }}>
                    Belum ada konfigurasi pajak
                  </td>
                </tr>
              ) : (
                configs.map((config) => (
                  <tr key={config.id} className={cn(!config.isActive && 'opacity-50')}>
                    <td className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {config.name}
                    </td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                      {Number(config.rate).toFixed(2)}%
                    </td>
                    <td className="text-center">
                      <span className={cn('badge', typeLabels[config.type]?.color || 'badge-gray')}>
                        {typeLabels[config.type]?.label || config.type}
                      </span>
                    </td>
                    <td className="text-center">
                      <button
                        onClick={() => toggleMutation.mutate({ id: config.id, isActive: !config.isActive })}
                        className="inline-flex items-center gap-1"
                        title={config.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      >
                        {config.isActive ? (
                          <ToggleRight size={20} className="text-green-500" />
                        ) : (
                          <ToggleLeft size={20} style={{ color: 'var(--color-text-muted)' }} />
                        )}
                      </button>
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleEdit(config)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={13} className="text-blue-500" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(config.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          title="Nonaktifkan"
                        >
                          <Trash2 size={13} className="text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Tax Modal */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onKeyDown={(e) => e.key === 'Escape' && setIsModalOpen(false)}
        >
          <div
            className="rounded-xl border shadow-xl p-6 w-full max-w-md"
            style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
          >
            <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
              {editingId ? 'Edit Konfigurasi Pajak' : 'Tambah Konfigurasi Pajak'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Nama Pajak *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder='Contoh: "PPN 11%", "PPh 23"'
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-blue-400 outline-none"
                  style={{
                    backgroundColor: 'var(--color-bg-primary)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Tarif (%) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.rate}
                    onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                    placeholder="11.00"
                    className="w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-blue-400 outline-none"
                    style={{
                      backgroundColor: 'var(--color-bg-primary)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Tipe *
                  </label>
                  <Select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full"
                    style={{
                      backgroundColor: 'var(--color-bg-primary)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    <option value="sales">Penjualan (PPN Keluaran)</option>
                    <option value="purchase">Pembelian (PPN Masukan)</option>
                    <option value="withholding">Pemotongan (PPh)</option>
                  </Select>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="flex-1 btn-secondary justify-center">
                Batal
              </button>
              <button
                onClick={handleSubmit}
                disabled={!formData.name || !formData.rate || createMutation.isPending || updateMutation.isPending}
                className="flex-1 btn-primary justify-center disabled:opacity-50"
              >
                {(createMutation.isPending || updateMutation.isPending) ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Nonaktifkan Pajak"
        message="Yakin ingin menonaktifkan konfigurasi pajak ini?"
        confirmLabel="Nonaktifkan"
        variant="danger"
        onConfirm={() => { if (confirmDelete) deleteMutation.mutate(confirmDelete); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};
