import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Loader2, AlertCircle, Wallet, CheckCircle2, Paperclip } from 'lucide-react';
import { formatRupiah } from '../lib/formatters';
import AttachmentUpload from './AttachmentUpload';
import RupiahInput from './RupiahInput';
import AttachmentPreview from './AttachmentPreview';

interface CustomerDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CustomerDepositModal: React.FC<CustomerDepositModalProps> = ({ isOpen, onClose }) => {
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [accountId, setAccountId] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [isOpeningBalance, setIsOpeningBalance] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOpen) {
      setDate(today);
      setPartyId('');
      setAmount('');
      setAccountId('');
      setReferenceNo('');
      setNotes('');
      setError('');
      setSavedId(null);
      setIsOpeningBalance(false);
    }
  }, [isOpen]);

  const { data: customers } = useQuery({
    queryKey: ['parties', 'Customer'],
    queryFn: async () => {
      const res = await api.get('/parties', { params: { type: 'Customer' } });
      return res.data.data ?? res.data;
    },
    enabled: isOpen,
  });

  const { data: cashAccounts } = useQuery({
    queryKey: ['cash-accounts'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((a: any) => !a.isGroup && a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1'));
    },
    enabled: isOpen,
  });

  const { data: depositBalance } = useQuery({
    queryKey: ['customer-deposit-balance', partyId],
    queryFn: async () => {
      const res = await api.get(`/customer-deposits/balance/${partyId}`);
      return res.data;
    },
    enabled: isOpen && !!partyId,
  });

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/payments', data),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['customer-deposits'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      setSavedId(res.data?.id || res.data?.payment?.id);
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal menyimpan uang muka.'),
  });

  const numAmount = Number(amount) || 0;
  const canSubmit = partyId && numAmount > 0 && (isOpeningBalance || accountId) && !mutation.isPending;

  const handleSubmit = () => {
    mutation.mutate({
      date,
      partyId,
      amount: numAmount,
      paymentType: 'CustomerDeposit',
      accountId: isOpeningBalance ? 'opening-equity' : accountId,
      referenceNo: referenceNo || null,
      notes: notes || null,
      isOpeningBalance,
    });
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="rounded-xl w-full max-w-[calc(100vw-1rem)] sm:max-w-lg shadow-2xl flex flex-col max-h-[95vh] overflow-hidden" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-teal-50">
              <Wallet size={16} className="text-teal-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Uang Muka Pelanggan
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Deposit dari pelanggan sebelum penjualan</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Date & Customer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Tanggal</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Pelanggan</label>
              <select
                value={partyId}
                onChange={e => setPartyId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Pilih Pelanggan —</option>
                {customers?.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Existing deposit balance info */}
          {partyId && depositBalance && depositBalance.totalBalance > 0 && (
            <div className="bg-teal-50 border border-teal-100 rounded-lg p-3">
              <p className="text-xs font-medium text-teal-700">
                Saldo uang muka saat ini: <span className="font-bold font-mono">{formatRupiah(depositBalance.totalBalance)}</span>
              </p>
              <p className="text-xs text-teal-500 mt-0.5">
                {depositBalance.data.length} deposit aktif
              </p>
            </div>
          )}

          {/* Opening balance toggle */}
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                checked={isOpeningBalance}
                onChange={e => setIsOpeningBalance(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 rounded-full peer-checked:bg-teal-500 transition-colors" />
              <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-4" />
            </div>
            <div>
              <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Saldo Awal / Koreksi</span>
              <p className="text-xs text-gray-400">Catat deposit tanpa mempengaruhi kas (offset ke Ekuitas Saldo Awal)</p>
            </div>
          </label>

          {isOpeningBalance && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <p className="text-xs text-blue-700">
                Jurnal: <span className="font-mono font-medium">DR Ekuitas Saldo Awal / CR Uang Muka Pelanggan</span>
              </p>
              <p className="text-xs text-blue-500 mt-0.5">Kas/Bank tidak terpengaruh. Gunakan untuk deposit yang uangnya sudah masuk sebelum sistem digunakan.</p>
            </div>
          )}

          {/* Amount & Account */}
          <div className={isOpeningBalance ? '' : 'grid grid-cols-1 sm:grid-cols-2 gap-4'}>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Jumlah (Rp)</label>
              <RupiahInput
                value={typeof amount === 'number' ? amount : 0}
                onChange={(v) => setAmount(v === 0 ? '' : v)}
                placeholder="0"
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Jumlah uang muka"
              />
            </div>
            {!isOpeningBalance && (
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Akun Kas/Bank</label>
                <select
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Pilih Akun —</option>
                  {cashAccounts?.map((a: any) => (
                    <option key={a.id} value={a.id}>{a.accountNumber} — {a.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Reference & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          {/* Amount preview */}
          {numAmount > 0 && (
            <div className="rounded-lg p-3 border bg-teal-50 border-teal-100">
              <p className="text-xs font-medium text-teal-700">
                Deposit <span className="text-base font-bold font-mono tabular-nums">{formatRupiah(numAmount)}</span> dari pelanggan
              </p>
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
              <AttachmentPreview referenceType="payment" referenceId={savedId} />
              <AttachmentUpload referenceType="payment" referenceId={savedId} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-3" style={{ borderColor: 'var(--color-border)' }}>
          {savedId ? (
            <button onClick={onClose} className="btn-primary">Selesai</button>
          ) : (
            <>
              <button onClick={onClose} className="btn-secondary">Batal</button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="btn-primary bg-teal-500 hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : 'Simpan Deposit'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerDepositModal;
