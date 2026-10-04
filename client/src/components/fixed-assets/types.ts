/** Shapes returned by /api/fixed-assets (Decimal columns arrive as strings). */

export type Money = string | number;

export interface AccountRef {
  id?: string;
  accountNumber: string;
  name: string;
}

export interface DepreciationEntryRow {
  id: string;
  periodDate: string;
  amount: Money;
  isPosted: boolean;
  journalEntryId: string | null;
}

export interface FixedAssetRow {
  id: string;
  assetNumber: string;
  name: string;
  category: string;
  description: string | null;
  acquisitionDate: string;
  acquisitionCost: Money;
  usefulLifeMonths: number;
  salvageValue: Money;
  depreciationMethod: string;
  accumulatedDepreciation: Money;
  bookValue: Money;
  status: string;
  disposalDate?: string | null;
  disposalAmount?: Money | null;
  assetAccount: AccountRef;
  depreciationAccount: AccountRef;
  accumulatedDepAccount: AccountRef;
  user?: { fullName: string } | null;
  depreciationEntries?: DepreciationEntryRow[];
}

export interface CoaOption {
  id: string;
  accountNumber: string;
  name: string;
  isGroup?: boolean;
}

/** GET /fixed-assets/summary/by-category (active assets only). */
export interface CategorySummaryRow {
  category: string;
  count: number;
  total_cost: number;
  total_accumulated: number;
  total_book_value: number;
}

export interface BulkPreviewItem {
  assetNumber: string;
  name: string;
  category: string;
  amount: number;
  periodDate: string;
}

/** POST /fixed-assets/depreciate-bulk (dry run or posting). */
export interface BulkDepreciationResponse {
  posted: number;
  totalAmount: number;
  jeNumbers?: string[];
  skipped?: number;
  message?: string;
  dryRun?: boolean;
  items?: BulkPreviewItem[];
}

/** One single-period posting waiting for confirmation. */
export interface DepreciationPostTarget {
  assetId: string;
  assetName: string;
  assetNumber: string;
  entryId: string;
  periodDate: string;
  amount: number;
  depAccount: string;
  accumAccount: string;
}

export const ACTIVE_STATUS = 'Active';

export const FIXED_ASSET_ENDPOINT = '/fixed-assets';
/** Register filters kept in the URL (each is also an API param). */
export const FIXED_ASSET_FILTER_KEYS = ['status', 'category', 'startDate', 'endDate'] as const;
export type FixedAssetFilterKey = (typeof FIXED_ASSET_FILTER_KEYS)[number];
