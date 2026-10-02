import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Package } from 'lucide-react';
import api from '../lib/api';
import Select from './Select';

export interface Batch {
  id: string;
  movementNumber: string;
  date: string;
  qtyInbound: number;
  unitCost: number;
  qtyConsumed: number;
  qtyAvailable: number;
  sourceType: string;
  sourceRef: string | null;
  sourceRefId: string | null;
}

interface Props {
  itemId: string;
  warehouseId: string;
  value: string;             // selected batch id ('' = no pick / WAC mode)
  onChange: (batchId: string, batch: Batch | null) => void;
  disabled?: boolean;
  className?: string;
  // Batch id yang sudah dipakai baris LAIN di form yang sama (item+gudang sama).
  // Disembunyikan dari dropdown agar tidak terpilih dobel. Batch yang sedang
  // dipilih baris ini sendiri (value) tetap muncul.
  excludeIds?: Iterable<string>;
}

const fmtDate = (s: string) => {
  try {
    return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch {
    return s;
  }
};

const fmtNum = (val: number) =>
  Number(val).toLocaleString('id-ID', { maximumFractionDigits: 3 });

const fmtRupiah = (val: number) =>
  Number(val).toLocaleString('id-ID', { maximumFractionDigits: 4 });

// BatchPicker — dropdown for picking a specific inbound batch (StockMovement)
// for a production input. Shows available batches with date, qty available,
// and unit cost. Empty string value means "no specific batch" — server will
// fall back to WAC-based costing (legacy behavior, still supported).
export default function BatchPicker({ itemId, warehouseId, value, onChange, disabled, className, excludeIds }: Props) {
  const enabled = !!itemId && !!warehouseId;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['item-batches', itemId, warehouseId],
    queryFn: () =>
      api
        .get(`/inventory/items/${itemId}/batches`, { params: { warehouseId } })
        .then(r => r.data),
    enabled,
    staleTime: 30_000,
  });

  // Sembunyikan batch yang sudah dipakai baris lain (cegah dobel), kecuali
  // batch yang sedang dipilih baris ini sendiri.
  const excludeKey = useMemo(() => [...(excludeIds ?? [])].sort().join(','), [excludeIds]);
  const batches: Batch[] = useMemo(() => {
    const all: Batch[] = data?.data ?? [];
    const excl = new Set(excludeKey ? excludeKey.split(',') : []);
    return all.filter(b => b.id === value || !excl.has(b.id));
  }, [data, excludeKey, value]);

  if (!enabled) {
    return (
      <div className={`text-xs text-gray-400 italic ${className ?? ''}`}>
        Pilih item & gudang dulu untuk lihat batch.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`flex items-center gap-1.5 text-xs text-gray-400 ${className ?? ''}`}>
        <Loader2 size={11} className="animate-spin" />
        Memuat batch…
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className={`text-xs text-gray-400 italic ${className ?? ''}`}>
        Tidak ada batch tersedia untuk item ini di gudang terpilih.
        Sistem akan pakai WAC saat submit.
      </div>
    );
  }

  const sumAvailable = batches.reduce((s, b) => s + b.qtyAvailable, 0);

  return (
    <div className={className}>
      <Select
        value={value}
        onChange={(e) => {
          const id = e.target.value;
          const batch = batches.find(b => b.id === id) ?? null;
          onChange(id, batch);
        }}
        disabled={disabled}
        className="w-full"
      >
        <option value="">— Pakai WAC (tidak pilih batch) —</option>
        {batches.map((b) => (
          <option key={b.id} value={b.id}>
            {fmtDate(b.date)} — {fmtNum(b.qtyAvailable)} Kg tersedia (@ Rp {fmtRupiah(b.unitCost)}/Kg) — {b.sourceRef ?? b.movementNumber}
          </option>
        ))}
      </Select>
      <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
        <Package size={10} />
        {batches.length} batch · total {fmtNum(sumAvailable)} Kg tersedia (FIFO sudah serap outbound legacy)
        {isFetching && !isLoading && <span className="ml-1 text-gray-300">memuat ulang…</span>}
      </p>
    </div>
  );
}
