import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Loader2, AlertCircle, Wallet } from 'lucide-react';
import { formatRupiah, formatDate } from '../lib/formatters';

interface ApplyCustomerDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  salesInvoiceId: string;
  partyId: string;
  invoiceOutstanding: number;
}

const ApplyCustomerDepositModal: React.FC<ApplyCustomerDepositModalProps> = ({
  isOpen, onClose, salesInvoiceId, partyId, invoiceOutstanding,
}) => {
  const [selectedDepositId, setSelectedDepositId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [error, setError] = useState('');

  const queryClient = useQueryClient();

  const { data: deposits, isLoading } = useQuery({
    queryKey: ['customer-deposit-balance', partyId],
    queryFn: async () => {
      const res = await api.get(`/customer-deposits/balance/${partyId}`);
      return res.data;
    },
    enabled: isOpen && !!partyId,
  });

  // No reset useEffect here: parent uses `{isOpen && <Modal .../>}` so each
  // open is a fresh mount and the useState() defaults above run again.

  // Auto-fill amount when deposit is selected
  useEffect(() => {
    if (selectedDepositId && deposits?.data) {
      const dep = deposits.data.find((d: any) => d.id === selectedDepositId);
      if (dep) {
        const suggested = Math.min(dep.remaining, invoiceOutstanding);
        setAmount(suggested);
      }
    }
  }, [selectedDepositId, deposits, invoiceOutstanding]);

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/customer-deposits/apply', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoice-detail'] });
      queryClient.invalidateQueries({ queryKey: ['customer-deposits'] });
      queryClient.invalidateQueries({ queryKey: ['customer-deposit-balance'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal mengaplikasikan uang muka.'),
  });

  const numAmount = Number(amount) || 0;
  const canSubmit = selectedDepositId && numAmount > 0 && !mutation.isPending;

  const handleSubmit = () => {
    mutation.mutate({
      depositPaymentId: selectedDepositId,
      salesInvoiceId,
      amount: numAmount,
    });
  };

  if (!isOpen) return null;

  const availableDeposits = deposits?.data ?? [];

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
                Gunakan Uang Muka Pelanggan
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Aplikasikan deposit ke invoice penjualan</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Invoice outstanding info */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <p className="text-xs font-medium text-blue-700">
              Sisa tagihan invoice: <span className="font-bold font-mono">{formatRupiah(invoiceOutstanding)}</span>
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : availableDeposits.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              Tidak ada deposit aktif untuk pelanggan ini.
            </div>
          ) : (
            <>
              {/* Deposit selection */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Pilih Deposit</label>
                <div className="space-y-2">
                  {availableDeposits.map((dep: any) => (
                    <button
                      key={dep.id}
                      onClick={() => setSelectedDepositId(dep.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedDepositId === dep.id
                          ? 'border-teal-400 bg-teal-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{dep.paymentNumber}</p>
                          <p className="text-xs text-gray-400">{formatDate(dep.date)} · {dep.account?.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold font-mono text-teal-600">{formatRupiah(dep.remaining)}</p>
                          <p className="text-xs text-gray-400">dari {formatRupiah(dep.amount)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              {selectedDepositId && (
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Jumlah yang diaplikasikan (Rp)</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0"
                    min={0}
                    className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              )}
            </>
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
            className="btn-primary bg-teal-500 hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : 'Aplikasikan'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApplyCustomerDepositModal;
