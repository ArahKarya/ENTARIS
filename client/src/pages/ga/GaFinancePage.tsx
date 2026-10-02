// Tagihan GA — antrian tagihan dari EAM (pajak/STNK/KIR, service kendaraan,
// permintaan sparepart) yang menunggu diposting ke pembukuan oleh Akuntan.
//
// HRGA yang mengajukan & menyetujui kebutuhan di modul EAM; halaman ini murni
// sisi keuangan: pilih COA, tentukan cara bayar (jurnal langsung / faktur
// pembelian ke vendor), lalu posting. Tidak ada perubahan data aset di sini.

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Receipt, Wrench, PackageSearch, Loader2, X, CheckCircle2,
  AlertCircle, FileText, Search, XCircle, Wallet,
} from 'lucide-react';
import api from '../../lib/api';
import { formatRupiah, formatDate } from '../../lib/formatters';
import { cn } from '../../lib/utils';
import SearchableSelect from '../../components/SearchableSelect';
import type { SelectOption } from '../../components/SearchableSelect';
import TableRowSkeleton from '../../components/TableRowSkeleton';
import { ConfirmDialog } from '../../components/ConfirmDialog';

type BillKind = 'VEHICLE_TAX' | 'SERVICE_LOG' | 'MATERIAL_REQUEST';

interface LinkedDoc {
  id: string;
  entryNumber?: string;
  invoiceNumber?: string;
  status: string;
  outstanding?: number;
}

interface Bill {
  kind: BillKind;
  id: string;
  ref: string;
  date: string | null;
  assetCode: string | null;
  assetName: string | null;
  description: string;
  amount: number;
  status: string;
  defaultAccountNumber: string;
  journalEntry: LinkedDoc | null;
  purchaseInvoice: LinkedDoc | null;
  notes?: string | null;
  items?: { itemName: string; quantity: number; uom: string; unitPrice: number }[];
}

