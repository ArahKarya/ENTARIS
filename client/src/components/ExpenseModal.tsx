import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Loader2, AlertCircle, TrendingUp, CheckCircle2, Paperclip } from 'lucide-react';
import { formatRupiah } from '../lib/formatters';
import AttachmentUpload from './AttachmentUpload';
import AttachmentPreview from './AttachmentPreview';
import SearchableSelect from './SearchableSelect';
import type { SelectOption } from './SearchableSelect';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Readable account-type labels */
const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  EXPENSE: 'Beban / Biaya',
  LIABILITY: 'Hutang',
  ASSET: 'Aset',
  EQUITY: 'Ekuitas',
  REVENUE: 'Pendapatan',
};

const ExpenseModal: React.FC<ExpenseModalProps> = ({ isOpen, onClose }) => {
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [debitAccountId, setDebitAccountId] = useState('');
  const [creditAccountId, setCreditAccountId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // Reset form on open
  useEffect(() => {
    if (isOpen) {
      setDate(today);
      setDebitAccountId('');
      setCreditAccountId('');
      setPartyId('');
      setAmount('');
      setReferenceNo('');
      setNotes('');
      setDescription('');
      setError('');
      setSavedId(null);
    }
  }, [isOpen]);

  // All non-group accounts (for debit side — the expense/target account)
  const { data: allAccounts } = useQuery({
    queryKey: ['all-accounts-flat'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((a: any) => !a.isGroup);
    },
    enabled: isOpen,
  });

  // Cash/Bank accounts (for credit side — where the money comes from)
  const cashAccounts = useMemo(
    () => allAccounts?.filter((a: any) => a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1')) ?? [],
    [allAccounts]
  );

  // Group debit-side accounts by accountType for SearchableSelect
  const debitOptions = useMemo((): SelectOption[] => {
    if (!allAccounts) return [];
    const debitCandidates = allAccounts.filter(
      (a: any) => !(a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1'))
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
          group: ACCOUNT_TYPE_LABELS[t] || t,
        }))
      );
  }, [allAccounts]);

  const cashOptions = useMemo((): SelectOption[] =>
    cashAccounts.map((a: any) => ({ value: a.id, label: `${a.accountNumber} — ${a.name}` })),
    [cashAccounts],
  );

  // Parties (optional — all types)
  const { data: parties } = useQuery({
    queryKey: ['parties-all'],
    queryFn: async () => {
      const res = await api.get('/parties');
      return res.data.data ?? res.data;
    },
    enabled: isOpen,
  });

  const partyOptions = useMemo((): SelectOption[] =>
    (parties ?? []).map((p: any) => ({ value: p.id, label: `${p.name}${p.partyType ? ` (${p.partyType})` : ''}` })),
    [parties],
  );

  const debitAccount = allAccounts?.find((a: any) => a.id === debitAccountId);
  const creditAccount = cashAccounts?.find((a: any) => a.id === creditAccountId);

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/journals', data),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['cash-journals'] });
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      setSavedId(res.data?.id);
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal menyimpan pengeluaran.'),
  });

  const numAmount = Number(amount) || 0;
  const canSubmit = debitAccountId && creditAccountId && numAmount > 0 && !mutation.isPending;

  const handleSubmit = () => {
    if (debitAccountId === creditAccountId) {
      setError('Akun debit dan kredit tidak boleh sama.');
      return;
    }

    const debitName = debitAccount ? `${debitAccount.accountNumber} ${debitAccount.name}` : '';
    const creditName = creditAccount ? `${creditAccount.accountNumber} ${creditAccount.name}` : '';
    const refPart = referenceNo ? ` (Ref: ${referenceNo})` : '';
    const descPart = description || `Pengeluaran: ${debitName}`;

    mutation.mutate({
      date,
      narration: `Pengeluaran: ${debitName} dari ${creditName}${refPart}${notes ? ` - ${notes}` : ''}`,
      items: [
        {
          accountId: debitAccountId,
          partyId: partyId || null,
          debit: numAmount,
          credit: 0,
          description: descPart,
        },
        {
          accountId: creditAccountId,
          partyId: null,
          debit: 0,
          credit: numAmount,
          description: descPart,
        },
      ],
    });
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="expense-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Escape' && onClose()}
    >
      <div className="rounded-xl w-full max-w-[calc(100vw-1rem)] sm:max-w-lg shadow-2xl flex flex-col max-h-[95vh] overflow-hidden" style={{ backgroundColor: 'var(--color-bg-primary)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-orange-50">
              <TrendingUp size={16} className="text-orange-500" />
            </div>
            <div>
              <h2 id="expense-modal-title" className="text-base font-semibold text-gray-900">
                Catat Pengeluaran
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Semua jenis pengeluaran kas & bank</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Tanggal</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Debit Account — what the money is for */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
              Akun Pengeluaran (Debit)
            </label>
            <SearchableSelect
              options={debitOptions}
              value={debitAccountId}
              onChange={setDebitAccountId}
              placeholder="— Pilih Akun Pengeluaran —"
            />
            <p className="text-xs text-gray-400 mt-1">Contoh: Beban Listrik, Beban Gaji, Hutang Usaha, dll.</p>
          </div>

          {/* Credit Account — where the money comes from */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
              Dibayar Dari (Kredit)
            </label>
            <SearchableSelect
              options={cashOptions}
              value={creditAccountId}
              onChange={setCreditAccountId}
              placeholder="— Pilih Akun Kas/Bank —"
            />
          </div>

          {/* Party (optional) */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
              Pihak Terkait <span className="font-normal normal-case">(opsional)</span>
            </label>
            <SearchableSelect
              options={partyOptions}
              value={partyId}
              onChange={setPartyId}
              placeholder="— Tanpa Pihak Terkait —"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Jumlah (Rp)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="0"
              min={0}
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Keterangan</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Contoh: Bayar listrik bulan Maret..."
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Reference & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">No. Referensi</label>
              <input
                type="text"
                value={referenceNo}
                onChange={e => setReferenceNo(e.target.value)}
                placeholder="No. kwitansi, bukti, dll."
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Catatan</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Catatan opsional..."
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Preview */}
          {numAmount > 0 && debitAccount && creditAccount && (
            <div className="rounded-lg p-3 border bg-orange-50 border-orange-100">
              <p className="text-xs font-medium text-orange-700">
                Pengeluaran{' '}
                <span className="text-base font-bold font-mono tabular-nums">{formatRupiah(numAmount)}</span>
              </p>
              <p className="text-xs text-orange-600 mt-1">
                <span className="font-medium">Dr</span> {debitAccount.accountNumber} {debitAccount.name}
              </p>
              <p className="text-xs text-orange-600">
                <span className="font-medium">Cr</span> {creditAccount.accountNumber} {creditAccount.name}
              </p>
              {partyId && parties && (
                <p className="text-xs text-orange-500 mt-1">
                  Pihak: {parties.find((p: any) => p.id === partyId)?.name}
                </p>
              )}
            </div>
          )}

          {/* Same account warning */}
          {debitAccountId && creditAccountId && debitAccountId === creditAccountId && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2 text-yellow-700 text-sm">
              <AlertCircle size={15} /> <span>Akun debit dan kredit tidak boleh sama.</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={15} /> <span>{error}</span>
            </div>
          )}

          {/* Attachment section — shown after save */}
          {savedId && (
            <div className="space-y-3 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-green-500" />
                <span className="text-xs font-semibold text-green-600">Tersimpan</span>
                <span className="text-xs ml-auto flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                  <Paperclip size={10} /> Lampiran Bukti
                </span>
              </div>
              <AttachmentPreview referenceType="journal" referenceId={savedId} />
              <AttachmentUpload referenceType="journal" referenceId={savedId} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          {savedId ? (
            <button onClick={onClose} className="btn-primary">Selesai</button>
          ) : (
            <>
              <button onClick={onClose} className="btn-secondary">Batal</button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : 'Simpan Pengeluaran'}
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
};

export default ExpenseModal;
