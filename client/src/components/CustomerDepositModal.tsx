import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { Wallet, CheckCircle2, Paperclip } from 'lucide-react';
import { formatRupiah } from '@/lib/format';
import AttachmentUpload from './AttachmentUpload';
import { RupiahField } from './purchase-cash/RupiahField';
import AttachmentPreview from './AttachmentPreview';
import { ComboboxField } from './overlays/ComboboxField';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DateInput, Field } from '@/components/shared';
import { FormError, OverlayBody, OverlayFooter, OverlayHeader } from './sales/dialog-parts-b';
import { dialogShellClass, moneyInputClass } from './sales/dialog-classes-b';

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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent size="md" className={dialogShellClass}>
        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); if (!savedId && canSubmit) handleSubmit(); }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <OverlayHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="size-5 text-primary" aria-hidden />
              Uang Muka Pelanggan
            </DialogTitle>
            <DialogDescription>Deposit dari pelanggan sebelum penjualan</DialogDescription>
          </OverlayHeader>

          <OverlayBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tanggal">
                <DateInput value={date} onChange={setDate} disabled={!!savedId} />
              </Field>
              <ComboboxField
                  label="Pelanggan"
                  required
                  options={(customers ?? []).map((p: any) => ({ value: p.id, label: p.name }))}
                  value={partyId}
                  onChange={setPartyId}
                  placeholder="— Pilih Pelanggan —"
                  disabled={!!savedId}
                />
            </div>

            {partyId && depositBalance && depositBalance.totalBalance > 0 && (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs font-medium text-foreground">
                  Saldo uang muka saat ini: <span className="font-bold tabular-nums">{formatRupiah(depositBalance.totalBalance)}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{depositBalance.data.length} deposit aktif</p>
              </div>
            )}

            <div className="flex items-start gap-3">
              <Checkbox
                id="customer-deposit-opening"
                checked={isOpeningBalance}
                onCheckedChange={(checked) => setIsOpeningBalance(checked === true)}
                disabled={!!savedId}
                className="mt-0.5"
              />
              <div className="grid gap-0.5">
                <Label htmlFor="customer-deposit-opening" className="text-sm font-medium">Saldo Awal / Koreksi</Label>
                <p className="text-xs text-muted-foreground">Catat deposit tanpa mempengaruhi kas (offset ke Ekuitas Saldo Awal)</p>
              </div>
            </div>

            {isOpeningBalance && (
              <div className="rounded-lg border border-border bg-info-subtle p-3 text-info-text">
                <p className="text-xs">
                  Jurnal: <span className="font-mono font-medium">DR Ekuitas Saldo Awal / CR Uang Muka Pelanggan</span>
                </p>
                <p className="mt-0.5 text-xs">Kas/Bank tidak terpengaruh. Gunakan untuk deposit yang uangnya sudah masuk sebelum sistem digunakan.</p>
              </div>
            )}

            <div className={isOpeningBalance ? '' : 'grid gap-4 sm:grid-cols-2'}>
              <Field label="Jumlah (Rp)" required>
                {(control) => (
                  <RupiahField
                    id={control.id}
                    value={typeof amount === 'number' ? amount : 0}
                    onChange={(v) => setAmount(v === 0 ? '' : v)}
                    placeholder="0"
                    className={moneyInputClass}
                    disabled={!!savedId}
                    aria-label="Jumlah uang muka"
                  />
                )}
              </Field>
              {!isOpeningBalance && (
                <Field label="Akun Kas/Bank" required>
                  {(control) => (
                    <Select value={accountId} onValueChange={setAccountId} disabled={!!savedId}>
                      <SelectTrigger {...control}><SelectValue placeholder="— Pilih Akun —" /></SelectTrigger>
                      <SelectContent>
                        {cashAccounts?.map((a: any) => (
                          <SelectItem key={a.id} value={a.id}>{a.accountNumber} — {a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="No. Referensi">
                <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="No. cek, transfer, dll." disabled={!!savedId} />
              </Field>
              <Field label="Catatan">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Keterangan opsional..." disabled={!!savedId} />
              </Field>
            </div>

            {numAmount > 0 && (
              <div className="rounded-lg border border-border bg-muted/40 p-3" aria-live="polite">
                <p className="text-xs font-medium text-foreground">
                  Deposit <span className="text-base font-bold tabular-nums">{formatRupiah(numAmount)}</span> dari pelanggan
                </p>
              </div>
            )}

            <FormError message={error} />

            {savedId && (
              <div className="grid gap-3 border-t border-border pt-3">
                <div className="flex items-center gap-2" role="status">
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
          </OverlayBody>

          <OverlayFooter>
            {savedId ? (
              <Button type="button" onClick={onClose}>Selesai</Button>
            ) : (
              <>
                <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>Batal</Button>
                <Button type="submit" disabled={!canSubmit} loading={mutation.isPending}>
                  {mutation.isPending ? 'Menyimpan…' : 'Simpan Deposit'}
                </Button>
              </>
            )}
          </OverlayFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerDepositModal;
