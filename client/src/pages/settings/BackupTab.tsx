import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Upload, HardDrive, Download, RotateCcw, AlertTriangle, ShieldCheck, Database, Plus, Trash2 } from 'lucide-react';
import api from '../../lib/api';
import { can, cap } from '../../lib/permissions';
import { EmptyState, LoadingState } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { SettingsCard } from '../../components/settings/SettingsCard';
import { TypedConfirmDialog } from '../../components/settings/TypedConfirmDialog';

interface BackupFile { filename: string; size: number; date: string }

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDateTime = (d: string, month: 'long' | 'short') =>
  new Date(d).toLocaleString('id-ID', { day: 'numeric', month, year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const BackupTab: React.FC = () => {
  const queryClient = useQueryClient();
  const canWriteBackup = can('audit', 'edit');
  const canRestore = canWriteBackup && cap('doc.cancel');
  const canDevTools = can('settings', 'edit');
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateDummyMutation = useMutation({
    mutationFn: async () => api.post('/settings/generate-dummy'),
    onSuccess: (res) => {
      const r = res.data.results;
      toast.success(`Data dummy dibuat: ${r.parties} mitra, ${r.salesInvoices} SI, ${r.purchaseInvoices} PI, ${r.journals} jurnal, ${r.inventoryItems} item.`);
      queryClient.invalidateQueries();
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal membuat data dummy.'),
  });

  const deleteDummyMutation = useMutation({
    mutationFn: async () => api.post('/settings/delete-dummy'),
    onSuccess: (res) => {
      const r = res.data.results;
      toast.success(`Data dummy dihapus: ${r.parties} mitra, ${r.salesInvoices} SI, ${r.purchaseInvoices} PI, ${r.inventoryItems} item.`);
      queryClient.invalidateQueries();
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal menghapus data dummy.'),
  });

  const resetMutation = useMutation({
    mutationFn: async () => api.post('/settings/reset-data', { confirmation: 'RESET' }),
    onSuccess: () => {
      toast.success('Data direset. Silakan login ulang.');
      localStorage.removeItem('user');
      localStorage.removeItem('onboardingDone');
      localStorage.removeItem('widgetPrefs');
      setTimeout(() => { window.location.href = '/login'; }, 1500);
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal mereset data.'),
  });

  const { data: backups, isLoading } = useQuery<BackupFile[]>({
    queryKey: ['backups'],
    queryFn: async () => { const res = await api.get('/backup/list'); return res.data; },
  });

  const createMutation = useMutation({
    mutationFn: async () => api.post('/backup/create'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      toast.success('Backup dibuat.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal membuat backup.'),
  });

  const restoreMutation = useMutation({
    mutationFn: async (filename: string) => api.post('/backup/restore', { filename }),
    onSuccess: () => {
      toast.success('Backup dipulihkan. Silakan muat ulang halaman.');
      setConfirmRestore(null);
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal restore backup.'),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post('/backup/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      toast.success(res.data.message || 'File backup diunggah.');
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
    fetch(url, { credentials: 'include' })
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

  const lastBackup = backups?.[0];
  const dummyBusy = generateDummyMutation.isPending || deleteDummyMutation.isPending;

  return (
    <div className="space-y-5">
      <SettingsCard
        title="Cadangan Database"
        description="Maksimal 5 cadangan disimpan otomatis. Pemulihan menimpa seluruh data saat ini."
        actions={canWriteBackup && (
          <>
            <input ref={fileInputRef} type="file" accept=".sql.gz" onChange={handleFileUpload} className="sr-only" tabIndex={-1} aria-hidden />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} loading={uploadMutation.isPending}>
              {!uploadMutation.isPending && <Upload aria-hidden />} Unggah Cadangan
            </Button>
            <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending}>
              {!createMutation.isPending && <HardDrive aria-hidden />} Buat Cadangan
            </Button>
          </>
        )}
        contentClassName="space-y-4 px-0 pb-0"
      >
        <div className="space-y-3 px-5">
          {lastBackup && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-success-subtle text-success-text">
                <ShieldCheck className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Cadangan terakhir</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(lastBackup.date, 'long')} · {formatSize(lastBackup.size)}</p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning-subtle p-3 text-xs text-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-text" aria-hidden />
            <p>Pemulihan akan <strong>menimpa seluruh data</strong> yang ada. Buat cadangan terlebih dahulu sebelum memulihkan.</p>
          </div>
        </div>

        {isLoading ? (
          <LoadingState className="pb-5" label="Memuat daftar cadangan…" />
        ) : !backups || backups.length === 0 ? (
          <EmptyState compact icon={HardDrive} title="Belum ada file cadangan" className="pb-5" />
        ) : (
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard focusable (axe scrollable-region-focusable)
          <div className="relative overflow-x-auto border-t border-border" role="region" aria-label="Tabel file cadangan" tabIndex={0}>
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-2.5 text-left font-medium">Nama file</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Ukuran</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Tanggal</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium"><span className="sr-only">Aksi</span></th>
                </tr>
              </thead>
              <tbody>
                {backups.map((backup) => (
                  <tr key={backup.filename} className="border-t border-border">
                    <td className="px-5 py-2.5 font-mono text-xs font-medium text-foreground">{backup.filename}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{formatSize(backup.size)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{formatDateTime(backup.date, 'short')}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => handleDownload(backup.filename)} aria-label={`Unduh ${backup.filename}`}>
                          <Download aria-hidden />
                        </Button>
                        {canRestore && (
                          <Button variant="ghost" size="icon-sm" onClick={() => setConfirmRestore(backup.filename)} aria-label={`Pulihkan ${backup.filename}`}>
                            <RotateCcw className="text-warning-text" aria-hidden />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingsCard>

      {canDevTools && (
        <SettingsCard
          title="Data Dummy (Pengujian)"
          description="Buat data transaksi contoh (pelanggan, pemasok, invoice, jurnal, inventori) untuk pengujian. Data dummy bisa dihapus tanpa memengaruhi data asli."
        >
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => generateDummyMutation.mutate()} loading={generateDummyMutation.isPending} disabled={dummyBusy}>
              {!generateDummyMutation.isPending && <Plus aria-hidden />} Buat Data Dummy
            </Button>
            <Button variant="outline" onClick={() => deleteDummyMutation.mutate()} loading={deleteDummyMutation.isPending} disabled={dummyBusy}>
              {!deleteDummyMutation.isPending && <Trash2 aria-hidden />} Hapus Data Dummy
            </Button>
          </div>
        </SettingsCard>
      )}

      {canDevTools && (
        <SettingsCard
          tone="danger"
          title="Reset Seluruh Data"
          description="Hapus semua transaksi, akun, mitra, dan pengguna; database dikembalikan ke kondisi awal (seed). Hanya untuk development/pengujian."
          actions={(
            <Button variant="danger" onClick={() => setShowResetConfirm(true)}>
              <Database aria-hidden /> Reset Data
            </Button>
          )}
        />
      )}

      <TypedConfirmDialog
        open={confirmRestore !== null}
        onOpenChange={(o) => !o && setConfirmRestore(null)}
        title="Pulihkan cadangan?"
        description="Aksi ini tidak dapat dibatalkan. Seluruh data saat ini akan ditimpa dengan data dari file berikut."
        keyword="RESTORE"
        confirmLabel="Pulihkan"
        loading={restoreMutation.isPending}
        onConfirm={() => confirmRestore && restoreMutation.mutate(confirmRestore)}
      >
        <p className="break-all rounded-md bg-muted p-2 font-mono text-xs font-semibold text-foreground">{confirmRestore}</p>
      </TypedConfirmDialog>

      <TypedConfirmDialog
        open={showResetConfirm}
        onOpenChange={setShowResetConfirm}
        title="Reset seluruh data?"
        description="Aksi ini tidak dapat dibatalkan. Semua data akan dihapus dan dikembalikan ke kondisi awal."
        keyword="RESET"
        confirmLabel="Reset Data"
        loading={resetMutation.isPending}
        onConfirm={() => resetMutation.mutate()}
      >
        <ul className="ml-4 list-disc space-y-1 text-xs text-muted-foreground">
          <li>Semua transaksi (invoice, pembayaran, jurnal)</li>
          <li>Semua mitra (pelanggan, pemasok)</li>
          <li>Semua akun (COA) dan saldo</li>
          <li>Semua pengguna (dibuat ulang dari seed)</li>
          <li>Semua stok dan gerakan inventori</li>
        </ul>
      </TypedConfirmDialog>
    </div>
  );
};
