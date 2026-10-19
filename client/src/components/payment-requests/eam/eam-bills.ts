/**
 * Types and pure helpers for the EAM bills tab. The server merges the three EAM
 * sources and does search, sorting and paging; the page only maps URL filters.
 */
import { Receipt, Wrench, PackageSearch, type LucideIcon } from 'lucide-react';
import type { StatusTone } from '@/lib/status';
import { tEam } from '@/components/ga/eam-i18n';

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

const KIND_ICON: Record<BillKind, LucideIcon> = { VEHICLE_TAX: Receipt, SERVICE_LOG: Wrench, MATERIAL_REQUEST: PackageSearch };

/** Labels are translated on every read. */
export const KIND_META: Record<BillKind, { label: string; short: string; icon: LucideIcon }> = Object.fromEntries(
  BILL_KINDS.map((kind) => [
    kind,
    {
      icon: KIND_ICON[kind],
      get label() { return tEam(`eamBills.kind.${kind}.label`); },
      get short() { return tEam(`eamBills.kind.${kind}.short`); },
    },
  ]),
) as Record<BillKind, { label: string; short: string; icon: LucideIcon }>;

/** URL filter keys (each also drives the request or the client filter). */
export const EAM_FILTER_KEYS = ['kind', 'posting', 'startDate', 'endDate'] as const;
export type EamFilterKey = (typeof EAM_FILTER_KEYS)[number];

/** `posting` filter: empty = the queue (not yet posted); sent to the server as `pending`. */
export type PostingFilter = '' | 'posted' | 'all';
export const POSTING_OPTIONS = [
  { value: 'posted', get label() { return tEam('eamBills.posting.posted'); } },
  { value: 'all', get label() { return tEam('eamBills.posting.all'); } },
];
/** Label of the default (empty) posting filter. */
export const postingDefaultLabel = (): string => tEam('eamBills.posting.pending');

/** A bill is "posted" once it has a journal or a purchase invoice. */
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
  if (b.journalEntry) {
    const label = tEam('eamBills.state.posted');
    return { label, short: label, tone: 'success', doc: b.journalEntry.entryNumber };
  }
  if (b.purchaseInvoice) {
    const label = tEam('eamBills.state.invoiced');
    return { label, short: label, tone: 'info', doc: b.purchaseInvoice.invoiceNumber };
  }
  return { label: tEam('eamBills.state.pending'), short: tEam('eamBills.state.pendingShort'), tone: 'warning' };
}

/** "Bearing ×4, V-Belt ×2 +1 lain" — first two items of a material request. */
export function itemsSummary(items: GaBill['items']): string {
  if (!items || items.length === 0) return '';
  const head = items.slice(0, 2).map((i) => `${i.itemName} ×${i.quantity}`).join(', ');
  return items.length > 2 ? tEam('eamBills.itemsMore', { head, count: items.length - 2 }) : head;
}
