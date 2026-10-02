import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../../lib/api';
import {
  Loader2, Upload, HardDrive, Download, RotateCcw, AlertTriangle, Shield, Database,
} from 'lucide-react';

export const BackupTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [restoreInput, setRestoreInput] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetInput, setResetInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateDummyMutation = useMutation({
    mutationFn: async () => api.post('/settings/generate-dummy'),
    onSuccess: (res) => {
      const r = res.data.results;
      toast.success(`Data dummy dibuat: ${r.parties} mitra, ${r.salesInvoices} SI, ${r.purchaseInvoices} PI, ${r.journals} jurnal, ${r.inventoryItems} item`);
      queryClient.invalidateQueries();
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal membuat data dummy.'),
  });

  const deleteDummyMutation = useMutation({
    mutationFn: async () => api.post('/settings/delete-dummy'),
    onSuccess: (res) => {
      const r = res.data.results;
      toast.success(`Data dummy dihapus: ${r.parties} mitra, ${r.salesInvoices} SI, ${r.purchaseInvoices} PI, ${r.inventoryItems} item`);
      queryClient.invalidateQueries();
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal menghapus data dummy.'),
  });

  const resetMutation = useMutation({
    mutationFn: async () => api.post('/settings/reset-data', { confirmation: 'RESET' }),
    onSuccess: () => {
      toast.success('Data berhasil direset. Login ulang...');
      localStorage.removeItem('user');
      localStorage.removeItem('onboardingDone');
      localStorage.removeItem('widgetPrefs');
      setTimeout(() => { window.location.href = '/login'; }, 1500);
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal mereset data.'),
  });

  const { data: backups, isLoading } = useQuery<Array<{ filename: string; size: number; date: string }>>({
    queryKey: ['backups'],
    queryFn: async () => { const res = await api.get('/backup/list'); return res.data; },
  });

  const createMutation = useMutation({
    mutationFn: async () => api.post('/backup/create'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      toast.success('Backup berhasil dibuat.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal membuat backup.'),
  });

  const restoreMutation = useMutation({
    mutationFn: async (filename: string) => api.post('/backup/restore', { filename }),
    onSuccess: () => {
      toast.success('Restore berhasil. Silakan refresh halaman.');
      setConfirmRestore(null);
      setRestoreInput('');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal restore backup.'),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post('/backup/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      toast.success(res.data.message || 'File backup berhasil diupload.');
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal mengupload file backup.'),
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.sql.gz')) {
      toast.error('Hanya file .sql.gz yang diperbolehkan.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    uploadMutation.mutate(file);
  };

  const handleDownload = (filename: string) => {
    const baseUrl = (import.meta as any).env?.VITE_API_URL || '/api';
    const url = `${baseUrl}/backup/download/${encodeURIComponent(filename)}`;
    const link = document.createElement('a');
    link.download = filename;
    fetch(url, {
      credentials: 'include',
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        link.href = blobUrl;
        link.click();
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => toast.error('Gagal mengunduh backup.'));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const lastBackup = backups?.[0];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Backup & Restore</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Kelola cadangan database aplikasi.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".sql.gz"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="btn-secondary"
          >
            {uploadMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {uploadMutation.isPending ? 'Mengupload...' : 'Upload Backup'}
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="btn-primary"
          >
            {createMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <HardDrive size={15} />}
            {createMutation.isPending ? 'Memproses...' : 'Buat Backup'}
          </button>
        </div>
      </div>

      {/* Last backup info */}
      {lastBackup && (
        <div
          className="flex items-center gap-4 p-4 rounded-xl border"
          style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}
        >
          <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
            <Shield size={18} className="text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Backup Terakhir
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {new Date(lastBackup.date).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {' '}&middot; {formatSize(lastBackup.size)}
            </p>
          </div>
        </div>
      )}

      {/* Warning */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800">
        <AlertTriangle size={16} className="text-yellow-600 shrink-0 mt-0.5" />
        <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <p className="font-semibold text-yellow-800 dark:text-yellow-400">Perhatian:</p>
          <p>Restore akan <strong>menimpa seluruh data</strong> yang ada. Pastikan Anda membuat backup sebelum melakukan restore. Maksimal 5 backup disimpan secara otomatis.</p>
        </div>
      </div>

      {/* Backup list */}
      {isLoading ? (
        <div className="py-16 flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          <Loader2 className="animate-spin" size={18} /> Memuat...
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Nama File</th>
                <th className="text-right">Ukuran</th>
                <th>Tanggal</th>
                <th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {(!backups || backups.length === 0) ? (
                <tr>
                  <td colSpan={4} className="py-16 text-center" style={{ color: 'var(--color-text-muted)' }}>
                    Belum ada file backup
                  </td>
                </tr>
              ) : (
                backups.map((backup) => (
                  <tr key={backup.filename}>
                    <td>
                      <span className="text-xs font-mono font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {backup.filename}
                      </span>
                    </td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                      {formatSize(backup.size)}
                    </td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>
                      {new Date(backup.date).toLocaleString('id-ID', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleDownload(backup.filename)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title="Unduh"
                        >
                          <Download size={13} className="text-blue-500" />
                        </button>
                        <button
                          onClick={() => { setConfirmRestore(backup.filename); setRestoreInput(''); }}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Restore"
                        >
                          <RotateCcw size={13} className="text-orange-500" />
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

      {/* Restore confirmation dialog */}
      {confirmRestore && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onKeyDown={(e) => e.key === 'Escape' && setConfirmRestore(null)}
        >
          <div
            className="rounded-xl border shadow-xl p-6 w-full max-w-md"
            style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Konfirmasi Restore
                </h2>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Aksi ini tidak dapat dibatalkan
                </p>
              </div>
            </div>

            <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              Restore akan menimpa <strong>seluruh data</strong> saat ini dengan data dari:
            </p>
            <p className="text-xs font-mono font-semibold mb-4 p-2 rounded-lg" style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}>
              {confirmRestore}
            </p>
            <p className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Ketik <strong>RESTORE</strong> untuk mengonfirmasi:
            </p>
            <input
              type="text"
              value={restoreInput}
              onChange={(e) => setRestoreInput(e.target.value)}
              placeholder="Ketik RESTORE"
              className="w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-red-400 outline-none mb-4"
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
              autoFocus
            />

            <div className="flex gap-3">
              <button onClick={() => setConfirmRestore(null)} className="flex-1 btn-secondary justify-center">
                Batal
              </button>
              <button
                onClick={() => restoreMutation.mutate(confirmRestore)}
                disabled={restoreInput !== 'RESTORE' || restoreMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {restoreMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                {restoreMutation.isPending ? 'Memproses...' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dummy Data — Development */}
      <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10">
          <div className="flex items-start gap-3">
            <Database size={20} className="text-blue-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-400">Data Dummy (Testing)</h3>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                Generate data transaksi contoh (customer, supplier, invoice, jurnal, inventory) untuk testing.
                Data dummy bisa dihapus tanpa mempengaruhi data asli.
              </p>
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={() => generateDummyMutation.mutate()}
                  disabled={generateDummyMutation.isPending || deleteDummyMutation.isPending}
                  className="px-4 py-2 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 dark:text-blue-300 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {generateDummyMutation.isPending ? <><Loader2 size={12} className="animate-spin inline mr-1" /> Membuat...</> : '+ Generate Dummy'}
                </button>
                <button
                  onClick={() => deleteDummyMutation.mutate()}
                  disabled={generateDummyMutation.isPending || deleteDummyMutation.isPending}
                  className="px-4 py-2 text-xs font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 dark:text-orange-300 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {deleteDummyMutation.isPending ? <><Loader2 size={12} className="animate-spin inline mr-1" /> Menghapus...</> : 'Hapus Dummy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reset Data — Development Only */}
      <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-start gap-3 p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10">
          <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-800 dark:text-red-400">Reset Seluruh Data</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              Hapus semua data transaksi, akun, mitra, dan pengguna. Database akan dikembalikan ke kondisi awal (seed data).
              Fitur ini hanya untuk development/testing.
            </p>
            <button
              onClick={() => { setShowResetConfirm(true); setResetInput(''); }}
              className="mt-3 px-4 py-2 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 dark:text-red-300 dark:bg-red-900/30 dark:hover:bg-red-900/50 rounded-lg transition-colors"
            >
              Reset Data
            </button>
          </div>
        </div>
      </div>

      {/* Reset confirmation dialog */}
      {showResetConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onKeyDown={(e) => e.key === 'Escape' && setShowResetConfirm(false)}
        >
          <div
            className="rounded-xl border shadow-xl p-6 w-full max-w-md"
            style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Reset Seluruh Data
                </h2>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Aksi ini tidak dapat dibatalkan
                </p>
              </div>
            </div>

            <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              Semua data akan dihapus dan dikembalikan ke kondisi awal:
            </p>
            <ul className="text-xs mb-4 space-y-1" style={{ color: 'var(--color-text-secondary)' }}>
              <li>• Semua transaksi (invoice, payment, journal)</li>
              <li>• Semua mitra (customer, supplier)</li>
              <li>• Semua akun (COA) dan saldo</li>
              <li>• Semua user (akan dibuat ulang dari seed)</li>
              <li>• Semua stok dan gerakan inventori</li>
            </ul>

            <p className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Ketik <strong>RESET</strong> untuk mengonfirmasi:
            </p>
            <input
              type="text"
              value={resetInput}
              onChange={(e) => setResetInput(e.target.value)}
              placeholder="Ketik RESET"
              className="w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-red-400 outline-none mb-4"
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
              autoFocus
            />

            <div className="flex gap-3">
              <button onClick={() => setShowResetConfirm(false)} className="flex-1 btn-secondary justify-center">
                Batal
              </button>
              <button
                onClick={() => resetMutation.mutate()}
                disabled={resetInput !== 'RESET' || resetMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {resetMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                {resetMutation.isPending ? 'Mereset...' : 'Reset Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
