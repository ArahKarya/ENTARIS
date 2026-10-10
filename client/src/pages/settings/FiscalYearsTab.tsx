import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Calendar, Lock, Unlock, Plus, CheckCircle2, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
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

function validate(f: NewYearForm): NewYearErrors {
  const errors: NewYearErrors = {};
  if (!f.name.trim()) errors.name = 'Nama tahun buku wajib diisi.';
  if (!f.startDate) errors.startDate = 'Tanggal mulai wajib diisi.';
  if (!f.endDate) errors.endDate = 'Tanggal selesai wajib diisi.';
  else if (f.startDate && f.endDate <= f.startDate) errors.endDate = 'Tanggal selesai harus setelah tanggal mulai.';
  return errors;
}

const fmtDate = (d: string) => format(new Date(d), 'dd MMM yyyy', { locale: id });

export const FiscalYearsTab: React.FC = () => {
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
      toast.success('Tahun buku dibuat.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal membuat tahun buku.'),
  });

  const closeMutation = useMutation({
    mutationFn: async (yearId: string) => api.post(`/fiscal-years/${yearId}/close`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] });
      toast.success('Tahun buku ditutup.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal menutup tahun buku.'),
  });

  const reopenMutation = useMutation({
    mutationFn: async (yearId: string) => api.post(`/fiscal-years/${yearId}/reopen`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] });
      toast.success('Tahun buku dibuka kembali.');
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal membuka tahun buku.'),
  });

  const errors = submitted ? validate(form) : {};
  const setField = (key: keyof NewYearForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleCreate = () => {
    setSubmitted(true);
    if (Object.keys(validate(form)).length > 0) return;
    createMutation.mutate(form);
  };

  const openModal = () => { setForm(EMPTY_FORM); setSubmitted(false); setIsModalOpen(true); };

  return (
    <div className="space-y-5">
      <SettingsCard
        title="Periode Akuntansi"
        description="Tutup buku membuat jurnal penutup; buka kembali menghapusnya. Kedua aksi memerlukan hak pembatalan dokumen."
        actions={canEdit && (
          <Button onClick={openModal}>
            <Plus aria-hidden /> Tahun Buku Baru
          </Button>
        )}
      >
        {isLoading ? (
          <LoadingState label="Memuat tahun buku…" />
        ) : !years || years.length === 0 ? (
          <EmptyState compact icon={Calendar} title="Belum ada tahun buku" description="Buat tahun buku pertama untuk mulai mencatat periode akuntansi." />
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
                    <h4 className="font-heading text-base font-semibold text-foreground">Tahun {year.name}</h4>
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
                    Ditutup {format(new Date(year.closedAt), 'Pp', { locale: id })}
                  </p>
                )}
                {canCloseReopen && (
                  <div className="mt-4">
                    {!year.isClosed ? (
                      <Button variant="outline" size="sm" className="w-full" onClick={() => setConfirmClose(year)} disabled={closeMutation.isPending}>
                        <Lock aria-hidden /> Tutup Buku
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="w-full" onClick={() => setConfirmReopen(year)} disabled={reopenMutation.isPending}>
                        <Unlock aria-hidden /> Buka Kembali
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
        title={`Tutup tahun buku ${confirmClose?.name ?? ''}?`}
        description="Jurnal penutup akan dibuat dan saldo pendapatan/beban akan direset ke laba ditahan."
        confirmLabel="Tutup Buku"
        loading={closeMutation.isPending}
        onConfirm={() => (confirmClose ? closeMutation.mutateAsync(confirmClose.id) : undefined)}
      />

      <ConfirmDialog
        open={confirmReopen !== null}
        onOpenChange={(o) => !o && setConfirmReopen(null)}
        tone="danger"
        title={`Buka kembali tahun buku ${confirmReopen?.name ?? ''}?`}
        description="Jurnal penutup akan dihapus dan saldo pendapatan/beban akan dipulihkan."
        confirmLabel="Buka Kembali"
        loading={reopenMutation.isPending}
        onConfirm={() => (confirmReopen ? reopenMutation.mutateAsync(confirmReopen.id) : undefined)}
      />

      <Dialog open={isModalOpen} onOpenChange={(o) => !createMutation.isPending && setIsModalOpen(o)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Tambah Tahun Buku</DialogTitle>
            <DialogDescription>Periode baru dibuat dalam status terbuka.</DialogDescription>
          </DialogHeader>
          <form
            id="fiscal-year-form"
            noValidate
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); handleCreate(); }}
          >
            <Field label="Nama tahun" required error={errors.name} hint="Contoh: 2027">
              {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves to the first field when the dialog/inline editor opens */}
              <Input value={form.name} onChange={setField('name')} placeholder="2027" autoFocus />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Tanggal mulai" required error={errors.startDate}>
                <Input type="date" value={form.startDate} onChange={setField('startDate')} />
              </Field>
              <Field label="Tanggal selesai" required error={errors.endDate}>
                <Input type="date" value={form.endDate} onChange={setField('endDate')} />
              </Field>
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={createMutation.isPending}>Batal</Button>
            <Button type="submit" form="fiscal-year-form" loading={createMutation.isPending}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
