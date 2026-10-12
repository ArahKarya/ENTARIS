// Finance events: monthly salary and electricity journals, a vendor deposit applied to a supplier
// invoice, and a cash top-up from the bank.

import type { PurchaseState } from './purchasing';
import { num, windowDate, ymd, type DemoContext } from '../context';

export function scheduleFinance(ctx: DemoContext, purchases: PurchaseState): void {
  const a = ctx.accounts;
  for (let w = 0; w < 3; w++) {
    ctx.schedule(windowDate(ctx, w, 20), 'Beban listrik', async () => {
      await ctx.api.post(ctx.admin, '/journals', {
        date: ymd(windowDate(ctx, w, 20)),
        narration: 'Tagihan listrik pabrik dan gudang',
        items: [
          { accountId: a.utilities, debit: 4_200_000 + w * 150_000, credit: 0 },
          { accountId: a.bank, debit: 0, credit: 4_200_000 + w * 150_000 },
        ],
      });
    });
    ctx.schedule(windowDate(ctx, w, 27), 'Beban gaji', async () => {
      await ctx.api.post(ctx.admin, '/journals', {
        date: ymd(windowDate(ctx, w, 27)),
        narration: 'Gaji dan upah karyawan',
        items: [
          { accountId: a.salary, debit: 18_500_000, credit: 0 },
          { accountId: a.bank, debit: 0, credit: 18_500_000 },
        ],
      });
    });
    ctx.schedule(windowDate(ctx, w, 1), 'Isi ulang kas kecil', async () => {
      await ctx.api.post(ctx.admin, '/journals', {
        date: ymd(windowDate(ctx, w, 1)),
        narration: 'Pemindahan bank ke kas kecil',
        items: [
          { accountId: a.cash, debit: 5_000_000, credit: 0 },
          { accountId: a.bank, debit: 0, credit: 5_000_000 },
        ],
      });
    });
  }

  ctx.schedule(windowDate(ctx, 2, 13), 'Uang muka pemasok', async () => {
    const { data } = await ctx.api.post<{ id: string }>(ctx.admin, '/payments', {
      date: ymd(windowDate(ctx, 2, 13)),
      partyId: ctx.parties.minyakPrima,
      amount: 7_500_000,
      paymentType: 'VendorDeposit',
      accountId: a.bank,
      notes: 'Uang muka pesanan minyak goreng',
    });
    const open = purchases.invoices.filter((i) => i.partyKey === 'minyakPrima').at(-1);
    if (!open) return;
    const detail = await ctx.api.get<{ outstanding: string }>(ctx.admin, `/purchase/invoices/${open.id}`);
    const amount = Math.min(5_000_000, num(detail.outstanding));
    if (amount > 0) await ctx.api.post(ctx.admin, '/vendor-deposits/apply', { depositPaymentId: data.id, purchaseInvoiceId: open.id, amount });
  });
}
