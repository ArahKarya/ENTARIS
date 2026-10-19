/**
 * Row types, labels and pure rules for the Stok & Produksi list tabs
 * (pages/InventoryPage.tsx). Kept free of React so they can be unit tested.
 */
import i18n from '@/i18n';
import { formatNumber, toNumber } from '@/lib/format';
import type { Paginated } from '@/components/shared';

export type Qty = string | number;

/** URL filter keys per list tab (each tab clears all of them on tab switch). */
export const ITEM_FILTER_KEYS = ['stockStatus', 'isActive', 'category', 'warehouseId'] as const;
export const MOVEMENT_FILTER_KEYS = ['itemId', 'warehouseId', 'movementType', 'status', 'startDate', 'endDate'] as const;
export const PRODUCTION_FILTER_KEYS = ['status', 'startDate', 'endDate'] as const;
export const SERVICE_FILTER_KEYS = ['isActive'] as const;

// Items

export type ItemStockStatus = 'out' | 'low' | 'ok';

export interface InventoryItemRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  category?: string | null;
  description?: string | null;
  currentStock: Qty;
  averageCost?: Qty;
  minimumStock: Qty;
  isActive: boolean;
  accountId?: string | null;
  /** Present in list mode (server-derived). */
  stockStatus?: ItemStockStatus;
}

export interface InventoryItemSummary {
  count: number;
  activeCount: number;
  lowCount: number;
  outCount: number;
  stockValue: number;
  categories: string[];
}

/** Same rule as the server (services/inventoryItemList.itemStockStatus). */
export function itemStockStatus(item: Pick<InventoryItemRow, 'currentStock' | 'minimumStock' | 'stockStatus'>): ItemStockStatus {
  if (item.stockStatus) return item.stockStatus;
  const cur = toNumber(item.currentStock) ?? 0;
  const min = toNumber(item.minimumStock) ?? 0;
  if (cur <= 0) return 'out';
  if (min > 0 && cur < min) return 'low';
  return 'ok';
}

/** Quantity with up to 3 decimals, e.g. "1.250,5". */
export const formatQty = (v: Qty | null | undefined): string => formatNumber(v, { maxDecimals: 3 });

/** Export rows in the import-template shape (kept from the old "Download"). */
export function toItemExportRows(items: readonly InventoryItemRow[]): Record<string, unknown>[] {
  return items.map((i) => ({
    code: i.code,
    name: i.name,
    unit: i.unit,
    category: i.category ?? '',
    description: i.description ?? '',
    currentStock: toNumber(i.currentStock) ?? 0,
    minimumStock: toNumber(i.minimumStock) ?? 0,
    openingQty: '',
    openingPrice: '',
  }));
}

// Stock movements

export type MovementType = 'In' | 'Out' | 'AdjustmentIn' | 'AdjustmentOut' | 'TransferIn' | 'TransferOut';

export const MOVEMENT_TYPES: readonly MovementType[] = ['In', 'Out', 'AdjustmentIn', 'AdjustmentOut', 'TransferIn', 'TransferOut'];

const isMovementType = (type: string): type is MovementType => (MOVEMENT_TYPES as readonly string[]).includes(type);

/** Movement type label in the current UI language. */
export const movementTypeLabel = (type: string): string =>
  isMovementType(type) ? i18n.t(`inventoryRows.movementType.${type}`, { ns: 'inventory' }) : type;

/**
 * Movement type labels, read through getters so every access follows the current language.
 * Prefer movementTypeLabel(); read it at render time, never into a module-level constant.
 */
export const MOVEMENT_TYPE_LABEL: Readonly<Record<MovementType, string>> = Object.defineProperties(
  {} as Record<MovementType, string>,
  Object.fromEntries(MOVEMENT_TYPES.map((t) => [t, { enumerable: true, get: () => movementTypeLabel(t) }])),
);

const INBOUND = new Set<string>(['In', 'AdjustmentIn', 'TransferIn']);

export const isInbound = (type: string): boolean => INBOUND.has(type);

/** Source documents of system-generated movements (label key: inventoryRows.referenceType.<type>). */
const REFERENCE_TYPES = [
  'GoodsReceipt',
  'PurchaseInvoice',
  'SalesInvoice',
  'SalesReturn',
  'DeliveryOrder',
  'ProductionRun',
  'StockOpname',
  'StockTransfer',
  'OpeningBalance',
] as const;
type ReferenceType = (typeof REFERENCE_TYPES)[number];
const isReferenceType = (type: string): type is ReferenceType => (REFERENCE_TYPES as readonly string[]).includes(type);

