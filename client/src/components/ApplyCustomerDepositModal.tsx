import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { Wallet } from 'lucide-react';
import { formatRupiah, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Field, LoadingState } from '@/components/shared';
import { FormError, OverlayBody, OverlayFooter, OverlayHeader } from './sales/dialog-parts-b';
import { dialogShellClass } from './sales/dialog-classes-b';

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

  const availableDeposits = deposits?.data ?? [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent size="md" className={dialogShellClass}>
        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); if (canSubmit) handleSubmit(); }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <OverlayHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="size-5 text-primary" aria-hidden />
              Gunakan Uang Muka Pelanggan
            </DialogTitle>
            <DialogDescription>Aplikasikan deposit ke invoice penjualan</DialogDescription>
          </OverlayHeader>

          <OverlayBody>
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-xs font-medium text-foreground">
                Sisa tagihan invoice: <span className="font-bold tabular-nums">{formatRupiah(invoiceOutstanding)}</span>
              </p>
            </div>

            {isLoading ? (
              <div role="status" aria-label="Memuat deposit"><LoadingState size="sm" /></div>
            ) : availableDeposits.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Tidak ada deposit aktif untuk pelanggan ini.
              </div>
            ) : (
              <>
                <div role="radiogroup" aria-labelledby="apply-deposit-label" className="grid gap-2">
                  <span id="apply-deposit-label" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Pilih Deposit
                  </span>
                  {availableDeposits.map((dep: any) => (
                    // eslint-disable-next-line jsx-a11y/control-has-associated-label -- accessible name comes from the button's text children
                    <button
                      key={dep.id}
                      type="button"
                      role="radio"
                      aria-checked={selectedDepositId === dep.id}
                      onClick={() => setSelectedDepositId(dep.id)}
                      className={cn(
                        'min-h-11 w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        selectedDepositId === dep.id
                          ? 'border-primary bg-primary-subtle'
                          : 'border-border hover:bg-accent',
                      )}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground">{dep.paymentNumber}</span>
                          <span className="block text-xs text-muted-foreground">{formatDate(dep.date)} · {dep.account?.name}</span>
                        </span>
                        <span className="text-right">
                          <span className="block text-sm font-bold tabular-nums text-foreground">{formatRupiah(dep.remaining)}</span>
                          <span className="block text-xs text-muted-foreground">dari {formatRupiah(dep.amount)}</span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                {selectedDepositId && (
                  <Field label="Jumlah yang diaplikasikan (Rp)" required>
                    <NumberInput
                      value={amount}
                      onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="0"
                      min={0}
                      className="h-10 text-right tabular-nums md:h-9"
                    />
                  </Field>
                )}
              </>
            )}

            <FormError message={error} />
          </OverlayBody>

          <OverlayFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>Batal</Button>
            <Button type="submit" disabled={!canSubmit} loading={mutation.isPending}>
              {mutation.isPending ? 'Menyimpan…' : 'Aplikasikan'}
            </Button>
          </OverlayFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ApplyCustomerDepositModal;
