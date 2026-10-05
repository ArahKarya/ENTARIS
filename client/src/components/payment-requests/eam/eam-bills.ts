/**
 * Types and pure helpers for the "Tagihan EAM" tab of Pengajuan Pembayaran
 * (formerly /ga/finance). GET /payment-requests/eam merges three EAM sources
 * and does search, date range, sorting and paging on the server; the page
 * only maps URL filters to request params and renders the rows.
 */
import { Receipt, Wrench, PackageSearch, type LucideIcon } from 'lucide-react';
import type { StatusTone } from '@/lib/status';

export type BillKind = 'VEHICLE_TAX' | 'SERVICE_LOG' | 'MATERIAL_REQUEST';
export const BILL_KINDS: readonly BillKind[] = ['VEHICLE_TAX', 'SERVICE_LOG', 'MATERIAL_REQUEST'];

export interface LinkedDoc {
  id: string;
  entryNumber?: string;
  invoiceNumber?: string;
  status: string;
  outstanding?: number | string;
}

export interface GaBill {
  kind: BillKind;
  id: string;
  ref: string;
  date: string | null;
  assetCode: string | null;
  assetName: string | null;
  description: string;
  amount: number;
  status: string;
  defaultAccountNumber: string;
  journalEntry: LinkedDoc | null;
  purchaseInvoice: LinkedDoc | null;
  notes?: string | null;
  items?: { itemName: string; quantity: number; uom: string; unitPrice: number }[];
}

export interface EamSummary {
  /** Unposted bills overall (all kinds, ignores filters) — the tab badge. */
  pendingCount: number;
  pendingAmount: number;
  /** Rows matching the current filters. */
  matchedCount: number;
  matchedAmount: number;
}

export const KIND_META: Record<BillKind, { label: string; short: string; icon: LucideIcon }> = {
  VEHICLE_TAX: { label: 'Pajak / STNK / KIR', short: 'Pajak kendaraan', icon: Receipt },
  SERVICE_LOG: { label: 'Service Kendaraan', short: 'Service', icon: Wrench },
  MATERIAL_REQUEST: { label: 'Permintaan Sparepart (MR)', short: 'Sparepart (MR)', icon: PackageSearch },
};

/** URL filter keys (each also drives the request or the client filter). */
export const EAM_FILTER_KEYS = ['kind', 'posting', 'startDate', 'endDate'] as const;
export type EamFilterKey = (typeof EAM_FILTER_KEYS)[number];

/** `posting` filter: empty = the queue (not yet posted); sent to the server as `pending`. */
export type PostingFilter = '' | 'posted' | 'all';
export const POSTING_OPTIONS = [
  { value: 'posted', label: 'Sudah diposting' },
  { value: 'all', label: 'Semua tagihan' },
];
export const POSTING_DEFAULT_LABEL = 'Menunggu posting';

/** Same rule as before: a bill is "posted" once it has a journal or a purchase invoice. */
export const isPosted = (b: Pick<GaBill, 'journalEntry' | 'purchaseInvoice'>) => !!b.journalEntry || !!b.purchaseInvoice;

export interface BillState {
  label: string;
  /** Compact label for narrow screens. */
  short: string;
  tone: StatusTone;
  /** Linked document number, when posted. */
  doc?: string;
}

export function billState(b: GaBill): BillState {
  if (b.journalEntry) return { label: 'Diposting', short: 'Diposting', tone: 'success', doc: b.journalEntry.entryNumber };
  if (b.purchaseInvoice) {
    return { label: 'Difakturkan', short: 'Difakturkan', tone: 'info', doc: b.purchaseInvoice.invoiceNumber };
  }
  return { label: 'Menunggu posting', short: 'Menunggu', tone: 'warning' };
}

/** "Bearing ×4, V-Belt ×2 +1 lain" — first two items of a material request. */
export function itemsSummary(items: GaBill['items']): string {
  if (!items || items.length === 0) return '';
  const head = items.slice(0, 2).map((i) => `${i.itemName} ×${i.quantity}`).join(', ');
  return items.length > 2 ? `${head} +${items.length - 2} lain` : head;
}
