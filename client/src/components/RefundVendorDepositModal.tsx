import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { formatRupiah } from '../lib/formatters';
import Select from './Select';

interface Deposit {
  id: string;
  paymentNumber: string;
  party?: { id: string; name: string; outstandingAmount?: number };
  amount: number;
  remaining: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  deposit: Deposit | null;
}

const RefundVendorDepositModal: React.FC<Props> = ({ isOpen, onClose, deposit }) => {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [offsetAmount, setOffsetAmount] = useState<number>(0);
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [cashAccountId, setCashAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const queryClient = useQueryClient();

  // Hutang ke vendor (outstanding purchase invoice FIFO)
  const { data: partyOutstanding } = useQuery({
    queryKey: ['party-outstanding', deposit?.party?.id],
    queryFn: async () => {
      const res = await api.get(`/parties/${deposit!.party!.id}`);
      return Number(res.data?.outstandingAmount ?? 0);
    },
    enabled: isOpen && !!deposit?.party?.id,
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

  // No reset useEffect: parent uses `{refundTarget && <Modal key={id} ... />}`
  // so each deposit target gets a fresh mount + useState() defaults.

  const remaining = Number(deposit?.remaining ?? 0);
  const maxOffset = Math.min(remaining, Number(partyOutstanding ?? 0));
  const total = Number(offsetAmount || 0) + Number(cashAmount || 0);
  const totalValid = total > 0 && total <= remaining + 0.01;

  const mutation = useMutation({
    mutationFn: (body: any) => api.post(`/vendor-deposits/${deposit!.id}/refund`, body),
    onSuccess: () => {
      toast.success('Uang muka vendor berhasil diselesaikan.');
      queryClient.invalidateQueries({ queryKey: ['vendor-deposits'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      onClose();
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Gagal memproses refund/offset.');
    },
  });

  const setOffsetMax = () => setOffsetAmount(Number(maxOffset.toFixed(2)));
  const setCashRest = () => {
    const rest = Math.max(0, Number((remaining - Number(offsetAmount || 0)).toFixed(2)));
    setCashAmount(rest);
  };

  const handleSubmit = () => {
    setError('');
    if (!totalValid) { setError('Total offset + kas harus > 0 dan ≤ sisa.'); return; }
    if (Number(cashAmount) > 0 && !cashAccountId) { setError('Pilih akun kas/bank untuk refund kas.'); return; }
    if (Number(offsetAmount) > Number(partyOutstanding ?? 0) + 0.01) {
      setError(`Offset (${formatRupiah(Number(offsetAmount))}) melebihi total hutang ke vendor (${formatRupiah(Number(partyOutstanding ?? 0))}).`);
      return;
    }
    mutation.mutate({
      date,
      offsetAmount: Number(offsetAmount) || 0,
      cashAmount: Number(cashAmount) || 0,
      cashAccountId: Number(cashAmount) > 0 ? cashAccountId : null,
      notes: notes || null,
    });
  };

  if (!isOpen || !deposit) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="refund-vendor-deposit-title" className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div>
            <h3 id="refund-vendor-deposit-title" className="font-semibold text-gray-900">Refund / Offset Uang Muka Vendor</h3>
            <p className="text-xs text-gray-500 mt-0.5">{deposit.paymentNumber} — {deposit.party?.name}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
              <p className="text-xs font-semibold text-orange-700 uppercase">Sisa Uang Muka</p>
              <p className="text-lg font-bold text-orange-700 font-mono tabular-nums">{formatRupiah(remaining)}</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              <p className="text-xs font-semibold text-blue-700 uppercase">Hutang ke Vendor</p>
              <p className="text-lg font-bold text-blue-700 font-mono tabular-nums">{formatRupiah(Number(partyOutstanding ?? 0))}</p>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Tanggal</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">Offset ke Hutang (FIFO invoice terlama)</label>
              <button type="button" onClick={setOffsetMax} className="text-xs text-orange-600 hover:underline">Maks: {formatRupiah(maxOffset)}</button>
            </div>
            <input type="number" min={0} value={offsetAmount || ''} onChange={(e) => setOffsetAmount(Number(e.target.value) || 0)}
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="0" />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">Refund Kas dari Vendor (masuk ke Bank)</label>
              <button type="button" onClick={setCashRest} className="text-xs text-orange-600 hover:underline">Sisa: {formatRupiah(Math.max(0, remaining - Number(offsetAmount || 0)))}</button>
            </div>
            <input type="number" min={0} value={cashAmount || ''} onChange={(e) => setCashAmount(Number(e.target.value) || 0)}
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="0" />
            {Number(cashAmount) > 0 && (
              <Select value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)}
                className="w-full mt-2">
                <option value="">— Pilih akun kas/bank —</option>
                {(cashAccounts || []).map((a: any) => (
                  <option key={a.id} value={a.id}>{a.accountNumber} — {a.name}</option>
                ))}
              </Select>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Catatan (opsional)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs">
            <div className="flex justify-between"><span className="text-gray-600">Total penyelesaian:</span><span className="font-mono font-semibold">{formatRupiah(total)}</span></div>
            <div className="flex justify-between text-gray-500"><span>Sisa setelah ini:</span><span className="font-mono">{formatRupiah(Math.max(0, remaining - total))}</span></div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-gray-50">
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button onClick={handleSubmit} disabled={mutation.isPending || !totalValid}
            className="btn-primary bg-orange-600 hover:bg-orange-700 disabled:opacity-50">
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Proses
          </button>
        </div>
      </div>
    </div>
  );
};

export default RefundVendorDepositModal;
