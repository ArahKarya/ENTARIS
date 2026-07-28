import { useState, useMemo } from 'react';
import { Plus, Loader2, ArrowRight, Trash2, Repeat, X, AlertCircle, Layers } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { toast } from 'sonner';
import { formatDate } from '../lib/formatters';
import { cn } from '../lib/utils';
import SearchableSelect, { type SelectOption } from '../components/SearchableSelect';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import WarehouseTransferDrawer from '../components/WarehouseTransferDrawer';
import BatchPicker from '../components/BatchPicker';
import { fetchBatches, allocateFifo } from '../lib/fifoAllocate';

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
  // Phase 5: optional batch picker — locks unitCost to a specific inbound batch.
  sourceMovementId?: string;
}

export const StockTransfers = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: raw, isLoading } = useQuery({
    queryKey: ['stock-transfers'],
    queryFn: async () => {
      const res = await api.get('/stock-transfers?limit=100');
      return res.data.data;
    },
  });

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Transfer Stok / SJG</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pindahkan stok antar gudang. Cetak Surat Jalan Antar Gudang (SJG) untuk supir. Stok pindah instan saat submit.
          </p>
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
                <th>No. Mobil</th>
                <th>Supir</th>
                <th className="text-right">Item</th>
                <th className="text-center">Status</th>
                <th className="text-center">SJG</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="py-16 text-center text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </td></tr>
              ) : !raw || raw.length === 0 ? (
                <tr><td colSpan={8} className="py-16 text-center">
                  <Repeat className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-40" />
                  <p className="text-sm text-muted-foreground">Belum ada transfer.</p>
                </td></tr>
              ) : (
                raw.map((t: any) => (
                  <tr key={t.id} onClick={() => setSelectedId(t.id)} className="cursor-pointer hover:bg-accent">
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
                    <td className="font-mono text-xs text-foreground uppercase whitespace-nowrap">
                      {t.nomorMobil || <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="text-xs text-foreground">
                      {t.driverName || <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="text-right text-xs text-muted-foreground">
                      {t.items?.length ?? 0} item
                    </td>
                    <td className="text-center">
                      <span className={cn('badge', STATUS_BADGE[t.status] ?? 'badge-gray')}>{t.status}</span>
                    </td>
                    <td className="text-center">
                      {t.printedAt ? (
                        <span className="text-[10px] text-green-600">✓ {new Date(t.printedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</span>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && <StockTransferModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />}
      <WarehouseTransferDrawer transferId={selectedId} onClose={() => setSelectedId(null)} />
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
  const [nomorMobil, setNomorMobil] = useState('');
  const [driverName, setDriverName] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<TransferItemRow[]>([
    { id: crypto.randomUUID(), itemId: '', quantity: 0 },
  ]);

  // Bagi Batch Otomatis (FIFO): pecah baris menjadi N baris per batch tersedia.
  // Sisa tak tertampung → baris tanpa batch (WAC) + warning.
  const splitTransferRow = async (idx: number) => {
    const row = items[idx];
    const qty = Number(row.quantity) || 0;
    if (!row.itemId || !fromWarehouseId || qty <= 0) return;
    try {
      const batches = await fetchBatches(row.itemId, fromWarehouseId);
      const claimed = new Map<string, number>();
      items.forEach((r, i) => {
        if (i !== idx && r.itemId === row.itemId && r.sourceMovementId) {
          claimed.set(r.sourceMovementId, (claimed.get(r.sourceMovementId) ?? 0) + (Number(r.quantity) || 0));
        }
      });
      const { allocations, shortfall } = allocateFifo(batches, qty, claimed);
      if (allocations.length === 0) {
        toast.error('Tidak ada batch tersedia untuk item ini di gudang asal.');
        return;
      }
      const newRows: TransferItemRow[] = allocations.map(a => ({
        id: crypto.randomUUID(),
        itemId: row.itemId,
        quantity: a.qty,
        unit: row.unit,
        description: row.description,
        sourceMovementId: a.batch.id,
      }));
      if (shortfall > 0) {
        newRows.push({ id: crypto.randomUUID(), itemId: row.itemId, quantity: shortfall, unit: row.unit, sourceMovementId: '' });
        toast.warning(`${shortfall.toLocaleString('id-ID')} melebihi total batch tersedia — baris sisa memakai biaya rata-rata (WAC).`);
      } else {
        toast.success(`Dibagi ke ${allocations.length} batch (FIFO).`);
      }
      setItems(prev => [...prev.slice(0, idx), ...newRows, ...prev.slice(idx + 1)]);
    } catch {
      toast.error('Gagal mengambil daftar batch.');
    }
  };
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
      toast.success('Transfer berhasil dibuat. Stok sudah pindah, SJG siap dicetak.');
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      onClose();
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
      nomorMobil: nomorMobil.trim() || null,
      driverName: driverName.trim() || null,
      recipientName: recipientName.trim() || null,
      items: valid.map((it) => ({
        itemId: it.itemId,
        quantity: it.quantity,
        description: it.description || null,
        sourceMovementId: it.sourceMovementId || null,
      })),
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Escape' && onClose()}>
      <div className="rounded-xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-primary)' }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h3 className="font-semibold text-foreground">Buat Transfer Stok</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Stok pindah antar gudang + cetak SJG untuk supir</p>
          </div>
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

          {/* SJG fields — physical delivery metadata untuk cetakan */}
          <div className="p-3 bg-blue-50/40 border border-blue-100 rounded-lg space-y-3">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-widest">Info Pengiriman (untuk SJG)</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">No. Mobil</label>
                <input
                  type="text"
                  value={nomorMobil}
                  onChange={(e) => setNomorMobil(e.target.value)}
                  placeholder="B 1234 ABC"
                  className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Supir</label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="Nama supir"
                  className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Penerima (Gudang Tujuan)</label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Nama PIC penerima"
                  className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <p className="text-[11px] text-blue-700">
              Field-field ini optional, tetapi muncul di cetakan SJG untuk verifikasi waktu serah-terima.
            </p>
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
                <div key={it.id} className="grid grid-cols-12 gap-2 items-start p-2 border border-border rounded-lg bg-card/50">
                  <div className="col-span-12 md:col-span-7">
                    <label className="text-[11px] text-muted-foreground">Item</label>
                    <SearchableSelect options={itemOptions} value={it.itemId}
                      onChange={(v) => {
                        const next = [...items];
                        next[idx] = { ...next[idx], itemId: v, sourceMovementId: '' };
                        const itemMeta = invItems?.find((i: any) => i.id === v);
                        if (itemMeta) next[idx].unit = itemMeta.unit;
                        setItems(next);
                      }}
                      placeholder="Pilih item..." />
                    {/* Phase 5: batch picker (optional, locks unitCost to a specific inbound batch) */}
                    {it.itemId && fromWarehouseId && (
                      <div className="mt-1">
                        <label className="text-[10px] text-muted-foreground block mb-0.5">
                          Batch sumber (opsional)
                        </label>
                        <div className="flex gap-2 items-center">
                          <div className="flex-1 min-w-0">
                            <BatchPicker
                              itemId={it.itemId}
                              warehouseId={fromWarehouseId}
                              value={it.sourceMovementId ?? ''}
                              excludeIds={items
                                .filter((r, i) => i !== idx && r.itemId === it.itemId && r.sourceMovementId)
                                .map((r) => r.sourceMovementId as string)}
                              onChange={(id) => {
                                const next = [...items];
                                next[idx] = { ...next[idx], sourceMovementId: id };
                                setItems(next);
                              }}
                            />
                          </div>
                          {!it.sourceMovementId && (Number(it.quantity) || 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => void splitTransferRow(idx)}
                              className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-300 rounded-lg px-2 py-1.5 transition-colors"
                              title="Pecah otomatis jadi beberapa baris sesuai batch tersedia (FIFO, tertua dulu)"
                            >
                              <Layers size={12} /> Bagi Batch
                            </button>
                          )}
                        </div>
                      </div>
                    )}
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
