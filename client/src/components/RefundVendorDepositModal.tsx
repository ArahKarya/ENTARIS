import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../lib/api';
import { formatRupiah } from '@/lib/format';
import { NumberInput } from '@/components/ui/number-input';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Field, DateInput } from '@/components/shared';
import { FormDialog } from './purchase-cash/FormDialog';
import { OptionPicker } from './purchase-cash/OptionPicker';
import { ErrorAlert } from './purchase-cash/ErrorAlert';

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

  if (!deposit) return null;

  const cashRest = Math.max(0, remaining - Number(offsetAmount || 0));

  return (
    <FormDialog
      open={isOpen}
      onClose={onClose}
      title="Refund / Offset Uang Muka Vendor"
      description={`${deposit.paymentNumber} — ${deposit.party?.name ?? ''}`}
      busy={mutation.isPending}
      submitLabel="Proses"
      busyLabel="Memproses…"
      onSubmit={handleSubmit}
      submitDisabled={!totalValid}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2">
          <p className="text-xs font-semibold uppercase text-warning-text">Sisa Uang Muka</p>
          <p className="num text-lg font-bold text-warning-text">{formatRupiah(remaining)}</p>
        </div>
        <div className="rounded-lg border border-info/30 bg-info-subtle px-3 py-2">
          <p className="text-xs font-semibold uppercase text-info-text">Hutang ke Vendor</p>
          <p className="num text-lg font-bold text-info-text">{formatRupiah(Number(partyOutstanding ?? 0))}</p>
        </div>
      </div>

      <Field label="Tanggal">
        <DateInput value={date} onChange={setDate} />
      </Field>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="refund-offset" className="text-sm font-medium text-foreground">
            Offset ke Hutang (FIFO invoice terlama)
          </label>
          <Button type="button" variant="link" size="sm" className="min-h-11 sm:min-h-0" onClick={setOffsetMax}>
            Maks: {formatRupiah(maxOffset)}
          </Button>
        </div>
        <NumberInput
          id="refund-offset"
          min={0}
          inputMode="decimal"
          value={offsetAmount || ''}
          onChange={(e) => setOffsetAmount(Number(e.target.value) || 0)}
          className="h-10 text-right md:h-9"
          placeholder="0"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="refund-cash" className="text-sm font-medium text-foreground">
            Refund Kas dari Vendor (masuk ke Bank)
          </label>
          <Button type="button" variant="link" size="sm" className="min-h-11 sm:min-h-0" onClick={setCashRest}>
            Sisa: {formatRupiah(cashRest)}
          </Button>
        </div>
        <NumberInput
          id="refund-cash"
          min={0}
          inputMode="decimal"
          value={cashAmount || ''}
          onChange={(e) => setCashAmount(Number(e.target.value) || 0)}
          className="h-10 text-right md:h-9"
          placeholder="0"
        />
        {Number(cashAmount) > 0 && (
          <OptionPicker
            aria-label="Akun kas/bank untuk refund"
            value={cashAccountId}
            onChange={setCashAccountId}
            placeholder="— Pilih akun kas/bank —"
            options={(cashAccounts || []).map((a: any) => ({ value: String(a.id), label: `${a.accountNumber} — ${a.name}` }))}
            className="mt-2"
          />
        )}
      </div>

      <Field label="Catatan (opsional)">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div className="space-y-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">Total penyelesaian:</span>
          <span className="num font-semibold">{formatRupiah(total)}</span>
        </div>
        <div className="flex justify-between gap-2 text-muted-foreground">
          <span>Sisa setelah ini:</span>
          <span className="num">{formatRupiah(Math.max(0, remaining - total))}</span>
        </div>
      </div>

      <ErrorAlert message={error} />
    </FormDialog>
  );
};

export default RefundVendorDepositModal;
