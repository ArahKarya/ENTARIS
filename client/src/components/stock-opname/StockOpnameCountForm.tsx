/**
 * Stock opname count entry (/stock-opname?opname=new).
 * Logic unchanged from the original page: all active items are sent (audit
 * trail), blank actual = system stock, blank unit cost = average cost
 * (filled = revaluation). Only markup/tokens were modernised.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatNumber, formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Field, LoadingState, PageHeader, StatCard } from '@/components/shared';
import { WarehouseSelectField } from '@/components/overlays/WarehouseSelectField';

interface OpnameItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  currentStock: string | number;
  averageCost: string | number;
  isDummy?: boolean;
}

const qty = (v: number) => formatNumber(v, { maxDecimals: 3 });

interface Props {
  breadcrumb: React.ReactNode;
  onBack: () => void;
  onSuccess: () => void;
}

export function StockOpnameCountForm({ breadcrumb, onBack, onSuccess }: Props) {
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
  // total, so counting warehouse B only doesn't accidentally adjust warehouse A.
  const { data: itemsRaw, isLoading } = useQuery({
    queryKey: ['inventory-items-opname', warehouseId],
    queryFn: () => api
      .get('/inventory/items', { params: { limit: 500, isActive: true, ...(warehouseId ? { warehouseId } : {}) } })
      .then((r) => r.data),
  });
  const items: OpnameItem[] = useMemo(() => {
    const raw: OpnameItem[] = Array.isArray(itemsRaw) ? itemsRaw : (itemsRaw?.data ?? []);
    return raw.filter((i) => !i.isDummy);
  }, [itemsRaw]);

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const s = search.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(s) || i.code.toLowerCase().includes(s));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unchanged from the original form
  }, [items, actualStocks, unitCosts]);

  const handleSubmit = async () => {
    // Build items array — include ALL items (even unchanged for audit trail)
    const opnameItems = items.map((item) => ({
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
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(message || 'Gagal menyimpan stok opname.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* PageHeader hides breadcrumbs below sm; keep a way back on phones. */}
      <div className="sm:hidden">{breadcrumb}</div>
      <PageHeader
        breadcrumb={breadcrumb}
        title="Buat Stok Opname"
        description="Isi stok fisik hasil hitung. Kolom kosong dianggap sama dengan stok sistem."
      />

      {/* Header */}
      <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-3">
        <Field label="Tanggal" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <WarehouseSelectField
          label="Gudang"
          required
              value={warehouseId}
              onChange={(id) => {
                // Reset entered values when switching warehouse — "Stok Sistem"
                // changes so the existing entries no longer mean the same thing.
                setWarehouseId(id);
                setActualStocks({});
              }}
          autoDefault
          placeholder="Pilih gudang opname..."
        />
        <Field label="Catatan">
          <Input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsional..." />
        </Field>
      </div>
      {!warehouseId && (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning-subtle p-3 text-sm text-warning-text">
          Pilih gudang dulu untuk menampilkan stok sistem per gudang.
        </p>
      )}

      {/* Summary */}
      <section aria-label="Ringkasan perubahan" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Item Berubah" value={formatNumber(summary.changed)} />
        <StatCard label="Surplus" value={formatRupiah(summary.surplus)} />
        <StatCard label="Defisit" value={formatRupiah(summary.deficit)} />
      </section>

      {/* Search */}
      <div className="relative">
        <label htmlFor="opname-item-search" className="sr-only">
          Cari item
        </label>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id="opname-item-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          placeholder="Cari item..."
        />
      </div>

      {/* Items table */}
      {isLoading ? (
        <LoadingState label="Memuat lembar hitung…" />
      ) : (
        <div
          className="overflow-x-auto rounded-lg border border-border bg-card"
          role="region"
          aria-label="Daftar item untuk dihitung"
          // Focusable so keyboard users can scroll the wide count table.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
        >
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2">Kode</th>
                <th scope="col" className="px-3 py-2">Nama Item</th>
                <th scope="col" className="px-3 py-2">Satuan</th>
                <th scope="col" className="px-3 py-2 text-right">Stok Sistem</th>
                <th scope="col" className="w-36 px-3 py-2 text-right">Stok Aktual</th>
                <th scope="col" className="px-3 py-2 text-right">Selisih</th>
                <th scope="col" className="w-40 px-3 py-2 text-right">Nilai/Satuan</th>
                <th scope="col" className="px-3 py-2 text-right">Nilai Selisih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredItems.map((item) => {
                const systemStock = Number(item.currentStock);
                const avgCost = Number(item.averageCost);
                const actual = getActualStock(item.id, systemStock);
                const cost = getUnitCost(item.id, avgCost);
                const diff = actual - systemStock;
                const costChanged = cost !== avgCost;
                const val = Math.abs(diff) * cost;

                return (
                  <tr
                    key={item.id}
                    className={cn(
                      diff > 0 && 'bg-success-subtle/40',
                      diff < 0 && 'bg-danger-subtle/40',
                      diff === 0 && costChanged && 'bg-warning-subtle/40',
                    )}
                  >
                    <td className="num px-3 py-2 font-mono text-xs">{item.code}</td>
                    <td className="px-3 py-2 text-foreground">{item.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{item.unit}</td>
                    <td className="num px-3 py-2 text-right">{qty(systemStock)}</td>
                    <td className="px-3 py-2">
                      <NumberInput
                        step="any"
                        min="0"
                        className="num text-right"
                        aria-label={`Stok aktual ${item.name}`}
                        placeholder={qty(systemStock)}
                        value={actualStocks[item.id] ?? ''}
                        onChange={(e) => handleActualChange(item.id, e.target.value)}
                      />
                    </td>
                    <td
                      className={cn(
                        'num px-3 py-2 text-right font-semibold',
                        diff > 0 && 'text-success-text',
                        diff < 0 && 'text-danger-text',
                      )}
                    >
                      {diff !== 0 ? (diff > 0 ? '+' : '') + qty(diff) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <NumberInput
                        step="any"
                        min="0"
                        className={cn('num text-right', costChanged && 'border-warning')}
                        aria-label={`Nilai per satuan ${item.name}`}
                        placeholder={qty(avgCost)}
                        value={unitCosts[item.id] ?? ''}
                        onChange={(e) => handleCostChange(item.id, e.target.value)}
                        title="Kosongkan untuk memakai HPP rata-rata. Diisi = revaluasi nilai persediaan."
                      />
                    </td>
                    <td className="num px-3 py-2 text-right whitespace-nowrap">
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
        <Button variant="outline" onClick={onBack}>
          Batal
        </Button>
        <Button onClick={handleSubmit} loading={submitting} disabled={submitting || !warehouseId}>
          {submitting ? 'Menyimpan...' : 'Simpan & Proses'}
        </Button>
      </div>
    </div>
  );
}
