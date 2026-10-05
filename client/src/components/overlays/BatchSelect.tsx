/**
 * Batch (inbound movement) dropdown for production / transfer lines. Same data,
 * query key and semantics as the legacy BatchPicker, but built on the Radix
 * Select so it works inside a modal dialog. Empty value = no batch (WAC).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Package } from 'lucide-react';
import api from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Batch } from '@/components/BatchPicker';

interface BatchSelectProps {
  itemId: string;
  warehouseId: string;
  /** Selected batch id ('' = none / WAC). */
  value: string;
  onChange: (batchId: string, batch: Batch | null) => void;
  /** Accessible name of the dropdown. */
  label: string;
  disabled?: boolean;
  /** Batch ids already used by other lines (hidden, except this line's own). */
  excludeIds?: Iterable<string>;
}

const NONE = '__none';

const fmtDate = (s: string) => {
  try {
    return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch {
    return s;
  }
};
const fmtNum = (val: number) => Number(val).toLocaleString('id-ID', { maximumFractionDigits: 3 });
const fmtRupiah = (val: number) => Number(val).toLocaleString('id-ID', { maximumFractionDigits: 4 });

export function BatchSelect({ itemId, warehouseId, value, onChange, label, disabled, excludeIds }: BatchSelectProps) {
  const enabled = !!itemId && !!warehouseId;
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['item-batches', itemId, warehouseId],
    queryFn: () =>
      api.get(`/inventory/items/${itemId}/batches`, { params: { warehouseId } }).then((r) => r.data),
    enabled,
    staleTime: 30_000,
  });

  const excludeKey = useMemo(() => [...(excludeIds ?? [])].sort().join(','), [excludeIds]);
  const batches: Batch[] = useMemo(() => {
    const all: Batch[] = data?.data ?? [];
    const excl = new Set(excludeKey ? excludeKey.split(',') : []);
    return all.filter((b) => b.id === value || !excl.has(b.id));
  }, [data, excludeKey, value]);

  if (!enabled) {
    return <p className="text-xs italic text-muted-foreground">Pilih item &amp; gudang dulu untuk lihat batch.</p>;
  }
  if (isLoading) {
    return (
      <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" aria-hidden /> Memuat batch…
      </p>
    );
  }
  if (batches.length === 0) {
    return (
      <p className="text-xs italic text-muted-foreground">
        Tidak ada batch tersedia untuk item ini di gudang terpilih. Sistem akan pakai WAC saat submit.
      </p>
    );
  }
  const sumAvailable = batches.reduce((s, b) => s + b.qtyAvailable, 0);

  return (
    <div className="space-y-1">
      <Select
        value={value || NONE}
        onValueChange={(v) => {
          const id = v === NONE ? '' : v;
          onChange(id, batches.find((b) => b.id === id) ?? null);
        }}
        disabled={disabled}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— Pakai WAC (tidak pilih batch) —</SelectItem>
          {batches.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {fmtDate(b.date)} — {fmtNum(b.qtyAvailable)} Kg tersedia (@ Rp {fmtRupiah(b.unitCost)}/Kg) — {b.sourceRef ?? b.movementNumber}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Package className="size-3" aria-hidden />
        {batches.length} batch · total {fmtNum(sumAvailable)} Kg tersedia (FIFO sudah serap outbound legacy)
        {isFetching && !isLoading && <span className="ml-1">memuat ulang…</span>}
      </p>
    </div>
  );
}
