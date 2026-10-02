import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { formatRupiah, formatDate } from '../lib/formatters';
import Select from './Select';

interface Props {
  open: boolean;
  onClose: () => void;
  prefillInvoiceId?: string | null;
}

interface EligibleLine {
  salesInvoiceItemId: string;
  itemName: string;
  isInventory: boolean;
  warehouseName: string | null;
  unit: string;
  rate: number;
  discount: number;
  taxPct: number;
  quantity: number;
  alreadyReturned: number;
  remaining: number;
}

interface LineState {
  qty: string;
  restock: boolean;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function SalesReturnModal({ open, onClose, prefillInvoiceId }: Props) {
  const queryClient = useQueryClient();
  const [invoiceId, setInvoiceId] = useState<string>('');
  const [date, setDate] = useState(todayStr());
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Record<string, LineState>>({});

  useEffect(() => {
    if (open) {
      setInvoiceId(prefillInvoiceId || '');
      setDate(todayStr());
      setReason('');
      setLines({});
    }
  }, [open, prefillInvoiceId]);

  // Daftar invoice yang bisa diretur (Submitted/PartiallyPaid/Paid/Overdue).
  const { data: invoiceList } = useQuery({
    queryKey: ['sales-invoices', 'for-return'],
    queryFn: async () => {
      const r = await api.get('/sales/invoices?limit=500');
      return (r.data?.data ?? []) as any[];
    },
    enabled: open,
  });
  const returnableInvoices = useMemo(
    () => (invoiceList ?? []).filter((i) => ['Submitted', 'PartiallyPaid', 'Paid', 'Overdue'].includes(i.status)),
    [invoiceList],
  );

  const { data: eligible, isLoading: eligibleLoading } = useQuery({
    queryKey: ['sales-return-eligible', invoiceId],
    queryFn: async () => {
      const r = await api.get(`/sales-returns/eligible/${invoiceId}`);
      return r.data as { invoice: any; lines: EligibleLine[] };
    },
    enabled: open && !!invoiceId,
  });

  const setLine = (id: string, patch: Partial<LineState>) =>
    setLines((prev) => {
      const cur = prev[id] ?? { qty: '', restock: true };
      return { ...prev, [id]: { ...cur, ...patch } };
    });

  // Ringkasan nilai retur (mengikuti perhitungan server: qty*rate*(1-disc) + pajak).
  const summary = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const ln of eligible?.lines ?? []) {
      const st = lines[ln.salesInvoiceItemId];
      const qty = Number(st?.qty ?? 0);
      if (!qty) continue;
      const amount = qty * ln.rate * (1 - ln.discount / 100);
      subtotal += amount;
      tax += amount * (ln.taxPct / 100);
    }
    const total = subtotal + tax;
    const outstanding = Number(eligible?.invoice?.outstanding ?? 0);
    const arReduce = Math.min(total, outstanding);
    const credit = total - arReduce;
    return { subtotal, tax, total, arReduce, credit };
  }, [lines, eligible]);

  const mutation = useMutation({
    mutationFn: async () => {
      const items = (eligible?.lines ?? [])
        .map((ln) => {
          const st = lines[ln.salesInvoiceItemId];
          const qty = Number(st?.qty ?? 0);
          if (!qty) return null;
          return {
            salesInvoiceItemId: ln.salesInvoiceItemId,
            quantity: qty,
            restock: ln.isInventory ? st?.restock !== false : false,
          };
        })
        .filter(Boolean);
      if (items.length === 0) throw new Error('Pilih minimal satu baris dengan qty > 0.');
      const r = await api.post('/sales-returns', { salesInvoiceId: invoiceId, date, reason: reason || null, items });
      return r.data;
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['sales-returns'] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      if (res?.pendingApproval) toast.success('Retur diajukan, menunggu persetujuan manajer.');
      else toast.success('Retur penjualan berhasil dibuat.');
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Gagal membuat retur.');
    },
  });

  if (!open) return null;

  const hasInvalidQty = (eligible?.lines ?? []).some((ln) => {
    const qty = Number(lines[ln.salesInvoiceItemId]?.qty ?? 0);
    return qty > ln.remaining + 1e-9;
  });

  // Retur boleh disimpan kalau ada minimal 1 qty terisi > 0, walau nilainya
  // Rp0 (mis. item titipan BULOG dengan rate 0 — retur qty-only, tanpa
  // pengaruh nilai piutang/kredit, hanya mengembalikan stok fisik).
  const hasQty = Object.values(lines).some((ln) => Number(ln.qty || 0) > 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-4xl my-8 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Retur Penjualan Baru</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent" aria-label="Tutup">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {/* Pilih invoice + tanggal */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Invoice Penjualan</label>
              <Select
                className="w-full"
                value={invoiceId}
                onChange={(e) => { setInvoiceId(e.target.value); setLines({}); }}
              >
                <option value="">— Pilih invoice —</option>
                {returnableInvoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.invoiceNumber} · {i.customer?.name} · {formatDate(i.date)} · {i.status}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tanggal Retur</label>
              <input type="date" className="w-full border border-border rounded-lg px-3 py-2 bg-background"
                value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {eligible?.invoice && (
            <div className="text-sm text-muted-foreground">
              Outstanding invoice: <span className="font-medium text-foreground">{formatRupiah(Number(eligible.invoice.outstanding))}</span>
              {' · '}Total: {formatRupiah(Number(eligible.invoice.grandTotal))}
            </div>
          )}

          {/* Baris yang bisa diretur */}
          {invoiceId && (
            <div className="border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[620px]">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right">Terjual</th>
                    <th className="px-3 py-2 text-right">Sisa bisa retur</th>
                    <th className="px-3 py-2 text-right">Qty retur</th>
                    <th className="px-3 py-2 text-center">Masuk stok?</th>
                  </tr>
                </thead>
                <tbody>
                  {eligibleLoading && (
                    <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">Memuat…</td></tr>
                  )}
                  {(eligible?.lines ?? []).map((ln) => {
                    const st = lines[ln.salesInvoiceItemId];
                    const qty = Number(st?.qty ?? 0);
                    const invalid = qty > ln.remaining + 1e-9;
                    const disabled = ln.remaining <= 0;
                    return (
                      <tr key={ln.salesInvoiceItemId} className="border-t border-border">
                        <td className="px-3 py-2">
                          <div className="font-medium">{ln.itemName}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatRupiah(ln.rate)}/{ln.unit}
                            {ln.discount > 0 ? ` · disc ${ln.discount}%` : ''}
                            {ln.taxPct > 0 ? ` · PPN ${ln.taxPct}%` : ''}
                            {ln.warehouseName ? ` · ${ln.warehouseName}` : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{ln.quantity} {ln.unit}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{ln.remaining} {ln.unit}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number" min={0} max={ln.remaining} step="any" disabled={disabled}
                            className={`w-28 border rounded-lg px-2 py-1 text-right bg-background ${invalid ? 'border-red-500' : 'border-border'}`}
                            value={st?.qty ?? ''}
                            onChange={(e) => setLine(ln.salesInvoiceItemId, { qty: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          {ln.isInventory ? (
                            <input type="checkbox" className="w-4 h-4"
                              checked={st?.restock !== false}
                              onChange={(e) => setLine(ln.salesInvoiceItemId, { restock: e.target.checked })}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Alasan */}
          {invoiceId && (
            <div>
              <label className="block text-sm font-medium mb-1">Alasan Retur (opsional)</label>
              <textarea className="w-full border border-border rounded-lg px-3 py-2 bg-background" rows={2}
                value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="mis. barang rusak saat pengiriman, salah kirim, dll." />
            </div>
          )}

          {/* Ringkasan */}
          {(summary.total > 0 || hasQty) && (
            <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
              {summary.total > 0 ? (
                <>
                  <div className="flex justify-between"><span>Subtotal retur</span><span className="tabular-nums">{formatRupiah(summary.subtotal)}</span></div>
                  {summary.tax > 0 && <div className="flex justify-between"><span>PPN</span><span className="tabular-nums">{formatRupiah(summary.tax)}</span></div>}
                  <div className="flex justify-between font-semibold border-t border-border pt-1"><span>Total Retur</span><span className="tabular-nums">{formatRupiah(summary.total)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>↳ Kurangi piutang</span><span className="tabular-nums">{formatRupiah(summary.arReduce)}</span></div>
                  {summary.credit > 0 && <div className="flex justify-between text-muted-foreground"><span>↳ Jadi kredit pelanggan</span><span className="tabular-nums">{formatRupiah(summary.credit)}</span></div>}
                </>
              ) : (
                <div className="text-muted-foreground">Retur qty-only (nilai Rp0) — hanya mengembalikan stok fisik, tidak mengubah piutang/kredit pelanggan.</div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border hover:bg-accent">Batal</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || (summary.total <= 0 && !hasQty) || hasInvalidQty}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {mutation.isPending ? 'Menyimpan…' : 'Simpan Retur'}
          </button>
        </div>
      </div>
    </div>
  );
}
