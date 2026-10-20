import Decimal from 'decimal.js';

// Hitung baris + total dokumen penjualan (Quotation, Proforma Invoice). Satu sumber agar angka konsisten.

export interface ResolvedItem {
  itemType: string;
  inventoryItemId: string | null;
  serviceItemId: string | null;
  accountId: string | null;
  itemName: string;
  quantity: number;
  unit: string;
  rate: number;
  discount: number;
  amount: number;
  taxPct: number;
  pphPct: number;
  description: string | null;
}

export interface RawLineItem {
  itemType?: string | null;
  inventoryItemId?: string | null;
  serviceItemId?: string | null;
  accountId?: string | null;
  itemName: string;
  quantity: Decimal.Value;
  unit?: string | null;
  rate: Decimal.Value;
  discount?: Decimal.Value | null;
  taxPct?: Decimal.Value | null;
  pphPct?: Decimal.Value | null;
  description?: string | null;
}

export function resolveItems(items: RawLineItem[]): ResolvedItem[] {
  return items.map((it) => {
    const qty = new Decimal(it.quantity);
    const rate = new Decimal(it.rate);
    const discount = new Decimal(it.discount ?? 0);
    const gross = qty.times(rate);
    const amount = gross.minus(gross.times(discount).div(100)).toDecimalPlaces(2);
    return {
      itemType: it.itemType ?? 'product',
      inventoryItemId: it.inventoryItemId || null,
      serviceItemId: it.serviceItemId || null,
      accountId: it.accountId || null,
      itemName: it.itemName,
      quantity: qty.toNumber(),
      unit: it.unit ?? 'Kg',
      rate: rate.toNumber(),
      discount: discount.toNumber(),
      amount: amount.toNumber(),
      taxPct: Number(it.taxPct ?? 0),
      pphPct: Number(it.pphPct ?? 0),
      description: it.description ?? null,
    };
  });
}

export function computeTotals(items: ResolvedItem[], potongan: number, biayaLain: number) {
  const subtotal = items.reduce((sum, it) => sum.plus(new Decimal(it.amount)), new Decimal(0));
  const taxAmount = items.reduce(
    (sum, it) => sum.plus(new Decimal(it.amount).times(new Decimal(it.taxPct).div(100))),
    new Decimal(0),
  ).toDecimalPlaces(2);
  const pphAmount = items.reduce(
    (sum, it) => sum.plus(new Decimal(it.amount).times(new Decimal(it.pphPct).div(100))),
    new Decimal(0),
  ).toDecimalPlaces(2);
  const grandTotal = subtotal
    .plus(taxAmount)
    .minus(pphAmount)
    .minus(new Decimal(potongan ?? 0))
    .plus(new Decimal(biayaLain ?? 0))
    .toDecimalPlaces(2);
  return { subtotal: subtotal.toNumber(), taxAmount: taxAmount.toNumber(), pphAmount: pphAmount.toNumber(), grandTotal: grandTotal.toNumber() };
}
