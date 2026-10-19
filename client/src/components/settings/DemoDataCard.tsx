import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import api from '../../lib/api';
import { LOCALE } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared';
import { SettingsCard } from './SettingsCard';
import { TypedConfirmDialog } from './TypedConfirmDialog';

interface DemoBatch {
  id: string;
  status: 'running' | 'done' | 'failed';
  step: string | null;
  doneSteps: number;
  totalSteps: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

interface DemoStatus {
  batch: DemoBatch | null;
  legacy: boolean;
  blockingTables: string[];
  /** Changes users made since the demo started; deleting demo data removes them too. */
  userChanges: number;
}

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } }).response?.data?.error || fallback;

/** Data uji coba lintas modul (mode eksklusif): buat, pantau progres, hapus. */
export const DemoDataCard: React.FC = () => {
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: status, isLoading, isError, refetch } = useQuery<DemoStatus>({
    queryKey: ['demo-data'],
    queryFn: async () => (await api.get('/settings/demo-data')).data,
    // Keep polling through a failed poll while a batch runs, so the card does not freeze half way.
    refetchInterval: (q) => (q.state.data?.batch?.status === 'running' || (q.state.status === 'error' && q.state.data) ? 2000 : false),
  });

  const batch = status?.batch ?? null;
  const prevStatus = useRef<DemoBatch['status'] | undefined>(undefined);
  useEffect(() => {
    // Generation finished while the page was open: refresh every list, dashboard and the banner.
    if (prevStatus.current === 'running' && batch?.status === 'done') {
      toast.success(t('backup.demo.created'));
      void queryClient.invalidateQueries();
    }
    prevStatus.current = batch?.status;
  }, [batch?.status, queryClient, t]);

  const generate = useMutation({
    mutationFn: async () => api.post('/settings/demo-data/generate'),
    onSuccess: () => void refetch(),
    onError: (error) => {
      toast.error(apiError(error, t('backup.demo.createError')));
      void refetch();
    },
  });

  const remove = useMutation({
    mutationFn: async () => api.post('/settings/demo-data/delete', { confirmation: 'HAPUS' }),
    onSuccess: () => {
      toast.success(t('backup.demo.deleted'));
      setConfirmDelete(false);
      void queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(apiError(error, t('backup.demo.deleteError'))),
  });

  const removeLegacy = useMutation({
    mutationFn: async () => api.post('/settings/delete-dummy'),
    onSuccess: () => {
      toast.success(t('backup.demo.legacyDeleted'));
      void queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(apiError(error, t('backup.demo.legacyDeleteError'))),
  });

  const running = batch?.status === 'running';
  const percent = batch && batch.totalSteps > 0 ? Math.min(100, Math.round((batch.doneSteps / batch.totalSteps) * 100)) : 0;
  const blocked = !batch && (status?.legacy || (status?.blockingTables.length ?? 0) > 0);

  const actions = !status ? null : batch ? (
    !running && (
      <Button variant="outline" onClick={() => setConfirmDelete(true)}>
        <Trash2 aria-hidden /> {t('backup.demo.delete')}
      </Button>
    )
  ) : status.legacy ? (
    <Button variant="outline" onClick={() => removeLegacy.mutate()} loading={removeLegacy.isPending}>
      {!removeLegacy.isPending && <Trash2 aria-hidden />} {t('backup.demo.deleteLegacy')}
    </Button>
  ) : (
    <Button variant="outline" onClick={() => generate.mutate()} loading={generate.isPending} disabled={blocked}>
      {!generate.isPending && <Plus aria-hidden />} {t('backup.demo.create')}
    </Button>
  );

  return (
    <SettingsCard title={t('backup.demo.title')} description={t('backup.demo.description')} actions={actions}>
      {isLoading ? (
        <LoadingState label={t('backup.demo.loading')} />
      ) : isError || !status ? (
        <p className="text-sm text-danger-text">{t('backup.demo.loadError')}</p>
      ) : running && batch ? (
        <div className="space-y-2" aria-live="polite">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Loader2 className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
            {t('backup.demo.running', { step: batch.step ?? '' })}
          </div>
          <div
            role="progressbar"
            aria-label={t('backup.demo.progressLabel')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={t('backup.demo.progressText', { done: batch.doneSteps, total: batch.totalSteps })}
            className="h-1.5 w-full overflow-hidden rounded-sm bg-muted"
          >
            <div className="h-full rounded-sm bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">{t('backup.demo.progressText', { done: batch.doneSteps, total: batch.totalSteps })}</p>
        </div>
      ) : batch?.status === 'failed' ? (
        <div className="flex items-start gap-3 rounded-lg border border-danger/40 bg-danger-subtle p-3 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger-text" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="font-medium">{t('backup.demo.failed')}</p>
            <p className="break-words text-xs text-muted-foreground">{batch.error}</p>
          </div>
        </div>
      ) : batch ? (
        <p className="text-sm text-foreground">
          {t('backup.demo.active', { date: new Date(batch.finishedAt ?? batch.startedAt).toLocaleString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) })}
        </p>
      ) : status.legacy ? (
        <p className="text-sm text-muted-foreground">{t('backup.demo.legacy')}</p>
      ) : status.blockingTables.length > 0 ? (
        <p className="text-sm text-muted-foreground">{t('backup.demo.blocked')}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{t('backup.demo.ready')}</p>
      )}

      <TypedConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('backup.demo.confirm.title')}
        description={t('backup.demo.confirm.description')}
        keyword="HAPUS"
        confirmLabel={t('backup.demo.delete')}
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      >
        {(status?.userChanges ?? 0) > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-subtle p-2 text-xs text-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger-text" aria-hidden />
            <p>{t('backup.demo.confirm.userChanges', { count: status?.userChanges })}</p>
          </div>
        )}
        <ul className="ml-4 list-disc space-y-1 text-xs text-muted-foreground">
          <li>{t('backup.demo.confirm.items.transactions')}</li>
          <li>{t('backup.demo.confirm.items.masters')}</li>
          <li>{t('backup.demo.confirm.items.kept')}</li>
        </ul>
      </TypedConfirmDialog>
    </SettingsCard>
  );
};
