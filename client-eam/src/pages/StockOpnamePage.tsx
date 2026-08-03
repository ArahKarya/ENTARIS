import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Plus, Loader2, XCircle, Eye, Search } from 'lucide-react';
import api from '../lib/api';
import { formatDate, formatRupiah } from '../lib/formatters';
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ConfirmDialog';
import PDFDownloadButton from '../components/PDFDownloadButton';
import StockOpnamePDF from '../lib/pdf/StockOpnamePDF';
import { useCompanySettings } from '../contexts/CompanySettingsContext';
import WarehousePicker from '../components/WarehousePicker';
import { can, cap } from '../lib/permissions';

const formatNumber = (val: number | string, decimals = 3) =>
  Number(val).toLocaleString('id-ID', { maximumFractionDigits: decimals });

const statusConfig: Record<string, { label: string; className: string }> = {
  Draft: { label: 'Draft', className: 'badge badge-blue' },
  Submitted: { label: 'Selesai', className: 'badge badge-green' },
  Cancelled: { label: 'Dibatalkan', className: 'badge badge-red' },
};

type ViewMode = 'list' | 'create' | 'detail';

export function StockOpnamePage() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const companySettings = useCompanySettings();

  const canEdit = can('stock_opname', 'edit');

  // List query
  const { data: listRaw, isLoading: listLoading } = useQuery({
    queryKey: ['stock-opname-list'],
    queryFn: () => api.get('/stock-opname?limit=100').then((r) => r.data),
  });
  const sessions: any[] = listRaw?.data ?? [];

  // Detail query
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['stock-opname-detail', selectedId],
    queryFn: () => api.get(`/stock-opname/${selectedId}`).then((r) => r.data),
    enabled: !!selectedId && viewMode === 'detail',
  });

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await api.put(`/stock-opname/${cancelTarget}/cancel`);
      toast.success('Stok opname berhasil dibatalkan.');
      queryClient.invalidateQueries({ queryKey: ['stock-opname-list'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      if (selectedId === cancelTarget) setViewMode('list');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal membatalkan stok opname.');
    } finally {
      setCancelTarget(null);
    }
  };

  if (viewMode === 'create') {
    return <StockOpnameForm onBack={() => setViewMode('list')} onSuccess={() => { setViewMode('list'); queryClient.invalidateQueries({ queryKey: ['stock-opname-list'] }); queryClient.invalidateQueries({ queryKey: ['inventory-items'] }); }} />;
  }

  if (viewMode === 'detail' && selectedId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setViewMode('list')} className="btn btn-secondary text-sm">← Kembali</button>
            <h2 className="text-lg font-semibold">{detail?.opnameNumber || 'Loading...'}</h2>
            {detail && <span className={statusConfig[detail.status]?.className}>{statusConfig[detail.status]?.label}</span>}
          </div>
          <div className="flex items-center gap-2">
            {detail && (
              <PDFDownloadButton
                document={
                  <StockOpnamePDF
                    opnameNumber={detail.opnameNumber}
                    date={detail.date}
                    status={detail.status}
                    notes={detail.notes}
                    createdBy={detail.createdBy?.fullName}
                    items={detail.items.filter((i: any) => Number(i.difference) !== 0).map((i: any) => ({
                      code: i.item.code,
                      name: i.item.name,
                      unit: i.item.unit,
                      systemStock: Number(i.systemStock),
                      actualStock: Number(i.actualStock),
                      difference: Number(i.difference),
                      unitCost: Number(i.unitCost),
                      totalValue: Number(i.totalValue),
                    }))}
                    company={{ name: companySettings?.companyName || 'Perusahaan', address: companySettings?.address, logoUrl: companySettings?.logoUrl }}
                  />
                }
                fileName={`stok-opname-${detail.opnameNumber}.pdf`}
                label="Unduh PDF"
              />
            )}
            {detail?.status === 'Submitted' && cap('doc.cancel') && (
              <button onClick={() => setCancelTarget(detail.id)} className="btn btn-danger text-sm"><XCircle size={16} className="mr-1" /> Batalkan</button>
            )}
          </div>
        </div>
        {detailLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
        ) : detail ? (
          <StockOpnameDetail data={detail} />
        ) : null}
        <ConfirmDialog open={!!cancelTarget} title="Batalkan Stok Opname?" message="Semua penyesuaian stok dan jurnal akan di-reverse." onConfirm={handleCancel} onCancel={() => setCancelTarget(null)} />
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={24} />
          <h1 className="text-xl font-bold">Stok Opname</h1>
        </div>
        {canEdit && (
          <button onClick={() => setViewMode('create')} className="btn btn-primary text-sm"><Plus size={16} className="mr-1" /> Buat Stok Opname</button>
        )}
      </div>

      {listLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Belum ada data stok opname.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>No. Opname</th>
                <th>Tanggal</th>
                <th>Status</th>
                <th className="text-right">Item Selisih</th>
                <th className="text-right">Total Nilai Selisih</th>
                <th>Dibuat Oleh</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s: any) => (
                <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer" onClick={() => { setSelectedId(s.id); setViewMode('detail'); }}>
                  <td className="font-mono text-sm">{s.opnameNumber}</td>
                  <td>{formatDate(s.date)}</td>
                  <td><span className={statusConfig[s.status]?.className}>{statusConfig[s.status]?.label}</span></td>
                  <td className="text-right tabular-nums">{s.itemsWithDiff ?? 0}</td>
                  <td className="text-right tabular-nums whitespace-nowrap">{formatRupiah(s.totalVariance ?? 0)}</td>
                  <td>{s.createdBy?.fullName}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setSelectedId(s.id); setViewMode('detail'); }}><Eye size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog open={!!cancelTarget} title="Batalkan Stok Opname?" message="Semua penyesuaian stok dan jurnal akan di-reverse." onConfirm={handleCancel} onCancel={() => setCancelTarget(null)} />
    </div>
  );
}

