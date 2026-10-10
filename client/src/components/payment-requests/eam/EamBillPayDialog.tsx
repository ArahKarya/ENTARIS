/**
 * Pay/post one EAM bill as a direct cash/bank journal or a vendor purchase invoice;
 * the expense account is preselected from the bill's default.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { controlBase } from '@/components/ui/styles';
import { DateInput, Field } from '@/components/shared';
import { AccountPicker } from '@/components/fixed-assets/AccountPicker';
import { ComboField } from '@/components/fixed-assets/ComboField';
import { usePartyPicker } from '@/hooks/usePartyPicker';
import { JournalPreview } from '@/components/fixed-assets/JournalPreview';
import { apiError } from '@/components/fixed-assets/errors';
import { PR_ENDPOINT } from '../payment-request';
import { KIND_META, type GaBill } from './eam-bills';

type Method = 'JOURNAL' | 'PURCHASE_INVOICE';

interface FlatAccount {
  id: string;
  accountNumber: string;
  name: string;
  accountType?: string;
  isGroup?: boolean;
}

interface EamBillPayDialogProps {
  bill: GaBill | null;
  onClose: () => void;
  onSuccess: () => void;
}

const METHODS: { value: Method; title: string; description: string }[] = [
  { value: 'JOURNAL', title: 'Jurnal Langsung', description: 'Lunas seketika dari kas/bank' },
  { value: 'PURCHASE_INVOICE', title: 'Faktur Pembelian', description: 'Ditagih vendor, masuk hutang usaha' },
];

const toIsoDay = (d: string | null) => (d ? String(d).split('T')[0] : new Date().toISOString().split('T')[0]);

export function EamBillPayDialog({ bill, onClose, onSuccess }: EamBillPayDialogProps) {
  const open = bill !== null;
  const [method, setMethod] = useState<Method>('JOURNAL');
  const [accountId, setAccountId] = useState('');
  const [creditAccountId, setCreditAccountId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [date, setDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (bill) {
      setMethod('JOURNAL');
      setAccountId('');
      setCreditAccountId('');
      setPartyId('');
      setAmount(bill.amount || '');
      setDate(toIsoDay(bill.date));
      setDueDate('');
      setNotes('');
      setError('');
    }
  }, [bill]);

  const accountsQuery = useQuery({
    queryKey: ['all-accounts-flat'],
    queryFn: async () => {
      const res = await api.get<FlatAccount[] | { data: FlatAccount[] }>('/coa/flat');
      const all = Array.isArray(res.data) ? res.data : res.data.data;
      return all.filter((a) => !a.isGroup);
    },
    enabled: open,
  });
  const accounts = accountsQuery.data;

  const vendorPicker = usePartyPicker({
    type: 'Supplier',
    activeOnly: true,
    selectedId: partyId || null,
    enabled: open && method === 'PURCHASE_INVOICE',
  });

  // Preselect the expense account matching the bill's default account number.
  useEffect(() => {
    if (!bill || !accounts || accountId) return;
    const def = accounts.find((a) => a.accountNumber === bill.defaultAccountNumber);
    if (def) setAccountId(def.id);
    // Only when the accounts arrive or the bill changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, bill]);

  const expenseAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.accountType === 'EXPENSE' || a.accountNumber.startsWith('1.3')),
    [accounts],
  );
  const cashAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1')),
    [accounts],
  );

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`${PR_ENDPOINT}/eam/${bill!.kind}/${bill!.id}/pay`, {
        method,
        accountId: accountId || null,
        creditAccountId: method === 'JOURNAL' ? creditAccountId || null : null,
        partyId: method === 'PURCHASE_INVOICE' ? partyId || null : null,
        amount: amount === '' ? null : Number(amount),
        date: date || null,
        dueDate: method === 'PURCHASE_INVOICE' ? dueDate || null : null,
        notes: notes || null,
      }),
    onSuccess: () => {
      toast.success(method === 'JOURNAL' ? 'Jurnal diposting.' : 'Faktur pembelian dibuat.');
      onSuccess();
    },
    onError: (e) => setError(apiError(e, 'Gagal memposting tagihan.')),
  });

  const submit = () => {
    setError('');
    if (!accountId) return setError('Pilih akun beban (debit) terlebih dahulu.');
    if (method === 'JOURNAL' && !creditAccountId) return setError('Pilih akun kas/bank sumber pembayaran.');
    if (method === 'PURCHASE_INVOICE' && !partyId) return setError('Pilih vendor penagih.');
    if (!amount || Number(amount) <= 0) return setError('Nilai tagihan harus lebih dari 0.');
    mutation.mutate();
  };

  const label = (list: FlatAccount[], id: string) => {
    const a = list.find((x) => x.id === id);
    return a ? `${a.accountNumber} · ${a.name}` : null;
  };
  const value = formatRupiah(Number(amount) || 0);
  const meta = bill ? KIND_META[bill.kind] : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !mutation.isPending && onClose()}>
      <DialogContent size="lg" hideClose={mutation.isPending}>
        {bill && meta && (
          <>
            <DialogHeader>
              <DialogTitle>Bayar / Posting Tagihan</DialogTitle>
              <DialogDescription>
                {meta.label} · {bill.assetName ?? '-'}
              </DialogDescription>
            </DialogHeader>

            <div className="min-w-0 space-y-4">
              <div className="rounded-md border border-border bg-muted/50 px-3 py-2.5">
                <p className="text-sm font-medium text-foreground">{bill.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Nilai pengajuan: <span className="num font-medium text-foreground">{formatRupiah(bill.amount)}</span>
                  {bill.notes ? ` · ${bill.notes}` : ''}
                </p>
                {bill.items && bill.items.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {bill.items.map((i, idx) => (
                      <li key={idx} className="flex justify-between gap-4">
                        <span>
                          {i.itemName} ({i.quantity} {i.uom})
                        </span>
                        <span className="num">{formatRupiah(i.unitPrice * i.quantity)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-foreground">Cara bayar</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {METHODS.map((o) => (
                    <label
                      key={o.value}
                      htmlFor={`ga-pay-method-${o.value}`}
                      className={cn(
                        'grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-2.5 rounded-md border px-3 py-2.5 transition-colors',
                        'focus-within:ring-2 focus-within:ring-ring',
                        method === o.value ? 'border-primary bg-primary-subtle' : 'border-border hover:bg-accent',
                      )}
                    >
                      <input
                        id={`ga-pay-method-${o.value}`}
                        type="radio"
                        name="ga-pay-method"
                        value={o.value}
                        checked={method === o.value}
                        onChange={() => setMethod(o.value)}
                        className="row-span-2 mt-1 size-4 accent-primary"
                      />
                      <span className="text-sm font-medium text-foreground">{o.title}</span>
                      <span className="text-xs text-muted-foreground">{o.description}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Tanggal">
                  {(control) => <DateInput id={control.id} value={date} onChange={setDate} />}
                </Field>
                <Field label="Nilai (Rp)">
                  <NumberInput
                    className={`${controlBase} h-10 px-3 md:h-9`}
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </Field>
              </div>

              <AccountPicker
                label="Akun beban (debit)"
                required
                value={accountId}
                onChange={setAccountId}
                accounts={expenseAccounts}
                placeholder="Pilih akun beban…"
                loading={accountsQuery.isLoading}
              />

              {method === 'JOURNAL' ? (
                <AccountPicker
                  label="Sumber dana / kas-bank (kredit)"
                  required
                  value={creditAccountId}
                  onChange={setCreditAccountId}
                  accounts={cashAccounts}
                  placeholder="Pilih kas/bank…"
                  loading={accountsQuery.isLoading}
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <ComboField
                    label="Vendor"
                    required
                    value={partyId}
                    onChange={setPartyId}
                    {...vendorPicker.pickerProps}
                    placeholder="Pilih vendor…"
                    searchPlaceholder="Cari vendor…"
                  />
                  <Field label="Jatuh tempo">
                    {(control) => <DateInput id={control.id} value={dueDate} onChange={setDueDate} />}
                  </Field>
                </div>
              )}

              <Field label="Catatan">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Opsional…" />
              </Field>

              <JournalPreview
                title="Pratinjau jurnal"
                lines={[
                  { side: 'DR', account: label(expenseAccounts, accountId) ?? '(pilih akun beban)', amount: value },
                  {
                    side: 'CR',
                    account:
                      method === 'JOURNAL'
                        ? label(cashAccounts, creditAccountId) ?? '(pilih kas/bank)'
                        : '2.1.1 · Hutang Usaha',
                    amount: value,
                  },
                ]}
              />

              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-sm text-danger-text">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
                Batal
              </Button>
              <Button onClick={submit} loading={mutation.isPending}>
                {method === 'JOURNAL' ? 'Posting Jurnal' : 'Buat Faktur'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
