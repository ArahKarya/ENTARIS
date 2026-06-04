import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Loader2, AlertCircle, ArrowRightLeft, CheckCircle2, Paperclip } from 'lucide-react';
import { formatRupiah } from '../lib/formatters';
import AttachmentUpload from './AttachmentUpload';
import AttachmentPreview from './AttachmentPreview';
import Select from './Select';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TransferModal: React.FC<TransferModalProps> = ({ isOpen, onClose }) => {
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [destAccountId, setDestAccountId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOpen) {
      setDate(today);
      setSourceAccountId('');
      setDestAccountId('');
      setAmount('');
      setReferenceNo('');
      setNotes('');
      setError('');
      setSavedId(null);
    }
  }, [isOpen]);

  // Cash/Bank accounts (ASSET, non-group, 1.1.x)
  const { data: cashAccounts } = useQuery({
    queryKey: ['cash-accounts'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((a: any) => !a.isGroup && a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1'));
    },
    enabled: isOpen,
  });

  const sourceAccount = cashAccounts?.find((a: any) => a.id === sourceAccountId);
  const destAccount = cashAccounts?.find((a: any) => a.id === destAccountId);

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/journals', data),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      setSavedId(res.data?.id);
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal menyimpan transfer.'),
  });

  const numAmount = Number(amount) || 0;
  const canSubmit =
    sourceAccountId &&
    destAccountId &&
    sourceAccountId !== destAccountId &&
    numAmount > 0 &&
    !mutation.isPending;

  const handleSubmit = () => {
    if (sourceAccountId === destAccountId) {
      setError('Akun asal dan tujuan tidak boleh sama.');
      return;
    }

    const srcName = sourceAccount ? `${sourceAccount.accountNumber} ${sourceAccount.name}` : '';
    const dstName = destAccount ? `${destAccount.accountNumber} ${destAccount.name}` : '';
    const refPart = referenceNo ? ` (Ref: ${referenceNo})` : '';
    const notesPart = notes ? ` - ${notes}` : '';

    mutation.mutate({
      date,
      narration: `Pinbuk: ${srcName} → ${dstName}${refPart}${notesPart}`,
      items: [
        {
          accountId: destAccountId,
          debit: numAmount,
          credit: 0,
          description: `Transfer masuk dari ${srcName}`,
        },
        {
          accountId: sourceAccountId,
          debit: 0,
          credit: numAmount,
          description: `Transfer keluar ke ${dstName}`,
        },
      ],
    });
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Escape' && onClose()}
    >
      <div className="rounded-xl w-full max-w-[calc(100vw-1rem)] sm:max-w-lg shadow-2xl flex flex-col max-h-[95vh] overflow-hidden" style={{ backgroundColor: 'var(--color-bg-primary)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50">
              <ArrowRightLeft size={16} className="text-blue-600" />
            </div>
            <div>
              <h2 id="transfer-modal-title" className="text-base font-semibold text-gray-900">
                Pemindahbukuan (Pinbuk)
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Transfer antar rekening kas/bank</p>
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

          {/* Source & Destination */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Akun Asal (Transfer Dari)</label>
              <Select
                value={sourceAccountId}
                onChange={e => setSourceAccountId(e.target.value)}
                className="w-full"
              >
                <option value="">— Pilih Akun Asal —</option>
                {cashAccounts?.map((a: any) => (
                  <option key={a.id} value={a.id} disabled={a.id === destAccountId}>
                    {a.accountNumber} — {a.name}
                  </option>
                ))}
              </Select>
            </div>

            {/* Arrow indicator */}
            {sourceAccountId && destAccountId && (
              <div className="flex items-center justify-center">
                <div className="flex items-center gap-2 px-4 py-1.5 bg-blue-50 rounded-full text-blue-600 text-xs font-medium">
                  <ArrowRightLeft size={12} />
                  Transfer ke
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Akun Tujuan (Transfer Ke)</label>
              <Select
                value={destAccountId}
                onChange={e => setDestAccountId(e.target.value)}
                className="w-full"
              >
                <option value="">— Pilih Akun Tujuan —</option>
                {cashAccounts?.map((a: any) => (
                  <option key={a.id} value={a.id} disabled={a.id === sourceAccountId}>
                    {a.accountNumber} — {a.name}
                  </option>
                ))}
              </Select>
            </div>
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

          {/* Reference & Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">No. Referensi</label>
              <input
                type="text"
                value={referenceNo}
                onChange={e => setReferenceNo(e.target.value)}
                placeholder="No. cek, transfer, dll."
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Catatan</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Keterangan opsional..."
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Preview */}
          {numAmount > 0 && sourceAccount && destAccount && (
            <div className="rounded-lg p-3 border bg-blue-50 border-blue-100">
              <p className="text-xs font-medium text-blue-700">
                Transfer{' '}
                <span className="text-base font-bold font-mono tabular-nums">{formatRupiah(numAmount)}</span>
              </p>
              <p className="text-xs text-blue-600 mt-1">
                {sourceAccount.accountNumber} {sourceAccount.name} → {destAccount.accountNumber} {destAccount.name}
              </p>
            </div>
          )}

          {/* Same account warning */}
          {sourceAccountId && destAccountId && sourceAccountId === destAccountId && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2 text-yellow-700 text-sm">
              <AlertCircle size={15} /> <span>Akun asal dan tujuan tidak boleh sama.</span>
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
                  <Paperclip size={10} /> Lampiran Bukti Transfer
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
                className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : 'Simpan Transfer'}
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
};

export default TransferModal;
