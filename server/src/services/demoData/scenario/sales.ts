// Sales chains, all through the real handlers:
//   SO -> DO (full or partial, linking a temporary note) -> invoice from DO lines -> receipt
//   direct DO -> invoice, service invoice (milling fee), sales return, customer deposit + apply
//   last window only: inquiry -> quotation -> SO, open/rejected quotations, open temporary note
// Invoices of the two older windows are collected in the next window, except one customer that
// stays overdue; the latest window stays open as receivables.

import { ITEM_WAREHOUSE } from './setup';
import { withItems, type Line } from './purchasing';
import { addDays, num, windowDate, ymd, type DemoContext } from '../context';

type Want = { key: string; qty: number };

export interface SalesState {
  invoices: Array<{ id: string; partyKey: string; total: number; window: number }>;
}

/** Customers that never pay in the demo, so aging shows overdue receivables. */
const SLOW_PAYERS = new Set(['koperasi']);

const keyOfItem = (ctx: DemoContext, id: string | null) => Object.entries(ctx.items).find(([, i]) => i.id === id)?.[0] ?? '';

function soLines(ctx: DemoContext, wants: Want[]) {
  return wants.map(({ key, qty }) => {
    const i = ctx.items[key];
    return { inventoryItemId: i.id, itemName: i.name, quantity: qty, unit: i.unit, rate: i.sellPrice, amount: qty * i.sellPrice };
  });
}

async function createSalesOrder(ctx: DemoContext, date: Date, partyKey: string, wants: Want[], quotationId?: string) {
  const { data } = await ctx.api.post<{ id: string; items?: Line[] }>(ctx.admin, '/sales-orders', {
    date: ymd(date),
    partyId: ctx.parties[partyKey],
    expectedDelivery: ymd(addDays(date, 3)),
    ...(quotationId ? { quotationId } : {}),
    items: soLines(ctx, wants),
  });
  await ctx.api.post(ctx.admin, `/sales-orders/${data.id}/submit`);
  return { id: data.id, lines: await withItems(ctx, '/sales-orders', data) };
}

async function deliverFromOrder(ctx: DemoContext, date: Date, so: { id: string; lines: Line[] }, share: number, temporaryNoteIds: string[] = []) {
  const { data } = await ctx.api.post<{ id: string; items?: Line[] }>(ctx.admin, `/sales-orders/${so.id}/generate-do`, {
    date: ymd(date),
    nomorMobil: 'B 9456 DMO',
    driverName: 'Pak Yusuf',
    recipientName: 'Bagian gudang',
    ...(temporaryNoteIds.length ? { temporaryNoteIds } : {}),
    items: so.lines.map((l) => ({
      salesOrderItemId: l.id,
      quantity: Math.round(num(l.quantity) * share),
      warehouseId: ctx.warehouses[ITEM_WAREHOUSE[keyOfItem(ctx, l.inventoryItemId)]],
    })),
  });
  return withItems(ctx, '/delivery-orders', data);
}

async function deliverDirect(ctx: DemoContext, date: Date, partyKey: string, wants: Want[]) {
  const { data } = await ctx.api.post<{ id: string; items?: Line[] }>(ctx.admin, '/delivery-orders', {
    date: ymd(date),
    partyId: ctx.parties[partyKey],
    nomorMobil: 'B 9456 DMO',
    driverName: 'Pak Yusuf',
    items: wants.map(({ key, qty }) => ({
      inventoryItemId: ctx.items[key].id,
      itemName: ctx.items[key].name,
      quantity: qty,
      unit: ctx.items[key].unit,
      warehouseId: ctx.warehouses[ITEM_WAREHOUSE[key]],
    })),
  });
  return withItems(ctx, '/delivery-orders', data);
}

async function invoiceDelivery(ctx: DemoContext, state: SalesState, w: number, date: Date, partyKey: string, doLines: Line[]) {
  const { data } = await ctx.api.post<{ id: string; grandTotal: string }>(ctx.admin, '/sales/invoices', {
    date: ymd(date),
    dueDate: ymd(addDays(date, 30)),
    partyId: ctx.parties[partyKey],
    items: doLines.map((l) => ({
      itemName: l.itemName,
      inventoryItemId: l.inventoryItemId,
      deliveryOrderItemId: l.id,
      quantity: num(l.quantity),
      unit: l.unit,
      rate: ctx.items[keyOfItem(ctx, l.inventoryItemId)].sellPrice,
    })),
  });
  const inv = { id: data.id, partyKey, total: num(data.grandTotal), window: w };
  state.invoices.push(inv);
  return inv;
}

function collectLater(ctx: DemoContext, w: number, partyKey: string, inv: () => { total: number } | undefined, day = 5): void {
  if (w >= 2 || SLOW_PAYERS.has(partyKey)) return;
  ctx.schedule(windowDate(ctx, w + 1, day), 'Penerimaan pembayaran', async () => {
    const i = inv();
    if (!i) return;
    await ctx.api.post(ctx.admin, '/payments', {
      date: ymd(windowDate(ctx, w + 1, day)),
      partyId: ctx.parties[partyKey],
      amount: i.total,
      paymentType: 'Receive',
      accountId: ctx.accounts.bank,
      notes: 'Transfer pelunasan invoice',
    });
  });
}

