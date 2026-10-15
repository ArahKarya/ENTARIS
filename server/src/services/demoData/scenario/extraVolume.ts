// Extra volume on top of the base scenario: more suppliers, customers and trade goods so lists,
// aging and dashboards look like a busy company. Same real handlers, same 30-day windows.
// Extra paddy purchases keep stock sufficient for the added milling runs (see production.ts).

import { billSupplier, payLater, priceByItem, receiveGoods, type Line, type PurchaseState } from './purchasing';
import { collectLater, createSalesOrder, deliverDirect, deliverFromOrder, invoiceDelivery, type SalesState } from './sales';
import { windowDate, type DemoContext } from '../context';

type Paid = { partyKey: string; total: number };

export function scheduleExtraVolume(ctx: DemoContext, purchases: PurchaseState, sales: SalesState): void {
  for (let w = 0; w < 3; w++) {
    // Extra paddy so the three added milling runs per window have stock.
    const g: { pi?: Paid } = {};
    ctx.schedule(windowDate(ctx, w, 1), 'Gabah tambahan petani', async () => {
      const lines = await receiveGoods(ctx, windowDate(ctx, w, 1), 'taniMakmur', [{ key: 'gabah', qty: 16_000, cost: 6750 }]);
      g.pi = await billSupplier(ctx, purchases, windowDate(ctx, w, 1), 'taniMakmur', lines, () => 6750);
    });
    payLater(ctx, w, () => g.pi);

    // Extra trade goods from a second wholesaler.
    const t: { pi?: Paid } = {};
    ctx.schedule(windowDate(ctx, w, 15), 'Pembelian barang dagang grosir', async () => {
      const lines = await receiveGoods(ctx, windowDate(ctx, w, 15), 'grosirPangan', [
        { key: 'tepung', qty: 300, cost: 11_500 },
        { key: 'kopi', qty: 250, cost: 14_000 },
        { key: 'mie', qty: 60, cost: 98_000 },
      ]);
      t.pi = await billSupplier(ctx, purchases, windowDate(ctx, w, 15), 'grosirPangan', lines, priceByItem(ctx, { tepung: 11_500, kopi: 14_000, mie: 98_000 }));
    });
    payLater(ctx, w, () => t.pi);

    // Direct deliveries to the added customers, each invoiced the same day.
    const direct: Array<[number, string, Array<{ key: string; qty: number }>]> = [
      [3, 'grosirMaju', [{ key: 'berasMedium', qty: 900 }, { key: 'tepung', qty: 80 }, { key: 'gula', qty: 60 }]],
      [8, 'rmPadang', [{ key: 'berasPremium', qty: 500 }, { key: 'minyak', qty: 60 }]],
      [13, 'pesantren', [{ key: 'berasMedium', qty: 1200 }, { key: 'mie', qty: 12 }]],
      [21, 'kateringBoga', [{ key: 'berasPremium', qty: 700 }, { key: 'kopi', qty: 40 }, { key: 'minyak', qty: 36 }]],
      [24, 'miniMart', [{ key: 'minyak', qty: 48 }, { key: 'gula', qty: 90 }, { key: 'kopi', qty: 60 }, { key: 'mie', qty: 10 }]],
      [27, 'bumiPangan', [{ key: 'berasPremium', qty: 800 }, { key: 'dedak', qty: 900 }]],
    ];
    for (const [day, partyKey, wants] of direct) {
      const d: { inv?: { total: number } } = {};
      ctx.schedule(windowDate(ctx, w, day), 'Surat Jalan pelanggan baru', async () => {
        const lines = await deliverDirect(ctx, windowDate(ctx, w, day), partyKey, wants);
        d.inv = await invoiceDelivery(ctx, sales, w, windowDate(ctx, w, day), partyKey, lines);
      });
      collectLater(ctx, w, partyKey, () => d.inv, 9);
    }

    // A second Sales Order flow for a catering customer, delivered in full.
    const o: { so?: { id: string; lines: Line[] }; inv?: { total: number } } = {};
    ctx.schedule(windowDate(ctx, w, 10), 'Sales Order katering', async () => {
      o.so = await createSalesOrder(ctx, windowDate(ctx, w, 10), 'kateringBoga', [{ key: 'berasPremium', qty: 1500 }, { key: 'kopi', qty: 80 }]);
    });
    ctx.schedule(windowDate(ctx, w, 12), 'Surat Jalan dari SO katering', async () => {
      const lines = await deliverFromOrder(ctx, windowDate(ctx, w, 12), o.so!, 1);
      o.inv = await invoiceDelivery(ctx, sales, w, windowDate(ctx, w, 13), 'kateringBoga', lines);
    });
    collectLater(ctx, w, 'kateringBoga', () => o.inv, 14);
  }
}
