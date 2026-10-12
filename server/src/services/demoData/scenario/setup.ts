// Demo setup: fiscal years, account lookup, masters (warehouses, parties, items, service item) and
// opening balances (capital journal + opening stock). Masters are recorded for deletion.

import { prisma } from '../../../lib/prisma';
import { DEMO_SPAN_DAYS, addDays, ymd, type DemoContext, type DemoItem } from '../context';
import type { DemoActor, DemoApi } from '../api';

type Mapping = { accountId: string; accountNumber: string };
type FlatAccount = { id: string; accountNumber: string; name: string; rootType: string; isGroup: boolean };

export class DemoSetupError extends Error {}

/**
 * Make sure open fiscal years cover every day of the demo span. Days in a calendar year that has no
 * fiscal year at all get a calendar-year FY; anything else (a closed FY, or a gap next to a custom
 * non-calendar FY) is reported instead of guessed.
 */
export async function ensureFiscalYears(api: DemoApi, admin: DemoActor, today: Date, record: DemoContext['record']): Promise<void> {
  const years = await prisma.fiscalYear.findMany({ select: { startDate: true, endDate: true, isClosed: true } });
  const coveredBy = (d: Date) => years.filter((fy) => fy.startDate <= d && fy.endDate >= d);
  const missingYears = new Set<number>();
  // Fixed assets may be acquired up to three days before the span (see backOffice.ts).
  for (let d = addDays(today, -DEMO_SPAN_DAYS - 4); d <= today; d = addDays(d, 1)) {
    const fys = coveredBy(d);
    if (fys.some((fy) => !fy.isClosed)) continue;
    if (fys.length) throw new DemoSetupError(`Tahun buku untuk ${ymd(d)} sudah ditutup. Buka kembali tahun buku itu sebelum membuat data uji coba.`);
    const y = d.getFullYear();
    const touchesYear = years.some((fy) => fy.startDate <= new Date(y, 11, 31) && fy.endDate >= new Date(y, 0, 1));
    if (touchesYear) throw new DemoSetupError(`Belum ada tahun buku untuk ${ymd(d)}. Buat tahun buku yang mencakup tanggal itu di Pengaturan > Tahun Buku.`);
    missingYears.add(y);
  }
  for (const y of missingYears) {
    const { data } = await api.post<{ id: string }>(admin, '/fiscal-years', { name: String(y), startDate: `${y}-01-01`, endDate: `${y}-12-31` });
    await record('fiscal_years', data.id);
  }
}

export async function resolveAccounts(api: DemoApi, admin: DemoActor): Promise<DemoContext['accounts']> {
  const { mappings } = await api.get<{ mappings: Record<string, Mapping[]> }>(admin, '/system-accounts');
  const flat = await api.get<FlatAccount[]>(admin, '/coa/flat');
  const role = (r: string) => mappings[r]?.[0]?.accountId;
  const cash = mappings.CASH ?? [];
  const expense = (pattern: RegExp) =>
    flat.find((a) => a.rootType === 'EXPENSE' && !a.isGroup && pattern.test(a.name))?.id ?? role('OTHER_EXPENSE');

  const accounts = {
    cash: cash[0]?.accountId,
    bank: (cash[1] ?? cash[0])?.accountId,
    openingEquity: role('OPENING_EQUITY'),
    salary: expense(/gaji|upah/i),
    utilities: expense(/listrik/i),
    serviceRevenue: role('SERVICE_REVENUE'),
  };
  // Roles later steps post through (stock count, guarantees, cash advances, production COGS).
  const required = ['INVENTORY_VARIANCE', 'PROJECT_GUARANTEE', 'EMPLOYEE_ADVANCE', 'COGS'].filter((r) => !role(r));
  const missing = [...Object.entries(accounts).filter(([, v]) => !v).map(([k]) => k), ...required];
  if (missing.length) throw new DemoSetupError(`Pemetaan Akun Sistem belum lengkap (${missing.join(', ')}). Lengkapi di Pengaturan > Akun Sistem.`);
  return accounts as DemoContext['accounts'];
}

const WAREHOUSES = [
  { key: 'plant', code: 'DEMO-PABRIK', name: 'Gudang Pabrik (demo)', location: 'Area pabrik penggilingan' },
  { key: 'distribution', code: 'DEMO-DIST', name: 'Gudang Distribusi (demo)', location: 'Gudang barang dagang' },
] as const;

const PARTIES = [
  { key: 'tokoBerkah', name: 'Toko Sembako Berkah', partyType: 'Customer', phone: '081200000101', address: 'Jl. Pasar Baru 12' },
  { key: 'lumbungPangan', name: 'CV Lumbung Pangan', partyType: 'Customer', phone: '081200000102', address: 'Jl. Raya Timur 45' },
  { key: 'sinarTani', name: 'UD Sinar Tani', partyType: 'Customer', phone: '081200000103', address: 'Jl. Sawah Lebar 8' },
  { key: 'mitraNiaga', name: 'PT Mitra Niaga Sentosa', partyType: 'Customer', phone: '081200000104', address: 'Kawasan Pergudangan Blok C3' },
  { key: 'koperasi', name: 'Koperasi Karya Usaha', partyType: 'Customer', phone: '081200000105', address: 'Jl. Koperasi 3' },
  { key: 'warungSari', name: 'Warung Makan Bu Sari', partyType: 'Customer', phone: '081200000106', address: 'Jl. Melati 21' },
  { key: 'gabahLestari', name: 'UD Gabah Lestari', partyType: 'Supplier', phone: '081200000201', address: 'Desa Sukamaju' },
  { key: 'kelompokTani', name: 'Kelompok Tani Subur Makmur', partyType: 'Supplier', phone: '081200000202', address: 'Desa Mekarsari' },
  { key: 'minyakPrima', name: 'PT Nabati Prima Distribusi', partyType: 'Supplier', phone: '081200000203', address: 'Jl. Industri 7' },
  { key: 'kemasPlast', name: 'CV Kemas Plastindo', partyType: 'Supplier', phone: '081200000204', address: 'Jl. Industri 19' },
] as const;

