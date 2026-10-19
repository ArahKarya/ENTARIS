import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trans, useTranslation } from 'react-i18next';
import { LOCALE } from '@/lib/format';
import { Upload, HardDrive, Download, RotateCcw, AlertTriangle, ShieldCheck, Database } from 'lucide-react';
import api from '../../lib/api';
import { can, cap } from '../../lib/permissions';
import { EmptyState, LoadingState } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { SettingsCard } from '../../components/settings/SettingsCard';
import { TypedConfirmDialog } from '../../components/settings/TypedConfirmDialog';
import { DemoDataCard } from '../../components/settings/DemoDataCard';

interface BackupFile { filename: string; size: number; date: string }

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDateTime = (d: string, month: 'long' | 'short') =>
  new Date(d).toLocaleString(LOCALE, { day: 'numeric', month, year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const BackupTab: React.FC = () => {
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();
  const canWriteBackup = can('audit', 'edit');
  const canRestore = canWriteBackup && cap('doc.cancel');
  const canDevTools = can('settings', 'edit');
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetMutation = useMutation({
    mutationFn: async () => api.post('/settings/reset-data', { confirmation: 'RESET' }),
    onSuccess: () => {
      toast.success(t('backup.reset.done'));
      localStorage.removeItem('user');
      localStorage.removeItem('onboardingDone');
      localStorage.removeItem('widgetPrefs');
      setTimeout(() => { window.location.href = '/login'; }, 1500);
    },
    onError: (error: any) => toast.error(error.response?.data?.error || t('backup.reset.error')),
  });

  const { data: backups, isLoading } = useQuery<BackupFile[]>({
    queryKey: ['backups'],
    queryFn: async () => { const res = await api.get('/backup/list'); return res.data; },
  });

  const createMutation = useMutation({
    mutationFn: async () => api.post('/backup/create'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      toast.success(t('backup.toast.created'));
    },
    onError: (error: any) => toast.error(error.response?.data?.error || t('backup.toast.createError')),
  });

  const restoreMutation = useMutation({
    mutationFn: async (filename: string) => api.post('/backup/restore', { filename }),
    onSuccess: () => {
      toast.success(t('backup.toast.restored'));
      setConfirmRestore(null);
    },
    onError: (error: any) => toast.error(error.response?.data?.error || t('backup.toast.restoreError')),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post('/backup/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      toast.success(res.data.message || t('backup.toast.uploaded'));
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (error: any) => toast.error(error.response?.data?.error || t('backup.toast.uploadError')),
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.sql.gz')) {
      toast.error(t('backup.toast.invalidFile'));
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
      .catch(() => toast.error(t('backup.toast.downloadError')));
  };

  const lastBackup = backups?.[0];

  return (
    <div className="space-y-5">
      <SettingsCard
        title={t('backup.title')}
        description={t('backup.description')}
        actions={canWriteBackup && (
          <>
            <input ref={fileInputRef} type="file" accept=".sql.gz" onChange={handleFileUpload} className="sr-only" tabIndex={-1} aria-hidden />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} loading={uploadMutation.isPending}>
              {!uploadMutation.isPending && <Upload aria-hidden />} {t('backup.upload')}
            </Button>
            <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending}>
              {!createMutation.isPending && <HardDrive aria-hidden />} {t('backup.create')}
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
                <p className="text-sm font-medium text-foreground">{t('backup.last')}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(lastBackup.date, 'long')} · {formatSize(lastBackup.size)}</p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning-subtle p-3 text-xs text-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-text" aria-hidden />
            <p><Trans t={t} i18nKey="backup.warning" components={{ strong: <strong /> }} /></p>
          </div>
        </div>

        {isLoading ? (
          <LoadingState className="pb-5" label={t('backup.loading')} />
        ) : !backups || backups.length === 0 ? (
          <EmptyState compact icon={HardDrive} title={t('backup.empty')} className="pb-5" />
        ) : (
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard focusable (axe scrollable-region-focusable)
          <div className="relative overflow-x-auto border-t border-border" role="region" aria-label={t('backup.table.label')} tabIndex={0}>
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-2.5 text-left font-medium">{t('backup.table.filename')}</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">{t('backup.table.size')}</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">{t('backup.table.date')}</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium"><span className="sr-only">{t('backup.table.actions')}</span></th>
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
                        <Button variant="ghost" size="icon-sm" onClick={() => handleDownload(backup.filename)} aria-label={t('backup.table.download', { filename: backup.filename })}>
                          <Download aria-hidden />
                        </Button>
                        {canRestore && (
                          <Button variant="ghost" size="icon-sm" onClick={() => setConfirmRestore(backup.filename)} aria-label={t('backup.table.restore', { filename: backup.filename })}>
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

      {canDevTools && <DemoDataCard />}

      {canDevTools && (
        <SettingsCard
          tone="danger"
          title={t('backup.reset.title')}
          description={t('backup.reset.description')}
          actions={(
            <Button variant="danger" onClick={() => setShowResetConfirm(true)}>
              <Database aria-hidden /> {t('backup.reset.action')}
            </Button>
          )}
        />
      )}

      <TypedConfirmDialog
        open={confirmRestore !== null}
        onOpenChange={(o) => !o && setConfirmRestore(null)}
        title={t('backup.restoreConfirm.title')}
        description={t('backup.restoreConfirm.description')}
        keyword="RESTORE"
        confirmLabel={t('backup.restoreConfirm.confirm')}
        loading={restoreMutation.isPending}
        onConfirm={() => confirmRestore && restoreMutation.mutate(confirmRestore)}
      >
        <p className="break-all rounded-md bg-muted p-2 font-mono text-xs font-semibold text-foreground">{confirmRestore}</p>
      </TypedConfirmDialog>

      <TypedConfirmDialog
        open={showResetConfirm}
        onOpenChange={setShowResetConfirm}
        title={t('backup.resetConfirm.title')}
        description={t('backup.resetConfirm.description')}
        keyword="RESET"
        confirmLabel={t('backup.reset.action')}
        loading={resetMutation.isPending}
        onConfirm={() => resetMutation.mutate()}
      >
        <ul className="ml-4 list-disc space-y-1 text-xs text-muted-foreground">
          <li>{t('backup.resetConfirm.items.transactions')}</li>
          <li>{t('backup.resetConfirm.items.partners')}</li>
          <li>{t('backup.resetConfirm.items.accounts')}</li>
          <li>{t('backup.resetConfirm.items.users')}</li>
          <li>{t('backup.resetConfirm.items.stock')}</li>
        </ul>
      </TypedConfirmDialog>
    </div>
  );
};
