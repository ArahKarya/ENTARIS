// EAM masters and assets through the real handlers: branch, cost center, locations and spare-part
// category (the company's own are reused when present), three vehicles with their data, a rented
// distribution warehouse, a calibrated floor scale and the milling machine, plus GA spare-part stock.

import { addDays, DEMO_SPAN_DAYS, ymd, type DemoContext } from '../context';

type Named = { id: string; code: string; name: string; isActive?: boolean; type?: string };

export interface EamState {
  branchId: string;
  costCenterId: string;
  locationId: string;
  categoryIds: Record<'vehicle' | 'building' | 'equipment' | 'machine', string>;
  documentTypes: Record<string, string>;
  vehicles: Record<'truck' | 'pickup' | 'motor', string>;
  building: string;
  scale: string;
  machine: string;
  spareParts: Record<'oil' | 'oilFilter' | 'hullerRubber' | 'led', string>;
}

export class EamSetupError extends Error {}

/** A code that is free: master codes are unique even among inactive rows. */
const freeCode = (rows: Named[], code: string) => (rows.some((r) => r.code.toUpperCase() === code) ? `DEMO-${code}` : code);

/** Reuse an active company row that matches, otherwise create one (recorded so the wipe removes it). */
async function findOrCreate(ctx: DemoContext, path: string, match: (r: Named) => boolean, body: { code: string } & Record<string, unknown>, table: Parameters<DemoContext['record']>[0]): Promise<string> {
  const rows = await ctx.api.get<Named[]>(ctx.admin, path);
  const found = rows.find((r) => r.isActive !== false && match(r));
  if (found) return found.id;
  const { data } = await ctx.api.post<{ id: string }>(ctx.admin, path, { ...body, code: freeCode(rows, body.code) });
  await ctx.record(table, data.id);
  return data.id;
}

async function masters(ctx: DemoContext, state: Partial<EamState>): Promise<void> {
  const branchId = await findOrCreate(ctx, '/ga/master/branches', () => true, { code: 'PST', name: 'Kantor Pusat', address: 'Jl. Raya Industri 1' }, 'ga_branches');
  state.costCenterId = await findOrCreate(ctx, '/ga/master/cost-centers', (r) => r.code === 'OPS', { code: 'OPS', name: 'Operasional', branchId }, 'ga_cost_centers');
  const locationId = await findOrCreate(ctx, '/ga/master/locations', (r) => r.code === 'SPR', { code: 'SPR', name: 'Gudang Suku Cadang', branchId }, 'ga_locations');
  const spareCat = await findOrCreate(ctx, '/ga/master/inventory-categories', (r) => r.type === 'SPAREPART', { code: 'SPR', name: 'Suku Cadang', type: 'SPAREPART' }, 'ga_inventory_categories');

  const cats = await ctx.api.get<Named[]>(ctx.admin, '/ga/master/asset-categories');
  const cat = async (codes: string[], create: { code: string; name: string }) => {
    const found = cats.find((c) => c.isActive !== false && codes.includes(c.code.toUpperCase()));
    if (found) return found.id;
    // A DEMO- prefixed code still resolves to the right kind through the category name.
    const { data } = await ctx.api.post<{ id: string }>(ctx.admin, '/ga/master/asset-categories', { ...create, code: freeCode(cats, create.code) });
    await ctx.record('ga_asset_categories', data.id);
    return data.id;
  };
  state.categoryIds = {
    vehicle: await cat(['KENDARAAN', 'VEHICLE', 'KND'], { code: 'KENDARAAN', name: 'Kendaraan' }),
    building: await cat(['GUDANG', 'BANGUNAN', 'GEDUNG', 'BUILDING'], { code: 'GUDANG', name: 'Gudang' }),
    equipment: await cat(['EQUIPMENT', 'PERALATAN', 'EQP'], { code: 'EQUIPMENT', name: 'Peralatan' }),
    machine: await cat(['MESIN_PRODUKSI', 'MESIN'], { code: 'MESIN_PRODUKSI', name: 'Mesin Produksi' }),
  };
  const docTypes = await ctx.api.get<Named[]>(ctx.admin, '/ga/master/document-types');
  state.documentTypes = Object.fromEntries(docTypes.filter((d) => d.isActive !== false).map((d) => [d.code.toUpperCase(), d.id]));
  state.branchId = branchId;
  state.locationId = locationId;

  const parts: Array<[keyof EamState['spareParts'], string, string, number]> = [
    ['oil', 'DEMO-OLI-10W40', 'Oli Mesin Diesel 10W-40', 40],
    ['oilFilter', 'DEMO-FLT-OLI', 'Filter Oli Truk', 6],
    ['hullerRubber', 'DEMO-KRT-HLR', 'Karet Roll Huller 10 inch', 8],
    ['led', 'DEMO-LED-50W', 'Lampu LED Gudang 50 W', 12],
  ];
  state.spareParts = {} as EamState['spareParts'];
  for (const [key, sku, name, qty] of parts) {
    const { data } = await ctx.api.post<{ id: string }>(ctx.admin, '/ga/inventory/items', { sku, name, categoryId: spareCat, uom: key === 'oil' ? 'Liter' : 'Pcs', minStock: Math.ceil(qty / 4) });
    state.spareParts[key] = data.id;
    await ctx.api.post(ctx.admin, '/ga/inventory/stock-set', { itemId: data.id, locationId, quantity: qty, notes: 'Stok awal suku cadang' });
  }
}