const ITEMS: Array<Omit<DemoItem, 'id'> & { key: string; category: string; warehouse: 'plant' | 'distribution'; opening: number }> = [
  { key: 'gabah', code: 'DEMO-GKP', name: 'Gabah Kering Panen (GKP)', unit: 'Kg', category: 'Bahan Baku', cost: 6800, sellPrice: 0, warehouse: 'plant', opening: 8000 },
  { key: 'berasPremium', code: 'DEMO-BRS-PRM', name: 'Beras Premium', unit: 'Kg', category: 'Produk Jadi', cost: 11500, sellPrice: 16000, warehouse: 'plant', opening: 8000 },
  { key: 'berasMedium', code: 'DEMO-BRS-MED', name: 'Beras Medium', unit: 'Kg', category: 'Produk Jadi', cost: 10200, sellPrice: 13500, warehouse: 'plant', opening: 4000 },
  { key: 'dedak', code: 'DEMO-DDK', name: 'Dedak', unit: 'Kg', category: 'Produk Samping', cost: 2500, sellPrice: 4000, warehouse: 'plant', opening: 2000 },
  { key: 'karung', code: 'DEMO-KRG-25', name: 'Karung Beras 25 kg', unit: 'Pcs', category: 'Kemasan', cost: 2200, sellPrice: 0, warehouse: 'plant', opening: 1500 },
  { key: 'minyak', code: 'DEMO-MNY-2L', name: 'Minyak Goreng 2 L', unit: 'Pcs', category: 'Barang Dagang', cost: 31000, sellPrice: 38000, warehouse: 'distribution', opening: 400 },
  { key: 'gula', code: 'DEMO-GLA-1KG', name: 'Gula Pasir 1 kg', unit: 'Pcs', category: 'Barang Dagang', cost: 15500, sellPrice: 19000, warehouse: 'distribution', opening: 600 },
];

/** Warehouse each demo item is stocked in. */
export const ITEM_WAREHOUSE: Record<string, 'plant' | 'distribution'> = Object.fromEntries(ITEMS.map((i) => [i.key, i.warehouse]));

export async function createMasters(ctx: DemoContext): Promise<void> {
  const { api, admin } = ctx;
  for (const w of WAREHOUSES) {
    const { data } = await api.post<{ id: string }>(admin, '/warehouses', { code: w.code, name: w.name, location: w.location });
    await ctx.record('warehouses', data.id);
    ctx.warehouses[w.key] = data.id;
  }
  for (const p of PARTIES) {
    const { key, ...body } = p;
    const { data } = await api.post<{ id: string }>(admin, '/parties', body);
    await ctx.record('parties', data.id);
    ctx.parties[key] = data.id;
  }
  // The banner and party list flag demo parties the same way the old generator did.
  await prisma.party.updateMany({ where: { id: { in: Object.values(ctx.parties) } }, data: { isDummy: true } });

  for (const { key, warehouse: _w, opening: _o, ...item } of ITEMS) {
    const { data } = await api.post<{ id: string }>(admin, '/inventory/items', {
      code: item.code,
      name: item.name,
      unit: item.unit,
      category: item.category,
      minimumStock: Math.round(ITEMS.find((i) => i.key === key)!.opening * 0.2),
    });
    await ctx.record('inventory_items', data.id);
    ctx.items[key] = { id: data.id, ...item };
  }
  await prisma.inventoryItem.updateMany({ where: { id: { in: Object.values(ctx.items).map((i) => i.id) } }, data: { isDummy: true } });

  const { data: svc } = await api.post<{ id: string }>(admin, '/service-items', {
    code: 'DEMO-JASA-GILING',
    name: 'Jasa Giling Gabah',
    unit: 'Kg',
    defaultRate: 450,
    accountId: ctx.accounts.serviceRevenue,
  });
  await ctx.record('service_items', svc.id);
  ctx.serviceItems.milling = { id: svc.id, name: 'Jasa Giling Gabah', rate: 450 };
}

/** Owner capital into cash and bank, and opening stock per item, one day before the demo span. */
export async function postOpeningBalances(ctx: DemoContext): Promise<void> {
  const date = ymd(addDays(ctx.today, -DEMO_SPAN_DAYS - 1));
  await ctx.api.post(ctx.admin, '/journals', {
    date,
    narration: 'Setoran modal awal pemilik',
    items: [
      { accountId: ctx.accounts.bank, debit: 450_000_000, credit: 0 },
      { accountId: ctx.accounts.cash, debit: 50_000_000, credit: 0 },
      { accountId: ctx.accounts.openingEquity, debit: 0, credit: 500_000_000 },
    ],
  });
  for (const item of ITEMS) {
    await ctx.api.post(ctx.admin, '/inventory/movements', {
      itemId: ctx.items[item.key].id,
      warehouseId: ctx.warehouses[item.warehouse],
      movementType: 'In',
      quantity: item.opening,
      unitCost: item.cost,
      date,
      notes: 'Saldo awal stok',
    });
  }
}
