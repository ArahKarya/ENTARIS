/**
 * Pure helpers for the Invoice Pembelian list page (/purchase): row types,
 * the overdue rule, Excel export rows and the PurchaseInvoiceModal prefill
 * used by "Edit lengkap" (cancel + re-create) and approval resubmission.
 */
import i18n from '@/i18n';
import { formatDate, toNumber } from '@/lib/format';
import { getStatusLabel } from '@/lib/status';

type Money = string | number;

export interface PurchaseInvoiceItemRow {
  itemName?: string | null;
  /** Stored line type ('product' | 'service'); older rows may lack it. */
  itemType?: string | null;
  inventoryItemId?: string | null;
  warehouseId?: string | null;
  description?: string | null;
  quantity?: Money | null;
  unit?: string | null;
  rate?: Money | null;
  discount?: Money | null;
  taxPct?: Money | null;
  pphPct?: Money | null;
  potonganItem?: Money | null;
  amount?: Money | null;
  kualitas?: string | null;
  refaksi?: Money | null;
  timbanganTruk?: Money | null;
  timbanganDiterima?: Money | null;
  nomorMobil?: string | null;
  goodsReceiptItemId?: string | null;
}

export interface PurchaseInvoiceRow {
  id: string;
  invoiceNumber: string;
  partyId?: string;
  date: string;
  dueDate: string | null;
  status: string;
  grandTotal: Money;
  outstanding: Money;
  biayaLain?: Money | null;
  notes?: string | null;
  supplier?: { name: string; phone?: string | null } | null;
  items?: PurchaseInvoiceItemRow[];
}

export interface PurchaseInvoiceSummary {
  count: number;
  grandTotal: number;
  outstanding: number;
  paidCount: number;
  cancelledCount: number;
  overdueCount: number;
  overdueOutstanding: number;
}

export const num = (v: Money | null | undefined): number => toNumber(v) ?? 0;

/** Past due date and still owing (same rule as the server's overdue KPI). */
export function isPurchaseInvoiceOverdue(inv: Pick<PurchaseInvoiceRow, 'dueDate' | 'outstanding'>, now = new Date()): boolean {
  return !!inv.dueDate && new Date(inv.dueDate) < now && num(inv.outstanding) > 0;
}

/** Nothing paid yet → can be cancelled and re-created ("Edit lengkap"). */
export function canEditFull(inv: Pick<PurchaseInvoiceRow, 'status' | 'outstanding' | 'grandTotal'>): boolean {
  return inv.status !== 'Cancelled' && num(inv.outstanding) === num(inv.grandTotal);
}

type ExportHeader =
  | 'date' | 'documentNumber' | 'supplier' | 'phone' | 'dueDate' | 'productName' | 'description' | 'qty' | 'unit'
  | 'unitPrice' | 'discountPct' | 'vatPct' | 'pphPct' | 'itemDeduction' | 'itemSubtotal' | 'quality' | 'refraction'
  | 'truckWeight' | 'receivedWeight' | 'vehicleNo' | 'invoiceTotal' | 'paid' | 'outstanding' | 'status' | 'notes';

/** Export column title in the current UI language. */
const h = (key: ExportHeader): string => i18n.t(`purchasing:invoiceExport.columns.${key}`);

