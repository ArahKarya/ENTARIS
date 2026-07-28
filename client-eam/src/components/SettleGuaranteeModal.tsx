import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { formatRupiah } from '../lib/formatters';
import Select from './Select';

interface Guarantee {
  id: string;
  guaranteeNumber: string;
  projectName: string;
  party?: { id: string; name: string };
  amount: number;
  outstanding: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  guarantee: Guarantee | null;
}

// Settlement uang jaminan: dikembalikan (kas masuk) dan/atau hangus (beban),
// bisa parsial dan berulang sampai sisa habis.
const SettleGuaranteeModal: React.FC<Props> = ({ isOpen, onClose, guarantee }) => {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [returnAmount, setReturnAmount] = useState<number>(0);
  const [forfeitAmount, setForfeitAmount] = useState<number>(0);
  const [returnAccountId, setReturnAccountId] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const queryClient = useQueryClient();

  const { data: accounts } = useQuery({
    queryKey: ['coa-flat'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      return (res.data.data ?? res.data) as any[];
    },
    enabled: isOpen,
  });

  const cashAccounts = (accounts || []).filter(
    (a: any) => !a.isGroup && a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1'),
  );
  const expenseAccounts = (accounts || []).filter(
    (a: any) => !a.isGroup && a.rootType === 'EXPENSE',
  );

  // No reset useEffect: parent mounts `{settleTarget && <Modal key={id} ... />}`
  // so each target gets a fresh mount + useState() defaults.

  const outstanding = Number(guarantee?.outstanding ?? 0);
  const total = Number(returnAmount || 0) + Number(forfeitAmount || 0);
  const totalValid = total > 0 && total <= outstanding + 0.01;

  const mutation = useMutation({
    mutationFn: (body: any) => api.post(`/project-guarantees/${guarantee!.id}/settle`, body),
    onSuccess: () => {
      toast.success('Settlement uang jaminan berhasil disimpan.');
      queryClient.invalidateQueries({ queryKey: ['project-guarantees'] });
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      onClose();
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Gagal memproses settlement.');
    },
  });

  const setReturnMax = () => setReturnAmount(Number((outstanding - Number(forfeitAmount || 0)).toFixed(2)));
  const setForfeitRest = () => {
    const rest = Math.max(0, Number((outstanding - Number(returnAmount || 0)).toFixed(2)));
    setForfeitAmount(rest);
  };

  const handleSubmit = () => {
    setError('');
    if (!totalValid) { setError('Total dikembalikan + hangus harus > 0 dan ≤ sisa jaminan.'); return; }
    if (Number(returnAmount) > 0 && !returnAccountId) { setError('Pilih akun kas/bank tujuan pengembalian.'); return; }
    mutation.mutate({
      date,
      returnAmount: Number(returnAmount) || 0,
      forfeitAmount: Number(forfeitAmount) || 0,
      returnAccountId: Number(returnAmount) > 0 ? returnAccountId : null,
      expenseAccountId: Number(forfeitAmount) > 0 && expenseAccountId ? expenseAccountId : null,
      notes: notes || null,
    });
  };

  if (!isOpen || !guarantee) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="settle-guarantee-title" className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div>
            <h3 id="settle-guarantee-title" className="font-semibold text-gray-900">Settlement Uang Jaminan</h3>
            <p className="text-xs text-gray-500 mt-0.5">{guarantee.guaranteeNumber} — {guarantee.projectName} ({guarantee.party?.name})</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
            <p className="text-xs font-semibold text-teal-700 uppercase">Sisa Jaminan</p>
            <p className="text-lg font-bold text-teal-700 font-mono tabular-nums">{formatRupiah(outstanding)}</p>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Tanggal</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">Dikembalikan (kas masuk)</label>
              <button type="button" onClick={setReturnMax} className="text-xs text-teal-600 hover:underline">Maks: {formatRupiah(Math.max(0, outstanding - Number(forfeitAmount || 0)))}</button>
            </div>
            <input type="number" min={0} value={returnAmount || ''} onChange={(e) => setReturnAmount(Number(e.target.value) || 0)}
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="0" />
            {Number(returnAmount) > 0 && (
              <Select value={returnAccountId} onChange={(e) => setReturnAccountId(e.target.value)} className="w-full mt-2">
                <option value="">— Pilih akun kas/bank tujuan —</option>
                {cashAccounts.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.accountNumber} — {a.name}</option>
                ))}
              </Select>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">Hangus / Dipotong Penalti (jadi beban)</label>
              <button type="button" onClick={setForfeitRest} className="text-xs text-red-500 hover:underline">Sisa: {formatRupiah(Math.max(0, outstanding - Number(returnAmount || 0)))}</button>
            </div>
            <input type="number" min={0} value={forfeitAmount || ''} onChange={(e) => setForfeitAmount(Number(e.target.value) || 0)}
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="0" />
            {Number(forfeitAmount) > 0 && (
              <Select value={expenseAccountId} onChange={(e) => setExpenseAccountId(e.target.value)} className="w-full mt-2">
                <option value="">— Default: Beban Lain-lain —</option>
                {expenseAccounts.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.accountNumber} — {a.name}</option>
                ))}
              </Select>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Catatan (opsional)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs">
            <div className="flex justify-between"><span className="text-gray-600">Total settlement:</span><span className="font-mono font-semibold">{formatRupiah(total)}</span></div>
            <div className="flex justify-between text-gray-500"><span>Sisa setelah ini:</span><span className="font-mono">{formatRupiah(Math.max(0, outstanding - total))}</span></div>
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
            className="btn-primary bg-teal-600 hover:bg-teal-700 disabled:opacity-50">
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Proses
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettleGuaranteeModal;
