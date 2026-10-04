/**
 * Pure helpers for Tagihan Aset & Umum (/ga/finance). The queue endpoint
 * (GET /ga/finance/bills) merges three EAM sources and returns every matching
 * bill at once, so search, date range and sorting run on the client here;
 * `kind` and the posting state map to the endpoint's `kind` / `includePaid`.
 */
import { Receipt, Wrench, PackageSearch, type LucideIcon } from 'lucide-react';
import type { ListSort } from '@/hooks/useListState';
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

export interface GaBillsResponse {
  bills: GaBill[];
  summary: { pendingCount: number; pendingAmount: number };
}

export const KIND_META: Record<BillKind, { label: string; short: string; icon: LucideIcon }> = {
  VEHICLE_TAX: { label: 'Pajak / STNK / KIR', short: 'Pajak kendaraan', icon: Receipt },
  SERVICE_LOG: { label: 'Service Kendaraan', short: 'Service', icon: Wrench },
  MATERIAL_REQUEST: { label: 'Permintaan Sparepart (MR)', short: 'Sparepart (MR)', icon: PackageSearch },
};

/** URL filter keys (each also drives the request or the client filter). */
export const GA_FILTER_KEYS = ['kind', 'posting', 'startDate', 'endDate'] as const;
export type GaFilterKey = (typeof GA_FILTER_KEYS)[number];

/** `posting` filter: empty = the queue (not yet posted), like the page always opened. */
export type PostingFilter = '' | 'posted' | 'all';
export const POSTING_OPTIONS = [
  { value: 'posted', label: 'Sudah diposting' },
  { value: 'all', label: 'Semua tagihan' },
];
export const POSTING_DEFAULT_LABEL = 'Menunggu posting';

export const GA_SORT_FIELDS = ['date', 'amount', 'kind', 'asset'] as const;

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

/** Request params for GET /ga/finance/bills. */
export function billsRequestParams(filters: { kind?: string; posting?: string }) {
  const kind = BILL_KINDS.includes(filters.kind as BillKind) ? (filters.kind as BillKind) : 'ALL';
  const includePaid = filters.posting === 'posted' || filters.posting === 'all';
  return { kind, includePaid };
}

/** Calendar day (YYYY-MM-DD) of an ISO timestamp in the browser's time zone. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface BillFilter {
  search?: string;
  posting?: string;
  startDate?: string;
  endDate?: string;
}

/** Client-side filters: search text, posted-only view and date range. */
export function filterBills(bills: readonly GaBill[], f: BillFilter): GaBill[] {
  const q = f.search?.trim().toLowerCase() ?? '';
  return bills.filter((b) => {
    if (f.posting === 'posted' && !isPosted(b)) return false;
    if (q) {
      const hay = [b.description, b.assetName ?? '', b.assetCode ?? '', b.ref].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.startDate || f.endDate) {
      const day = b.date ? localDay(b.date) : '';
      if (!day) return false;
      if (f.startDate && day < f.startDate) return false;
      if (f.endDate && day > f.endDate) return false;
    }
    return true;
  });
}

const text = (a: string, b: string) => a.localeCompare(b, 'id', { sensitivity: 'base' });

/** Sorted copy; no sort keeps the server order. Undated bills go last when sorting by date. */
export function sortBills(bills: readonly GaBill[], sort: ListSort | null): GaBill[] {
  if (!sort || !(GA_SORT_FIELDS as readonly string[]).includes(sort.id)) return [...bills];
  const sign = sort.desc ? -1 : 1;
  return [...bills].sort((a, b) => {
    switch (sort.id) {
      case 'date': {
        if (!a.date || !b.date) return a.date === b.date ? 0 : a.date ? -1 : 1;
        return (new Date(a.date).getTime() - new Date(b.date).getTime()) * sign;
      }
      case 'amount':
        return (a.amount - b.amount) * sign;
      case 'kind':
        return text(KIND_META[a.kind].label, KIND_META[b.kind].label) * sign;
      default:
        return text(a.assetName ?? '', b.assetName ?? '') * sign;
    }
  });
}

export function sumAmount(bills: readonly GaBill[]): number {
  return bills.reduce((s, b) => s + (Number(b.amount) || 0), 0);
}

/** "Bearing ×4, V-Belt ×2 +1 lain" — first two items of a material request. */
export function itemsSummary(items: GaBill['items']): string {
  if (!items || items.length === 0) return '';
  const head = items.slice(0, 2).map((i) => `${i.itemName} ×${i.quantity}`).join(', ');
  return items.length > 2 ? `${head} +${items.length - 2} lain` : head;
}