// ─── Detail View ─────────────────────────────────────────────────────────────

function StockOpnameDetail({ data }: { data: any }) {
  const totalSurplus = data.items.filter((i: any) => Number(i.difference) > 0).reduce((s: number, i: any) => s + Number(i.totalValue), 0);
  const totalDeficit = data.items.filter((i: any) => Number(i.difference) < 0).reduce((s: number, i: any) => s + Number(i.totalValue), 0);
  const itemsWithDiff = data.items.filter((i: any) => Number(i.difference) !== 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-3">
          <div className="text-xs text-gray-500">Tanggal</div>
          <div className="font-semibold">{formatDate(data.date)}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-gray-500">Total Item Dihitung</div>
          <div className="font-semibold">{data.items.length}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-green-600">Surplus</div>
          <div className="font-semibold text-green-600">{formatRupiah(totalSurplus)}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-red-600">Defisit</div>
          <div className="font-semibold text-red-600">{formatRupiah(totalDeficit)}</div>
        </div>
      </div>
      {data.notes && <div className="card p-3 text-sm"><span className="text-gray-500">Catatan:</span> {data.notes}</div>}

      <h3 className="font-semibold">Item dengan Selisih ({itemsWithDiff.length})</h3>
      <div className="overflow-x-auto">
        <table className="data-table w-full text-sm">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Nama Item</th>
              <th>Satuan</th>
              <th className="text-right">Stok Sistem</th>
              <th className="text-right">Stok Aktual</th>
              <th className="text-right">Selisih</th>
              <th className="text-right">Harga/Unit</th>
              <th className="text-right">Nilai Selisih</th>
            </tr>
          </thead>
          <tbody>
            {itemsWithDiff.map((i: any) => {
              const diff = Number(i.difference);
              return (
                <tr key={i.id} className={diff > 0 ? 'bg-green-50 dark:bg-green-950/20' : 'bg-red-50 dark:bg-red-950/20'}>
                  <td className="font-mono">{i.item.code}</td>
                  <td>{i.item.name}</td>
                  <td>{i.item.unit}</td>
                  <td className="text-right tabular-nums">{formatNumber(i.systemStock)}</td>
                  <td className="text-right tabular-nums">{formatNumber(i.actualStock)}</td>
                  <td className={`text-right tabular-nums font-semibold ${diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {diff > 0 ? '+' : ''}{formatNumber(diff)}
                  </td>
                  <td className="text-right tabular-nums whitespace-nowrap">{formatRupiah(Number(i.unitCost))}</td>
                  <td className="text-right tabular-nums whitespace-nowrap">{formatRupiah(Number(i.totalValue))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Create Form ─────────────────────────────────────────────────────────────

function StockOpnameForm({ onBack, onSuccess }: { onBack: () => void; onSuccess: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [actualStocks, setActualStocks] = useState<Record<string, string>>({});
  // Nilai satuan manual per item. Kosong = pakai averageCost item apa adanya.
  const [unitCosts, setUnitCosts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Load all active items. When a warehouse is picked, the endpoint returns
  // per-warehouse currentStock — opname compares against that, not the global
  // total, so counting POLES only doesn't accidentally adjust GILING.
  const { data: itemsRaw, isLoading } = useQuery({
    queryKey: ['inventory-items-opname', warehouseId],
    queryFn: () => api
      .get('/inventory/items', { params: { limit: 500, isActive: true, ...(warehouseId ? { warehouseId } : {}) } })
      .then((r) => r.data),
  });
  const items: any[] = useMemo(() => {
    const raw = Array.isArray(itemsRaw) ? itemsRaw : (itemsRaw?.data ?? []);
    return raw.filter((i: any) => !i.isDummy);
  }, [itemsRaw]);

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const s = search.toLowerCase();
    return items.filter((i: any) => i.name.toLowerCase().includes(s) || i.code.toLowerCase().includes(s));
  }, [items, search]);

  const handleActualChange = (itemId: string, value: string) => {
    setActualStocks((prev) => ({ ...prev, [itemId]: value }));
  };

  const getActualStock = (itemId: string, systemStock: number): number => {
    const val = actualStocks[itemId];
    if (val === undefined || val === '') return systemStock; // unchanged = same as system
    return Number(val) || 0;
  };

  const handleCostChange = (itemId: string, value: string) => {
    setUnitCosts((prev) => ({ ...prev, [itemId]: value }));
  };

  // Nilai satuan yang dipakai untuk perhitungan: input manual bila diisi,
  // kalau tidak pakai HPP rata-rata (averageCost) item.
  const getUnitCost = (itemId: string, avgCost: number): number => {
    const val = unitCosts[itemId];
    if (val === undefined || val === '') return avgCost;
    return Number(val) || 0;
  };

  const summary = useMemo(() => {
    let surplus = 0;
    let deficit = 0;
    let changed = 0;
    let revalued = 0;
    for (const item of items) {
      const systemStock = Number(item.currentStock);
      const avgCost = Number(item.averageCost);
      const cost = getUnitCost(item.id, avgCost);
      const actual = getActualStock(item.id, systemStock);
      const diff = actual - systemStock;
      if (diff !== 0) {
        changed++;
        const val = Math.abs(diff) * cost;
        if (diff > 0) surplus += val;
        else deficit += val;
      }
      // Revaluasi: perubahan nilai satuan dikenakan ke SELURUH stok saat ini.
      if (cost !== avgCost) {
        revalued++;
        const delta = systemStock * (cost - avgCost);
        if (delta > 0) surplus += delta;
        else deficit += -delta;
      }
    }
    return { surplus, deficit, changed, revalued };
  }, [items, actualStocks, unitCosts]);

  const handleSubmit = async () => {
    // Build items array — include ALL items (even unchanged for audit trail)
    const opnameItems = items.map((item: any) => ({
      itemId: item.id,
      actualStock: getActualStock(item.id, Number(item.currentStock)),
      unitCost: getUnitCost(item.id, Number(item.averageCost)),
    }));

    if (opnameItems.length === 0) {
      toast.error('Tidak ada item untuk stok opname.');
      return;
    }

    if (!warehouseId) {
      toast.error('Pilih gudang opname terlebih dahulu.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/stock-opname', {
        date,
        warehouseId,
        notes: notes || null,
        items: opnameItems,
      });
      toast.success('Stok opname berhasil disimpan dan diproses.');
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan stok opname.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="btn btn-secondary text-sm">← Kembali</button>
          <h2 className="text-lg font-semibold">Buat Stok Opname</h2>
        </div>
      </div>

      {/* Header */}
      <div className="card p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="label">Tanggal</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input w-full" />
        </div>
        <div>
          <label className="label">Gudang <span className="text-red-500">*</span></label>
          <WarehousePicker
            value={warehouseId}
            onChange={(id) => {
              // Reset entered values when switching warehouse — "Stok Sistem"
              // changes so the existing entries no longer mean the same thing.
              setWarehouseId(id);
              setActualStocks({});
            }}
            size="md"
            autoDefault={true}
            placeholder="Pilih gudang opname..."
          />
        </div>
        <div>
          <label className="label">Catatan</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="input w-full" placeholder="Opsional..." />
        </div>
      </div>
      {!warehouseId && (
        <div className="card p-3 text-sm text-amber-700 bg-amber-50 border border-amber-200">
          Pilih gudang dulu untuk menampilkan stok sistem per gudang.
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-3 text-center">
          <div className="text-xs text-gray-500">Item Berubah</div>
          <div className="text-xl font-bold">{summary.changed}</div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-xs text-green-600">Surplus</div>
          <div className="text-lg font-bold text-green-600">{formatRupiah(summary.surplus)}</div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-xs text-red-600">Defisit</div>
          <div className="text-lg font-bold text-red-600">{formatRupiah(summary.deficit)}</div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="input w-full pl-9" placeholder="Cari item..." />
      </div>

      {/* Items table */}
      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table w-full text-sm">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama Item</th>
                <th>Satuan</th>
                <th className="text-right">Stok Sistem</th>
                <th className="text-right w-36">Stok Aktual</th>
                <th className="text-right">Selisih</th>
                <th className="text-right w-40">Nilai/Satuan</th>
                <th className="text-right">Nilai Selisih</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item: any) => {
                const systemStock = Number(item.currentStock);
                const avgCost = Number(item.averageCost);
                const actual = getActualStock(item.id, systemStock);
                const cost = getUnitCost(item.id, avgCost);
                const diff = actual - systemStock;
                const costChanged = cost !== avgCost;
                const val = Math.abs(diff) * cost;

                return (
                  <tr key={item.id} className={diff > 0 ? 'bg-green-50 dark:bg-green-950/20' : diff < 0 ? 'bg-red-50 dark:bg-red-950/20' : costChanged ? 'bg-amber-50 dark:bg-amber-950/20' : ''}>
                    <td className="font-mono">{item.code}</td>
                    <td>{item.name}</td>
                    <td>{item.unit}</td>
                    <td className="text-right tabular-nums">{formatNumber(systemStock)}</td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        className="input w-full text-right tabular-nums"
                        placeholder={formatNumber(systemStock)}
                        value={actualStocks[item.id] ?? ''}
                        onChange={(e) => handleActualChange(item.id, e.target.value)}
                      />
                    </td>
                    <td className={`text-right tabular-nums font-semibold ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : ''}`}>
                      {diff !== 0 ? (diff > 0 ? '+' : '') + formatNumber(diff) : '—'}
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        className={`input w-full text-right tabular-nums ${costChanged ? 'border-amber-500' : ''}`}
                        placeholder={formatNumber(avgCost)}
                        value={unitCosts[item.id] ?? ''}
                        onChange={(e) => handleCostChange(item.id, e.target.value)}
                        title="Kosongkan untuk memakai HPP rata-rata. Diisi = revaluasi nilai persediaan."
                      />
                    </td>
                    <td className="text-right tabular-nums whitespace-nowrap">
                      {diff !== 0 ? formatRupiah(val) : costChanged ? formatRupiah(systemStock * (cost - avgCost)) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onBack} className="btn btn-secondary">Batal</button>
        <button onClick={handleSubmit} disabled={submitting || !warehouseId} className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
          {submitting ? <><Loader2 size={16} className="animate-spin mr-1" /> Menyimpan...</> : 'Simpan & Proses'}
        </button>
      </div>
    </div>
  );
}
