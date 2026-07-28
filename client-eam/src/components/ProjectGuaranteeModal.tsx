import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import { formatRupiah } from '../lib/formatters';
import RupiahInput from './RupiahInput';
import Select from './Select';

const GUARANTEE_TYPES = ['Penawaran', 'Pelaksanaan', 'Pemeliharaan', 'Lainnya'];

interface ProjectGuaranteeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ProjectGuaranteeModal: React.FC<ProjectGuaranteeModalProps> = ({ isOpen, onClose }) => {
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [partyId, setPartyId] = useState('');
  const [guaranteeType, setGuaranteeType] = useState('Penawaran');
  const [projectName, setProjectName] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [accountId, setAccountId] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOpen) {
      setDate(today);
      setPartyId('');
      setGuaranteeType('Penawaran');
      setProjectName('');
      setReferenceNo('');
      setAmount('');
      setAccountId('');
      setExpectedReturnDate('');
      setNotes('');
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Pemberi proyek bisa customer atau pihak lain — tampilkan semua pihak.
  const { data: parties } = useQuery({
    queryKey: ['parties'],
    queryFn: async () => {
      const res = await api.get('/parties');
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

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/project-guarantees', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-guarantees'] });
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal menyimpan uang jaminan.'),
  });

  const numAmount = Number(amount) || 0;
  const canSubmit = partyId && projectName.trim() && numAmount > 0 && accountId && !mutation.isPending;

  const handleSubmit = () => {
    mutation.mutate({
      date,
      partyId,
      guaranteeType,
      projectName: projectName.trim(),
      referenceNo: referenceNo || null,
      amount: numAmount,
      accountId,
      expectedReturnDate: expectedReturnDate || null,
      notes: notes || null,
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
              <ShieldCheck size={16} className="text-teal-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Setor Uang Jaminan Proyek
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Jaminan tender/pelaksanaan ke pemberi proyek</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Tanggal Setor</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Jenis Jaminan</label>
              <Select value={guaranteeType} onChange={(e) => setGuaranteeType(e.target.value)} className="w-full">
                {GUARANTEE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Pemberi Proyek</label>
            <Select value={partyId} onChange={(e) => setPartyId(e.target.value)} className="w-full">
              <option value="">— Pilih Pihak —</option>
              {parties?.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Nama Proyek</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Mis. Pengadaan Beras 2026"
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">No. Referensi</label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="No. tender / kontrak"
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Jumlah (Rp)</label>
              <RupiahInput
                value={typeof amount === 'number' ? amount : 0}
                onChange={(v) => setAmount(v === 0 ? '' : v)}
                placeholder="0"
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Jumlah uang jaminan"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Akun Sumber Dana</label>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full">
                <option value="">— Pilih Akun Kas/Bank —</option>
                {cashAccounts?.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.accountNumber} — {a.name}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Jatuh Tempo Pengembalian</label>
              <input
                type="date"
                value={expectedReturnDate}
                onChange={(e) => setExpectedReturnDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[11px] text-gray-400 mt-1">Opsional — sistem mengingatkan H-7 via notifikasi & Telegram.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Catatan</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Keterangan opsional..."
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {numAmount > 0 && (
            <div className="rounded-lg p-3 border bg-teal-50 border-teal-100">
              <p className="text-xs font-medium text-teal-700">
                Setor jaminan <span className="text-base font-bold font-mono tabular-nums">{formatRupiah(numAmount)}</span>
              </p>
              <p className="text-xs text-teal-500 mt-0.5">
                Jurnal: <span className="font-mono">DR Uang Jaminan Proyek (1.8) / CR Kas-Bank</span>
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={15} /> <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-3" style={{ borderColor: 'var(--color-border)' }}>
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="btn-primary bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : 'Setor Jaminan'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectGuaranteeModal;
