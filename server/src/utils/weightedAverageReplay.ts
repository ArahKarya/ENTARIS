import Decimal from 'decimal.js';
import { calcWeightedAverage } from './weightedAverage';

/**
 * Weighted-average-cost (WAC) REPLAY.
 *
 * A blend cannot be undone, so after a cancel/edit the average is re-derived by
 * replaying ALL remaining movements in original order (createdAt, then id) with the
 * same rules as `calcWeightedAverage`. Averaging inbounds in one shot is wrong: it
 * ignores stock consumed in between and negative-stock windows.
 *
 * Rules:
 *  - cancelled movements are skipped;
 *  - In / AdjustmentIn with unitCost > 0 -> WAC blend, then stock += qty;
 *  - In / AdjustmentIn with unitCost <= 0 -> stock += qty, avg untouched
 *    (customer-owned goods, zero-cost inbound never dilute the avg);
 *  - In from SalesReturn and AdjustmentIn from StockOpname are stock-only:
 *    the live paths restock at the original/current cost WITHOUT touching avg;
 *  - Out / AdjustmentOut -> stock -= qty, avg untouched;
 *  - TransferIn / TransferOut -> stock only (item-level they net to zero).
 *
 * Pure function: no I/O, no mutation of its input.
 */

export type ReplayMovementType =
  | 'In'
  | 'Out'
  | 'AdjustmentIn'
  | 'AdjustmentOut'
  | 'TransferIn'
  | 'TransferOut';

export interface ReplayMovement {
  id: string;
  movementType: ReplayMovementType;
  quantity: number | string | Decimal;
  unitCost: number | string | Decimal;
  /** Processing order (DB created_at), NOT the user-entered document date. */
  createdAt: Date | string | number;
  referenceType?: string | null;
  isCancelled?: boolean;
}

export interface ReplayResult {
  /** Replayed average, or `fallbackAverageCost` when no costed inbound remains. */
  averageCost: number;
  /** Running stock after the replay (can be negative). */
  stock: number;
  /** True when at least one inbound movement contributed to the average. */
  hasCostedInbound: boolean;
}

/** Inbound types that blend into the average (subject to the ref rules below). */
const COSTED_IN_TYPES = new Set<ReplayMovementType>(['In', 'AdjustmentIn']);
const STOCK_IN_TYPES = new Set<ReplayMovementType>(['In', 'AdjustmentIn', 'TransferIn']);

/** True when this movement blends into the average on the live (incremental) path. */
export function movementBlendsAverage(m: Pick<ReplayMovement, 'movementType' | 'unitCost' | 'referenceType'>): boolean {
  if (!COSTED_IN_TYPES.has(m.movementType)) return false;
  if (new Decimal(m.unitCost.toString()).lte(0)) return false;
  if (m.movementType === 'In' && m.referenceType === 'SalesReturn') return false;
  if (m.movementType === 'AdjustmentIn' && m.referenceType === 'StockOpname') return false;
  return true;
}

const toMillis = (v: Date | string | number): number =>
  v instanceof Date ? v.getTime() : new Date(v).getTime();

/** Chronological order = createdAt, then id (deterministic tiebreak). */
export function sortMovementsForReplay<T extends Pick<ReplayMovement, 'id' | 'createdAt'>>(movements: readonly T[]): T[] {
  return [...movements].sort((a, b) => {
    const d = toMillis(a.createdAt) - toMillis(b.createdAt);
    if (d !== 0) return d;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export interface ReplayOptions {
  /** Returned when no costed inbound remains (never zero an item). */
  fallbackAverageCost: number | string | Decimal;
  /** Stock/avg base before the first movement (default 0 / 0). */
  openingStock?: number | string | Decimal;
  openingAverageCost?: number | string | Decimal;
}

export function replayWeightedAverage(
  movements: readonly ReplayMovement[],
  options: ReplayOptions,
): ReplayResult {
  let stock = new Decimal((options.openingStock ?? 0).toString());
  let avg = new Decimal((options.openingAverageCost ?? 0).toString());
  let hasCostedInbound = false;

  for (const m of sortMovementsForReplay(movements)) {
    if (m.isCancelled) continue;
    const qty = new Decimal(m.quantity.toString());
    if (movementBlendsAverage(m)) {
      avg = new Decimal(calcWeightedAverage(stock, avg, qty, new Decimal(m.unitCost.toString())));
      hasCostedInbound = true;
    }
    stock = STOCK_IN_TYPES.has(m.movementType) ? stock.plus(qty) : stock.minus(qty);
  }

  const resolved = hasCostedInbound ? avg : new Decimal(options.fallbackAverageCost.toString());
  return {
    averageCost: resolved.toDecimalPlaces(2).toNumber(),
    stock: stock.toNumber(),
    hasCostedInbound,
  };
}