export function toPurchaseInvoiceExportRows(invoices: PurchaseInvoiceRow[], now = new Date()): Record<string, unknown>[] {
  return invoices.flatMap((inv) => {
    const totalPaid = num(inv.grandTotal) - num(inv.outstanding);
    const status = getStatusLabel(inv.status, 'purchase_invoice');
    const statusLabel = isPurchaseInvoiceOverdue(inv, now)
      ? i18n.t('purchasing:invoiceExport.overdueStatus', { status })
      : status;
    const items: Array<PurchaseInvoiceItemRow | null> = inv.items && inv.items.length > 0 ? inv.items : [null];
    return items.map((it) => ({
      [h('date')]: formatDate(inv.date),
      [h('documentNumber')]: inv.invoiceNumber,
      [h('supplier')]: inv.supplier?.name ?? '',
      [h('phone')]: inv.supplier?.phone ?? '',
      [h('dueDate')]: inv.dueDate ? formatDate(inv.dueDate) : '',
      [h('productName')]: it?.itemName ?? '',
      [h('description')]: it?.description ?? '',
      [h('qty')]: it ? num(it.quantity) : '',
      [h('unit')]: it?.unit ?? '',
      [h('unitPrice')]: it ? num(it.rate) : '',
      [h('discountPct')]: it ? num(it.discount) : '',
      [h('vatPct')]: it ? num(it.taxPct) : '',
      [h('pphPct')]: it ? num(it.pphPct) : '',
      [h('itemDeduction')]: it ? num(it.potonganItem) : '',
      [h('itemSubtotal')]: it ? num(it.amount) : '',
      [h('quality')]: it?.kualitas ?? '',
      [h('refraction')]: it?.refaksi != null ? num(it.refaksi) : '',
      [h('truckWeight')]: it?.timbanganTruk != null ? num(it.timbanganTruk) : '',
      [h('receivedWeight')]: it?.timbanganDiterima != null ? num(it.timbanganDiterima) : '',
      [h('vehicleNo')]: it?.nomorMobil ?? '',
      [h('invoiceTotal')]: num(inv.grandTotal),
      [h('paid')]: totalPaid,
      [h('outstanding')]: num(inv.outstanding),
      [h('status')]: statusLabel,
      [h('notes')]: inv.notes ?? '',
    }));
  });
}

/** Item shape of PurchaseInvoiceModal's `prefill.items`. */
export interface PurchaseInvoicePrefillItem {
  id: string;
  itemType: 'material' | 'service';
  itemName: string;
  inventoryItemId: string;
  warehouseId: string;
  description: string;
  unit: string;
  kualitas: string;
  refaksi: number;
  timbanganTruk: number;
  timbanganDiterima: number;
  rate: number;
  taxPct: number;
  pphPct: number;
  potonganItem: number;
  nomorMobil: string;
  goodsReceiptItemId?: string | null;
}

export interface PurchaseInvoicePrefill {
  date?: string;
  dueDate?: string;
  partyId?: string;
  notes?: string;
  biayaLain?: number;
  items: PurchaseInvoicePrefillItem[];
}

export interface PrefillSource {
  date?: string | null;
  dueDate?: string | null;
  partyId?: string;
  notes?: string | null;
  biayaLain?: Money | null;
  items?: PurchaseInvoiceItemRow[] | null;
}

const isoDay = (value: string | null | undefined) =>
  value ? new Date(value).toISOString().split('T')[0] : undefined;

/**
 * Modal prefill from an invoice ("Edit lengkap") or an approval payload
 * (resubmit). `keepLinks` carries the warehouse and STT line links over —
 * only the approval payload does that; "Edit lengkap" never did.
 */
export function toPurchaseInvoicePrefill(
  source: PrefillSource,
  { keepLinks, newId = () => crypto.randomUUID() }: { keepLinks: boolean; newId?: () => string },
): PurchaseInvoicePrefill {
  const items = (source.items ?? []).map((it): PurchaseInvoicePrefillItem => {
    // Stored 'service' type, or the legacy no-weight heuristic for older rows.
    const isService =
      !it.inventoryItemId && (it.itemType === 'service' || Number(it.timbanganDiterima ?? 0) === 0);
    const item: PurchaseInvoicePrefillItem = {
      id: newId(),
      itemType: isService ? 'service' : 'material',
      itemName: it.itemName ?? '',
      inventoryItemId: it.inventoryItemId ?? '',
      warehouseId: keepLinks ? (it.warehouseId ?? '') : '',
      description: it.description ?? '',
      unit: it.unit ?? (isService ? 'pcs' : 'Kg'),
      kualitas: it.kualitas ?? '',
      refaksi: Number(it.refaksi ?? 0),
      timbanganTruk: Number(it.timbanganTruk ?? 0),
      timbanganDiterima: Number(it.timbanganDiterima ?? it.quantity ?? 0),
      rate: Number(it.rate ?? 0),
      taxPct: Number(it.taxPct ?? 0),
      pphPct: Number(it.pphPct ?? 0),
      potonganItem: Number(it.potonganItem ?? 0),
      nomorMobil: it.nomorMobil ?? '',
    };
    return keepLinks ? { ...item, goodsReceiptItemId: it.goodsReceiptItemId ?? null } : item;
  });
  return {
    date: isoDay(source.date),
    dueDate: isoDay(source.dueDate),
    partyId: source.partyId,
    notes: source.notes ?? '',
    biayaLain: Number(source.biayaLain ?? 0),
    items,
  };
}
