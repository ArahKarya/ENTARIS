// Fleet, maintenance and EAM bills through the real handlers. Dated records (fuel, oil, tyres,
// inspections, taxes, insurance, documents, direct service logs) are spread over the demo span;
// work orders, material requests and approvals are stamped "now" by the app, so they run on the
// last days. Some EAM bills are posted to finance, the rest stay in the Tagihan EAM queue.

import { addDays, windowDate, ymd, type DemoContext } from '../context';
import { setupEam, type EamState } from './eamAssets';

const CHECKS: Record<string, string[]> = {
  mesin: ['oli_mesin', 'oli_rem', 'air_radiator', 'air_aki', 'air_wiper'],
  kelistrikan: ['lampu_depan', 'lampu_belakang', 'lampu_sein', 'lampu_rem', 'lampu_mundur', 'klakson'],
  rem_kemudi: ['rem_depan', 'rem_belakang', 'rem_tangan', 'kemudi_suspensi'],
  ban_roda: ['ban_depan', 'ban_belakang', 'ban_serep', 'tekanan_ban', 'velg'],
  keselamatan: ['sabuk_pengaman', 'p3k', 'apar', 'segitiga_pengaman', 'dongkrak', 'kunci_roda'],
  lain: ['kaca_spion', 'kaca_depan', 'kaca_belakang', 'wiper', 'ac', 'body_cat', 'dashboard_indikator'],
};

function checklist(attention: string[] = []): Record<string, string> {
  return Object.fromEntries(Object.values(CHECKS).flat().map((k) => [k, attention.includes(k) ? 'PERLU_PERHATIAN' : 'OK']));
}

/** Undefined = let the EAM posting use its own default account (by number). */
type Accounts = { tax?: string; maintenance?: string };

async function expenseAccounts(ctx: DemoContext): Promise<Accounts> {
  const flat = await ctx.api.get<Array<{ id: string; name: string; rootType: string; isGroup: boolean }>>(ctx.admin, '/coa/flat');
  const find = (...res: RegExp[]) => flat.find((a) => a.rootType === 'EXPENSE' && !a.isGroup && res.every((re) => re.test(a.name)))?.id;
  return { tax: find(/pajak|perizinan/i, /kendaraan/i), maintenance: find(/pemeliharaan|perbaikan|perawatan|servis/i, /kendaraan/i) };
}

