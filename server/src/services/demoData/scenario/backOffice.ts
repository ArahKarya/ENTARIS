// Back-office finance through the real handlers: fixed assets with their purchase journal and
// monthly depreciation, project guarantees (one returned, one outstanding), a recurring rent
// journal, cash book drafts (one posted, one waiting for review) and a bank reconciliation in
// progress. Payment requests live in paymentRequests.ts.

import { DEMO_SPAN_DAYS, addDays, num, windowDate, ymd, type DemoContext } from '../context';

type Mapping = { accountId: string; accountName: string };
type FlatAccount = { id: string; name: string; rootType: string; isGroup: boolean };

export interface BackOfficeAccounts {
  assets: Partial<Record<'building' | 'vehicle' | 'machine', { asset: string; accum: string; expense: string }>>;
  rent: string;
  supplies: string;
  transport: string;
  meals: string;
  otherIncome: string | null;
}

export async function resolveBackOfficeAccounts(ctx: DemoContext): Promise<BackOfficeAccounts> {
  const { mappings } = await ctx.api.get<{ mappings: Record<string, Mapping[]> }>(ctx.admin, '/system-accounts');
  const flat = await ctx.api.get<FlatAccount[]>(ctx.admin, '/coa/flat');
  const pick = (role: string, re: RegExp) => mappings[role]?.find((m) => re.test(m.accountName))?.accountId;
  const expense = (re: RegExp) => flat.find((a) => a.rootType === 'EXPENSE' && !a.isGroup && re.test(a.name))?.id ?? mappings.OTHER_EXPENSE?.[0]?.accountId ?? ctx.accounts.utilities;

  const assets: BackOfficeAccounts['assets'] = {};
  for (const [key, re] of [['building', /gedung|bangunan/i], ['vehicle', /kendaraan/i], ['machine', /mesin/i]] as const) {
    const asset = pick('FIXED_ASSET', re);
    const accum = pick('ACCUM_DEPRECIATION', re);
    const exp = pick('DEPRECIATION_EXPENSE', re);
    if (asset && accum && exp) assets[key] = { asset, accum, expense: exp };
  }
  return {
    assets,
    rent: expense(/sewa/i),
    supplies: expense(/atk|alat tulis|perlengkapan/i),
    transport: expense(/transport|bensin|bbm|perjalanan/i),
    meals: expense(/konsumsi|makan|jamuan/i),
    otherIncome: mappings.OTHER_INCOME?.[0]?.accountId ?? null,
  };
}

const ASSETS = [
  { key: 'machine', name: 'Mesin Huller Satake', category: 'Mesin', cost: 185_000_000, months: 96, salvage: 15_000_000 },
  { key: 'vehicle', name: 'Truk Engkel Pengiriman', category: 'Kendaraan', cost: 265_000_000, months: 96, salvage: 40_000_000 },
  { key: 'building', name: 'Gudang Distribusi', category: 'Gedung', cost: 600_000_000, months: 240, salvage: 0 },
] as const;

function scheduleFixedAssets(ctx: DemoContext, acc: () => BackOfficeAccounts): void {
  const created: string[] = [];
  // The depreciation schedule adds months to the acquisition date; days 29-31 overflow into
  // duplicate or skipped periods, so acquire on day 28 at the latest.
  const opening = addDays(ctx.today, -DEMO_SPAN_DAYS - 1);
  const date = new Date(opening.getFullYear(), opening.getMonth(), Math.min(opening.getDate(), 28));
  ctx.schedule(date, 'Aset tetap', async () => {
    for (const a of ASSETS) {
      const accounts = acc().assets[a.key];
      if (!accounts) {
        ctx.skip(`Aset ${a.name}`, 'Akun Sistem aset/penyusutan belum dipetakan');
        continue;
      }
      const { data } = await ctx.api.post<{ id: string }>(ctx.admin, '/fixed-assets', {
        name: a.name,
        category: a.category,
        acquisitionDate: ymd(date),
        acquisitionCost: a.cost,
        usefulLifeMonths: a.months,
        salvageValue: a.salvage,
        depreciationMethod: 'straight_line',
        assetAccountId: accounts.asset,
        depreciationAccountId: accounts.expense,
        accumulatedDepAccountId: accounts.accum,
      });
      created.push(data.id);
      // Creating an asset posts nothing; the opening book value is journaled against opening equity.
      await ctx.api.post(ctx.admin, '/journals', {
        date: ymd(date),
        narration: `Saldo awal aset tetap: ${a.name}`,
        items: [
          { accountId: accounts.asset, debit: a.cost, credit: 0 },
          { accountId: ctx.accounts.openingEquity, debit: 0, credit: a.cost },
        ],
      });
    }
  });
  ctx.schedule(windowDate(ctx, 2, 29), 'Penyusutan bulanan', async () => {
    for (const id of created) {
      const asset = await ctx.api.get<{ depreciationEntries: Array<{ id: string; periodDate: string; isPosted: boolean }> }>(ctx.admin, `/fixed-assets/${id}`);
      for (const e of asset.depreciationEntries.filter((d) => !d.isPosted && new Date(d.periodDate) <= ctx.today)) {
        await ctx.api.post(ctx.admin, `/fixed-assets/${id}/depreciate`, { entryId: e.id });
      }
    }
  });
}

