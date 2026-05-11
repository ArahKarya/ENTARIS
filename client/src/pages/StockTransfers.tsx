import { useState, useMemo } from 'react';
import { Plus, Loader2, ArrowRight, Trash2, Repeat, X, AlertCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { toast } from 'sonner';
import { formatDate } from '../lib/formatters';
import { cn } from '../lib/utils';
import SearchableSelect, { type SelectOption } from '../components/SearchableSelect';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { ConfirmDialog } from '../components/ConfirmDialog';

const STATUS_BADGE: Record<string, string> = {
  Draft: 'badge-gray',
  Submitted: 'badge-blue',
  Cancelled: 'badge-red',
};

interface TransferItemRow {
  id: string;
  itemId: string;
  quantity: number;
  unit?: string;
  description?: string;
}

export const StockTransfers = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<any>(null);

  const queryClient = useQueryClient();

  const { data: raw, isLoading } = useQuery({
    queryKey: ['stock-transfers'],
    queryFn: async () => {
      const res = await api.get('/stock-transfers?limit=100');
      return res.data.data;
    },
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => api.patch(`/stock-transfers/${id}/cancel`),
    onSuccess: () => {
      toast.success('Transfer dibatalkan.');
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      setCancelTarget(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Gagal cancel.'),
  });

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Transfer Stok</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Pindahkan stok item antar gudang. Tidak ada efek ke GL.</p>
        </div>
        <button className="btn-primary self-start" onClick={() => setIsModalOpen(true)}>
          <Plus size={15} /> Buat Transfer
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Nomor</th>
                <th>Dari → Tujuan</th>
                <th className="text-right">Item</th>
                <th className="text-center">Status</th>
                <th>Catatan</th>
                <th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="py-16 text-center text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </td></tr>
              ) : !raw || raw.length === 0 ? (
                <tr><td colSpan={7} className="py-16 text-center">
                  <Repeat className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-40" />
                  <p className="text-sm text-muted-foreground">Belum ada transfer.</p>
                </td></tr>
              ) : (
                raw.map((t: any) => (
                  <tr key={t.id}>
                    <td className="text-muted-foreground whitespace-nowrap">{formatDate(t.date)}</td>
                    <td className="whitespace-nowrap">
                      <span className="font-mono text-xs text-foreground bg-muted px-1.5 py-0.5 rounded">{t.transferNumber}</span>
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <span className="text-foreground">{t.fromWarehouse?.name}</span>
                        <ArrowRight size={12} className="text-muted-foreground" />
                        <span className="text-foreground font-medium">{t.toWarehouse?.name}</span>
                      </span>
                    </td>
                    <td className="text-right text-xs text-muted-foreground">
                      {t.items?.length ?? 0} item
                    </td>
                    <td className="text-center">
                      <span className={cn('badge', STATUS_BADGE[t.status] ?? 'badge-gray')}>{t.status}</span>
                    </td>
                    <td className="text-xs text-muted-foreground truncate max-w-xs">{t.notes ?? '—'}</td>
                    <td className="text-center">
                      {t.status === 'Submitted' && (
                        <button
                          onClick={() => setCancelTarget(t)}
                          className="p-1.5 hover:bg-red-50 rounded text-red-500 hover:text-red-600"
                          aria-label="Batalkan transfer"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <StockTransferModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      <ConfirmDialog
        open={cancelTarget !== null}
        title="Batalkan Transfer"
        message={`Batalkan transfer ${cancelTarget?.transferNumber}? Stok akan dikembalikan ke gudang asal.`}
        confirmLabel="Ya, Batalkan"
        variant="danger"
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => { if (cancelTarget) cancelMut.mutate(cancelTarget.id); }}
      />
    </div>
  );
};

export default StockTransfers;

// ─── Modal ───────────────────────────────────────────────────────────────
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function StockTransferModal({ isOpen, onClose }: ModalProps) {
  useBodyScrollLock(isOpen);
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<TransferItemRow[]>([
    { id: crypto.randomUUID(), itemId: '', quantity: 0 },
  ]);
  const [error, setError] = useState('');

  const queryClient = useQueryClient();

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses-active'],
    queryFn: async () => {
      const res = await api.get('/warehouses?active=true');
      return res.data.data;
    },
    enabled: isOpen,
  });

  const { data: invItems } = useQuery({
    queryKey: ['inventory-items-active'],
    queryFn: async () => {
      const res = await api.get('/inventory/items');
      const all = res.data.data ?? res.data;
      return all.filter((i: any) => i.isActive !== false);
    },
    enabled: isOpen,
  });

  const whOptions = useMemo<SelectOption[]>(
    () => (warehouses ?? []).map((w: any) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
    [warehouses],
  );

  const itemOptions = useMemo<SelectOption[]>(
    () => (invItems ?? []).map((i: any) => ({ value: i.id, label: `${i.code} — ${i.name}` })),
    [invItems],
  );

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/stock-transfers', data),
    onSuccess: () => {
      toast.success('Transfer berhasil dibuat.');
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      onClose();
      setDate(today);
      setFromWarehouseId('');
      setToWarehouseId('');
      setNotes('');
      setItems([{ id: crypto.randomUUID(), itemId: '', quantity: 0 }]);
      setError('');
    },
    onError: (e: any) => setError(e.response?.data?.error ?? 'Gagal buat transfer.'),
  });

  const handleSubmit = () => {
    setError('');
    if (!fromWarehouseId) { setError('Pilih gudang asal.'); return; }
    if (!toWarehouseId) { setError('Pilih gudang tujuan.'); return; }
    if (fromWarehouseId === toWarehouseId) { setError('Gudang asal dan tujuan harus berbeda.'); return; }
    const valid = items.filter((it) => it.itemId && it.quantity > 0);
    if (valid.length === 0) { setError('Tambahkan minimal satu item dengan qty > 0.'); return; }
    mutation.mutate({
      date,
      fromWarehouseId,
      toWarehouseId,
      notes: notes.trim() || null,
      items: valid.map((it) => ({
        itemId: it.itemId,
        quantity: it.quantity,
        description: it.description || null,
      })),
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Escape' && onClose()}>
      <div className="rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-primary)' }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="font-semibold text-foreground">Buat Transfer Stok</h3>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded" aria-label="Tutup"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tanggal</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Dari Gudang *</label>
              <SearchableSelect options={whOptions} value={fromWarehouseId}
                onChange={setFromWarehouseId} placeholder="Pilih gudang asal..." />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Ke Gudang *</label>
              <SearchableSelect options={whOptions.filter((o) => o.value !== fromWarehouseId)} value={toWarehouseId}
                onChange={setToWarehouseId} placeholder="Pilih gudang tujuan..." />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Item</label>
              <button type="button"
                onClick={() => setItems([...items, { id: crypto.randomUUID(), itemId: '', quantity: 0 }])}
                className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
                <Plus size={12} /> Tambah baris
              </button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={it.id} className="grid grid-cols-12 gap-2 items-end p-2 border border-border rounded-lg bg-card/50">
                  <div className="col-span-12 md:col-span-7">
                    <label className="text-[11px] text-muted-foreground">Item</label>
                    <SearchableSelect options={itemOptions} value={it.itemId}
                      onChange={(v) => {
                        const next = [...items];
                        next[idx] = { ...next[idx], itemId: v };
                        const itemMeta = invItems?.find((i: any) => i.id === v);
                        if (itemMeta) next[idx].unit = itemMeta.unit;
                        setItems(next);
                      }}
                      placeholder="Pilih item..." />
                  </div>
                  <div className="col-span-8 md:col-span-3">
                    <label className="text-[11px] text-muted-foreground">Qty {it.unit ? `(${it.unit})` : ''}</label>
                    <input type="number" min={0} value={it.quantity || ''}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = { ...next[idx], quantity: Number(e.target.value) || 0 };
                        setItems(next);
                      }}
                      className="w-full mt-1 px-2 py-1.5 text-xs border border-border rounded bg-card" />
                  </div>
                  <div className="col-span-4 md:col-span-2 flex justify-end">
                    {items.length > 1 && (
                      <button type="button"
                        onClick={() => setItems(items.filter((_, i) => i !== idx))}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded" aria-label="Hapus baris">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Catatan</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Alasan transfer..."
              className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button onClick={handleSubmit} disabled={mutation.isPending}
            className="btn-primary disabled:opacity-40">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Submit Transfer
          </button>
        </div>
      </div>
    </div>
  );
}