const VEHICLES = [
  { key: 'truck', name: 'Truk Engkel Hino Dutro', acquired: '2021-06-14', cost: 412_000_000, data: { noPlat: 'B 9123 DMO', brand: 'Hino', tipe: 'Dutro 130 HD', tahunProduksi: 2021, jenisBBM: 'SOLAR', kapasitasTangki: 100, warna: 'Putih', odometerSaatBeli: 12, odometerTerakhir: 48_200, noMesin: 'W04DTRR-DMO101', noRangka: 'MJEC1JG43M-DMO101' } },
  { key: 'pickup', name: 'Pick Up Mitsubishi L300', acquired: '2022-02-08', cost: 236_000_000, data: { noPlat: 'B 9456 DMO', brand: 'Mitsubishi', tipe: 'L300 Flat Deck', tahunProduksi: 2022, jenisBBM: 'SOLAR', kapasitasTangki: 60, warna: 'Hitam', odometerSaatBeli: 8, odometerTerakhir: 36_400, noMesin: '4N14-DMO202', noRangka: 'MK2L0PU39N-DMO202' } },
  { key: 'motor', name: 'Motor Kurir Honda Vario', acquired: '2023-09-01', cost: 24_500_000, data: { noPlat: 'B 3789 DMO', brand: 'Honda', tipe: 'Vario 125', tahunProduksi: 2023, jenisBBM: 'PERTALITE', kapasitasTangki: 5.5, warna: 'Merah', odometerSaatBeli: 3, odometerTerakhir: 12_100 } },
] as const;

async function assets(ctx: DemoContext, s: EamState): Promise<void> {
  const create = async (body: Record<string, unknown>) =>
    (await ctx.api.post<{ id: string }>(ctx.admin, '/ga/assets', { branchId: s.branchId, costCenterId: s.costCenterId, ...body })).data.id;
  s.vehicles = {} as EamState['vehicles'];
  for (const v of VEHICLES) {
    const id = await create({ name: v.name, categoryId: s.categoryIds.vehicle, acquisitionDate: v.acquired, acquisitionCost: v.cost, location: 'Pool kendaraan pabrik', picUserId: ctx.staff?.id ?? ctx.admin.id });
    await ctx.api.put(ctx.admin, `/ga/vehicle/assets/${id}`, v.data);
    s.vehicles[v.key] = id;
  }
  s.building = await create({ name: 'Gudang Distribusi Kawasan Timur', categoryId: s.categoryIds.building, acquisitionDate: '2024-01-01', location: 'Kawasan Pergudangan Blok C3' });
  await ctx.api.put(ctx.admin, `/ga/building/assets/${s.building}`, {
    jenis: 'GUDANG', ownership: 'SEWA_MASUK', luasTanah: 900, luasBangunan: 600, jumlahLantai: 1, tahunBangun: 2015,
    alamatLengkap: 'Kawasan Pergudangan Blok C3 No. 7', kota: 'Bekasi', provinsi: 'Jawa Barat',
  });
  await ctx.api.post(ctx.admin, `/ga/building/assets/${s.building}/rentals`, {
    arah: 'SEWA_MASUK', pihak: 'PT Properti Logistik Sentosa', kontak: '021-5550 1234', nilaiSewa: 7_500_000, periode: 'BULANAN',
    tanggalMulai: '2024-01-01', tanggalAkhir: ymd(addDays(ctx.today, 445)), notes: 'Kontrak sewa gudang distribusi',
  });
  s.scale = await create({ name: 'Timbangan Lantai 3 Ton', categoryId: s.categoryIds.equipment, acquisitionDate: '2022-05-10', acquisitionCost: 18_500_000, serialNumber: 'TL3T-DMO-0457', location: 'Area penerimaan gabah' });
  await ctx.api.put(ctx.admin, `/ga/equipment/assets/${s.scale}`, { maxCapacity: 3000, unit: 'KG', accuracy: 1, classLabel: 'Kelas III', defaultCalibrator: 'UPT Metrologi Legal', intervalMonths: 12 });
  const calibrated = addDays(ctx.today, -DEMO_SPAN_DAYS - 40);
  await ctx.api.post(ctx.admin, `/ga/equipment/assets/${s.scale}/calibration-logs`, {
    tanggal: ymd(calibrated), lembaga: 'UPT Metrologi Legal', noSertifikat: 'MTR/2026/0457', hasil: 'PASS', mode: 'ON_SITE',
    validUntil: ymd(addDays(calibrated, 365)), biaya: 750_000, deviasi: '0,4 kg', rangeTested: '0 - 3.000 kg',
  });
  s.machine = await create({ name: 'Mesin Huller Satake', categoryId: s.categoryIds.machine, acquisitionDate: '2020-11-20', acquisitionCost: 185_000_000, location: 'Lantai produksi' });
}

/** Masters, spare parts and assets. Runs once, before every fleet and maintenance event. */
export async function setupEam(ctx: DemoContext): Promise<EamState> {
  const state = {} as EamState;
  await masters(ctx, state);
  await assets(ctx, state);
  return state;
}
