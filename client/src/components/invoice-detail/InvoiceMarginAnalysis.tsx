/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped (same as the legacy drawer) */
/**
 * Sales margin analysis (material WAC vs loaded HPP), shown when at least one
 * line has unitCostLoaded from a batch pick.
 */
import { cn } from '@/lib/utils';
import { formatRupiah } from '@/lib/format';
import {
  TableRegion,
} from '@/components/sales-a/overlay-parts';

export function InvoiceMarginAnalysis({ items }: { items: any[] }) {
  const productLines = items.filter((i: any) => i.inventoryItemId);
  if (productLines.length === 0) return null;
  const lineWithLoaded = productLines.filter((i: any) => i.unitCostLoaded != null);
  if (lineWithLoaded.length === 0) return null;
  const totalRev = productLines.reduce((s: number, i: any) => s + Number(i.amount), 0);
  const materialCost = productLines.reduce(
    (s: number, i: any) => s + Number(i.quantity) * Number(i.inventoryItem?.averageCost ?? 0),
    0,
  );
  const loadedCost = productLines.reduce(
    (s: number, i: any) =>
      s + Number(i.quantity) * Number(i.unitCostLoaded ?? i.inventoryItem?.averageCost ?? 0),
    0,
  );
  const matMargin = totalRev - materialCost;
  const loadMargin = totalRev - loadedCost;
  const matPct = totalRev > 0 ? (matMargin / totalRev) * 100 : 0;
  const loadPct = totalRev > 0 ? (loadMargin / totalRev) * 100 : 0;
  return (
    <div className="border-b border-border px-6 py-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-success-text">
        Margin Analysis ({lineWithLoaded.length}/{productLines.length} line tracked)
      </h3>
      <TableRegion label="Analisis margin" className="border-success/30 bg-success-subtle/30">
        <table className="w-full min-w-[420px] text-xs">
          <thead>
            <tr className="border-b border-success/30 bg-success-subtle text-success-text">
              <th scope="col" className="px-3 py-1.5 text-left font-semibold">Basis</th>
              <th scope="col" className="px-3 py-1.5 text-right font-semibold">Revenue (Produk)</th>
              <th scope="col" className="px-3 py-1.5 text-right font-semibold">COGS</th>
              <th scope="col" className="px-3 py-1.5 text-right font-semibold">Margin</th>
              <th scope="col" className="px-3 py-1.5 text-right font-semibold">%</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-success/20">
              <th scope="row" className="px-3 py-1.5 text-left font-normal text-foreground">Material (WAC)</th>
              <td className="px-3 py-1.5 text-right tabular-nums">{formatRupiah(totalRev)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{formatRupiah(materialCost)}</td>
              <td className={cn('px-3 py-1.5 text-right tabular-nums', matMargin >= 0 ? 'text-success-text' : 'text-danger-text')}>
                {formatRupiah(matMargin)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{matPct.toFixed(1)}%</td>
            </tr>
            <tr className="bg-success-subtle/50">
              <th scope="row" className="px-3 py-1.5 text-left font-medium text-foreground">Loaded HPP</th>
              <td className="px-3 py-1.5 text-right tabular-nums">{formatRupiah(totalRev)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{formatRupiah(loadedCost)}</td>
              <td className={cn('px-3 py-1.5 text-right font-semibold tabular-nums', loadMargin >= 0 ? 'text-success-text' : 'text-danger-text')}>
                {formatRupiah(loadMargin)}
              </td>
              <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{loadPct.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </TableRegion>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        Material basis = pakai WAC saat ini. Loaded basis = pakai HPP per batch
        (Phase 3: include biaya produksi & by-product NRV).
      </p>
    </div>
  );
}
