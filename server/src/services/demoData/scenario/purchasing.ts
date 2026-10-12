// Purchasing chains, all through the real handlers:
//   PO -> STT (partial + rest) -> PI from STT lines -> payment
//   STT without PO (farmer group) -> PI -> payment
//   trade goods STT -> PI, packaging STT -> PI
// Supplier invoices of the two older windows are paid; the latest window stays open as payables.

import { ITEM_WAREHOUSE } from './setup';
import { addDays, num, windowDate, ymd, type DemoContext } from '../context';

export type Line = { id: string; inventoryItemId: string | null; itemName: string; quantity: string | number; unit: string };
type Doc = { id: string; items?: Line[] };

/** Purchase invoices created so far, shared with later events (payments, deposits, approvals). */
export interface PurchaseState {
  invoices: Array<{ id: string; partyKey: string; total: number }>;
}

export async function withItems(ctx: DemoContext, path: string, doc: Doc): Promise<Line[]> {
  if (doc.items?.length) return doc.items;
  const full = await ctx.api.get<Doc>(ctx.admin, `${path}/${doc.id}`);
  return full.items ?? [];
}

export async function receiveGoods(
  ctx: DemoContext,
  date: Date,
  partyKey: string,
  lines: Array<{ key: string; qty: number; cost: number; poItemId?: string }>,
  purchaseOrderId?: string,
  actor = ctx.admin,
): Promise<Line[]> {
  const { data } = await ctx.api.post<Doc>(actor, '/goods-receipts', {
    date: ymd(date),
    partyId: ctx.parties[partyKey],
    ...(purchaseOrderId ? { purchaseOrderId } : {}),
    nomorMobil: 'B 9123 DMO',
    driverName: 'Pak Darto',
    items: lines.map((l) => {
      const item = ctx.items[l.key];
      return {
        inventoryItemId: item.id,
        warehouseId: ctx.warehouses[ITEM_WAREHOUSE[l.key]],
        itemName: item.name,
        quantity: l.qty,
        unit: item.unit,
        lockedUnitCost: l.cost,
        ...(l.poItemId ? { purchaseOrderItemId: l.poItemId } : {}),
      };
    }),
  });
  return withItems(ctx, '/goods-receipts', data);
}

export function purchaseInvoiceBody(ctx: DemoContext, date: Date, partyKey: string, sttLines: Line[], rateFor: (line: Line) => number) {
  return {
    date: ymd(date),
    dueDate: ymd(addDays(date, 30)),
    partyId: ctx.parties[partyKey],
    items: sttLines.map((l) => ({
      itemName: l.itemName,
      inventoryItemId: l.inventoryItemId,
      goodsReceiptItemId: l.id,
      quantity: num(l.quantity),
      unit: l.unit,
      rate: rateFor(l),
    })),
  };
}

async function billSupplier(ctx: DemoContext, state: PurchaseState, date: Date, partyKey: string, sttLines: Line[], rateFor: (line: Line) => number) {
  const { data } = await ctx.api.post<{ id: string; grandTotal: string }>(ctx.admin, '/purchase/invoices', purchaseInvoiceBody(ctx, date, partyKey, sttLines, rateFor));
  const inv = { id: data.id, partyKey, total: num(data.grandTotal) };
  state.invoices.push(inv);
  return inv;
}

function payLater(ctx: DemoContext, w: number, inv: () => { partyKey: string; total: number } | undefined): void {
  if (w >= 2) return;
  ctx.schedule(windowDate(ctx, w + 1, 1), 'Pelunasan Supplier', async () => {
    const i = inv();
    if (!i) return;
    await ctx.api.post(ctx.admin, '/payments', {
      date: ymd(windowDate(ctx, w + 1, 1)),
      partyId: ctx.parties[i.partyKey],
      amount: i.total,
      paymentType: 'Pay',
      accountId: ctx.accounts.bank,
      notes: 'Pelunasan tagihan Supplier',
    });
  });
}

const priceByItem = (ctx: DemoContext, prices: Record<string, number>) => (l: Line) =>
  prices[Object.entries(ctx.items).find(([, i]) => i.id === l.inventoryItemId)?.[0] ?? ''] ?? 0;

