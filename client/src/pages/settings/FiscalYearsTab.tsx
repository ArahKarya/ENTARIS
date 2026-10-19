import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Calendar, Lock, Unlock, Plus, CheckCircle2, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { formatDate, formatDateTime } from '@/lib/format';
import api from '../../lib/api';
import { can, cap } from '../../lib/permissions';
import { cn } from '../../lib/utils';
import { ConfirmDialog, EmptyState, Field, LoadingState, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { SettingsCard } from '../../components/settings/SettingsCard';

interface FiscalYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
  closedAt: string | null;
}

interface NewYearForm { name: string; startDate: string; endDate: string }
type NewYearErrors = Partial<Record<keyof NewYearForm, string>>;

const EMPTY_FORM: NewYearForm = { name: '', startDate: '', endDate: '' };

function validate(f: NewYearForm, t: TFunction<'settings'>): NewYearErrors {
  const errors: NewYearErrors = {};
  if (!f.name.trim()) errors.name = t('fiscal.errors.nameRequired');
  if (!f.startDate) errors.startDate = t('fiscal.errors.startRequired');
  if (!f.endDate) errors.endDate = t('fiscal.errors.endRequired');
  else if (f.startDate && f.endDate <= f.startDate) errors.endDate = t('fiscal.errors.endAfterStart');
  return errors;
}

const fmtDate = (d: string) => formatDate(d, 'medium');

export const FiscalYearsTab: React.FC = () => {
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();
  const canEdit = can('settings', 'edit');
  const canCloseReopen = canEdit && cap('doc.cancel');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<NewYearForm>(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [confirmClose, setConfirmClose] = useState<FiscalYear | null>(null);
  const [confirmReopen, setConfirmReopen] = useState<FiscalYear | null>(null);

  const { data: years, isLoading } = useQuery<FiscalYear[]>({
    queryKey: ['fiscal-years'],
    queryFn: async () => { const res = await api.get('/fiscal-years'); return res.data; },
  });

  const createMutation = useMutation({
    mutationFn: async (d: NewYearForm) => api.post('/fiscal-years', d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] });
      setIsModalOpen(false);
      setForm(EMPTY_FORM);
      setSubmitted(false);
      toast.success(t('fiscal.toast.created'));
    },
    onError: (error: any) => toast.error(error.response?.data?.error || t('fiscal.toast.createError')),
  });

  const closeMutation = useMutation({
    mutationFn: async (yearId: string) => api.post(`/fiscal-years/${yearId}/close`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] });
      toast.success(t('fiscal.toast.closed'));
    },
    onError: (error: any) => toast.error(error.response?.data?.error || t('fiscal.toast.closeError')),
  });

  const reopenMutation = useMutation({
    mutationFn: async (yearId: string) => api.post(`/fiscal-years/${yearId}/reopen`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] });
      toast.success(t('fiscal.toast.reopened'));
    },
    onError: (error: any) => toast.error(error.response?.data?.error || t('fiscal.toast.reopenError')),
  });

  const errors = submitted ? validate(form, t) : {};
  const setField = (key: keyof NewYearForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleCreate = () => {
    setSubmitted(true);
    if (Object.keys(validate(form, t)).length > 0) return;
    createMutation.mutate(form);
  };

  const openModal = () => { setForm(EMPTY_FORM); setSubmitted(false); setIsModalOpen(true); };

  return (
    <div className="space-y-5">
      <SettingsCard
        title={t('fiscal.title')}
        description={t('fiscal.description')}
        actions={canEdit && (
          <Button onClick={openModal}>
            <Plus aria-hidden /> {t('fiscal.new')}
          </Button>
        )}
      >
        {isLoading ? (
          <LoadingState label={t('fiscal.loading')} />
        ) : !years || years.length === 0 ? (
          <EmptyState compact icon={Calendar} title={t('fiscal.empty.title')} description={t('fiscal.empty.description')} />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {years.map((year) => (
              <li
                key={year.id}
                className={cn('flex flex-col rounded-lg border border-border p-4', year.isClosed ? 'bg-muted/40' : 'bg-card')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      {year.isClosed ? <Lock className="size-4" aria-hidden /> : <Unlock className="size-4 text-primary" aria-hidden />}
                    </span>
                    <h4 className="font-heading text-base font-semibold text-foreground">{t('fiscal.yearName', { name: year.name })}</h4>
                  </div>
                  <StatusBadge status={year.isClosed ? 'closed' : 'open'} />
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="size-3.5" aria-hidden />
                  <span>{fmtDate(year.startDate)}</span>
                  <ChevronRight className="size-3" aria-hidden />
                  <span>{fmtDate(year.endDate)}</span>
                </p>
                {year.isClosed && year.closedAt && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="size-3.5 text-success" aria-hidden />
                    {t('fiscal.closedAt', { date: formatDateTime(year.closedAt) })}
                  </p>
                )}
                {canCloseReopen && (
                  <div className="mt-4">
                    {!year.isClosed ? (
                      <Button variant="outline" size="sm" className="w-full" onClick={() => setConfirmClose(year)} disabled={closeMutation.isPending}>
                        <Lock aria-hidden /> {t('fiscal.close')}
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="w-full" onClick={() => setConfirmReopen(year)} disabled={reopenMutation.isPending}>
                        <Unlock aria-hidden /> {t('fiscal.reopen')}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <ConfirmDialog
        open={confirmClose !== null}
        onOpenChange={(o) => !o && setConfirmClose(null)}
        tone="danger"
        title={t('fiscal.closeConfirm.title', { name: confirmClose?.name ?? '' })}
        description={t('fiscal.closeConfirm.description')}
        confirmLabel={t('fiscal.close')}
        loading={closeMutation.isPending}
        onConfirm={() => (confirmClose ? closeMutation.mutateAsync(confirmClose.id) : undefined)}
      />

      <ConfirmDialog
        open={confirmReopen !== null}
        onOpenChange={(o) => !o && setConfirmReopen(null)}
        tone="danger"
        title={t('fiscal.reopenConfirm.title', { name: confirmReopen?.name ?? '' })}
        description={t('fiscal.reopenConfirm.description')}
        confirmLabel={t('fiscal.reopen')}
        loading={reopenMutation.isPending}
        onConfirm={() => (confirmReopen ? reopenMutation.mutateAsync(confirmReopen.id) : undefined)}
      />

      <Dialog open={isModalOpen} onOpenChange={(o) => !createMutation.isPending && setIsModalOpen(o)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t('fiscal.form.title')}</DialogTitle>
            <DialogDescription>{t('fiscal.form.description')}</DialogDescription>
          </DialogHeader>
          <form
            id="fiscal-year-form"
            noValidate
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); handleCreate(); }}
          >
            <Field label={t('fiscal.form.name')} required error={errors.name} hint={t('fiscal.form.nameHint')}>
              {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves to the first field when the dialog/inline editor opens */}
              <Input value={form.name} onChange={setField('name')} placeholder="2027" autoFocus />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('fiscal.form.startDate')} required error={errors.startDate}>
                <Input type="date" value={form.startDate} onChange={setField('startDate')} />
              </Field>
              <Field label={t('fiscal.form.endDate')} required error={errors.endDate}>
                <Input type="date" value={form.endDate} onChange={setField('endDate')} />
              </Field>
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={createMutation.isPending}>{t('fiscal.form.cancel')}</Button>
            <Button type="submit" form="fiscal-year-form" loading={createMutation.isPending}>{t('fiscal.form.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
