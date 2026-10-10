import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { formatRupiah } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DateInput, Field } from '@/components/shared';
import { FormError, OverlayBody, OverlayFooter, OverlayHeader } from './sales/dialog-parts-b';
import { dialogShellClass } from './sales/dialog-classes-b';

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

const RefundCustomerDepositModal: React.FC<Props> = ({ isOpen, onClose, deposit }) => {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [offsetAmount, setOffsetAmount] = useState<number>(0);
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [cashAccountId, setCashAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const queryClient = useQueryClient();

  // Piutang pelanggan (outstanding invoice FIFO)
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
    mutationFn: (body: any) => api.post(`/customer-deposits/${deposit!.id}/refund`, body),
    onSuccess: () => {
      toast.success('Uang muka diselesaikan.');
      queryClient.invalidateQueries({ queryKey: ['customer-deposits'] });
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
      setError(`Offset (${formatRupiah(Number(offsetAmount))}) melebihi total piutang pelanggan (${formatRupiah(Number(partyOutstanding ?? 0))}).`);
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

  return (
    <Dialog open={isOpen && !!deposit} onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent size="md" className={dialogShellClass}>
        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); if (totalValid && !mutation.isPending) handleSubmit(); }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <OverlayHeader>
            <DialogTitle>Refund / Offset Uang Muka</DialogTitle>
            <DialogDescription>{deposit?.paymentNumber} · {deposit?.party?.name}</DialogDescription>
          </OverlayHeader>

          <OverlayBody>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Sisa Uang Muka</p>
                <p className="text-lg font-bold tabular-nums text-foreground">{formatRupiah(remaining)}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Piutang Pelanggan</p>
                <p className="text-lg font-bold tabular-nums text-foreground">{formatRupiah(Number(partyOutstanding ?? 0))}</p>
              </div>
            </div>

            <Field label="Tanggal">
              <DateInput value={date} onChange={setDate} />
            </Field>

            <div className="grid gap-2">
              <Field label="Offset ke Piutang (FIFO invoice terlama)">
                <NumberInput min={0} value={offsetAmount || ''} onChange={(e) => setOffsetAmount(Number(e.target.value) || 0)}
                  className="h-10 text-right tabular-nums md:h-9" placeholder="0" />
              </Field>
              <Button type="button" variant="link" size="sm" className="justify-self-end text-xs" onClick={setOffsetMax}>
                Maks: {formatRupiah(maxOffset)}
              </Button>
            </div>

            <div className="grid gap-2">
              <Field label="Refund Kas ke Bank">
                <NumberInput min={0} value={cashAmount || ''} onChange={(e) => setCashAmount(Number(e.target.value) || 0)}
                  className="h-10 text-right tabular-nums md:h-9" placeholder="0" />
              </Field>
              <Button type="button" variant="link" size="sm" className="justify-self-end text-xs" onClick={setCashRest}>
                Sisa: {formatRupiah(Math.max(0, remaining - Number(offsetAmount || 0)))}
              </Button>
              {Number(cashAmount) > 0 && (
                <Field label="Akun kas/bank" required>
                  {(control) => (
                    <Select value={cashAccountId} onValueChange={setCashAccountId}>
                      <SelectTrigger {...control}><SelectValue placeholder="Pilih akun kas/bank" /></SelectTrigger>
                      <SelectContent>
                        {(cashAccounts || []).map((a: any) => (
                          <SelectItem key={a.id} value={a.id}>{a.accountNumber} · {a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              )}
            </div>

            <Field label="Catatan (opsional)">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>

            <dl className="grid gap-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs" aria-live="polite">
              <div className="flex justify-between"><dt className="text-muted-foreground">Total penyelesaian:</dt><dd className="font-semibold tabular-nums">{formatRupiah(total)}</dd></div>
              <div className="flex justify-between text-muted-foreground"><dt>Sisa setelah ini:</dt><dd className="tabular-nums">{formatRupiah(Math.max(0, remaining - total))}</dd></div>
            </dl>

            <FormError message={error} />
          </OverlayBody>

          <OverlayFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>Batal</Button>
            <Button type="submit" disabled={!totalValid} loading={mutation.isPending}>
              {!mutation.isPending && <CheckCircle2 aria-hidden />}
              {mutation.isPending ? 'Memproses…' : 'Proses'}
            </Button>
          </OverlayFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RefundCustomerDepositModal;