export function schedulePurchasing(ctx: DemoContext, state: PurchaseState): void {
  for (let w = 0; w < 3; w++) {
    // 1. Planned gabah purchase: PO, two partial receipts, one invoice for both.
    const s: { poId?: string; poLineId?: string; stt: Line[]; pi?: { partyKey: string; total: number } } = { stt: [] };
    ctx.schedule(windowDate(ctx, w, 2), 'Purchase Order gabah', async () => {
      const { data: po } = await ctx.api.post<Doc & { approvalRequestId?: string | null }>(ctx.admin, '/purchase-orders', {
        date: ymd(windowDate(ctx, w, 2)),
        partyId: ctx.parties.gabahLestari,
        expectedDeliveryDate: ymd(windowDate(ctx, w, 9)),
        paymentTermDays: 30,
        warehouseId: ctx.warehouses.plant,
        notes: 'Pembelian gabah musim panen',
        items: [{ inventoryItemId: ctx.items.gabah.id, itemName: ctx.items.gabah.name, quantity: 24_000, unit: 'Kg', estimatedRate: 6800 }],
        saveAs: 'submit',
      });
      // A company approval rule may hold the PO; the demo admin approves it like a manager would.
      if (po.approvalRequestId) await ctx.api.post(ctx.admin, `/approvals/requests/${po.approvalRequestId}/approve`, { notes: 'Disetujui' });
      s.poId = po.id;
      s.poLineId = (await withItems(ctx, '/purchase-orders', po))[0]?.id;
    });
    for (const [day, qty] of [[5, 14_000], [9, 10_000]] as const) {
      ctx.schedule(windowDate(ctx, w, day), 'Penerimaan gabah (STT) dari PO', async () => {
        s.stt.push(...(await receiveGoods(ctx, windowDate(ctx, w, day), 'gabahLestari', [{ key: 'gabah', qty, cost: 6800, poItemId: s.poLineId }], s.poId)));
      });
    }
    // The supplier bills slightly above the PO price; the variance goes to inventory.
    ctx.schedule(windowDate(ctx, w, 10), 'Invoice pembelian gabah', async () => {
      s.pi = await billSupplier(ctx, state, windowDate(ctx, w, 10), 'gabahLestari', s.stt, () => 6850);
    });
    payLater(ctx, w, () => s.pi);

    // 2. Direct receipt from the farmer group, no PO.
    const f: { pi?: { partyKey: string; total: number } } = {};
    ctx.schedule(windowDate(ctx, w, 7), 'Gabah petani tanpa PO', async () => {
      const lines = await receiveGoods(ctx, windowDate(ctx, w, 7), 'kelompokTani', [{ key: 'gabah', qty: 6_000, cost: 6700 }]);
      f.pi = await billSupplier(ctx, state, windowDate(ctx, w, 7), 'kelompokTani', lines, () => 6700);
    });
    payLater(ctx, w, () => f.pi);

    // 3. Trade goods for the distribution warehouse.
    const t: { pi?: { partyKey: string; total: number } } = {};
    ctx.schedule(windowDate(ctx, w, 12), 'Pembelian barang dagang', async () => {
      const lines = await receiveGoods(ctx, windowDate(ctx, w, 12), 'minyakPrima', [
        { key: 'minyak', qty: 240, cost: 31_000 },
        { key: 'gula', qty: 360, cost: 15_400 },
      ]);
      t.pi = await billSupplier(ctx, state, windowDate(ctx, w, 12), 'minyakPrima', lines, priceByItem(ctx, { minyak: 31_000, gula: 15_400 }));
    });
    payLater(ctx, w, () => t.pi);
  }

  // 4. Packaging, once.
  const k: { pi?: { partyKey: string; total: number } } = {};
  ctx.schedule(windowDate(ctx, 0, 4), 'Pembelian karung', async () => {
    const lines = await receiveGoods(ctx, windowDate(ctx, 0, 4), 'kemasPlast', [{ key: 'karung', qty: 2_000, cost: 2200 }]);
    k.pi = await billSupplier(ctx, state, windowDate(ctx, 0, 4), 'kemasPlast', lines, () => 2200);
  });
  payLater(ctx, 0, () => k.pi);
}
