import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Loader2, AlertCircle, TrendingDown, TrendingUp, CheckCircle2, Paperclip, Plus, Trash2, RotateCcw } from 'lucide-react';
import { formatRupiah, formatDate } from '../lib/formatters';
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
      setDate(today);
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

  // Source payment list — only for Refund types. Shows prior Pay/Receive to same party.
  const { data: sourcePayments } = useQuery({
    queryKey: ['payments-source-for-refund', partyId, paymentType],
    queryFn: async () => {
      const expectedType = paymentType === 'VendorRefund' ? 'Pay' : 'Receive';
      const res = await api.get('/payments', { params: { limit: 200 } });
      const all: any[] = res.data.data ?? res.data;
      return all.filter(
        (p: any) =>
          p.partyId === partyId &&
          p.status === 'Submitted' &&
          p.paymentType === expectedType,
      );
    },
    enabled: isOpen && isRefund && !!partyId,
  });

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
    mutationFn: (data: any) => api.post('/payments', data),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      // Refresh 'Dari Pembayaran' section on any invoice detail drawer currently open.
      queryClient.invalidateQueries({ queryKey: ['invoice-related-attachments'] });
      setSavedId(res.data?.id || res.data?.payment?.id);
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

  if (!isOpen) return null;

  const isReceive = paymentType === 'Receive';
  const isVendorRefund = paymentType === 'VendorRefund';

  const typeLabel = isRefund
    ? (isVendorRefund ? 'Refund dari Vendor' : 'Refund ke Pelanggan')
    : (isReceive ? 'Terima Pembayaran' : 'Bayar Hutang');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Escape' && onClose()}
    >
      <div className="rounded-xl w-full max-w-[calc(100vw-1rem)] sm:max-w-lg shadow-2xl flex flex-col max-h-[95vh] overflow-hidden" style={{ backgroundColor: 'var(--color-bg-primary)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isRefund ? 'bg-purple-50' : isReceive ? 'bg-green-50' : 'bg-orange-50'}`}>
              {isRefund
                ? <RotateCcw size={16} className="text-purple-600" />
                : isReceive
                  ? <TrendingDown size={16} className="text-green-600" />
                  : <TrendingUp size={16} className="text-orange-500" />}
            </div>
            <div>
              <h2 id="payment-modal-title" className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {typeLabel}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Draft • belum disimpan</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Payment Type Toggle */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Tipe Transaksi</label>
            <div className="grid grid-cols-2 gap-1.5">
              {([
                { t: 'Receive' as PaymentType, label: 'Penerimaan', icon: <TrendingDown size={14} />, activeCls: 'bg-green-600 text-white' },
                { t: 'Pay' as PaymentType, label: 'Pengeluaran', icon: <TrendingUp size={14} />, activeCls: 'bg-orange-500 text-white' },
                { t: 'CustomerRefund' as PaymentType, label: 'Refund ke Pelanggan', icon: <RotateCcw size={14} />, activeCls: 'bg-purple-600 text-white' },
                { t: 'VendorRefund' as PaymentType, label: 'Refund dari Vendor', icon: <RotateCcw size={14} />, activeCls: 'bg-purple-600 text-white' },
              ]).map(({ t, label, icon, activeCls }) => (
                <button
                  key={t}
                  onClick={() => {
                    setPaymentType(t);
                    setPartyId('');
                    setRefundSourcePaymentId('');
                    if (t === 'VendorRefund' || t === 'CustomerRefund') setSplitMode(false);
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-lg border transition-colors ${
                    paymentType === t
                      ? `${activeCls} border-transparent`
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>

          {/* Refund Source Payment Picker */}
          {isRefund && partyId && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                Pembayaran Asal (opsional)
              </label>
              <select
                value={refundSourcePaymentId}
                onChange={e => setRefundSourcePaymentId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">— Tanpa link (generic refund) —</option>
                {(sourcePayments ?? []).map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.paymentNumber} • {formatDate(p.date)} • {formatRupiah(Number(p.amount))}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                Pilih pembayaran {isVendorRefund ? 'Pay' : 'Receive'} yang sebagian dikembalikan.
                Sistem otomatis kurangi alokasinya dan restore outstanding faktur terkait.
              </p>
            </div>
          )}

          {/* Date & Party */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Tanggal</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                {isReceive ? 'Pelanggan' : 'Supplier'}
              </label>
              <select
                value={partyId}
                onChange={e => setPartyId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Pilih —</option>
                {parties?.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Outstanding info */}
          {partyId && openInvoices && (
            <div className="space-y-2">
              {/* Open invoices */}
              {openInvoices.length > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                  <p className="text-xs font-medium text-blue-700 mb-2">
                    {openInvoices.length} invoice terbuka — total {formatRupiah(totalInvoiceOutstanding)}
                  </p>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {openInvoices.map((inv: any) => (
                      <div key={inv.id} className="flex justify-between text-xs text-blue-600">
                        <span>{inv.invoiceNumber} ({formatDate(inv.date)})</span>
                        <span className="font-mono tabular-nums">{formatRupiah(Number(inv.outstanding))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Non-invoice outstanding (e.g. opening balance) */}
              {nonInvoiceOutstanding > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                  <p className="text-xs font-medium text-amber-700">
                    Saldo {isReceive ? 'piutang' : 'hutang'} tanpa invoice (saldo awal): {formatRupiah(nonInvoiceOutstanding)}
                  </p>
                </div>
              )}

              {/* Total outstanding with fill button */}
              {partyOutstanding > 0 && (
                <button
                  onClick={() => setAmount(partyOutstanding)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium underline underline-offset-2"
                >
                  Isi jumlah lunaskan semua ({formatRupiah(partyOutstanding)})
                </button>
              )}

              {/* No outstanding at all */}
              {partyOutstanding <= 0 && openInvoices.length === 0 && (
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs text-gray-500">
                  Tidak ada {isReceive ? 'piutang' : 'hutang'} untuk {isReceive ? 'pelanggan' : 'supplier'} ini.
                </div>
              )}
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Jumlah Tagihan (Rp)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="0"
              min={0}
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          {/* Split toggle — disabled for refund */}
          {!isRefund && (
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest">Distribusi Akun</label>
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={splitMode}
                  onChange={(e) => setSplitMode(e.target.checked)}
                  className="rounded"
                />
                Split ke beberapa akun (mis. dipotong komisi)
              </label>
            </div>
          )}

          {!splitMode ? (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Akun Kas/Bank</label>
              <select
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Pilih Akun —</option>
                {cashAccounts?.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.accountNumber} — {a.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-2 border border-gray-200 rounded-lg p-3">
              <p className="text-xs text-gray-500">
                Total {numAmount > 0 ? formatRupiah(numAmount) : '0'} dibagi ke beberapa akun. Selisih harus 0.
              </p>
              {splits.map((sp, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                  <select
                    value={sp.accountId}
                    onChange={(e) => updateSplit(idx, { accountId: e.target.value })}
                    className="col-span-6 border border-gray-200 rounded-md py-1.5 px-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Pilih Akun —</option>
                    {allAccounts?.map((a: any) => (
                      <option key={a.id} value={a.id}>{a.accountNumber} — {a.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={sp.amount}
                    onChange={(e) => updateSplit(idx, { amount: e.target.value === '' ? '' : Number(e.target.value) })}
                    placeholder="0"
                    min={0}
                    className="col-span-3 border border-gray-200 rounded-md py-1.5 px-2 text-xs text-gray-900 font-mono text-right focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <input
                    type="text"
                    value={sp.notes}
                    onChange={(e) => updateSplit(idx, { notes: e.target.value })}
                    placeholder="catatan"
                    className="col-span-2 border border-gray-200 rounded-md py-1.5 px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeSplit(idx)}
                    disabled={splits.length === 1}
                    className="col-span-1 p-1.5 text-red-500 hover:bg-red-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Hapus baris"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addSplit}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <Plus size={12} /> Tambah baris
              </button>
              <div className="flex justify-between pt-2 border-t border-gray-100 text-xs">
                <span className="text-gray-500">Total split:</span>
                <span className="font-mono font-semibold">{formatRupiah(splitsTotal)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Selisih:</span>
                <span
                  className={`font-mono font-semibold ${Math.abs(splitsRemaining) < 0.01 ? 'text-green-600' : 'text-red-600'}`}
                >
                  {formatRupiah(splitsRemaining)}
                </span>
              </div>
            </div>
          )}

          {/* Reference & Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">No. Referensi</label>
              <input
                type="text"
                value={referenceNo}
                onChange={e => setReferenceNo(e.target.value)}
                placeholder="No. cek, transfer, dll."
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Catatan</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Keterangan opsional..."
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Amount preview */}
          {numAmount > 0 && (
            <div className={`rounded-lg p-3 border ${isReceive ? 'bg-green-50 border-green-100' : 'bg-orange-50 border-orange-100'}`}>
              <p className={`text-xs font-medium ${isReceive ? 'text-green-700' : 'text-orange-700'}`}>
                {isReceive ? 'Menerima' : 'Membayar'}{' '}
                <span className="text-base font-bold font-mono tabular-nums">{formatRupiah(numAmount)}</span>
                {partyOutstanding > 0 && numAmount >= partyOutstanding && ' · Melunasi semua tagihan'}
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={15} /> <span>{error}</span>
            </div>
          )}

          {/* Attachment section — shown after save */}
          {savedId && (
            <div className="space-y-3 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-green-500" />
                <span className="text-xs font-semibold text-green-600">Tersimpan</span>
                <span className="text-xs ml-auto flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                  <Paperclip size={10} /> Lampiran Bukti Transfer
                </span>
              </div>
              <AttachmentPreview referenceType="payment" referenceId={savedId} />
              <AttachmentUpload referenceType="payment" referenceId={savedId} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-3" style={{ borderColor: 'var(--color-border)' }}>
          {savedId ? (
            <button onClick={onClose} className="btn-primary">Selesai</button>
          ) : (
            <>
              <button onClick={onClose} className="btn-secondary">Batal</button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`btn-primary disabled:opacity-40 disabled:cursor-not-allowed ${!isReceive ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
              >
                {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : 'Simpan'}
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
};

export default PaymentModal;