export const referenceTypeLabel = (type: string | null | undefined): string => {
  if (!type) return '';
  return isReferenceType(type) ? i18n.t(`inventoryRows.referenceType.${type}`, { ns: 'inventory' }) : type;
};

export interface StockMovementRow {
  id: string;
  movementNumber: string | null;
  date: string;
  itemId: string;
  warehouseId?: string | null;
  movementType: string;
  quantity: Qty;
  unitCost?: Qty;
  totalValue?: Qty | null;
  notes?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  referenceNumber?: string | null;
  offsetAccountId?: string | null;
  isCancelled: boolean;
  createdAt?: string;
  item?: { id: string; name: string; code: string; unit: string } | null;
  warehouse?: { id: string; name: string; code: string } | null;
  offsetAccount?: { id: string; name: string; accountNumber: string } | null;
}

export interface StockMovementSummary {
  count: number;
  cancelledCount: number;
  inCount: number;
  inQty: number;
  inValue: number;
  outCount: number;
  outQty: number;
  outValue: number;
}

/**
 * Mirrors the server's blocking rules (routes/inventory/movements.ts) so the
 * menu never offers an action that is always rejected:
 *  • STT (GoodsReceipt) movements: no edit, no cancel — revise/cancel the STT.
 *  • Production-run movements: no edit — edit the production run.
 */
export function movementEditBlock(m: Pick<StockMovementRow, 'referenceType' | 'isCancelled'>): string | null {
  if (m.isCancelled) return i18n.t('inventoryRows.block.cancelled', { ns: 'inventory' });
  if (m.referenceType === 'GoodsReceipt') return i18n.t('inventoryRows.block.editFromReceipt', { ns: 'inventory' });
  if (m.referenceType === 'ProductionRun') return i18n.t('inventoryRows.block.editFromProduction', { ns: 'inventory' });
  return null;
}

export function movementCancelBlock(m: Pick<StockMovementRow, 'referenceType' | 'isCancelled'>): string | null {
  if (m.isCancelled) return i18n.t('inventoryRows.block.cancelled', { ns: 'inventory' });
  if (m.referenceType === 'GoodsReceipt') return i18n.t('inventoryRows.block.cancelFromReceipt', { ns: 'inventory' });
  return null;
}

// Production runs

export interface ProductionRunLine {
  id: string;
  lineType: string;
  isByProduct?: boolean;
  quantity: Qty;
  unitPrice?: Qty | null;
  item?: { id: string; name: string; unit: string; code: string } | null;
}

export interface ProductionRunRow {
  id: string;
  runNumber: string;
  date: string;
  notes?: string | null;
  referenceNumber?: string | null;
  yieldPct?: Qty | null;
  isCancelled: boolean;
  items?: ProductionRunLine[];
  machine?: { id: string; code: string; name: string } | null;
}

export type ProductionDraftStatus = 'Draft' | 'PendingApproval' | 'Posted';

export interface ProductionDraftRow {
  id: string;
  draftNumber: string;
  date: string;
  notes?: string | null;
  status: ProductionDraftStatus;
  lastError?: string | null;
  postedRunId?: string | null;
  postedRunNumber?: string | null;
  createdAt: string;
  createdBy?: { id: string; fullName: string | null } | null;
  summary?: {
    inputQty: number;
    outputQty: number;
    inputCount: number;
    outputCount: number;
    mainOutput: string | null;
    inputNames: string[];
  } | null;
}

export interface ProductionDraftList extends Paginated<ProductionDraftRow> {
  counts?: Partial<Record<ProductionDraftStatus, number>>;
}

export interface ProductionRunSummary {
  count: number;
  activeCount: number;
  cancelledCount: number;
  inputQty: number;
  outputQty: number;
  byproductQty: number;
  yieldPct: number | null;
  unit: string | null;
}

export const isByProductLine = (l: ProductionRunLine): boolean => !!l.isByProduct || l.lineType === 'ByProduct';

export function splitRunLines(run: Pick<ProductionRunRow, 'items'>): { inputs: ProductionRunLine[]; outputs: ProductionRunLine[] } {
  const lines = run.items ?? [];
  return {
    inputs: lines.filter((l) => l.lineType === 'Input'),
    outputs: lines.filter((l) => l.lineType === 'Output' || l.lineType === 'ByProduct'),
  };
}

// Service items

export interface ServiceItemRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  defaultRate?: Qty | null;
  accountId?: string;
  description?: string | null;
  isActive: boolean;
  account?: { id: string; accountNumber: string; name: string } | null;
}

export const errorMessage = (err: unknown, fallback: string): string =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