function scheduleVehicleLogs(ctx: DemoContext, s: () => EamState): void {
  // Fuel every ten days for the two trucks; odometers only move forward.
  for (const [key, startKm, liters, kmPerFill] of [['truck', 48_200, 80, 420], ['pickup', 36_400, 45, 380]] as const) {
    for (let i = 0; i < 9; i++) {
      const date = windowDate(ctx, Math.floor(i / 3), (i % 3) * 10 + 2);
      ctx.schedule(date, 'Log BBM kendaraan', async () => {
        await ctx.api.post(ctx.admin, `/ga/vehicle/assets/${s().vehicles[key]}/fuel-logs`, {
          tanggal: ymd(date), liters, pricePerLiter: 6_800, totalCost: liters * 6_800, odometer: startKm + (i + 1) * kmPerFill,
          spbu: 'SPBU 34.171.02', driverName: key === 'truck' ? 'Pak Darto' : 'Pak Yusuf',
        });
      });
    }
  }
  ctx.schedule(windowDate(ctx, 1, 4), 'Ganti oli kendaraan', async () => {
    await ctx.api.post(ctx.admin, `/ga/vehicle/assets/${s().vehicles.truck}/oil-logs`, { tanggal: ymd(windowDate(ctx, 1, 4)), odometer: 49_900, nextOdometerDue: 59_900, brand: 'Shell Rimula R4', volume: 9 });
  });
  ctx.schedule(windowDate(ctx, 0, 5), 'Ban kendaraan', async () => {
    for (const [pos, sn] of [['DEPAN_KIRI', 'BS-DMO-1101'], ['DEPAN_KANAN', 'BS-DMO-1102'], ['BELAKANG_KIRI', 'BS-DMO-1103'], ['BELAKANG_KANAN', 'BS-DMO-1104']] as const) {
      await ctx.api.post(ctx.admin, `/ga/vehicle/assets/${s().vehicles.pickup}/tires`, { serialNumber: sn, brand: 'Bridgestone', model: 'Duravis R624', size: '7.00-15', position: pos, installedAt: ymd(windowDate(ctx, 0, 5)), installedOdometer: 36_500 });
    }
  });
  for (const [w, day, attention, result] of [[1, 8, [], 'BAIK'], [2, 8, ['tekanan_ban', 'lampu_rem'], 'PERLU_PERHATIAN']] as const) {
    ctx.schedule(windowDate(ctx, w, day), 'Inspeksi kendaraan', async () => {
      await ctx.api.post(ctx.admin, `/ga/vehicle/assets/${s().vehicles.truck}/inspections`, {
        tanggal: ymd(windowDate(ctx, w, day)), checklist: checklist([...attention]), overallResult: result, odometer: 48_200 + (w * 3 + 1) * 420 + 100,
        inspectorName: 'Pak Rahmat', fuelLevel: 'TIGA_PEREMPAT', intervalDays: 30,
        notes: result === 'BAIK' ? 'Kendaraan laik jalan' : 'Tekanan ban kurang dan lampu rem kiri redup',
      });
    });
  }
  ctx.schedule(windowDate(ctx, 1, 23), 'Insiden kendaraan', async () => {
    await ctx.api.post(ctx.admin, `/ga/vehicle/assets/${s().vehicles.pickup}/incidents`, {
      tanggal: ymd(windowDate(ctx, 1, 23)), description: 'Bemper belakang tergores saat mundur di area bongkar muat', severity: 'RINGAN',
      status: 'SELESAI', location: 'Gudang Distribusi', driverName: 'Pak Yusuf', estimatedCost: 650_000, actualCost: 600_000,
    });
  });
}

function scheduleComplianceAndDocuments(ctx: DemoContext, s: () => EamState, acc: () => Accounts): void {
  ctx.schedule(windowDate(ctx, 0, 1), 'Asuransi dan dokumen kendaraan', async () => {
    const st = s();
    const year = ctx.today.getFullYear();
    await ctx.api.post(ctx.admin, `/ga/vehicle/assets/${st.vehicles.truck}/insurances`, {
      type: 'ALL_RISK', provider: 'Asuransi Contoh Umum', policyNumber: 'POL-DMO-2026-0911', startDate: ymd(addDays(ctx.today, -200)),
      endDate: ymd(addDays(ctx.today, 165)), premium: 9_850_000, coverageValue: 380_000_000,
    });
    await ctx.api.post(ctx.admin, `/ga/vehicle/assets/${st.vehicles.truck}/taxes`, {
      type: 'PAJAK_KENDARAAN', periodYear: year, dueDate: ymd(addDays(ctx.today, 215)), amount: 3_450_000, paidAt: ymd(addDays(ctx.today, -150)), status: 'ACTIVE',
    });
    const docs: Array<[string, string, string, number]> = [
      ['STNK', 'truck', 'STNK Truk Engkel Hino Dutro', 210],
      ['KIR', 'truck', 'Buku Uji KIR Truk Engkel', 24],
      ['STNK', 'pickup', 'STNK Pick Up L300', 300],
      ['KIR', 'pickup', 'Buku Uji KIR Pick Up L300', 95],
    ];
    for (const [type, v, title, daysLeft] of docs) {
      if (!st.documentTypes[type]) continue;
      await ctx.api.post(ctx.admin, '/ga/documents', {
        title, typeId: st.documentTypes[type], assetId: st.vehicles[v as keyof EamState['vehicles']], issuedBy: type === 'KIR' ? 'Dinas Perhubungan' : 'Samsat',
        effectiveDate: ymd(addDays(ctx.today, daysLeft - 365)), expiryDate: ymd(addDays(ctx.today, daysLeft)),
      });
    }
  });

  // Direct workshop service: one posted to finance, one left in the Tagihan EAM queue.
  for (const [w, day, key, desc, cost, post] of [[1, 12, 'pickup', 'Servis berkala 40.000 km', 1_350_000, true], [2, 19, 'motor', 'Ganti kampas rem dan servis CVT', 285_000, false]] as const) {
    ctx.schedule(windowDate(ctx, w, day), 'Servis bengkel', async () => {
      const { data } = await ctx.api.post<{ id: string }>(ctx.admin, `/ga/vehicle/assets/${s().vehicles[key]}/services`, {
        tanggal: ymd(windowDate(ctx, w, day)), jenisService: 'SERVIS_BERKALA', deskripsi: desc, bengkel: 'Bengkel Jaya Motor', biaya: cost,
      });
      if (post) await ctx.api.post(ctx.admin, `/payment-requests/eam/SERVICE_LOG/${data.id}/pay`, { method: 'JOURNAL', accountId: acc().maintenance, creditAccountId: ctx.accounts.cash });
    });
  }
}

