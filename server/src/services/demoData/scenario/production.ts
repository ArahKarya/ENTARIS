// Plant operations through the real handlers: milling runs saved as drafts and posted (paddy ->
// premium rice + medium rice and bran as by-products, with machines, processes, shift and
// downtime for OEE), one draft left open, one posted by staff into the approval queue, a stock
// transfer to the distribution warehouse and a stock count with small differences.

import { prisma } from '../../../lib/prisma';
import { DemoApiError } from '../api';
import { windowDate, ymd, type DemoContext } from '../context';

const PROCESSES = ['Pengeringan', 'Penggilingan', 'Penyosohan', 'Pengemasan'];
const MACHINES = [
  { key: 'huller', code: 'DEMO-HULLER', name: 'Mesin Huller 1', idealRatePerHour: 3000 },
  { key: 'polisher', code: 'DEMO-POLISHER', name: 'Mesin Polisher 1', idealRatePerHour: 2500 },
] as const;

interface PlantMasters {
  processIds: string[];
  machines: Record<string, string>;
}

async function ensureMasters(ctx: DemoContext): Promise<PlantMasters> {
  // Process names are unique company-wide: reuse the company's own, create only what is missing.
  const { data: existing } = await ctx.api.get<{ data: Array<{ id: string; name: string }> }>(ctx.admin, '/inventory/production-processes');
  const processIds: string[] = [];
  for (const [i, name] of PROCESSES.entries()) {
    const found = existing.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (found) {
      processIds.push(found.id);
      continue;
    }
    const { data } = await ctx.api.post<{ id: string }>(ctx.admin, '/inventory/production-processes', { name, sortOrder: i + 1 });
    await ctx.record('production_processes', data.id);
    processIds.push(data.id);
  }
  const machines: Record<string, string> = {};
  for (const m of MACHINES) {
    const { data } = await ctx.api.post<{ id: string }>(ctx.admin, '/inventory/machines', { code: m.code, name: m.name, idealRatePerHour: m.idealRatePerHour, unit: 'kg' });
    await ctx.record('machines', data.id);
    machines[m.key] = data.id;
  }
  return { processIds, machines };
}

function runBody(ctx: DemoContext, masters: PlantMasters, date: Date, paddyKg: number, downtimeMin: number) {
  const at = (h: number, m = 0) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m).toISOString();
  const i = ctx.items;
  return {
    date: ymd(date),
    warehouseId: ctx.warehouses.plant,
    notes: 'Giling gabah GKP menjadi beras',
    inputs: [{ itemId: i.gabah.id, quantity: paddyKg }],
    outputs: [
      { itemId: i.berasPremium.id, quantity: Math.round(paddyKg * 0.4) },
      { itemId: i.berasMedium.id, quantity: Math.round(paddyKg * 0.22), isByProduct: true, unitPrice: i.berasMedium.cost },
      { itemId: i.dedak.id, quantity: Math.round(paddyKg * 0.1), isByProduct: true, unitPrice: i.dedak.cost },
    ],
    costs: [
      { description: 'Upah giling', costSide: 'InputSide', basis: 'InputQty', rate: 250 },
      { description: 'Listrik mesin', costSide: 'InputSide', basis: 'InputQty', rate: 120 },
    ],
    processIds: masters.processIds,
    plannedStart: at(7),
    plannedEnd: at(16),
    breakStart: at(12),
    breakEnd: at(13),
    runMachines: [
      { machineId: masters.machines.huller, startAt: at(7, 15), endAt: at(15, 30) },
      { machineId: masters.machines.polisher, startAt: at(8), endAt: at(16) },
    ],
    shift: 'Pagi',
    shiftLead: 'Pak Rahmat',
    manpowerCount: 6,
    downtimes: downtimeMin > 0 ? [{ machineId: masters.machines.huller, category: 'Perawatan', reason: 'Ganti karet huller', durationMin: downtimeMin }] : [],
  };
}

async function systemStock(itemId: string, warehouseId: string): Promise<number> {
  const row = await prisma.inventoryStock.findFirst({ where: { itemId, warehouseId }, select: { currentStock: true } });
  return Number(row?.currentStock ?? 0);
}

export function scheduleProduction(ctx: DemoContext): void {
  let masters: PlantMasters | null = null;
  const plant = async () => (masters ??= await ensureMasters(ctx));

  for (let w = 0; w < 3; w++) {
    for (const [day, kg, down] of [[6, 6000, 35], [13, 6000, 0], [20, 5500, 20], [26, 6000, 0]] as const) {
      ctx.schedule(windowDate(ctx, w, day), 'Produksi giling', async () => {
        const body = runBody(ctx, await plant(), windowDate(ctx, w, day), kg, down);
        const { data } = await ctx.api.post<{ draft: { id: string } }>(ctx.admin, '/inventory/production-runs', body);
        await ctx.api.post(ctx.admin, `/inventory/production-runs/drafts/${data.draft.id}/post`);
      });
    }
    ctx.schedule(windowDate(ctx, w, 3), 'Transfer stok ke gudang distribusi', async () => {
      await ctx.api.post(ctx.admin, '/stock-transfers', {
        date: ymd(windowDate(ctx, w, 3)),
        fromWarehouseId: ctx.warehouses.plant,
        toWarehouseId: ctx.warehouses.distribution,
        nomorMobil: 'B 9456 DMO',
        driverName: 'Pak Yusuf',
        notes: 'Stok beras untuk penjualan eceran',
        items: [{ itemId: ctx.items.berasPremium.id, quantity: 400 }, { itemId: ctx.items.berasMedium.id, quantity: 300 }],
      });
    });
  }

  // A draft still being filled in by the operator.
  ctx.schedule(windowDate(ctx, 2, 27), 'Draft produksi', async () => {
    await ctx.api.post(ctx.admin, '/inventory/production-runs', runBody(ctx, await plant(), windowDate(ctx, 2, 27), 4000, 0));
  });

  // A run a staff user posts: it waits for approval before stock and GL move.
  ctx.schedule(windowDate(ctx, 2, 28), 'Produksi menunggu persetujuan', async () => {
    if (!ctx.staff) return ctx.skip('Produksi staf', 'tidak ada pengguna staf');
    try {
      const { data } = await ctx.api.post<{ draft: { id: string } }>(ctx.staff, '/inventory/production-runs', runBody(ctx, await plant(), windowDate(ctx, 2, 28), 3000, 0));
      await ctx.api.post(ctx.staff, `/inventory/production-runs/drafts/${data.draft.id}/post`);
    } catch (err) {
      if (err instanceof DemoApiError && (err.status === 403 || err.status === 401)) return ctx.skip('Produksi staf', err.message);
      throw err;
    }
  });

  // Month-end count of the distribution warehouse with small differences.
  ctx.schedule(windowDate(ctx, 2, 29), 'Stock opname', async () => {
    const wh = ctx.warehouses.distribution;
    const diff: Record<string, number> = { minyak: -3, gula: 2, berasPremium: -5 };
    const items = [];
    for (const [key, delta] of Object.entries(diff)) {
      const sys = await systemStock(ctx.items[key].id, wh);
      items.push({ itemId: ctx.items[key].id, actualStock: Math.max(0, sys + delta), notes: delta < 0 ? 'Selisih kurang saat hitung fisik' : 'Selisih lebih saat hitung fisik' });
    }
    await ctx.api.post(ctx.admin, '/stock-opname', { date: ymd(windowDate(ctx, 2, 29)), warehouseId: wh, notes: 'Hitung fisik akhir bulan gudang distribusi', items });
  });
}