function scheduleGuarantees(ctx: DemoContext): void {
  const g: { id?: string } = {};
  ctx.schedule(windowDate(ctx, 0, 15), 'Jaminan penawaran', async () => {
    const { data } = await ctx.api.post<{ id: string }>(ctx.admin, '/project-guarantees', {
      date: ymd(windowDate(ctx, 0, 15)),
      partyId: ctx.parties.mitraNiaga,
      guaranteeType: 'Penawaran',
      projectName: 'Tender pengadaan beras gudang regional',
      referenceNo: 'TDR/BRS/014',
      amount: 15_000_000,
      accountId: ctx.accounts.bank,
      expectedReturnDate: ymd(windowDate(ctx, 1, 20)),
    });
    g.id = data.id;
  });
  ctx.schedule(windowDate(ctx, 1, 20), 'Jaminan dikembalikan', async () => {
    await ctx.api.post(ctx.admin, `/project-guarantees/${g.id}/settle`, {
      date: ymd(windowDate(ctx, 1, 20)),
      returnAmount: 15_000_000,
      returnAccountId: ctx.accounts.bank,
      notes: 'Tender selesai, jaminan dikembalikan penuh',
    });
  });
  ctx.schedule(windowDate(ctx, 2, 6), 'Jaminan pelaksanaan', async () => {
    await ctx.api.post(ctx.admin, '/project-guarantees', {
      date: ymd(windowDate(ctx, 2, 6)),
      partyId: ctx.parties.mitraNiaga,
      guaranteeType: 'Pelaksanaan',
      projectName: 'Kontrak pasokan beras gudang regional',
      referenceNo: 'KTR/BRS/021',
      amount: 25_000_000,
      accountId: ctx.accounts.bank,
      expectedReturnDate: ymd(addDays(ctx.today, 90)),
    });
  });
}

function scheduleRecurring(ctx: DemoContext, acc: () => BackOfficeAccounts): void {
  ctx.schedule(ctx.today, 'Transaksi berulang', async () => {
    const { data } = await ctx.api.post<{ id: string }>(ctx.admin, '/recurring', {
      name: 'Sewa gudang distribusi',
      templateType: 'journal',
      frequency: 'monthly',
      dayOfMonth: ctx.today.getDate(),
      nextRunDate: ymd(ctx.today),
      templateData: {
        narration: 'Sewa gudang distribusi bulanan',
        items: [
          { accountId: acc().rent, debit: 7_500_000, credit: 0 },
          { accountId: ctx.accounts.bank, debit: 0, credit: 7_500_000 },
        ],
      },
    });
    // The recurring runner always dates its journal today; it reports failures in the body (HTTP 200).
    const { data: run } = await ctx.api.post<{ success: boolean; error?: string }>(ctx.admin, `/recurring/${data.id}/execute`);
    if (!run.success) throw new Error(`Transaksi berulang gagal dijalankan: ${run.error ?? '-'}`);
  });
}

