import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { CheckCircle2, Paperclip } from 'lucide-react';
import { formatRupiah } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, DateInput } from '@/components/shared';
import { FormDialog } from './purchase-cash/FormDialog';
import { OptionPicker } from './purchase-cash/OptionPicker';
import { RupiahField } from './purchase-cash/RupiahField';
import { ErrorAlert, Callout } from './purchase-cash/ErrorAlert';
import AttachmentUpload from './AttachmentUpload';
import AttachmentPreview from './AttachmentPreview';

interface VendorDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const VendorDepositModal: React.FC<VendorDepositModalProps> = ({ isOpen, onClose }) => {
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

  const { data: suppliers } = useQuery({
    queryKey: ['parties', 'Supplier'],
    queryFn: async () => {
      const res = await api.get('/parties', { params: { type: 'Supplier' } });
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

  // Fetch current deposit balance for selected supplier
  const { data: depositBalance } = useQuery({
    queryKey: ['vendor-deposit-balance', partyId],
    queryFn: async () => {
      const res = await api.get(`/vendor-deposits/balance/${partyId}`);
      return res.data;
    },
    enabled: isOpen && !!partyId,
  });

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/payments', data),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-deposits'] });
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
      paymentType: 'VendorDeposit',
      accountId: isOpeningBalance ? 'opening-equity' : accountId,
      referenceNo: referenceNo || null,
      notes: notes || null,
      isOpeningBalance,
    });
  };

  return (
    <FormDialog
      open={isOpen}
      onClose={onClose}
      title="Uang Muka Vendor"
      description="Deposit ke supplier sebelum pembelian"
      size="lg"
      className="sm:max-w-xl"
      busy={mutation.isPending}
      submitLabel="Simpan Deposit"
      onSubmit={handleSubmit}
      submitDisabled={!canSubmit}
      footer={
        savedId ? (
          <Button className="h-11 sm:h-9" onClick={onClose}>
            Selesai
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Tanggal">
          <DateInput value={date} onChange={setDate} />
        </Field>
        <Field label="Supplier">
          <OptionPicker
            value={partyId}
            onChange={setPartyId}
            placeholder="— Pilih Supplier —"
            options={(suppliers ?? []).map((p: any) => ({ value: p.id, label: p.name }))}
          />
        </Field>
      </div>

      {partyId && depositBalance && depositBalance.totalBalance > 0 && (
        <Callout tone="warning" icon={<span className="sr-only">Info:</span>}>
          <p>
            Saldo uang muka saat ini: <span className="num font-bold">{formatRupiah(depositBalance.totalBalance)}</span>
          </p>
          <p className="mt-0.5 text-xs">{depositBalance.data.length} deposit aktif</p>
        </Callout>
      )}

      <label className="flex min-h-11 cursor-pointer items-start gap-3 sm:min-h-0">
        <Checkbox
          className="mt-0.5"
          checked={isOpeningBalance}
          onCheckedChange={(v) => setIsOpeningBalance(v === true)}
        />
        <span>
          <span className="text-sm font-medium text-foreground">Saldo Awal / Koreksi</span>
          <span className="block text-xs text-muted-foreground">
            Catat deposit tanpa mempengaruhi kas (offset ke Ekuitas Saldo Awal)
          </span>
        </span>
      </label>

      {isOpeningBalance && (
        <Callout tone="info">
          <p>
            Jurnal: <span className="font-mono font-medium">DR Uang Muka Pembelian / CR Ekuitas Saldo Awal</span>
          </p>
          <p className="mt-0.5 text-xs">
            Kas/Bank tidak terpengaruh. Gunakan untuk deposit yang uangnya sudah keluar sebelum sistem digunakan.
          </p>
        </Callout>
      )}

      <div className={isOpeningBalance ? '' : 'grid grid-cols-1 gap-4 sm:grid-cols-2'}>
        <Field label="Jumlah (Rp)">
          <RupiahField
            value={typeof amount === 'number' ? amount : 0}
            onChange={(v) => setAmount(v === 0 ? '' : v)}
            placeholder="0"
          />
        </Field>
        {!isOpeningBalance && (
          <Field label="Akun Kas/Bank">
            <OptionPicker
              value={accountId}
              onChange={setAccountId}
              placeholder="— Pilih Akun —"
              options={(cashAccounts ?? []).map((a: any) => ({ value: String(a.id), label: `${a.accountNumber} — ${a.name}` }))}
            />
          </Field>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="No. Referensi">
          <Input
            value={referenceNo}
            onChange={(e) => setReferenceNo(e.target.value)}
            placeholder="No. cek, transfer, dll."
          />
        </Field>
        <Field label="Catatan">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Keterangan opsional..." />
        </Field>
      </div>

      {numAmount > 0 && (
        <Callout tone="warning" icon={<span className="sr-only">Ringkasan:</span>}>
          Deposit <span className="num text-base font-bold">{formatRupiah(numAmount)}</span> ke supplier
        </Callout>
      )}

      <ErrorAlert message={error} />

      {savedId && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-success-text" aria-hidden />
            <span className="text-xs font-semibold text-success-text">Tersimpan</span>
            <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <Paperclip className="size-3" aria-hidden /> Lampiran Bukti Transfer
            </span>
          </div>
          <AttachmentPreview referenceType="payment" referenceId={savedId} />
          <AttachmentUpload referenceType="payment" referenceId={savedId} />
        </div>
      )}
    </FormDialog>
  );
};

export default VendorDepositModal;
