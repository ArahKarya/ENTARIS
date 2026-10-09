import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { TrendingDown, TrendingUp, CheckCircle2, Paperclip, Plus, Trash2, RotateCcw } from 'lucide-react';
import { formatRupiah, formatDate } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { NumberInput } from '@/components/ui/number-input';
import { Field, DateInput } from '@/components/shared';
import { cn } from '@/lib/utils';
import { FormDialog } from './purchase-cash/FormDialog';
import { OptionPicker } from './purchase-cash/OptionPicker';
import { ErrorAlert, Callout } from './purchase-cash/ErrorAlert';
import AttachmentUpload from './AttachmentUpload';
import AttachmentPreview from './AttachmentPreview';

type PaymentType = 'Receive' | 'Pay' | 'VendorRefund' | 'CustomerRefund';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: PaymentType;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, defaultType = 'Receive' }) => {
  const today = new Date().toISOString().split('T')[0];

  const [paymentType, setPaymentType] = useState<PaymentType>(defaultType);
  const [date, setDate] = useState(today);
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [accountId, setAccountId] = useState('');
  const [splitMode, setSplitMode] = useState(false);
  const [splits, setSplits] = useState<Array<{ accountId: string; amount: number | ''; notes: string }>>([
    { accountId: '', amount: '', notes: '' },
  ]);
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [refundSourcePaymentId, setRefundSourcePaymentId] = useState<string>('');
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setPaymentType(defaultType);
      setDate(new Date().toISOString().split('T')[0]);
      setPartyId('');
      setAmount('');
      setAccountId('');
      setSplitMode(false);
      setSplits([{ accountId: '', amount: '', notes: '' }]);
      setReferenceNo('');
      setNotes('');
      setRefundSourcePaymentId('');
      setError('');
      setSavedId(null);
    }
  }, [isOpen, defaultType]);

  const isReceiveFlow = paymentType === 'Receive' || paymentType === 'CustomerRefund';
  const isRefund = paymentType === 'VendorRefund' || paymentType === 'CustomerRefund';

  // Parties — filter by type based on payment direction
  const partyType = isReceiveFlow ? 'Customer' : 'Supplier';
  const { data: parties } = useQuery({
    queryKey: ['parties', partyType],
    queryFn: async () => {
      const res = await api.get('/parties', { params: { type: partyType } });
      return res.data.data ?? res.data;
    },
    enabled: isOpen,
  });

  // Cash/Bank accounts (ASSET type, non-group, account numbers starting with 1.1.1 or 1.1.2)
  const { data: cashAccounts } = useQuery({
    queryKey: ['cash-accounts'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      const all: any[] = res.data.data ?? res.data;
      // Return non-group asset accounts that are typically cash/bank (1.1.x)
      return all.filter((a: any) => !a.isGroup && a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1'));
    },
    enabled: isOpen,
  });

  // All non-group accounts (for split rows — allows cash + expense + others)
  const { data: allAccounts } = useQuery({
    queryKey: ['all-accounts-flat'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((a: any) => !a.isGroup && a.isActive !== false);
    },
    enabled: isOpen,
  });

  // Source payment list — only for Refund types. Combines TWO kinds of source:
  //   1. Direct payments (Pay / Receive) — over-payment refund flow via /payments
  //   2. Deposits (VendorDeposit / CustomerDeposit) — uang muka refund flow via
  //      /vendor-deposits/:id/refund or /customer-deposits/:id/refund (cash leg).
  // Each row carries a `kind` discriminator + remaining balance so the UI can
  // route the submit to the correct endpoint and validate amount.
  const { data: sourcePayments } = useQuery({
    queryKey: ['payments-source-for-refund', partyId, paymentType],
    queryFn: async () => {
      const isVendor = paymentType === 'VendorRefund';
      const directType = isVendor ? 'Pay' : 'Receive';
      const depositEndpoint = isVendor ? '/vendor-deposits' : '/customer-deposits';

      const [directRes, depositRes] = await Promise.all([
        api.get('/payments', { params: { limit: 500 } }),
        api.get(depositEndpoint, { params: { partyId } }),
      ]);

      const directs = (directRes.data.data ?? directRes.data)
        .filter(
          (p: any) =>
            p.partyId === partyId &&
            p.status === 'Submitted' &&
            p.paymentType === directType,
        )
        .map((p: any) => ({
          ...p,
          kind: 'direct' as const,
          remaining: Number(p.amount),
        }));

      const deposits = (depositRes.data.data ?? depositRes.data)
        .filter((d: any) => d.status === 'Submitted' && Number(d.remaining ?? 0) > 0)
        .map((d: any) => ({
          ...d,
          kind: 'deposit' as const,
          remaining: Number(d.remaining),
        }));

      return [...deposits, ...directs];
    },
    enabled: isOpen && isRefund && !!partyId,
  });

  const selectedSource = sourcePayments?.find((p: any) => p.id === refundSourcePaymentId);
  const isDepositRefund = selectedSource?.kind === 'deposit';

  // Open invoices for selected party (for display only — server auto-allocates)
  const { data: openInvoices } = useQuery({
    queryKey: ['open-invoices', partyId, paymentType],
    queryFn: async () => {
      if (isReceiveFlow) {
        const res = await api.get('/sales/invoices', { params: { partyId } });
        return (res.data.data ?? res.data).filter((inv: any) =>
          Number(inv.outstanding) > 0 && !['Cancelled', 'Paid'].includes(inv.status)
        );
      } else {
        const res = await api.get('/purchase/invoices', { params: { partyId } });
        return (res.data.data ?? res.data).filter((inv: any) =>
          Number(inv.outstanding) > 0 && !['Cancelled', 'Paid'].includes(inv.status)
        );
      }
    },
    enabled: isOpen && !!partyId,
  });

  const totalInvoiceOutstanding = openInvoices?.reduce((s: number, inv: any) => s + Number(inv.outstanding), 0) ?? 0;
  // Party-level outstanding (includes opening balances without invoices)
  const selectedParty = parties?.find((p: any) => p.id === partyId);
  const partyOutstanding = Number(selectedParty?.outstandingAmount ?? 0);
  const nonInvoiceOutstanding = Math.max(0, partyOutstanding - totalInvoiceOutstanding);

  const mutation = useMutation({
    mutationFn: (data: any) => {
      // Refund of a vendor/customer deposit goes through the dedicated
      // /vendor-deposits/:id/refund (or /customer-deposits/:id/refund) endpoint
      // — that's the canonical path that decrements depositBalance, posts the
      // bank/deposit JV, and tracks refundedAmount. /payments would create the
      // wrong journal for this flow.
      if (data.__depositRefund) {
        const path = data.__depositRefund.path;
        return api.post(path, {
          date: data.date,
          cashAmount: data.amount,
          offsetAmount: 0,
          cashAccountId: data.accountId,
          notes: data.notes,
        });
      }
      return api.post('/payments', data);
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-deposits'] });
      queryClient.invalidateQueries({ queryKey: ['customer-deposits'] });
      // Refresh 'Dari Pembayaran' section on any invoice detail drawer currently open.
      queryClient.invalidateQueries({ queryKey: ['invoice-related-attachments'] });
      // Deposit-refund response shape is { cashRefunded, applications, cashJournalId }
      // — no top-level id. Fall back to cashJournalId so the success state shows.
      // Attachment section is skipped for deposit refunds (no Payment row to
      // attach to) — guarded below.
      setSavedId(res.data?.id || res.data?.payment?.id || res.data?.cashJournalId || 'success');
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal menyimpan pembayaran.'),
  });

  const numAmount = Number(amount) || 0;

  // Split totals & validation
  const splitsTotal = splits.reduce((s, sp) => s + (Number(sp.amount) || 0), 0);
  const splitsRemaining = numAmount - splitsTotal;
  const splitsValid = splitMode
    ? splits.length > 0 &&
      splits.every((sp) => sp.accountId && Number(sp.amount) > 0) &&
      Math.abs(splitsRemaining) < 0.01
    : true;

  const canSubmit =
    partyId &&
    numAmount > 0 &&
    !mutation.isPending &&
    (splitMode ? splitsValid : !!accountId);

  const handleSubmit = () => {
    // Deposit refund path: send to /vendor-deposits/:id/refund or
    // /customer-deposits/:id/refund. The mutation reads __depositRefund
    // and rewrites the request body to the schema that endpoint expects.
    if (isRefund && isDepositRefund && selectedSource) {
      if (numAmount > selectedSource.remaining + 0.01) {
        setError(
          `Jumlah refund ${formatRupiah(numAmount)} melebihi sisa uang muka ${formatRupiah(selectedSource.remaining)}.`,
        );
        return;
      }
      const isVendor = paymentType === 'VendorRefund';
      mutation.mutate({
        date,
        amount: numAmount,
        accountId,
        notes: notes || null,
        __depositRefund: {
          path: isVendor
            ? `/vendor-deposits/${selectedSource.id}/refund`
            : `/customer-deposits/${selectedSource.id}/refund`,
        },
      });
      return;
    }

    const payload: any = {
      date,
      partyId,
      amount: numAmount,
      paymentType,
      // For split mode the server still requires accountId on the row;
      // use the first split's account as the "primary" cash reference.
      accountId: splitMode ? splits[0].accountId : accountId,
      referenceNo: referenceNo || null,
      notes: notes || null,
    };
    if (splitMode && !isRefund) {
      payload.splits = splits.map((sp) => ({
        accountId: sp.accountId,
        amount: Number(sp.amount),
        notes: sp.notes || null,
      }));
    }
    if (isRefund && refundSourcePaymentId) {
      payload.refundSourcePaymentId = refundSourcePaymentId;
    }
    mutation.mutate(payload);
  };

  const updateSplit = (idx: number, patch: Partial<{ accountId: string; amount: number | ''; notes: string }>) => {
    setSplits((prev) => prev.map((sp, i) => (i === idx ? { ...sp, ...patch } : sp)));
  };
  const addSplit = () => {
    // Auto-fill remaining as default amount for new row
    setSplits((prev) => [
      ...prev,
      { accountId: '', amount: splitsRemaining > 0 ? Number(splitsRemaining.toFixed(2)) : '', notes: '' },
    ]);
  };
  const removeSplit = (idx: number) => {
    setSplits((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  const isReceive = paymentType === 'Receive';
  const isVendorRefund = paymentType === 'VendorRefund';

  const typeLabel = isRefund
    ? (isVendorRefund ? 'Refund dari Vendor' : 'Refund ke Pelanggan')
    : (isReceive ? 'Terima Pembayaran' : 'Bayar Hutang');

  const accountOptions = (list?: any[]) =>
    (list ?? []).map((a: any) => ({ value: String(a.id), label: `${a.accountNumber} · ${a.name}` }));

  const typeButtons: Array<{ t: PaymentType; label: string; icon: React.ReactNode }> = [
    { t: 'Receive', label: 'Penerimaan', icon: <TrendingDown aria-hidden /> },
    { t: 'Pay', label: 'Pengeluaran', icon: <TrendingUp aria-hidden /> },
    { t: 'CustomerRefund', label: 'Refund ke Pelanggan', icon: <RotateCcw aria-hidden /> },
    { t: 'VendorRefund', label: 'Refund dari Vendor', icon: <RotateCcw aria-hidden /> },
  ];

  return (
    <FormDialog
      open={isOpen}
      onClose={onClose}
      title={typeLabel}
      description="Draft • belum disimpan"
      size="lg"
      className="sm:max-w-xl"
      busy={mutation.isPending}
      submitLabel="Simpan"
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
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-foreground">Tipe Transaksi</legend>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {typeButtons.map(({ t, label, icon }) => (
            <Button
              key={t}
              type="button"
              variant={paymentType === t ? 'primary' : 'outline'}
              aria-pressed={paymentType === t}
              className="h-11 sm:h-9"
              onClick={() => {
                setPaymentType(t);
                setPartyId('');
                setRefundSourcePaymentId('');
                if (t === 'VendorRefund' || t === 'CustomerRefund') setSplitMode(false);
              }}
            >
              {icon} {label}
            </Button>
          ))}
        </div>
      </fieldset>

      {isRefund && partyId && (
        <Field
          label={`Pembayaran Asal ${isDepositRefund ? '(Uang Muka)' : '(opsional)'}`}
          hint={
            isDepositRefund ? (
              <>
                Refund uang muka: sistem panggil endpoint <code>/{isVendorRefund ? 'vendor' : 'customer'}-deposits/refund</code>.
                Sisa uang muka: <span className="font-semibold">{formatRupiah(selectedSource?.remaining ?? 0)}</span>.
                Saldo deposit otomatis turun, jurnal: DR Bank / CR Uang Muka.
              </>
            ) : (
              <>
                Pilih pembayaran {isVendorRefund ? 'Pay' : 'Receive'} yang sebagian dikembalikan, ATAU baris UANG MUKA untuk refund DP.
                Sistem otomatis kurangi alokasi & restore outstanding faktur.
              </>
            )
          }
        >
          <OptionPicker
            value={refundSourcePaymentId}
            onChange={setRefundSourcePaymentId}
            placeholder="Tanpa link (generic refund)"
            emptyLabel="Tanpa link (generic refund)"
            searchable={false}
            options={(sourcePayments ?? []).map((p: any) => ({
              value: p.id,
              label: `${p.kind === 'deposit' ? 'UANG MUKA · ' : ''}${p.paymentNumber} • ${formatDate(p.date)}${
                p.kind === 'deposit' ? ` • sisa ${formatRupiah(p.remaining)}` : ` • ${formatRupiah(Number(p.amount))}`
              }`,
            }))}
          />
        </Field>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Tanggal">
          <DateInput value={date} onChange={setDate} />
        </Field>
        <Field label={isReceiveFlow ? 'Pelanggan' : 'Supplier'}>
          <OptionPicker
            value={partyId}
            onChange={setPartyId}
            placeholder="Pilih"
            options={(parties ?? []).map((p: any) => ({ value: p.id, label: p.name }))}
          />
        </Field>
      </div>

      {partyId && openInvoices && (
        <div className="space-y-2">
          {openInvoices.length > 0 && (
            <Callout tone="info" icon={<span className="sr-only">Info:</span>}>
              <p className="mb-2 font-medium">
                {openInvoices.length} invoice terbuka, total <span className="num">{formatRupiah(totalInvoiceOutstanding)}</span>
              </p>
              <div
                role="region"
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
                aria-label="Daftar invoice terbuka"
                className="max-h-28 space-y-1 overflow-y-auto text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {openInvoices.map((inv: any) => (
                  <div key={inv.id} className="flex justify-between gap-2">
                    <span>
                      {inv.invoiceNumber} ({formatDate(inv.date)})
                    </span>
                    <span className="num shrink-0">{formatRupiah(Number(inv.outstanding))}</span>
                  </div>
                ))}
              </div>
            </Callout>
          )}

          {nonInvoiceOutstanding > 0 && (
            <Callout tone="warning" icon={<span className="sr-only">Perhatian:</span>}>
              Saldo {isReceive ? 'piutang' : 'hutang'} tanpa invoice (saldo awal): <span className="num">{formatRupiah(nonInvoiceOutstanding)}</span>
            </Callout>
          )}

          {partyOutstanding > 0 && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="min-h-11 sm:min-h-0"
              onClick={() => setAmount(partyOutstanding)}
            >
              Isi jumlah lunaskan semua ({formatRupiah(partyOutstanding)})
            </Button>
          )}

          {partyOutstanding <= 0 && openInvoices.length === 0 && (
            <Callout tone="neutral" icon={<span className="sr-only">Info:</span>}>
              Tidak ada {isReceive ? 'piutang' : 'hutang'} untuk {isReceive ? 'pelanggan' : 'supplier'} ini.
            </Callout>
          )}
        </div>
      )}

      <Field label="Jumlah Tagihan (Rp)">
        <NumberInput
          value={amount}
          onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder="0"
          min={0}
          inputMode="decimal"
          className="h-10 text-right md:h-9"
        />
      </Field>

      {!isRefund && (
        // eslint-disable-next-line jsx-a11y/label-has-associated-control -- wraps a Checkbox (button role)
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground sm:min-h-0">
          <Checkbox checked={splitMode} onCheckedChange={(v) => setSplitMode(v === true)} />
          Split ke beberapa akun (mis. dipotong komisi)
        </label>
      )}

      {!splitMode ? (
        <Field label="Akun Kas/Bank">
          <OptionPicker
            value={accountId}
            onChange={setAccountId}
            placeholder="Pilih Akun"
            options={accountOptions(cashAccounts)}
          />
        </Field>
      ) : (
        <section aria-label="Distribusi akun" className="space-y-3 rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">
            Total {numAmount > 0 ? formatRupiah(numAmount) : '0'} dibagi ke beberapa akun. Selisih harus 0.
          </p>
          {splits.map((sp, idx) => {
            const n = idx + 1;
            return (
              <div
                key={idx}
                role="group"
                aria-label={`Baris split ${n}`}
                className="grid grid-cols-1 items-start gap-2 rounded-md border border-border p-2 sm:grid-cols-12 sm:border-0 sm:p-0"
              >
                <div className="sm:col-span-5">
                  <OptionPicker
                    aria-label={`Akun baris split ${n}`}
                    value={sp.accountId}
                    onChange={(v) => updateSplit(idx, { accountId: v })}
                    placeholder="Pilih Akun"
                    options={accountOptions(allAccounts)}
                  />
                </div>
                <div className="sm:col-span-3">
                  <NumberInput
                    aria-label={`Jumlah baris split ${n}`}
                    value={sp.amount}
                    onChange={(e) => updateSplit(idx, { amount: e.target.value === '' ? '' : Number(e.target.value) })}
                    placeholder="0"
                    min={0}
                    inputMode="decimal"
                    className="num h-10 text-right md:h-9"
                  />
                </div>
                <div className="sm:col-span-3">
                  <Input
                    aria-label={`Catatan baris split ${n}`}
                    value={sp.notes}
                    onChange={(e) => updateSplit(idx, { notes: e.target.value })}
                    placeholder="catatan"
                  />
                </div>
                <div className="sm:col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-touch"
                    className="w-full text-danger-text sm:size-9"
                    onClick={() => removeSplit(idx)}
                    disabled={splits.length === 1}
                    aria-label={`Hapus baris split ${n}`}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>
            );
          })}
          <Button type="button" variant="ghost" size="sm" className="h-11 sm:h-8" onClick={addSplit}>
            <Plus aria-hidden /> Tambah baris
          </Button>
          <div className="flex justify-between border-t border-border pt-2 text-sm">
            <span className="text-muted-foreground">Total split:</span>
            <span className="num font-semibold">{formatRupiah(splitsTotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Selisih:</span>
            <span
              className={cn('num font-semibold', Math.abs(splitsRemaining) < 0.01 ? 'text-success-text' : 'text-danger-text')}
            >
              {formatRupiah(splitsRemaining)}
            </span>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="No. Referensi">
          <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="No. cek, transfer, dll." />
        </Field>
        <Field label="Catatan">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Keterangan opsional..." />
        </Field>
      </div>

      {numAmount > 0 && (
        <Callout tone={isReceive ? 'success' : 'warning'} icon={<span className="sr-only">Ringkasan:</span>}>
          {isReceive ? 'Menerima' : 'Membayar'}{' '}
          <span className="num text-base font-bold">{formatRupiah(numAmount)}</span>
          {partyOutstanding > 0 && numAmount >= partyOutstanding && ' · Melunasi semua tagihan'}
        </Callout>
      )}

      <ErrorAlert message={error} />

      {/* Attachment section is skipped for deposit refunds (response is a journal, not a Payment). */}
      {savedId && !isDepositRefund && (
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
      {savedId && isDepositRefund && (
        <div className="flex items-center gap-2 border-t border-border pt-3" role="status">
          <CheckCircle2 className="size-4 text-success-text" aria-hidden />
          <span className="text-xs font-semibold text-success-text">
            Refund uang muka tersimpan. Saldo deposit vendor sudah berkurang.
          </span>
        </div>
      )}
    </FormDialog>
  );
};

export default PaymentModal;
