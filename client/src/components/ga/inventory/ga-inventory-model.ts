/**
 * Types, constants and pure helpers for Inventaris Kantor (/ga/inventory):
 * GA's own sparepart / ATK stock per location, separate from the accounting
 * inventory (no GL). Endpoint base: /ga/inventory.
 */
import api from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { labelMap } from '../eam-i18n';

export type GaMovementType = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT';
export type GaStockState = 'out' | 'low' | 'ok';

export interface GaCategoryOption {
  id: string;
  code: string;
  name: string;
  type?: 'SPAREPART' | 'CONSUMABLE';
}

export interface GaLocationOption {
  id: string;
  code: string;
  name: string;
}

/** Row of GET /ga/inventory/items (both modes). */
export interface GaItemRow {
  id: string;
  sku: string;
  name: string;
  uom: string;
  minStock: number;
  imagePath?: string | null;
  isActive: boolean;
  totalStock: number;
  lowStock: boolean;
  category?: { code: string; name: string; type?: string } | null;
  /** Paged mode with `locationId`: quantity at that location. */
  locationStock?: number;
}

export interface GaItemSummary {
  count: number;
  activeCount: number;
  okCount: number;
  lowCount: number;
  outCount: number;
}

export interface GaMovementRow {
  id: string;
  type: GaMovementType;
  quantity: number;
  referenceNo?: string | null;
  notes?: string | null;
  createdAt: string;
  item?: { sku: string; name: string; uom: string } | null;
  fromLocation?: { code: string; name?: string } | null;
  toLocation?: { code: string; name?: string } | null;
}

export interface GaInventoryDashboard {
  summary: {
    totalItems: number;
    activeItems: number;
    totalQty: number;
    lowStockCount: number;
    outOfStockCount: number;
    locationCount: number;
    categoryCount: number;
    movements30d: number;
    itemsMoved30d: number;
  };
  movementTotals: Record<GaMovementType, { count: number; qty: number }>;
  byCategory: { name: string; type: string; items: number; qty: number }[];
  byLocation: { code: string; name: string; items: number; qty: number }[];
  lowStockItems: {
    id: string;
    sku: string;
    name: string;
    uom: string;
    category: string;
    totalStock: number;
    minStock: number;
    shortfall: number;
  }[];
  recentMovements: GaMovementRow[];
}

export const ITEMS_ENDPOINT = '/ga/inventory/items';
export const MOVEMENTS_ENDPOINT = '/ga/inventory/movements';
/** Query-key root shared by every GA inventory query (invalidate after writes). */
export const GA_INVENTORY_KEY = 'ga-inventory';

export const ITEM_FILTER_KEYS = ['categoryId', 'locationId', 'stockStatus'] as const;
export const MOVEMENT_FILTER_KEYS = ['type', 'locationId', 'startDate', 'endDate'] as const;

export const MOVEMENT_TYPES: readonly GaMovementType[] = ['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT'];
export const MOVEMENT_LABEL: Record<GaMovementType, string> = labelMap(MOVEMENT_TYPES, 'gaInventory.movementType');

/** Secure item image endpoint; `imagePath` busts the cache when the image changes. */
export function itemImageUrl(id: string, imagePath?: string | null): string {
  return `${api.defaults.baseURL ?? '/api'}/ga/inventory/items/${id}/image?v=${encodeURIComponent(imagePath ?? '')}`;
}

/** Same rule as the server (services/gaInventoryList): out ≤ 0, low < minimum. */
export function gaStockState(item: Pick<GaItemRow, 'totalStock' | 'lowStock'>): GaStockState {
  if (item.totalStock <= 0) return 'out';
  return item.lowStock ? 'low' : 'ok';
}

export const formatQty = (v: number | null | undefined): string => formatNumber(v, { maxDecimals: 2 });

/** Signed quantity for adjustments ("+3", "−2"); other types are always positive. */
export function formatMovementQty(m: Pick<GaMovementRow, 'type' | 'quantity'>): string {
  if (m.type !== 'ADJUSTMENT') return formatQty(m.quantity);
  if (m.quantity > 0) return `+${formatQty(m.quantity)}`;
  if (m.quantity < 0) return `−${formatQty(Math.abs(m.quantity))}`;
  return formatQty(0);
}

/** Which locations a movement type needs (same rules as the server). */
export function movementNeeds(type: GaMovementType): { from: boolean; to: boolean } {
  return {
    from: type === 'OUT' || type === 'TRANSFER',
    to: type === 'IN' || type === 'TRANSFER' || type === 'ADJUSTMENT',
  };
}

export function errorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown } } })?.response?.data;
  return typeof data?.error === 'string' ? data.error : fallback;
}

/** "Lokasi" text for a movement row: "GD-A → GD-B", "→ GD-B", "GD-A →". */
export function movementRoute(m: Pick<GaMovementRow, 'fromLocation' | 'toLocation'>): string {
  const from = m.fromLocation?.name ?? m.fromLocation?.code;
  const to = m.toLocation?.name ?? m.toLocation?.code;
  if (from && to) return `${from} → ${to}`;
  if (to) return `→ ${to}`;
  if (from) return `${from} →`;
  return '—';
}
