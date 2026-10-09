import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { formatRupiah, formatDate } from '@/lib/format';
import { NumberInput } from '@/components/ui/number-input';
import { Field, LoadingState } from '@/components/shared';
import { cn } from '@/lib/utils';
import { FormDialog } from './purchase-cash/FormDialog';
import { ErrorAlert, Callout } from './purchase-cash/ErrorAlert';

interface ApplyDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchaseInvoiceId: string;
  partyId: string;
  invoiceOutstanding: number;
}

const ApplyDepositModal: React.FC<ApplyDepositModalProps> = ({
  isOpen, onClose, purchaseInvoiceId, partyId, invoiceOutstanding,
}) => {
  const [selectedDepositId, setSelectedDepositId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [error, setError] = useState('');

  const queryClient = useQueryClient();

  const { data: deposits, isLoading } = useQuery({
    queryKey: ['vendor-deposit-balance', partyId],
    queryFn: async () => {
      const res = await api.get(`/vendor-deposits/balance/${partyId}`);
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
    mutationFn: (data: any) => api.post('/vendor-deposits/apply', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-invoice-detail'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-deposits'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-deposit-balance'] });
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
      purchaseInvoiceId,
      amount: numAmount,
    });
  };

  const availableDeposits = deposits?.data ?? [];

  return (
    <FormDialog
      open={isOpen}
      onClose={onClose}
      title="Gunakan Uang Muka"
      description="Aplikasikan deposit ke invoice ini"
      busy={mutation.isPending}
      submitLabel="Aplikasikan"
      busyLabel="Memproses…"
      onSubmit={handleSubmit}
      submitDisabled={!canSubmit}
    >
      <Callout tone="info">
        Sisa tagihan invoice: <span className="num font-bold">{formatRupiah(invoiceOutstanding)}</span>
      </Callout>

      {isLoading ? (
        <LoadingState label="Memuat deposit…" />
      ) : availableDeposits.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada deposit aktif untuk supplier ini.</p>
      ) : (
        <>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium text-foreground">Pilih Deposit</legend>
            {availableDeposits.map((dep: any) => (
              // eslint-disable-next-line jsx-a11y/control-has-associated-label -- accessible name comes from the button's text children
              <button
                key={dep.id}
                type="button"
                aria-pressed={selectedDepositId === dep.id}
                onClick={() => setSelectedDepositId(dep.id)}
                className={cn(
                  'min-h-11 w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selectedDepositId === dep.id
                    ? 'border-primary bg-primary-subtle'
                    : 'border-border hover:border-border-strong hover:bg-accent',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{dep.paymentNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(dep.date)} · {dep.account?.name}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="num text-sm font-bold text-foreground">{formatRupiah(dep.remaining)}</p>
                    <p className="text-xs text-muted-foreground">dari {formatRupiah(dep.amount)}</p>
                  </div>
                </div>
              </button>
            ))}
          </fieldset>

          {selectedDepositId && (
            <Field label="Jumlah yang diaplikasikan (Rp)">
              <NumberInput
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0"
                min={0}
                inputMode="decimal"
                className="h-10 text-right md:h-9"
              />
            </Field>
          )}
        </>
      )}

      <ErrorAlert message={error} />
    </FormDialog>
  );
};

export default ApplyDepositModal;
