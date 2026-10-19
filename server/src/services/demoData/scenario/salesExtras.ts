// Last-window extras that make every sales and approval screen show something:
// inquiries (converted, in progress, lost), quotations (accepted -> SO, sent, rejected), an open
// temporary note, a sales return, a customer deposit applied to an invoice, and documents a staff
// user submitted that still wait for approval.

import { DemoApiError } from '../api';
import { purchaseInvoiceBody, receiveGoods } from './purchasing';
import type { SalesState } from './sales';
import { addDays, num, windowDate, ymd, type DemoContext } from '../context';

type InvoiceDetail = { id: string; outstanding: string; items: Array<{ id: string; inventoryItemId: string | null; quantity: string }> };

function quotationBody(ctx: DemoContext, date: Date, partyKey: string, lines: Array<{ key: string; qty: number }>) {
  return {
    date: ymd(date),
    validUntil: ymd(addDays(ctx.today, 21)),
    partyId: ctx.parties[partyKey],
    terms: 'Harga franco gudang pembeli. Pembayaran 30 hari setelah invoice.',
    items: lines.map(({ key, qty }) => ({
      itemName: ctx.items[key].name,
      inventoryItemId: ctx.items[key].id,
      quantity: qty,
      unit: ctx.items[key].unit,
      rate: ctx.items[key].sellPrice,
    })),
  };
}

function scheduleInquiriesAndQuotations(ctx: DemoContext): void {
  const won: { inquiry?: string; quotation?: string } = {};
  ctx.schedule(windowDate(ctx, 2, 8), 'Inquiry Customer', async () => {
    const { data } = await ctx.api.post<{ id: string }>(ctx.admin, '/inquiries', {
      date: ymd(windowDate(ctx, 2, 8)),
      channel: 'WhatsApp',
      partyId: ctx.parties.sinarTani,
      prospectName: 'UD Sinar Tani',
      prospectPhone: '081200000103',
      itemsMode: 'structured',
      items: [{ itemName: 'Beras Premium', quantity: 2000, unit: 'Kg', estimatedPrice: 14_500 }],
      notes: 'Minta penawaran untuk stok bulanan',
    });
    won.inquiry = data.id;
  });
  ctx.schedule(windowDate(ctx, 2, 10), 'Penawaran dari inquiry', async () => {
    const { data } = await ctx.api.post<{ id: string }>(ctx.admin, '/quotations', quotationBody(ctx, windowDate(ctx, 2, 10), 'sinarTani', [{ key: 'berasPremium', qty: 2000 }]));
    won.quotation = data.id;
    await ctx.api.patch(ctx.admin, `/quotations/${data.id}/send`);
    await ctx.api.post(ctx.admin, `/inquiries/${won.inquiry}/link`, { quotationId: data.id });
  });
  ctx.schedule(windowDate(ctx, 2, 12), 'Penawaran diterima menjadi SO', async () => {
    await ctx.api.patch(ctx.admin, `/quotations/${won.quotation}/accept`);
    const items = quotationBody(ctx, windowDate(ctx, 2, 12), 'sinarTani', [{ key: 'berasPremium', qty: 2000 }]).items.map((i) => ({ ...i, amount: i.quantity * i.rate }));
    const { data } = await ctx.api.post<{ id: string }>(ctx.admin, '/sales-orders', {
      date: ymd(windowDate(ctx, 2, 12)),
      partyId: ctx.parties.sinarTani,
      quotationId: won.quotation,
      expectedDelivery: ymd(addDays(ctx.today, 5)),
      items,
    });
    await ctx.api.post(ctx.admin, `/sales-orders/${data.id}/submit`);
  });

  ctx.schedule(windowDate(ctx, 2, 5), 'Inquiry tidak jadi', async () => {
    const { data } = await ctx.api.post<{ id: string }>(ctx.admin, '/inquiries', {
      date: ymd(windowDate(ctx, 2, 5)),
      channel: 'Telepon',
      prospectName: 'Katering Rasa Nusa',
      prospectPhone: '081200000301',
      itemsText: 'Beras medium 500 kg per minggu',
    });
    await ctx.api.patch(ctx.admin, `/inquiries/${data.id}/status`, { status: 'Hilang', lossReason: 'Harga pesaing lebih murah' });
  });
  ctx.schedule(windowDate(ctx, 2, 20), 'Inquiry diproses', async () => {
    const { data } = await ctx.api.post<{ id: string }>(ctx.admin, '/inquiries', {
      date: ymd(windowDate(ctx, 2, 20)),
      channel: 'Email',
      prospectName: 'Hotel Cendana Asri',
      prospectEmail: 'pembelian@contoh.test',
      itemsText: 'Beras premium 300 kg, minyak goreng 50 pcs',
      followUpDate: ymd(addDays(ctx.today, 3)),
    });
    await ctx.api.patch(ctx.admin, `/inquiries/${data.id}/status`, { status: 'Diproses' });
  });

  ctx.schedule(windowDate(ctx, 2, 18), 'Penawaran ditolak', async () => {
    const { data } = await ctx.api.post<{ id: string }>(ctx.admin, '/quotations', quotationBody(ctx, windowDate(ctx, 2, 18), 'warungSari', [{ key: 'berasMedium', qty: 300 }]));
    await ctx.api.patch(ctx.admin, `/quotations/${data.id}/send`);
    await ctx.api.patch(ctx.admin, `/quotations/${data.id}/reject`, { reason: 'Customer menunda pembelian bulan ini' });
  });
  ctx.schedule(windowDate(ctx, 2, 22), 'Penawaran terkirim', async () => {
    const { data } = await ctx.api.post<{ id: string }>(ctx.admin, '/quotations', quotationBody(ctx, windowDate(ctx, 2, 22), 'koperasi', [{ key: 'berasMedium', qty: 1500 }, { key: 'dedak', qty: 1000 }]));
    await ctx.api.patch(ctx.admin, `/quotations/${data.id}/send`);
  });

  ctx.schedule(windowDate(ctx, 2, 24), 'Surat Jalan Sementara terbuka', async () => {
    await ctx.api.post(ctx.admin, '/temporary-delivery-notes', {
      date: ymd(windowDate(ctx, 2, 24)),
      partyId: ctx.parties.sinarTani,
      nomorMobil: 'B 9456 DMO',
      driverName: 'Pak Yusuf',
      notes: 'Kirim duluan, Surat Jalan resmi menyusul',
      items: [{ inventoryItemId: ctx.items.berasMedium.id, itemName: ctx.items.berasMedium.name, unit: 'Kg', quantity: 200 }],
    });
  });
}