const KIND_META: Record<BillKind, { label: string; icon: typeof Receipt; color: string }> = {
  VEHICLE_TAX: { label: 'Pajak / STNK / KIR', icon: Receipt, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  SERVICE_LOG: { label: 'Service Kendaraan', icon: Wrench, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  MATERIAL_REQUEST: { label: 'Permintaan Sparepart', icon: PackageSearch, color: 'text-violet-600 bg-violet-50 border-violet-200' },
};

const TABS: { key: 'ALL' | BillKind; label: string }[] = [
  { key: 'ALL', label: 'Semua' },
  { key: 'VEHICLE_TAX', label: 'Pajak / STNK / KIR' },
  { key: 'SERVICE_LOG', label: 'Service Kendaraan' },
  { key: 'MATERIAL_REQUEST', label: 'Sparepart (MR)' },
];

export const GaFinancePage = () => {
  const [tab, setTab] = useState<'ALL' | BillKind>('ALL');
  const [search, setSearch] = useState('');
  const [showPaid, setShowPaid] = useState(false);
  const [payTarget, setPayTarget] = useState<Bill | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Bill | null>(null);

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['ga-finance-bills', tab, showPaid],
    queryFn: async () => {
      const res = await api.get('/ga/finance/bills', { params: { kind: tab, includePaid: showPaid } });
      return res.data as { bills: Bill[]; summary: { pendingCount: number; pendingAmount: number } };
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (b: Bill) => api.post(`/ga/finance/${b.kind}/${b.id}/cancel`),
    onSuccess: () => {
      toast.success('Posting tagihan dibatalkan.');
      queryClient.invalidateQueries({ queryKey: ['ga-finance-bills'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      setCancelTarget(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal membatalkan posting.'),
  });

  const bills = useMemo(() => {
    const list = data?.bills ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (b) =>
        b.description.toLowerCase().includes(q) ||
        (b.assetName ?? '').toLowerCase().includes(q) ||
        (b.assetCode ?? '').toLowerCase().includes(q) ||
        b.ref.toLowerCase().includes(q),
    );
  }, [data, search]);

  const summary = data?.summary;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tagihan GA</h1>
          <p className="text-sm text-gray-500 mt-1">
            Antrian biaya dari modul EAM (pajak kendaraan, service, sparepart) yang menunggu
            diposting ke pembukuan. Pengajuan &amp; persetujuan dilakukan HRGA di EAM.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 min-w-[150px]">
            <div className="text-xs text-gray-500">Belum diposting</div>
            <div className="text-lg font-bold text-gray-900">{summary?.pendingCount ?? 0} tagihan</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 min-w-[180px]">
            <div className="text-xs text-gray-500">Nilai belum diposting</div>
            <div className="text-lg font-bold text-amber-600">{formatRupiah(summary?.pendingAmount ?? 0)}</div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-800',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kendaraan, deskripsi, nomor…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} className="rounded" />
          Tampilkan yang sudah diposting
        </label>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-left text-xs uppercase text-gray-500">
              <th className="px-4 py-3">Jenis</th>
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3">Aset</th>
              <th className="px-4 py-3">Keterangan</th>
              <th className="px-4 py-3 text-right">Nilai</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <TableRowSkeleton rows={5} columns={7} />
            ) : bills.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                  Tidak ada tagihan GA yang menunggu diposting.
                </td>
              </tr>
            ) : (
              bills.map((b) => {
                const meta = KIND_META[b.kind];
                const Icon = meta.icon;
                const posted = !!b.journalEntry || !!b.purchaseInvoice;
                return (
                  <tr key={`${b.kind}-${b.id}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium', meta.color)}>
                        <Icon className="w-3.5 h-3.5" />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{b.date ? formatDate(b.date) : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{b.assetName ?? '—'}</div>
                      <div className="text-xs text-gray-500">{b.assetCode ?? ''}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[320px]">
                      <div className="truncate" title={b.description}>{b.description}</div>
                      {b.items && b.items.length > 0 && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          {b.items.slice(0, 2).map((i) => `${i.itemName} ×${i.quantity}`).join(', ')}
                          {b.items.length > 2 ? ` +${b.items.length - 2} lain` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                      {formatRupiah(b.amount)}
                    </td>
                    <td className="px-4 py-3">
                      {posted ? (
                        <div className="space-y-0.5">
                          {b.journalEntry && (
                            <span className="inline-flex items-center gap-1 text-xs text-green-700">
                              <CheckCircle2 className="w-3.5 h-3.5" /> {b.journalEntry.entryNumber}
                            </span>
                          )}
                          {b.purchaseInvoice && (
                            <span className="inline-flex items-center gap-1 text-xs text-indigo-700">
                              <FileText className="w-3.5 h-3.5" /> {b.purchaseInvoice.invoiceNumber}
                              {b.purchaseInvoice.outstanding !== undefined && Number(b.purchaseInvoice.outstanding) > 0 && (
                                <span className="text-gray-500">
                                  (sisa {formatRupiah(Number(b.purchaseInvoice.outstanding))})
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                          <AlertCircle className="w-3.5 h-3.5" /> Menunggu posting
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {posted ? (
                        <button
                          onClick={() => setCancelTarget(b)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Batalkan
                        </button>
                      ) : (
                        <button
                          onClick={() => setPayTarget(b)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                        >
                          <Wallet className="w-3.5 h-3.5" /> Bayar / Posting
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {payTarget && (
        <GaBillPayModal
          bill={payTarget}
          onClose={() => setPayTarget(null)}
          onSuccess={() => {
            setPayTarget(null);
            queryClient.invalidateQueries({ queryKey: ['ga-finance-bills'] });
            queryClient.invalidateQueries({ queryKey: ['coa'] });
            queryClient.invalidateQueries({ queryKey: ['payments'] });
          }}
        />
      )}

      <ConfirmDialog
        open={!!cancelTarget}
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && cancelMutation.mutate(cancelTarget)}
        title="Batalkan posting tagihan?"
        message={
          cancelTarget
            ? `Jurnal/faktur untuk "${cancelTarget.description}" akan dibatalkan dan tagihan kembali ke antrian. Faktur yang sudah dibayar sebagian tidak bisa dibatalkan.`
            : ''
        }
        confirmLabel="Ya, batalkan"
        variant="danger"
      />
    </div>
  );
};

// ─── Modal bayar ─────────────────────────────────────────────────────

const GaBillPayModal = ({
  bill, onClose, onSuccess,
}: { bill: Bill; onClose: () => void; onSuccess: () => void }) => {
  const today = new Date().toISOString().split('T')[0];
  const [method, setMethod] = useState<'JOURNAL' | 'PURCHASE_INVOICE'>('JOURNAL');
  const [accountId, setAccountId] = useState('');
  const [creditAccountId, setCreditAccountId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState<number | ''>(bill.amount || '');
  const [date, setDate] = useState(bill.date ? String(bill.date).split('T')[0] : today);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const { data: accounts } = useQuery({
    queryKey: ['all-accounts-flat'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((a: any) => !a.isGroup);
    },
  });

  const { data: vendors } = useQuery({
    queryKey: ['parties-supplier'],
    queryFn: async () => {
      const res = await api.get('/parties', { params: { partyType: 'Supplier', limit: 500 } });
      return (res.data.data ?? res.data) as any[];
    },
    enabled: method === 'PURCHASE_INVOICE',
  });

  // Preselect akun beban sesuai jenis tagihan.
  useMemo(() => {
    if (!accounts || accountId) return;
    const def = accounts.find((a: any) => a.accountNumber === bill.defaultAccountNumber);
    if (def) setAccountId(def.id);
  }, [accounts]);

  const expenseOptions: SelectOption[] = useMemo(
    () =>
      (accounts ?? [])
        .filter((a: any) => a.accountType === 'EXPENSE' || a.accountNumber.startsWith('1.3'))
        .map((a: any) => ({ value: a.id, label: `${a.accountNumber} — ${a.name}` })),
    [accounts],
  );

  const cashOptions: SelectOption[] = useMemo(
    () =>
      (accounts ?? [])
        .filter((a: any) => a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1'))
        .map((a: any) => ({ value: a.id, label: `${a.accountNumber} — ${a.name}` })),
    [accounts],
  );

  const vendorOptions: SelectOption[] = useMemo(
    () => (vendors ?? []).map((v: any) => ({ value: v.id, label: v.name })),
    [vendors],
  );

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/ga/finance/${bill.kind}/${bill.id}/pay`, {
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
      toast.success(method === 'JOURNAL' ? 'Jurnal berhasil diposting.' : 'Faktur pembelian dibuat.');
      onSuccess();
    },
    onError: (e: any) => setError(e.response?.data?.error || 'Gagal memposting tagihan.'),
  });

  const submit = () => {
    setError('');
    if (!accountId) return setError('Pilih akun beban (debit) terlebih dahulu.');
    if (method === 'JOURNAL' && !creditAccountId) return setError('Pilih akun kas/bank sumber pembayaran.');
    if (method === 'PURCHASE_INVOICE' && !partyId) return setError('Pilih vendor penagih.');
    if (!amount || Number(amount) <= 0) return setError('Nilai tagihan harus lebih dari 0.');
    mutation.mutate();
  };

  const meta = KIND_META[bill.kind];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Bayar Tagihan GA</h2>
            <p className="text-xs text-gray-500 mt-0.5">{meta.label} · {bill.assetName ?? '—'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
            <div className="text-sm font-medium text-gray-900">{bill.description}</div>
            <div className="text-xs text-gray-500 mt-1">
              Nilai pengajuan: <span className="font-semibold text-gray-700">{formatRupiah(bill.amount)}</span>
              {bill.notes ? ` · ${bill.notes}` : ''}
            </div>
            {bill.items && bill.items.length > 0 && (
              <ul className="mt-2 text-xs text-gray-600 space-y-0.5">
                {bill.items.map((i, idx) => (
                  <li key={idx} className="flex justify-between gap-4">
                    <span>{i.itemName} ({i.quantity} {i.uom})</span>
                    <span>{formatRupiah(i.unitPrice * i.quantity)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Cara Bayar</label>
            <div className="grid grid-cols-2 gap-3">
              {([
                { v: 'JOURNAL', t: 'Jurnal Langsung', d: 'Lunas seketika dari kas/bank' },
                { v: 'PURCHASE_INVOICE', t: 'Faktur Pembelian', d: 'Ditagih vendor, masuk hutang usaha' },
              ] as const).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setMethod(o.v)}
                  className={cn(
                    'text-left px-3 py-2.5 rounded-lg border transition-colors',
                    method === o.v ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400',
                  )}
                >
                  <div className="text-sm font-semibold text-gray-900">{o.t}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{o.d}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Tanggal</label>
              <input
                type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nilai (Rp)</label>
              <input
                type="number" value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Akun Beban (Debit) <span className="text-red-500">*</span>
            </label>
            <SearchableSelect
              options={expenseOptions} value={accountId} onChange={setAccountId}
              placeholder="Pilih akun beban…"
            />
          </div>

          {method === 'JOURNAL' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Sumber Dana / Kas-Bank (Kredit) <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                options={cashOptions} value={creditAccountId} onChange={setCreditAccountId}
                placeholder="Pilih kas/bank…"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Vendor <span className="text-red-500">*</span>
                </label>
                <SearchableSelect
                  options={vendorOptions} value={partyId} onChange={setPartyId}
                  placeholder="Pilih vendor…"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Jatuh Tempo</label>
                <input
                  type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Catatan</label>
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="Opsional…"
            />
          </div>

          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-900">
            <div className="font-semibold mb-1">Pratinjau jurnal</div>
            <div>DR {expenseOptions.find((o) => o.value === accountId)?.label ?? '(pilih akun beban)'} — {formatRupiah(Number(amount) || 0)}</div>
            <div>
              CR{' '}
              {method === 'JOURNAL'
                ? cashOptions.find((o) => o.value === creditAccountId)?.label ?? '(pilih kas/bank)'
                : '2.1.1 — Hutang Usaha'}{' '}
              — {formatRupiah(Number(amount) || 0)}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">
            Batal
          </button>
          <button
            onClick={submit} disabled={mutation.isPending}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg"
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {method === 'JOURNAL' ? 'Posting Jurnal' : 'Buat Faktur'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GaFinancePage;
