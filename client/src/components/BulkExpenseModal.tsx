import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertCircle, CheckCircle2, Plus, Trash2, Paperclip, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { formatRupiah } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Field, DateInput } from '@/components/shared';
import { cn } from '@/lib/utils';
import { FormDialog } from './purchase-cash/FormDialog';
import { OptionPicker } from './purchase-cash/OptionPicker';
import { RupiahField } from './purchase-cash/RupiahField';
import { uploadAttachments, validateAttachmentFiles } from '../lib/attachments';
import type { PickerOption as SelectOption } from './purchase-cash/OptionPicker';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type RowStatus = 'pending' | 'saving' | 'uploading' | 'done' | 'error';

interface ExpenseRow {
  tempId: string;
  debitAccountId: string;
  description: string;
  partyId: string;
  amount: number | '';
  files: File[];
  status: RowStatus;
  savedJournalId?: string;
  error?: string;
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  EXPENSE: 'Beban / Biaya',
  LIABILITY: 'Hutang',
  ASSET: 'Aset',
  EQUITY: 'Ekuitas',
  REVENUE: 'Pendapatan',
};

const genTempId = () => Math.random().toString(36).slice(2, 10);

const makeEmptyRow = (): ExpenseRow => ({
  tempId: genTempId(),
  debitAccountId: '',
  description: '',
  partyId: '',
  amount: '',
  files: [],
  status: 'pending',
});

const makeBatchNote = (d: string): string => {
  const dt = new Date(d || new Date().toISOString());
  const pad = (n: number) => String(n).padStart(2, '0');
  return `BATCH-${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}-${pad(new Date().getHours())}${pad(new Date().getMinutes())}`;
};