async function returnBody(ctx: DemoContext, invoiceId: string, date: Date, qty: number, reason: string) {
  const inv = await ctx.api.get<InvoiceDetail>(ctx.admin, `/sales/invoices/${invoiceId}`);
  const line = inv.items.find((i) => i.inventoryItemId === ctx.items.berasPremium.id) ?? inv.items[0];
  return {
    salesInvoiceId: invoiceId,
    date: ymd(date),
    reason,
    items: [{ salesInvoiceItemId: line.id, quantity: Math.min(qty, num(line.quantity)), restock: true, warehouseId: ctx.warehouses.plant }],
  };
}

function scheduleReturnsAndDeposits(ctx: DemoContext, sales: SalesState): void {
  // Return against an invoice that was already paid: becomes a customer credit.
  ctx.schedule(windowDate(ctx, 2, 9), 'Retur penjualan', async () => {
    const paid = sales.invoices.find((i) => i.window === 1 && i.partyKey === 'tokoBerkah');
    if (!paid) return ctx.skip('Retur penjualan', 'invoice sumber tidak ada');
    await ctx.api.post(ctx.admin, '/sales-returns', await returnBody(ctx, paid.id, windowDate(ctx, 2, 9), 50, 'Karung sobek saat bongkar muat'));
  });

  ctx.schedule(windowDate(ctx, 2, 21), 'Uang Muka Customer', async () => {
    const { data } = await ctx.api.post<{ id: string }>(ctx.admin, '/payments', {
      date: ymd(windowDate(ctx, 2, 21)),
      partyId: ctx.parties.mitraNiaga,
      amount: 10_000_000,
      paymentType: 'CustomerDeposit',
      accountId: ctx.accounts.bank,
      notes: 'Uang muka pesanan berikutnya',
    });
    const open = sales.invoices.find((i) => i.window === 2 && i.partyKey === 'mitraNiaga');
    if (!open) return;
    const detail = await ctx.api.get<InvoiceDetail>(ctx.admin, `/sales/invoices/${open.id}`);
    const amount = Math.min(5_000_000, num(detail.outstanding));
    if (amount > 0) await ctx.api.post(ctx.admin, '/customer-deposits/apply', { depositPaymentId: data.id, salesInvoiceId: open.id, amount });
  });
}

/** Documents a non-bypass user submits; they stay in the approval queue. */
function scheduleStaffSubmissions(ctx: DemoContext, sales: SalesState): void {
  const staff = ctx.staff;
  if (!staff) {
    ctx.skip('Pengajuan staf', 'tidak ada pengguna aktif tanpa hak lewati persetujuan');
    return;
  }
  const tolerate = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      // A company may have narrowed the staff role; the rest of the demo still stands.
      if (err instanceof DemoApiError && (err.status === 403 || err.status === 401)) return ctx.skip(label, err.message);
      throw err;
    }
  };
  ctx.schedule(windowDate(ctx, 2, 26), 'Invoice pembelian menunggu persetujuan', async () => {
    const lines = await receiveGoods(ctx, windowDate(ctx, 2, 26), 'kelompokTani', [{ key: 'gabah', qty: 3_000, cost: 6750 }]);
    await tolerate('Invoice pembelian staf', async () => {
      await ctx.api.post(staff, '/purchase/invoices', purchaseInvoiceBody(ctx, windowDate(ctx, 2, 26), 'kelompokTani', lines, () => 6750));
    });
  });
  ctx.schedule(windowDate(ctx, 2, 27), 'Retur menunggu persetujuan', async () => {
    const inv = sales.invoices.find((i) => i.window === 2 && i.partyKey === 'tokoBerkah');
    if (!inv) return ctx.skip('Retur staf', 'invoice sumber tidak ada');
    await tolerate('Retur staf', async () => {
      await ctx.api.post(staff, '/sales-returns', await returnBody(ctx, inv.id, windowDate(ctx, 2, 27), 25, 'Beras basah sebagian'));
    });
  });
}

export function scheduleSalesExtras(ctx: DemoContext, sales: SalesState): void {
  scheduleInquiriesAndQuotations(ctx);
  scheduleReturnsAndDeposits(ctx, sales);
  scheduleStaffSubmissions(ctx, sales);
}