function scheduleWindow(ctx: DemoContext, state: SalesState, w: number): void {
  // SO delivered in full, invoiced the next day.
  const a: { so?: { id: string; lines: Line[] }; inv?: { total: number } } = {};
  ctx.schedule(windowDate(ctx, w, 4), 'Sales Order', async () => {
    a.so = await createSalesOrder(ctx, windowDate(ctx, w, 4), 'tokoBerkah', [{ key: 'berasPremium', qty: 2000 }, { key: 'berasMedium', qty: 1300 }]);
  });
  ctx.schedule(windowDate(ctx, w, 6), 'Surat Jalan dari SO', async () => {
    const lines = await deliverFromOrder(ctx, windowDate(ctx, w, 6), a.so!, 1, w === 2 && ctx.temporaryNote ? [ctx.temporaryNote] : []);
    a.inv = await invoiceDelivery(ctx, state, w, windowDate(ctx, w, 7), 'tokoBerkah', lines);
  });
  collectLater(ctx, w, 'tokoBerkah', () => a.inv);

  // SO delivered in two parts, each part invoiced.
  const b: { so?: { id: string; lines: Line[] }; inv: Array<{ total: number }> } = { inv: [] };
  ctx.schedule(windowDate(ctx, w, 14), 'Sales Order distributor', async () => {
    b.so = await createSalesOrder(ctx, windowDate(ctx, w, 14), 'mitraNiaga', [{ key: 'berasPremium', qty: 4500 }]);
  });
  for (const [day, share] of [[15, 2 / 3], [22, 1 / 3]] as const) {
    ctx.schedule(windowDate(ctx, w, day), 'Pengiriman bertahap', async () => {
      const lines = await deliverFromOrder(ctx, windowDate(ctx, w, day), b.so!, share);
      b.inv.push(await invoiceDelivery(ctx, state, w, windowDate(ctx, w, day + 1), 'mitraNiaga', lines));
    });
  }
  collectLater(ctx, w, 'mitraNiaga', () => (b.inv.length ? { total: b.inv.reduce((s, i) => s + i.total, 0) } : undefined), 8);

  // Direct deliveries without an order.
  const direct: Array<[number, string, Want[]]> = [
    [11, 'warungSari', [{ key: 'minyak', qty: 40 }, { key: 'gula', qty: 60 }]],
    [19, 'koperasi', [{ key: 'dedak', qty: 1500 }, { key: 'berasMedium', qty: 600 }]],
    [25, 'lumbungPangan', [{ key: 'berasPremium', qty: 1200 }, { key: 'minyak', qty: 120 }]],
  ];
  for (const [day, partyKey, wants] of direct) {
    const d: { inv?: { total: number } } = {};
    ctx.schedule(windowDate(ctx, w, day), 'Surat Jalan langsung', async () => {
      const lines = await deliverDirect(ctx, windowDate(ctx, w, day), partyKey, wants);
      d.inv = await invoiceDelivery(ctx, state, w, windowDate(ctx, w, day), partyKey, lines);
    });
    collectLater(ctx, w, partyKey, () => d.inv, 10);
  }

  // Milling service for a customer who brings their own paddy.
  const s: { inv?: { total: number } } = {};
  ctx.schedule(windowDate(ctx, w, 18), 'Invoice jasa giling', async () => {
    const svc = ctx.serviceItems.milling;
    const { data } = await ctx.api.post<{ id: string; grandTotal: string }>(ctx.admin, '/sales/invoices', {
      date: ymd(windowDate(ctx, w, 18)),
      dueDate: ymd(addDays(windowDate(ctx, w, 18), 14)),
      partyId: ctx.parties.lumbungPangan,
      items: [{ itemType: 'service', serviceItemId: svc.id, itemName: svc.name, quantity: 20_000, unit: 'Kg', rate: svc.rate }],
    });
    s.inv = { total: num(data.grandTotal) };
    state.invoices.push({ id: data.id, partyKey: 'lumbungPangan', total: num(data.grandTotal), window: w });
  });
  collectLater(ctx, w, 'lumbungPangan', () => s.inv, 12);
}

export function scheduleSales(ctx: DemoContext, state: SalesState): void {
  // A temporary delivery note goes out before the order is processed and is linked to the DO later.
  ctx.schedule(windowDate(ctx, 2, 3), 'Surat Jalan Sementara', async () => {
    const { data } = await ctx.api.post<{ id: string }>(ctx.admin, '/temporary-delivery-notes', {
      date: ymd(windowDate(ctx, 2, 3)),
      partyId: ctx.parties.tokoBerkah,
      nomorMobil: 'B 9456 DMO',
      driverName: 'Pak Yusuf',
      notes: 'Dikirim lebih dulu, menunggu Surat Jalan resmi',
      items: [{ inventoryItemId: ctx.items.berasPremium.id, itemName: ctx.items.berasPremium.name, unit: 'Kg', quantity: 300 }],
    });
    ctx.temporaryNote = data.id;
  });
  for (let w = 0; w < 3; w++) scheduleWindow(ctx, state, w);
}