const BulkExpenseModal = ({ isOpen, onClose }: Props) => {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [cashAccountId, setCashAccountId] = useState('');
  const [batchNote, setBatchNote] = useState(() => makeBatchNote(today));
  const [rows, setRows] = useState<ExpenseRow[]>([makeEmptyRow()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const queryClient = useQueryClient();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (isOpen) {
      setDate(today);
      setCashAccountId('');
      setBatchNote(makeBatchNote(today));
      setRows([makeEmptyRow()]);
      setIsSubmitting(false);
      setHasSubmitted(false);
    }
  }, [isOpen]);

  const { data: allAccounts } = useQuery({
    queryKey: ['all-accounts-flat'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((a: any) => !a.isGroup);
    },
    enabled: isOpen,
  });

  const { data: parties } = useQuery({
    queryKey: ['parties-all'],
    queryFn: async () => {
      const res = await api.get('/parties');
      return res.data.data ?? res.data;
    },
    enabled: isOpen,
  });

  const cashAccounts = useMemo(
    () => (allAccounts ?? []).filter((a: any) => a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1')),
    [allAccounts],
  );

  const debitOptions = useMemo((): SelectOption[] => {
    if (!allAccounts) return [];
    const debitCandidates = allAccounts.filter(
      (a: any) => !(a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1')),
    );
    const groups: Record<string, any[]> = {};
    for (const acc of debitCandidates) {
      const type = acc.accountType as string;
      if (!groups[type]) groups[type] = [];
      groups[type].push(acc);
    }
    const order = ['EXPENSE', 'LIABILITY', 'ASSET', 'EQUITY', 'REVENUE'];
    return order
      .filter((t) => groups[t]?.length)
      .flatMap((t) =>
        groups[t].map((a: any) => ({
          value: a.id,
          label: `${a.accountNumber} — ${a.name}`,
          group: ACCOUNT_TYPE_LABELS[t] ?? t,
        }))
      );
  }, [allAccounts]);

  const cashOptions = useMemo((): SelectOption[] =>
    cashAccounts.map((a: any) => ({ value: a.id, label: `${a.accountNumber} — ${a.name}` })),
    [cashAccounts],
  );

  const partyOptions = useMemo((): SelectOption[] =>
    (parties ?? []).map((p: any) => ({ value: p.id, label: p.name })),
    [parties],
  );

  const updateRow = (tempId: string, patch: Partial<ExpenseRow>) => {
    setRows((prev) => prev.map((r) => (r.tempId === tempId ? { ...r, ...patch } : r)));
  };

  const addRow = () => setRows((prev) => [...prev, makeEmptyRow()]);

  const removeRow = (tempId: string) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.tempId !== tempId)));
  };

  const handleFiles = (tempId: string, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const err = validateAttachmentFiles(files);
    if (err) {
      toast.error(err.file ? `${err.file}: ${err.reason}` : err.reason);
      return;
    }
    updateRow(tempId, { files });
  };

  const isRowValid = (r: ExpenseRow): boolean => {
    return !!r.debitAccountId && Number(r.amount) > 0 && r.description.trim().length > 0;
  };

  const validRows = rows.filter(isRowValid);
  const total = validRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  const canSubmit =
    !!date &&
    !!cashAccountId &&
    validRows.length > 0 &&
    !isSubmitting &&
    rows.some((r) => r.status !== 'done');

  const submitRow = async (row: ExpenseRow): Promise<ExpenseRow> => {
    try {
      let savedJournalId = row.savedJournalId;

      // Only POST new journal if not already saved (retry-safe: prevents duplicate JE)
      if (!savedJournalId) {
        const debitAcc = allAccounts?.find((a: any) => a.id === row.debitAccountId);
        const cashAcc = cashAccounts.find((a: any) => a.id === cashAccountId);
        const debitLabel = debitAcc ? `${debitAcc.accountNumber} ${debitAcc.name}` : '';
        const cashLabel = cashAcc ? `${cashAcc.accountNumber} ${cashAcc.name}` : '';
        const amount = Number(row.amount) || 0;
        const narration = `[${batchNote}] ${row.description} — ${debitLabel} dari ${cashLabel}`;

        const res = await api.post('/journals', {
          date,
          narration,
          items: [
            {
              accountId: row.debitAccountId,
              partyId: row.partyId || null,
              debit: amount,
              credit: 0,
              description: row.description,
            },
            {
              accountId: cashAccountId,
              partyId: null,
              debit: 0,
              credit: amount,
              description: row.description,
            },
          ],
        });
        savedJournalId = res.data?.id;
        if (!savedJournalId) {
          return { ...row, status: 'error', error: 'Server tidak mengembalikan ID jurnal.' };
        }
      }

      if (row.files.length > 0) {
        try {
          await uploadAttachments('journal', savedJournalId, row.files);
        } catch (uploadErr: any) {
          return {
            ...row,
            status: 'error',
            savedJournalId,
            error: `Jurnal tersimpan, tapi lampiran gagal: ${uploadErr.response?.data?.error ?? 'Upload error'}`,
          };
        }
      }

      return { ...row, status: 'done', savedJournalId, error: undefined };
    } catch (err: any) {
      return {
        ...row,
        status: 'error',
        error: err.response?.data?.error ?? 'Gagal menyimpan jurnal.',
      };
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setHasSubmitted(true);

    const toProcess = rows.filter((r) => isRowValid(r) && r.status !== 'done');

    // Mark all as saving
    setRows((prev) =>
      prev.map((r) => (toProcess.some((tp) => tp.tempId === r.tempId) ? { ...r, status: 'saving', error: undefined } : r)),
    );

    // Sequential submit for clean JV numbering
    for (const row of toProcess) {
      const latest = rows.find((r) => r.tempId === row.tempId) ?? row;
      const result = await submitRow({ ...latest, status: 'saving' });
      setRows((prev) => prev.map((r) => (r.tempId === row.tempId ? result : r)));
    }

    setIsSubmitting(false);
    queryClient.invalidateQueries({ queryKey: ['payments'] });
    queryClient.invalidateQueries({ queryKey: ['cash-journals'] });
    queryClient.invalidateQueries({ queryKey: ['journals'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['coa'] });
    queryClient.invalidateQueries({ queryKey: ['parties'] });
  };

  const retryRow = async (tempId: string) => {
    const row = rows.find((r) => r.tempId === tempId);
    if (!row) return;
    setIsSubmitting(true);
    setRows((prev) => prev.map((r) => (r.tempId === tempId ? { ...r, status: 'saving', error: undefined } : r)));
    const result = await submitRow({ ...row, status: 'saving' });
    setRows((prev) => prev.map((r) => (r.tempId === tempId ? result : r)));
    setIsSubmitting(false);
  };

  const doneCount = rows.filter((r) => r.status === 'done').length;
  const errorCount = rows.filter((r) => r.status === 'error').length;
  const allDone = hasSubmitted && !isSubmitting && errorCount === 0 && doneCount > 0;
  const headerLocked = isSubmitting || hasSubmitted;
  const rowLabel = 'text-xs font-medium text-muted-foreground md:sr-only';

  const footer = (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" role="status">
        <div>
          <span className="text-muted-foreground">Baris valid: </span>
          <span className="num font-semibold text-foreground">{validRows.length}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Total: </span>
          <span className="num font-bold text-foreground">{formatRupiah(total)}</span>
        </div>
        {hasSubmitted && (
          <>
            {doneCount > 0 && <span className="font-semibold text-success-text">{doneCount} sukses</span>}
            {errorCount > 0 && <span className="font-semibold text-danger-text">{errorCount} gagal</span>}
          </>
        )}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        {allDone ? (
          <Button className="h-11 sm:h-9" onClick={onClose}>
            Selesai
          </Button>
        ) : (
          <>
            <Button variant="outline" className="h-11 sm:h-9" onClick={onClose} disabled={isSubmitting}>
              {hasSubmitted ? 'Tutup' : 'Batal'}
            </Button>
            <Button className="h-11 sm:h-9" onClick={handleSubmit} disabled={!canSubmit} loading={isSubmitting}>
              {isSubmitting ? 'Menyimpan…' : `Simpan Semua (${validRows.length})`}
            </Button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <FormDialog
      open={isOpen}
      onClose={onClose}
      title="Input Pengeluaran (Banyak Baris)"
      description="Input banyak pengeluaran sekaligus dari satu sumber kas"
      size="doc"
      className="lg:max-w-5xl"
      busy={isSubmitting}
      footer={footer}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Tanggal">
          <DateInput value={date} onChange={setDate} disabled={headerLocked} />
        </Field>
        <Field label="Sumber Kas">
          <OptionPicker
            options={cashOptions}
            value={cashAccountId}
            onChange={setCashAccountId}
            placeholder="— Pilih Akun Kas/Bank —"
            disabled={headerLocked}
          />
        </Field>
        <Field label="Batch Note">
          <Input
            value={batchNote}
            onChange={(e) => setBatchNote(e.target.value)}
            disabled={headerLocked}
            className="font-mono"
          />
        </Field>
      </div>

      <div className="space-y-2">
        <div className="hidden grid-cols-12 gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid" aria-hidden>
          <div className="col-span-3">Akun Debit</div>
          <div className="col-span-3">Keterangan</div>
          <div className="col-span-2">Pihak (opsional)</div>
          <div className="col-span-2 text-right">Jumlah</div>
          <div className="col-span-1 text-center">Lampiran</div>
          <div className="col-span-1" />
        </div>

        {rows.map((row, idx) => {
          const locked = row.status === 'done' || row.status === 'saving' || row.status === 'uploading';
          const n = idx + 1;
          return (
            <div
              key={row.tempId}
              role="group"
              aria-label={`Baris pengeluaran ${n}`}
              className={cn(
                'grid grid-cols-1 items-start gap-2 rounded-lg border p-2 md:grid-cols-12',
                row.status === 'done' && 'border-success/40 bg-success-subtle',
                row.status === 'error' && 'border-danger/40 bg-danger-subtle',
                row.status !== 'done' && row.status !== 'error' && 'border-border bg-card',
              )}
            >
              <div className="flex flex-col gap-1 md:col-span-3">
                <label htmlFor={`bx-debit-${row.tempId}`} className={rowLabel}>Akun Debit</label>
                <OptionPicker
                  id={`bx-debit-${row.tempId}`}
                  options={debitOptions}
                  value={row.debitAccountId}
                  onChange={(v) => updateRow(row.tempId, { debitAccountId: v })}
                  placeholder="— Pilih Akun —"
                  disabled={locked}
                />
              </div>
              <div className="flex flex-col gap-1 md:col-span-3">
                <label htmlFor={`bx-desc-${row.tempId}`} className={rowLabel}>Keterangan</label>
                <Input
                  id={`bx-desc-${row.tempId}`}
                  value={row.description}
                  onChange={(e) => updateRow(row.tempId, { description: e.target.value })}
                  disabled={locked}
                  placeholder={`Baris #${n} — contoh: Beli ATK`}
                />
              </div>
              <div className="flex flex-col gap-1 md:col-span-2">
                <label htmlFor={`bx-party-${row.tempId}`} className={rowLabel}>Pihak (opsional)</label>
                <OptionPicker
                  id={`bx-party-${row.tempId}`}
                  options={partyOptions}
                  value={row.partyId}
                  onChange={(v) => updateRow(row.tempId, { partyId: v })}
                  placeholder="— Tidak ada —"
                  emptyLabel="— Tidak ada —"
                  disabled={locked}
                />
              </div>
              <div className="flex flex-col gap-1 md:col-span-2">
                <label htmlFor={`bx-amt-${row.tempId}`} className={rowLabel}>Jumlah (Rp)</label>
                <RupiahField
                  id={`bx-amt-${row.tempId}`}
                  value={typeof row.amount === 'number' ? row.amount : 0}
                  onChange={(v) => updateRow(row.tempId, { amount: v === 0 ? '' : v })}
                  disabled={locked}
                />
              </div>
              <div className="flex items-center gap-2 md:col-span-2 md:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn('h-11 flex-1 md:h-9', row.files.length > 0 && 'border-primary text-primary')}
                  onClick={() => fileInputRefs.current[row.tempId]?.click()}
                  disabled={locked}
                  aria-label={
                    row.files.length > 0
                      ? `Lampiran baris ${n}: ${row.files.map((f) => f.name).join(', ')}`
                      : `Unggah lampiran baris ${n}`
                  }
                  title={row.files.length > 0 ? row.files.map((f) => f.name).join(', ') : 'Upload lampiran'}
                >
                  <Paperclip aria-hidden />
                  {row.files.length > 0 && <span className="font-semibold">{row.files.length}</span>}
                </Button>
                <input
                  ref={(el) => {
                    fileInputRefs.current[row.tempId] = el;
                  }}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  multiple
                  className="hidden"
                  aria-label={`Berkas lampiran baris ${n}`}
                  tabIndex={-1}
                  onChange={(e) => {
                    handleFiles(row.tempId, e.target.files);
                    e.target.value = '';
                  }}
                />
                <div className="flex items-center justify-end gap-1">
                  {row.status === 'saving' && (
                    <>
                      <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
                      <span className="sr-only">Menyimpan baris {n}</span>
                    </>
                  )}
                  {row.status === 'done' && (
                    <>
                      <CheckCircle2 className="size-4 text-success-text" aria-hidden />
                      <span className="sr-only">Baris {n} tersimpan</span>
                    </>
                  )}
                  {row.status === 'error' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-touch"
                      className="text-danger-text md:size-9"
                      onClick={() => retryRow(row.tempId)}
                      aria-label={`Ulangi simpan baris ${n}`}
                    >
                      <RotateCw aria-hidden />
                    </Button>
                  )}
                  {!locked && rows.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-touch"
                      className="text-muted-foreground hover:text-danger-text md:size-9"
                      onClick={() => removeRow(row.tempId)}
                      aria-label={`Hapus baris ${n}`}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </div>
              </div>
              {row.error && (
                <div role="alert" className="flex items-start gap-1 px-1 text-xs text-danger-text md:col-span-12">
                  <AlertCircle className="mt-0.5 size-3 shrink-0" aria-hidden />
                  <span>{row.error}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Button type="button" variant="outline" size="sm" className="h-11 border-dashed sm:h-8" onClick={addRow} disabled={isSubmitting}>
        <Plus aria-hidden /> Tambah Baris
      </Button>
    </FormDialog>
  );
};

export default BulkExpenseModal;
