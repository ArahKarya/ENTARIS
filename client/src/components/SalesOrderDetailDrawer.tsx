import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Pencil, Send, Ban, Truck, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { formatRupiah, formatDate } from '../lib/formatters';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { toast } from 'sonner';

interface Props {
  soId: string | null;
  onClose: () => void;
  onEdit: (so: any) => void;
}

const STATUS_LABEL: Record<string, string> = {
  Draft: 'Draft',
  Submitted: 'Disubmit',
  PartiallyDelivered: 'Sebagian Terkirim',
  FullyDelivered: 'Selesai',
  Cancelled: 'Dibatalkan',
};

const STATUS_COLOR: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-700',
  Submitted: 'bg-blue-100 text-blue-700',
  PartiallyDelivered: 'bg-amber-100 text-amber-700',
  FullyDelivered: 'bg-green-100 text-green-700',
  Cancelled: 'bg-red-100 text-red-700',
};

const SalesOrderDetailDrawer: React.FC<Props> = ({ soId, onClose, onEdit }) => {
  const queryClient = useQueryClient();
  const [genDOOpen, setGenDOOpen] = useState(false);
  const [genItems, setGenItems] = useState<Record<string, number>>({});
  const [genWarehouseId, setGenWarehouseId] = useState('');
  const [genDate, setGenDate] = useState(new Date().toISOString().split('T')[0]);
  const [genNomorMobil, setGenNomorMobil] = useState('');
  const [genDriver, setGenDriver] = useState('');
  const [genError, setGenError] = useState('');

  useBodyScrollLock(Boolean(soId));

  const { data: so, isLoading } = useQuery({
    queryKey: ['sales-order', soId],
    queryFn: async () => {
      const res = await api.get(`/sales-orders/${soId}`);
      return res.data;
    },
    enabled: Boolean(soId),
  });

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses-active'],
    queryFn: async () => {
      const res = await api.get('/warehouses');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((w: any) => w.isActive !== false);
    },
  });

  useEffect(() => {
    if (so?.items) {
      // Initialize gen items to remaining qty per line
      const init: Record<string, number> = {};
      so.items.forEach((it: any) => {
        const remaining = Number(it.quantity) - Number(it.deliveredQty);
        init[it.id] = Math.max(0, remaining);
      });
      setGenItems(init);
    }
  }, [so?.id]);

  const submitMut = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/sales-orders/${soId}/submit`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      queryClient.invalidateQueries({ queryKey: ['sales-order', soId] });
      toast.success('Sales Order disubmit.');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Gagal submit.'),
  });

  const cancelMut = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/sales-orders/${soId}/cancel`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      queryClient.invalidateQueries({ queryKey: ['sales-order', soId] });
      toast.success('Sales Order dibatalkan.');
      onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Gagal cancel.'),
  });

  const genDOMut = useMutation({
    mutationFn: async () => {
      const items = Object.entries(genItems)
        .filter(([, qty]) => qty > 0)
        .map(([salesOrderItemId, quantity]) => ({
          salesOrderItemId,
          quantity,
          warehouseId: genWarehouseId || null,
        }));
      if (items.length === 0) throw new Error('Pilih minimal 1 item dengan qty > 0.');
      if (!genWarehouseId) throw new Error('Pilih gudang sumber.');
      const res = await api.post(`/sales-orders/${soId}/generate-do`, {
        date: genDate,
        nomorMobil: genNomorMobil || null,
        driverName: genDriver || null,
        notes: null,
        items,
      });
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      queryClient.invalidateQueries({ queryKey: ['sales-order', soId] });
      queryClient.invalidateQueries({ queryKey: ['delivery-orders'] });
      toast.success(`Surat Jalan ${data.doNumber} dibuat.`);
      setGenDOOpen(false);
      setGenError('');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Gagal generate Surat Jalan.';
      setGenError(msg);
    },
  });

  if (!soId) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-end" onClick={onClose}>
      <div className="bg-card border-l border-border w-full sm:max-w-3xl h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-6 py-3 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-semibold text-foreground">Detail Sales Order</h2>
            {so && <p className="text-xs text-muted-foreground font-mono">{so.soNumber}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent" aria-label="Tutup">
            <X size={18} />
          </button>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-muted-foreground"><Loader2 size={20} className="animate-spin inline" /></div>
        ) : !so ? (
          <div className="p-6 text-center text-muted-foreground">SO tidak ditemukan.</div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm"><span className="text-muted-foreground">Tanggal:</span> {formatDate(so.date)}</p>
                {so.expectedDelivery && <p className="text-sm"><span className="text-muted-foreground">Target Kirim:</span> {formatDate(so.expectedDelivery)}</p>}
                <p className="text-sm"><span className="text-muted-foreground">Pelanggan:</span> <span className="font-medium">{so.customer?.name}</span></p>
                {so.customerRefNo && <p className="text-sm"><span className="text-muted-foreground">Ref PO:</span> {so.customerRefNo}</p>}
                {so.notes && <p className="text-sm text-muted-foreground">Catatan: {so.notes}</p>}
              </div>
              <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', STATUS_COLOR[so.status])}>{STATUS_LABEL[so.status]}</span>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs">Item</th>
                    <th className="text-right px-3 py-2 text-xs">Qty</th>
                    <th className="text-right px-3 py-2 text-xs">Terkirim</th>
                    <th className="text-right px-3 py-2 text-xs">Sisa</th>
                    <th className="text-right px-3 py-2 text-xs">Harga</th>
                    <th className="text-right px-3 py-2 text-xs">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {so.items?.map((it: any) => {
                    const remaining = Number(it.quantity) - Number(it.deliveredQty);
                    const fully = remaining <= 0;
                    return (
                      <tr key={it.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <p className="font-medium">{it.itemName}</p>
                          {it.inventoryItem && <p className="text-xs text-muted-foreground font-mono">{it.inventoryItem.code}</p>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{Number(it.quantity).toLocaleString('id-ID')} {it.unit}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{Number(it.deliveredQty).toLocaleString('id-ID')}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fully ? (
                            <span className="text-green-600"><CheckCircle2 size={12} className="inline" /></span>
                          ) : (
                            <span className="text-amber-600 font-medium">{remaining.toLocaleString('id-ID')}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(Number(it.rate))}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatRupiah(Number(it.amount))}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/30 border-t border-border">
                  <tr>
                    <td colSpan={4}></td>
                    <td className="px-3 py-2 text-right text-sm text-muted-foreground">Subtotal</td>
                    <td className="px-3 py-2 text-right font-mono">{formatRupiah(Number(so.subtotal))}</td>
                  </tr>
                  {Number(so.potongan) > 0 && (
                    <tr>
                      <td colSpan={4}></td>
                      <td className="px-3 py-2 text-right text-sm text-muted-foreground">Potongan</td>
                      <td className="px-3 py-2 text-right font-mono">-{formatRupiah(Number(so.potongan))}</td>
                    </tr>
                  )}
                  {Number(so.taxPct) > 0 && (
                    <tr>
                      <td colSpan={4}></td>
                      <td className="px-3 py-2 text-right text-sm text-muted-foreground">PPN {so.taxPct}%</td>
                      <td className="px-3 py-2 text-right font-mono">{formatRupiah((Number(so.subtotal) - Number(so.potongan)) * Number(so.taxPct) / 100)}</td>
                    </tr>
                  )}
                  {Number(so.biayaLain) > 0 && (
                    <tr>
                      <td colSpan={4}></td>
                      <td className="px-3 py-2 text-right text-sm text-muted-foreground">Biaya Lain</td>
                      <td className="px-3 py-2 text-right font-mono">{formatRupiah(Number(so.biayaLain))}</td>
                    </tr>
                  )}
                  <tr className="border-t border-border">
                    <td colSpan={4}></td>
                    <td className="px-3 py-2 text-right font-semibold">Grand Total</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-blue-600">{formatRupiah(Number(so.grandTotal))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {so.deliveryOrders?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Surat Jalan Terkait</h3>
                <ul className="space-y-1 text-sm">
                  {so.deliveryOrders.map((d: any) => (
                    <li key={d.id} className="flex items-center justify-between border border-border rounded px-2 py-1.5">
                      <span className="font-mono text-xs">{d.doNumber}</span>
                      <span className="text-muted-foreground text-xs">{formatDate(d.date)} • {d.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Generate DO inline panel */}
            {genDOOpen && (so.status === 'Submitted' || so.status === 'PartiallyDelivered') && (
              <div className="border-2 border-blue-200 bg-blue-50/40 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Truck size={14} /> Buat Surat Jalan
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Tanggal</label>
                    <input type="date" value={genDate} onChange={(e) => setGenDate(e.target.value)} className="input w-full mt-1" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Gudang Sumber *</label>
                    <select value={genWarehouseId} onChange={(e) => setGenWarehouseId(e.target.value)} className="input w-full mt-1">
                      <option value="">— Pilih gudang —</option>
                      {warehouses?.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">No. Mobil</label>
                    <input type="text" value={genNomorMobil} onChange={(e) => setGenNomorMobil(e.target.value)} className="input w-full mt-1" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Sopir</label>
                  <input type="text" value={genDriver} onChange={(e) => setGenDriver(e.target.value)} className="input w-full mt-1" />
                </div>
                <div className="border border-border rounded">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left px-2 py-1 text-xs">Item</th>
                        <th className="text-right px-2 py-1 text-xs">Sisa</th>
                        <th className="text-right px-2 py-1 text-xs w-32">Qty Kirim</th>
                      </tr>
                    </thead>
                    <tbody>
                      {so.items?.map((it: any) => {
                        const remaining = Number(it.quantity) - Number(it.deliveredQty);
                        if (remaining <= 0) return null;
                        return (
                          <tr key={it.id} className="border-t border-border">
                            <td className="px-2 py-1.5">{it.itemName}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{remaining.toLocaleString('id-ID')} {it.unit}</td>
                            <td className="px-2 py-1.5">
                              <input
                                type="number"
                                value={genItems[it.id] ?? 0}
                                onChange={(e) => setGenItems((prev) => ({ ...prev, [it.id]: Number(e.target.value) }))}
                                className="input w-full text-right"
                                min={0}
                                max={remaining}
                                step="0.001"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {genError && (
                  <div className="bg-red-50 border border-red-200 rounded px-2 py-1.5 flex items-center gap-2 text-red-700 text-sm">
                    <AlertCircle size={14} /> {genError}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button onClick={() => { setGenDOOpen(false); setGenError(''); }} className="btn-secondary">Batal</button>
                  <button onClick={() => genDOMut.mutate()} disabled={genDOMut.isPending} className="btn-primary">
                    {genDOMut.isPending && <Loader2 size={14} className="animate-spin" />}
                    Buat Surat Jalan
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {so && (
          <div className="sticky bottom-0 bg-card border-t border-border px-6 py-3 flex items-center justify-end gap-2">
            {so.status === 'Draft' && (
              <>
                <button onClick={() => onEdit(so)} className="btn-secondary text-sm">
                  <Pencil size={14} /> Edit
                </button>
                <button onClick={() => submitMut.mutate()} disabled={submitMut.isPending} className="btn-primary text-sm">
                  {submitMut.isPending && <Loader2 size={14} className="animate-spin" />}
                  <Send size={14} /> Submit
                </button>
              </>
            )}
            {(so.status === 'Submitted' || so.status === 'PartiallyDelivered') && !genDOOpen && (
              <button onClick={() => setGenDOOpen(true)} className="btn-primary text-sm">
                <Truck size={14} /> Buat Surat Jalan
              </button>
            )}
            {so.status === 'Draft' || so.status === 'Submitted' ? (
              <button onClick={() => { if (confirm('Yakin batalkan SO ini?')) cancelMut.mutate(); }} disabled={cancelMut.isPending} className="btn-secondary text-sm text-red-600">
                <Ban size={14} /> Cancel
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesOrderDetailDrawer;
