import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, AlertCircle, CheckCircle2, Plus, Trash2, Paperclip, TrendingUp, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import RupiahInput from './RupiahInput';
import { formatRupiah } from '../lib/formatters';
import { uploadAttachments, validateAttachmentFiles } from '../lib/attachments';
import SearchableSelect from './SearchableSelect';
import type { SelectOption } from './SearchableSelect';

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

  if (!isOpen) return null;

  const doneCount = rows.filter((r) => r.status === 'done').length;
  const errorCount = rows.filter((r) => r.status === 'error').length;
  const allDone = hasSubmitted && !isSubmitting && errorCount === 0 && doneCount > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Escape' && !isSubmitting && onClose()}
    >
      <div className="rounded-xl w-full max-w-[calc(100vw-1rem)] lg:max-w-5xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden bg-white">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-orange-50">
              <TrendingUp size={16} className="text-orange-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Input Pengeluaran (Banyak Baris)</h2>
              <p className="text-xs text-gray-400 mt-0.5">Input banyak pengeluaran sekaligus dari satu sumber kas</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors disabled:opacity-30"
          >
            <X size={18} />
          </button>
        </div>

        {/* Header Form */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Tanggal</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={isSubmitting || hasSubmitted}
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Sumber Kas</label>
            <SearchableSelect
              options={cashOptions}
              value={cashAccountId}
              onChange={setCashAccountId}
              placeholder="— Pilih Akun Kas/Bank —"
              disabled={isSubmitting || hasSubmitted}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Batch Note</label>
            <input
              type="text"
              value={batchNote}
              onChange={(e) => setBatchNote(e.target.value)}
              disabled={isSubmitting || hasSubmitted}
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm font-mono text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
            />
          </div>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            <div className="hidden md:grid grid-cols-12 gap-2 px-2 text-xs font-semibold text-gray-400 uppercase tracking-widest">
              <div className="col-span-3">Akun Debit</div>
              <div className="col-span-3">Keterangan</div>
              <div className="col-span-2">Pihak (opsional)</div>
              <div className="col-span-2 text-right">Jumlah</div>
              <div className="col-span-1 text-center">Lampiran</div>
              <div className="col-span-1"></div>
            </div>

            {rows.map((row, idx) => {
              const locked = row.status === 'done' || row.status === 'saving' || row.status === 'uploading';
              return (
                <div
                  key={row.tempId}
                  className={`grid grid-cols-1 md:grid-cols-12 gap-2 items-start p-2 rounded-lg border ${
                    row.status === 'done'
                      ? 'bg-green-50 border-green-200'
                      : row.status === 'error'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="md:col-span-3">
                    <SearchableSelect
                      options={debitOptions}
                      value={row.debitAccountId}
                      onChange={(v) => updateRow(row.tempId, { debitAccountId: v })}
                      placeholder="— Pilih Akun —"
                      disabled={locked}
                    />
                  </div>
                  <div className="md:col-span-3">
                    <input
                      type="text"
                      value={row.description}
                      onChange={(e) => updateRow(row.tempId, { description: e.target.value })}
                      disabled={locked}
                      placeholder={`Baris #${idx + 1} — contoh: Beli ATK`}
                      className="w-full border border-gray-200 rounded-md py-1.5 px-2 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-gray-50"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <SearchableSelect
                      options={partyOptions}
                      value={row.partyId}
                      onChange={(v) => updateRow(row.tempId, { partyId: v })}
                      placeholder="— Tidak ada —"
                      disabled={locked}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <RupiahInput
                      value={typeof row.amount === 'number' ? row.amount : 0}
                      onChange={(v) => updateRow(row.tempId, { amount: v === 0 ? '' : v })}
                      disabled={locked}
                      placeholder="0"
                      className="w-full border border-gray-200 rounded-md py-1.5 px-2 text-xs text-right font-mono tabular-nums text-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-gray-50"
                      aria-label="Jumlah"
                    />
                  </div>
                  <div className="md:col-span-1 flex justify-center">
                    <button
                      type="button"
                      onClick={() => fileInputRefs.current[row.tempId]?.click()}
                      disabled={locked}
                      className={`relative flex items-center justify-center w-full h-[30px] border rounded-md text-xs transition-colors ${
                        row.files.length > 0
                          ? 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100'
                          : 'border-gray-200 text-gray-400 hover:border-orange-300 hover:text-orange-600'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                      title={row.files.length > 0 ? row.files.map((f) => f.name).join(', ') : 'Upload lampiran'}
                    >
                      <Paperclip size={12} />
                      {row.files.length > 0 && <span className="ml-1 font-semibold">{row.files.length}</span>}
                    </button>
                    <input
                      ref={(el) => { fileInputRefs.current[row.tempId] = el; }}
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.pdf"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        handleFiles(row.tempId, e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </div>
                  <div className="md:col-span-1 flex items-center justify-end gap-1">
                    {row.status === 'saving' && <Loader2 size={14} className="animate-spin text-orange-500" />}
                    {row.status === 'done' && <CheckCircle2 size={14} className="text-green-600" />}
                    {row.status === 'error' && (
                      <button
                        type="button"
                        onClick={() => retryRow(row.tempId)}
                        className="p-1 rounded hover:bg-red-100 text-red-600"
                        title={`Ulangi: ${row.error ?? ''}`}
                      >
                        <RotateCw size={14} />
                      </button>
                    )}
                    {!locked && rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(row.tempId)}
                        className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
                        title="Hapus baris"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {row.error && (
                    <div className="md:col-span-12 flex items-start gap-1 text-xs text-red-600 px-1">
                      <AlertCircle size={11} className="flex-shrink-0 mt-0.5" />
                      <span>{row.error}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addRow}
            disabled={isSubmitting}
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-orange-600 hover:bg-orange-50 border border-dashed border-orange-300 disabled:opacity-40"
          >
            <Plus size={13} /> Tambah Baris
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-4 text-xs">
            <div>
              <span className="text-gray-500">Baris valid: </span>
              <span className="font-semibold text-gray-900">{validRows.length}</span>
            </div>
            <div>
              <span className="text-gray-500">Total: </span>
              <span className="font-mono font-bold text-orange-600 tabular-nums">{formatRupiah(total)}</span>
            </div>
            {hasSubmitted && (
              <div className="flex items-center gap-2">
                {doneCount > 0 && (
                  <span className="text-green-600 font-semibold">✓ {doneCount} sukses</span>
                )}
                {errorCount > 0 && (
                  <span className="text-red-600 font-semibold">✗ {errorCount} gagal</span>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {allDone ? (
              <button onClick={onClose} className="btn-primary bg-green-600 hover:bg-green-700">
                Selesai
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="btn-secondary disabled:opacity-40"
                >
                  {hasSubmitted ? 'Tutup' : 'Batal'}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Menyimpan...
                    </>
                  ) : (
                    <>Simpan Semua ({validRows.length})</>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkExpenseModal;