/** Approvals, work orders and material requests are stamped "now" by the app: run them last. */
function scheduleMaintenance(ctx: DemoContext, s: () => EamState, acc: () => Accounts): void {
  ctx.schedule(ctx.today, 'Pajak kendaraan diajukan', async () => {
    const st = s();
    const year = ctx.today.getFullYear();
    const { data: req } = await ctx.api.post<{ id: string }>(ctx.admin, `/ga/vehicle/assets/${st.vehicles.pickup}/tax-requests`, {
      type: 'PAJAK_KENDARAAN', periodYear: year, dueDate: ymd(addDays(ctx.today, 12)), estimatedAmount: 2_150_000, urgensi: 'HIGH', deskripsi: 'Pajak tahunan pick up jatuh tempo',
    });
    const approved = await ctx.api.patch<{ taxId: string }>(ctx.admin, `/ga/vehicle/tax-requests/${req.id}/approve`);
    await ctx.api.post(ctx.admin, `/payment-requests/eam/VEHICLE_TAX/${approved.taxId}/pay`, { method: 'JOURNAL', date: ymd(ctx.today), accountId: acc().tax, creditAccountId: ctx.accounts.cash });
    // Still waiting for an approver.
    await ctx.api.post(ctx.admin, `/ga/vehicle/assets/${st.vehicles.truck}/tax-requests`, {
      type: 'KIR', periodYear: year, dueDate: ymd(addDays(ctx.today, 24)), estimatedAmount: 450_000, urgensi: 'MEDIUM', deskripsi: 'Uji KIR berkala truk',
    });
  });

  ctx.schedule(ctx.today, 'Servis dari pengajuan', async () => {
    const st = s();
    const { data: sr } = await ctx.api.post<{ id: string }>(ctx.admin, `/ga/vehicle/assets/${st.vehicles.truck}/service-requests`, {
      jenisService: 'OLI', deskripsi: 'Ganti oli dan filter oli sesuai jadwal', odometer: 52_100, urgensi: 'MEDIUM',
    });
    const approved = await ctx.api.patch<{ workOrderId: string }>(ctx.admin, `/ga/vehicle/service-requests/${sr.id}/approve`);
    const wo = approved.workOrderId;
    await ctx.api.patch(ctx.admin, `/ga/maintenance/work-orders/${wo}/assign`, { assignedToId: ctx.admin.id });
    await ctx.api.patch(ctx.admin, `/ga/maintenance/work-orders/${wo}/start`);
    await ctx.api.post(ctx.admin, `/ga/maintenance/work-orders/${wo}/parts`, { inventoryItemId: st.spareParts.oil, quantity: 9, unitCost: 62_000, fromLocationId: st.locationId });
    await ctx.api.post(ctx.admin, `/ga/maintenance/work-orders/${wo}/parts`, { inventoryItemId: st.spareParts.oilFilter, quantity: 1, unitCost: 145_000, fromLocationId: st.locationId });
    await ctx.api.patch(ctx.admin, `/ga/maintenance/work-orders/${wo}/complete`, { resolution: 'Oli dan filter diganti, tidak ada kebocoran', laborHours: 1.5, laborCost: 150_000 });
    await ctx.api.patch(ctx.admin, `/ga/maintenance/work-orders/${wo}/close`);
    // A request from the courier that still waits for approval.
    await ctx.api.post(ctx.admin, `/ga/vehicle/assets/${st.vehicles.motor}/service-requests`, { jenisService: 'GANTI_BAN', deskripsi: 'Ban belakang aus, perlu diganti', odometer: 12_900, urgensi: 'HIGH' });
  });

  ctx.schedule(ctx.today, 'Perawatan mesin dan permintaan barang', async () => {
    const st = s();
    await ctx.api.post(ctx.admin, '/ga/maintenance/schedules', { assetId: st.machine, nextDueAt: ymd(addDays(ctx.today, 10)), intervalDays: 30, notes: 'Pemeriksaan karet roll dan sabuk huller' });
    const { data: wo } = await ctx.api.post<{ id: string }>(ctx.admin, '/ga/maintenance/work-orders', {
      assetId: st.machine, title: 'Ganti karet roll huller', type: 'CORRECTIVE', priority: 'HIGH', component: 'Karet roll', description: 'Hasil giling banyak beras patah', dueAt: ymd(addDays(ctx.today, 3)),
    });
    await ctx.api.patch(ctx.admin, `/ga/maintenance/work-orders/${wo.id}/assign`, { assignedToId: ctx.admin.id });
    await ctx.api.patch(ctx.admin, `/ga/maintenance/work-orders/${wo.id}/start`);

    const { data: mr } = await ctx.api.post<{ id: string }>(ctx.admin, `/ga/material-requests/from-work-order/${wo.id}`, {
      notes: 'Stok karet roll tinggal sedikit',
      items: [{ itemName: 'Karet Roll Huller 10 inch', uom: 'Pcs', quantity: 4, inventoryItemId: st.spareParts.hullerRubber }],
    });
    await ctx.api.patch(ctx.admin, `/ga/material-requests/${mr.id}/submit`);
    await ctx.api.patch(ctx.admin, `/ga/material-requests/${mr.id}/approve`);
    const detail = await ctx.api.get<{ items: Array<{ id: string }> }>(ctx.admin, `/ga/material-requests/${mr.id}`);
    for (const item of detail.items) {
      await ctx.api.patch(ctx.admin, `/ga/material-requests/${mr.id}/items/${item.id}/procurement`, { vendorName: 'Toko Teknik Makmur', unitPrice: 385_000, procurementStatus: 'ORDERED' });
      await ctx.api.patch(ctx.admin, `/ga/material-requests/${mr.id}/items/${item.id}/receive`, { receivedQty: 4, locationId: st.locationId, inventoryItemId: st.spareParts.hullerRubber });
    }
    await ctx.api.post(ctx.admin, `/payment-requests/eam/MATERIAL_REQUEST/${mr.id}/pay`, { method: 'JOURNAL', date: ymd(ctx.today), accountId: acc().maintenance, creditAccountId: ctx.accounts.cash });

    await ctx.api.post(ctx.admin, '/ga/maintenance/work-orders', {
      assetId: st.building, title: 'Perbaikan talang atap bocor', type: 'CORRECTIVE', priority: 'MEDIUM', description: 'Air masuk di sisi timur gudang saat hujan', dueAt: ymd(addDays(ctx.today, 7)),
    });
  });
}

export function scheduleEam(ctx: DemoContext): void {
  let state: EamState | null = null;
  let accounts: Accounts | null = null;
  const s = () => {
    if (!state) throw new Error('Data EAM belum dimuat.');
    return state;
  };
  const acc = () => {
    if (!accounts) throw new Error('Data EAM belum dimuat.');
    return accounts;
  };
  ctx.schedule(addDays(ctx.today, -100), 'Aset dan kendaraan', async () => {
    state = await setupEam(ctx);
    accounts = await expenseAccounts(ctx);
  });
  scheduleVehicleLogs(ctx, s);
  scheduleComplianceAndDocuments(ctx, s, acc);
  scheduleMaintenance(ctx, s, acc);
}
