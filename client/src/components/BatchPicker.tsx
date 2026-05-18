import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Package } from 'lucide-react';
import api from '../lib/api';

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
export default function BatchPicker({ itemId, warehouseId, value, onChange, disabled, className }: Props) {
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

  const batches: Batch[] = useMemo(() => data?.data ?? [], [data]);
  const currentStock: number = data?.currentStock ?? 0;

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
  const mismatch = Math.abs(sumAvailable - currentStock) > 0.001;

  return (
    <div className={className}>
      <select
        value={value}
        onChange={(e) => {
          const id = e.target.value;
          const batch = batches.find(b => b.id === id) ?? null;
          onChange(id, batch);
        }}
        disabled={disabled}
        className="w-full border border-gray-200 rounded-lg py-1.5 px-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
      >
        <option value="">— Pakai WAC (tidak pilih batch) —</option>
        {batches.map((b) => (
          <option key={b.id} value={b.id}>
            {fmtDate(b.date)} — {fmtNum(b.qtyAvailable)} Kg tersedia (@ Rp {fmtRupiah(b.unitCost)}/Kg) — {b.sourceRef ?? b.movementNumber}
          </option>
        ))}
      </select>
      {isFetching && !isLoading && (
        <p className="text-[10px] text-gray-400 mt-0.5">Memuat ulang…</p>
      )}
      {mismatch && (
        <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
          <Package size={10} />
          Tersedia per batch ({fmtNum(sumAvailable)}) ≠ stok gudang ({fmtNum(currentStock)}).
          Selisih kemungkinan karena keluar via sales/transfer (belum ada batch-tracking di sana).
        </p>
      )}
    </div>
  );
}
