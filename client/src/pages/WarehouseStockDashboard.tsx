import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pdf } from '@react-pdf/renderer';
import { ChevronDown, ChevronRight, Loader2, Warehouse as WhIcon, Star, AlertTriangle, Search, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { useCompanySettings } from '../contexts/CompanySettingsContext';
import WarehouseStockPDF, { type WarehouseBlock } from '../lib/pdf/WarehouseStockPDF';

interface Warehouse {
  id: string;
  code: string;
  name: string;
  location: string | null;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  itemCount?: number;
  totalStock?: number;
}

interface InventoryStockRow {
  id: string;
  itemId: string;
  warehouseId: string;
  currentStock: number | string;
  item: {
    id: string;
    code: string;
    name: string;
    unit: string;
    averageCost: number | string;
  };
}

interface WarehouseDetail extends Warehouse {
  stocks: InventoryStockRow[];
}

function StockSection({ warehouse, search }: { warehouse: Warehouse; search: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['warehouse-detail', warehouse.id],
    queryFn: async () => {
      const res = await api.get(`/warehouses/${warehouse.id}`);
      return res.data as WarehouseDetail;
    },
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mx-auto" />
      </div>
    );
  }

  const allRows = data?.stocks ?? [];
  // Backend already filters out zero stock; we keep negatives.
  const filtered = search
    ? allRows.filter((s) => {
        const q = search.toLowerCase();
        return s.item.name.toLowerCase().includes(q) || s.item.code.toLowerCase().includes(q);
      })
    : allRows;

  if (filtered.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {search ? 'Tidak ada item cocok dengan pencarian.' : 'Tidak ada stok di gudang ini.'}
      </div>
    );
  }

  const negativeCount = filtered.filter((s) => Number(s.currentStock) < 0).length;
  const totalValue = filtered.reduce(
    (sum, s) => sum + Number(s.currentStock) * Number(s.item.averageCost ?? 0),
    0,
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs px-1">
        <span className="text-muted-foreground">
          <span className="font-mono tabular-nums text-foreground">{filtered.length}</span> jenis item
        </span>
        {negativeCount > 0 && (
          <span className="text-red-600 inline-flex items-center gap-1">
            <AlertTriangle size={12} />
            <span className="font-mono tabular-nums">{negativeCount}</span> stok negatif
          </span>
        )}
        <span className="text-muted-foreground">
          Nilai buku: <span className="font-mono tabular-nums text-foreground">
            Rp {totalValue.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
          </span>
        </span>
      </div>
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-28">Kode</th>
              <th>Nama</th>
              <th className="w-20">Satuan</th>
              <th className="text-right w-32">Stok</th>
              <th className="text-right w-36">Avg. Cost</th>
              <th className="text-right w-40">Nilai</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const qty = Number(s.currentStock);
              const cost = Number(s.item.averageCost ?? 0);
              const value = qty * cost;
              const isNegative = qty < 0;
              return (
                <tr key={s.id}>
                  <td>
                    <span className="font-mono text-xs text-foreground bg-muted px-1.5 py-0.5 rounded">
                      {s.item.code}
                    </span>
                  </td>
                  <td className="font-medium text-foreground">{s.item.name}</td>
                  <td className="text-xs text-muted-foreground">{s.item.unit}</td>
                  <td className={cn(
                    'text-right font-mono tabular-nums',
                    isNegative ? 'text-red-600 font-semibold' : 'text-foreground',
                  )}>
                    {qty.toLocaleString('id-ID', { maximumFractionDigits: 3 })}
                  </td>
                  <td className="text-right font-mono tabular-nums text-muted-foreground">
                    {cost > 0 ? cost.toLocaleString('id-ID', { maximumFractionDigits: 0 }) : '—'}
                  </td>
                  <td className={cn(
                    'text-right font-mono tabular-nums',
                    isNegative ? 'text-red-600' : 'text-foreground',
                  )}>
                    {value !== 0 ? `Rp ${value.toLocaleString('id-ID', { maximumFractionDigits: 0 })}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

interface SnapshotItem {
  code: string; name: string; unit: string;
  qty: number; averageCost: number; value: number;
}
interface SnapshotWarehouse {
  code: string; name: string; location: string | null;
  isDefault: boolean; items: SnapshotItem[];
}
interface StockSnapshotResponse {
  asOfDate: string;
  valuationNote: string;
  warehouses: SnapshotWarehouse[];
}

export const WarehouseStockDashboard = () => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [asOfDate, setAsOfDate] = useState(today());
  const company = useCompanySettings();

  const { data: warehouses, isLoading } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const res = await api.get('/warehouses?active=true');
      return res.data.data as Warehouse[];
    },
  });

  // Unduh PDF posisi stok "as of" tanggal terpilih. Selalu pakai snapshot
  // endpoint (riwayat pergerakan) — utk tanggal hari ini, hasilnya sama dgn
  // stok live, tapi konsisten satu jalur.
  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      const res = await api.get('/warehouses/stock-snapshot', { params: { date: asOfDate } });
      const snap = res.data as StockSnapshotResponse;

      const blocks: WarehouseBlock[] = snap.warehouses.map((w) => ({
        code: w.code,
        name: w.name,
        location: w.location,
        isDefault: w.isDefault,
        items: w.items.map((s) => ({
          code: s.code,
          name: s.name,
          unit: s.unit,
          currentStock: s.qty,
          averageCost: s.averageCost,
        })),
      }));

      const blob = await pdf(
        <WarehouseStockPDF
          warehouses={blocks}
          generatedAt={new Date()}
          asOfDate={snap.asOfDate}
          valuationNote={snap.valuationNote}
          company={{ name: company?.companyName ?? 'Perusahaan', address: company?.address }}
        />,
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Stok-Per-Gudang_${asOfDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Gagal membuat PDF.');
    } finally {
      setIsDownloading(false);
    }
  };

  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const expandAll = () => {
    if (!warehouses) return;
    setExpanded(Object.fromEntries(warehouses.map((w) => [w.id, true])));
  };
  const collapseAll = () => setExpanded({});

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dashboard Stok per Gudang</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tabel menampilkan stok terkini. Unduh PDF mengambil posisi stok per tanggal terpilih.
            Item dengan stok 0 disembunyikan. Stok negatif ditandai merah.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={expandAll} className="btn-secondary text-xs">Buka semua</button>
          <button onClick={collapseAll} className="btn-secondary text-xs">Tutup semua</button>
          <div className="flex items-center gap-1.5 border border-border rounded-lg px-2 py-1 bg-card">
            <span className="text-xs text-muted-foreground">Posisi tgl:</span>
            <input
              type="date"
              value={asOfDate}
              max={today()}
              onChange={(e) => setAsOfDate(e.target.value || today())}
              className="bg-transparent text-xs focus:outline-none text-foreground"
            />
          </div>
          <button
            onClick={handleDownloadPDF}
            disabled={isDownloading || !warehouses || warehouses.length === 0}
            className="btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            title="Unduh stok posisi per tanggal terpilih"
          >
            {isDownloading ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
            Unduh PDF
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl px-3 py-2 flex items-center gap-2">
        <Search size={14} className="text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari item (nama / kode)..."
          className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Reset
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
        </div>
      ) : !warehouses || warehouses.length === 0 ? (
        <div className="py-16 text-center bg-card border border-border rounded-xl">
          <WhIcon className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-40" />
          <p className="text-sm text-muted-foreground">Belum ada gudang aktif.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {warehouses.map((w) => {
            const isOpen = !!expanded[w.id];
            return (
              <div key={w.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => toggle(w.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-accent/50 transition-colors text-left"
                >
                  {isOpen
                    ? <ChevronDown size={16} className="text-muted-foreground shrink-0" />
                    : <ChevronRight size={16} className="text-muted-foreground shrink-0" />}
                  <span className="font-mono text-xs text-foreground bg-muted px-1.5 py-0.5 rounded">{w.code}</span>
                  <span className="font-medium text-foreground inline-flex items-center gap-1.5">
                    {w.name}
                    {w.isDefault && <Star size={12} className="text-amber-500 fill-amber-500" />}
                  </span>
                  {w.location && <span className="text-xs text-muted-foreground">— {w.location}</span>}
                  <div className="ml-auto flex items-center gap-4 text-xs">
                    <span className="text-muted-foreground">
                      <span className="font-mono tabular-nums text-foreground">{w.itemCount ?? 0}</span> item
                    </span>
                    <span className="text-muted-foreground">
                      Total: <span className="font-mono tabular-nums text-foreground">
                        {Number(w.totalStock ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 3 })}
                      </span>
                    </span>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-border bg-background/50">
                    <div className="pt-3">
                      <StockSection warehouse={w} search={search} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default WarehouseStockDashboard;