function scheduleCashBook(ctx: DemoContext, acc: () => BackOfficeAccounts): void {
  ctx.schedule(windowDate(ctx, 2, 17), 'Buku kas dari nota', async () => {
    const d = (day: number) => ymd(windowDate(ctx, 2, day));
    const a = acc();
    const rows = [
      { date: d(14), description: 'Bensin motor kurir', keluar: 85_000, txnType: 'pengeluaran', accountId: a.transport },
      { date: d(15), description: 'Konsumsi rapat dengan Supplier', keluar: 150_000, txnType: 'pengeluaran', accountId: a.meals },
      { date: d(15), description: 'Kasbon Andi (operator gudang)', keluar: 500_000, txnType: 'uang_muka' },
      { date: d(16), description: 'Parkir dan tol pengiriman', keluar: 64_000, txnType: 'pengeluaran', accountId: a.transport },
      ...(a.otherIncome ? [{ date: d(17), description: 'Penjualan karung bekas', masuk: 60_000, txnType: 'pemasukan', accountId: a.otherIncome }] : []),
    ];
    const { data } = await ctx.api.post<{ id: string }>(ctx.admin, '/cash-book-drafts', {
      entryDate: d(17),
      cashAccountId: ctx.accounts.cash,
      title: 'Buku kas kecil pekan ketiga',
      rows,
    });
    await ctx.api.post(ctx.admin, `/cash-book-drafts/${data.id}/post`, { partial: true });
  });
  ctx.schedule(windowDate(ctx, 2, 26), 'Draft buku kas menunggu tinjauan', async () => {
    await ctx.api.post(ctx.admin, '/cash-book-drafts', {
      entryDate: ymd(windowDate(ctx, 2, 26)),
      cashAccountId: ctx.accounts.cash,
      title: 'Buku kas kecil pekan keempat',
      rows: [
        { description: 'Galon air minum kantor', keluar: 42_000, txnType: 'pengeluaran', accountId: acc().meals },
        { description: 'Perbaikan kunci gudang', keluar: 175_000, txnType: 'lainnya' },
        { description: 'Pengembalian kasbon Andi', masuk: 200_000, txnType: 'terima_kasbon' },
      ],
    });
  });
}

function scheduleReconciliation(ctx: DemoContext): void {
  ctx.schedule(windowDate(ctx, 2, 29), 'Rekonsiliasi bank', async () => {
    const bankOnly = [
      { statementAmount: -15_000, statementDesc: 'Biaya administrasi bank', statementDate: ymd(windowDate(ctx, 2, 28)) },
      { statementAmount: 42_000, statementDesc: 'Bunga jasa giro', statementDate: ymd(windowDate(ctx, 2, 28)) },
    ];
    const flat = await ctx.api.get<Array<{ id: string; balance: string | number }>>(ctx.admin, '/coa/flat');
    const book = num(flat.find((a) => a.id === ctx.accounts.bank)?.balance);
    const { data: rec } = await ctx.api.post<{ id: string }>(ctx.admin, '/reconciliation', {
      accountId: ctx.accounts.bank,
      statementDate: ymd(windowDate(ctx, 2, 29)),
      statementBalance: book + bankOnly.reduce((s, i) => s + i.statementAmount, 0),
      notes: 'Rekening koran bulan berjalan',
    });
    const detail = await ctx.api.get<{ unmatchedLedgerEntries: Array<{ id: string; date: string; debit: string; credit: string }> }>(ctx.admin, `/reconciliation/${rec.id}`);
    const since = windowDate(ctx, 2, 0);
    const recent = detail.unmatchedLedgerEntries.filter((e) => new Date(e.date) >= since).slice(0, 10);
    if (recent.length === 0) ctx.skip('Pencocokan rekonsiliasi', 'tidak ada mutasi bank bulan berjalan di 200 baris pertama');
    const statement = recent.map((e) => ({ statementAmount: num(e.debit) - num(e.credit), statementDesc: 'Mutasi rekening', statementDate: ymd(new Date(e.date)) }));
    const { data: items } = await ctx.api.post<Array<{ id: string }>>(ctx.admin, `/reconciliation/${rec.id}/items`, { items: [...statement, ...bankOnly] });
    // Match all but the last two book entries: those stay outstanding, the bank-only lines stay unmatched.
    for (let i = 0; i < Math.max(0, recent.length - 2); i++) {
      await ctx.api.patch(ctx.admin, `/reconciliation/${rec.id}/match`, { itemId: items[i].id, ledgerEntryId: recent[i].id });
    }
  });
}

/** Schedules back-office events; returns the account accessor other scenarios share. */
export function scheduleBackOffice(ctx: DemoContext): () => BackOfficeAccounts {
  let accounts: BackOfficeAccounts | null = null;
  // Resolved by the first event that needs it (setup has run by then).
  const acc = () => {
    if (!accounts) throw new Error('Akun back office belum dimuat.');
    return accounts;
  };
  // Before every back-office event, including assets acquired up to three days before the span.
  ctx.schedule(addDays(ctx.today, -DEMO_SPAN_DAYS - 4), 'Akun back office', async () => {
    accounts = await resolveBackOfficeAccounts(ctx);
  });
  scheduleFixedAssets(ctx, acc);
  scheduleGuarantees(ctx);
  scheduleRecurring(ctx, acc);
  scheduleCashBook(ctx, acc);
  scheduleReconciliation(ctx);
  return acc;
}
