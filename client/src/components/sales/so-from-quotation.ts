// Prefill for "Buat Pesanan dari Penawaran": a SalesOrderModal target without id.

type Money = string | number;

export interface QuotationForSalesOrder {
  id: string;
  quotationNumber: string;
  partyId: string;
  status: string;
  notes?: string | null;
  potongan?: Money | null;
  biayaLain?: Money | null;
  taxPct?: Money | null;
  salesInvoice?: { id: string } | null;
  salesOrders?: Array<{ id: string; soNumber: string }> | null;
  items?: Array<{
    inventoryItemId?: string | null;
    itemName: string;
    quantity: Money;
    unit?: string | null;
    rate: Money;
    discount?: Money | null;
    description?: string | null;
  }> | null;
}

export interface SalesOrderPrefill {
  quotationId: string;
  quotationNumber: string;
  partyId: string;
  notes: string;
  potongan: number;
  biayaLain: number;
  taxPct: number;
  items: Array<{
    inventoryItemId: string;
    itemName: string;
    quantity: number;
    unit: string;
    rate: number;
    discount: number;
    description: string;
  }>;
}

/** An SO can be made from an Accepted quotation not yet billed or ordered. */
export function canCreateSalesOrderFromQuotation(q: QuotationForSalesOrder | null | undefined): boolean {
  return !!q && q.status === 'Accepted' && !q.salesInvoice && (q.salesOrders ?? []).length === 0;
}

export function quotationToSalesOrderPrefill(q: QuotationForSalesOrder): SalesOrderPrefill {
  return {
    quotationId: q.id,
    quotationNumber: q.quotationNumber,
    partyId: q.partyId,
    notes: q.notes ?? '',
    potongan: Number(q.potongan ?? 0),
    biayaLain: Number(q.biayaLain ?? 0),
    taxPct: Number(q.taxPct ?? 0),
    items: (q.items ?? []).map((it) => ({
      inventoryItemId: it.inventoryItemId ?? '',
      itemName: it.itemName,
      quantity: Number(it.quantity),
      unit: it.unit || 'Kg',
      rate: Number(it.rate),
      discount: Number(it.discount ?? 0),
      description: it.description ?? '',
    })),
  };
}
