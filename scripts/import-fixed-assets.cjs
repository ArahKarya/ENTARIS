#!/usr/bin/env node
/* eslint-disable */
/**
 * Bulk import Fixed Assets ke ERP berdasarkan kertas kerja PMD.
 *
 * Source: Google Sheet "Aset Tetap PMD"
 *   https://docs.google.com/spreadsheets/d/11qtLbdiTC4onLudbfSssVBnmM1b3B-79jUxJtNXTA1w
 *
 * Default: DRY RUN — hanya print preview, tidak write ke DB.
 * Untuk eksekusi sungguhan: `node scripts/import-fixed-assets.cjs --run`
 *
 * Behavior:
 *   - assetNumber default FA-XXXX (auto), kode original (A0001/D0046/dst)
 *     disimpan di field description.
 *   - Tanah: usefulLifeMonths = 1200 + salvageValue = acquisitionCost
 *     → monthly depreciation = 0, no schedule entries written (skip).
 *   - Aset lain: opening accumulatedDepreciation diambil dari kolom
 *     "Accumulate Depreciation Mei 2026" spreadsheet. Schedule entries
 *     di-generate hanya untuk SISA umur (mulai Juni 2026), bukan dari
 *     acquisition date.
 *   - fiscalYearId pakai FY berjalan (2026) walau acquisition Feb 2023
 *     (acquisitionDate sendiri tetap real → audit accurate).
 *   - D0046 (duplikat 5x di spreadsheet) di-rename otomatis dengan
 *     suffix -B/-C/-D/-E saat masuk description.
 *   - Akun di-resolve dari kategori spreadsheet:
 *       Tanah     → 1.6.1 (no dep account)
 *       Bangunan  → 1.6.2.1 / 6.21 / 1.7.1
 *       Peralatan → 1.6.6   / 6.35 / 1.7.5
 *       Mesin     → 1.6.4   / 6.23 / 1.7.3
 */
// Resolve Prisma + driver adapter from the bundled app (sama seperti
// server/src/lib/prisma.ts). Script ini dirancang dijalankan di dalam
// container app (sebelumnya di-copy via `docker cp`), bukan dari host.
const path = require('path');
const APP_ROOT = process.env.APP_ROOT || '/app/server';
const { PrismaClient } = require(path.join(APP_ROOT, 'node_modules', '@prisma', 'client'));
const { PrismaPg } = require(path.join(APP_ROOT, 'node_modules', '@prisma', 'adapter-pg'));
const { Pool } = require(path.join(APP_ROOT, 'node_modules', 'pg'));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ─── Helpers ──────────────────────────────────────────────────────────────
const fmtRp = (n) =>
  'Rp ' + Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 });

const parseDate = (s) => {
  // "14/2/2023" → Date in local tz @ noon (avoid DST edges)
  const [d, m, y] = s.split('/').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d, 12, 0, 0);
};
const parseRp = (s) => {
  if (s == null) return 0;
  const cleaned = String(s).replace(/Rp/gi, '').replace(/[,\s]/g, '').replace('-', '');
  if (!cleaned) return 0;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const CATEGORY_MAP = {
  Tanah:     { asset: '1.6.1',   dep: null,   accum: null,   label: 'Tanah' },
  Bangunan:  { asset: '1.6.2.1', dep: '6.21', accum: '1.7.1', label: 'Bangunan' },
  Peralatan: { asset: '1.6.6',   dep: '6.35', accum: '1.7.5', label: 'Peralatan' },
  Mesin:     { asset: '1.6.4',   dep: '6.23', accum: '1.7.3', label: 'Mesin' },
};

// ─── Data (parsed from spreadsheet) ──────────────────────────────────────
// Columns: id, machineType, name, category, taxGroup, brand,
//          purchaseDate, purchaseCost, lifeYears, locn, cond, accumMay2026
const ASSETS = [
  ['A0001','','Tanah','Tanah','-','No Brand','14/2/2023',1523250000,0,'PMDP','GOOD',0],
  ['A0002','','Tanah Sawah','Tanah','-','No Brand','1/1/2022',1000000,0,'PMDP','GOOD',0],
  ['B0002','','Kantor','Bangunan','Permanen','No Brand','14/2/2023',381480000,20,'PMDP','GOOD',62813556],
  ['B0003','','Ruang Produksi','Bangunan','Permanen','No Brand','14/2/2023',2806080000,20,'PMDP','GOOD',462042214],
  ['B0004','','Gudang','Bangunan','Permanen','No Brand','14/2/2023',1004400000,20,'PMDP','GOOD',165382027],
  ['B0005','','Pos Satpam','Bangunan','Tidak Permanen','No Brand','14/2/2023',53790000,10,'PMDP','GOOD ENOUGH',17713858],
  ['B0006','','Gardu Listrik','Bangunan','Tidak Permanen','No Brand','14/2/2023',73200000,10,'PMDP','GOOD',24105863],
  ['C0001','','Pagar','Bangunan','Tidak Permanen','No Brand','14/2/2023',28620000,10,'PMDP','GOOD',9424997],
  ['B0007','','Perkerasan','Bangunan','Tidak Permanen','No Brand','14/2/2023',210000000,10,'PMDP','GOOD',69156164],
  ['B0008','','Sumber Air','Bangunan','Tidak Permanen','No Brand','14/2/2023',12970000,10,'PMDP','GOOD',4271216],
  ['C0002','','Daya Listrik','Peralatan','Kelompok 2','No Brand','14/2/2023',668610000,8,'PMDP','GOOD',275229185],
  ['D0001','MSDM-120','Hopper Scale 1','Mesin','Kelompok 2','Buhler','14/2/2023',220000000,8,'PMDP','GOOD',90561644],
  ['D0002','MSDM-120','Hopper Scale 2','Mesin','Kelompok 2','Buhler','14/2/2023',220000000,8,'PMDP','GOOD',90561644],
  ['D0003','MTRC-MVSL 150/200','Separator 1','Mesin','Kelompok 2','Buhler','14/2/2023',326500000,8,'PMDP','GOOD',134401712],
  ['D0004','MTRC-MVSL 150/200','Separator 2','Mesin','Kelompok 2','Buhler','14/2/2023',326500000,8,'PMDP','GOOD',134401712],
  ['D0005','AVHE + DRSD','Huller + Husk Separator 1','Mesin','Kelompok 2','Buhler','14/2/2023',384500000,8,'PMDP','GOOD',158277055],
  ['D0006','AVHE + DRSD','Huller + Husk Separator 2','Mesin','Kelompok 2','Buhler','14/2/2023',384500000,8,'PMDP','GOOD',158277055],
  ['D0007','AVHE + DRSD','Huller + Husk Separator 3','Mesin','Kelompok 2','Buhler','14/2/2023',384500000,8,'PMDP','GOOD',158277055],
  ['D0008','AVHE + DRSD','Huller + Husk Separator 4','Mesin','Kelompok 2','Buhler','14/2/2023',384500000,8,'PMDP','GOOD',158277055],
  ['D0009','DRTA','Paddy Separator','Mesin','Kelompok 2','Buhler','14/2/2023',288000000,8,'PMD1','GOOD',118553425],
  ['D0010','DRWA 75 KW','Whitener 1','Mesin','Kelompok 2','Buhler','14/2/2023',543000000,8,'PMDP','GOOD',223522603],
  ['D0011','DRWA 75 KW','Whitener 2','Mesin','Kelompok 2','Buhler','14/2/2023',543000000,8,'PMDP','GOOD',223522603],
  ['D0012','DRPG 90 KW','Polisher 1','Mesin','Kelompok 2','Buhler','14/2/2023',543000000,8,'PMDP','GOOD',223522603],
  ['D0013','DRPG 90 KW','Polisher 2','Mesin','Kelompok 2','Buhler','14/2/2023',543000000,8,'PMDP','GOOD',223522603],
  ['D0014','DROA','Rice Inline Sensor','Mesin','Kelompok 2','Buhler','14/2/2023',163000000,8,'PMDP','GOOD',67097945],
  ['D0015','AVER 4L-40-12T','Plan Sifter 1','Mesin','Kelompok 2','Buhler','14/2/2023',336000000,8,'PMDP','GOOD',138312329],
  ['D0016','AVER 4L-40-12T','Plan Sifter 2','Mesin','Kelompok 2','Buhler','14/2/2023',336000000,8,'PMDP','GOOD',138312329],
  ['D0017','AVEL','Length Grader 1','Mesin','Kelompok 2','Buhler','14/2/2023',331000000,8,'PMDP','GOOD',136254110],
  ['D0018','AVEL','Length Grader 2','Mesin','Kelompok 2','Buhler','14/2/2023',331000000,8,'PMDP','GOOD',136254110],
  ['D0019','MZAL - 12','Flow Balancer 1','Mesin','Kelompok 2','Buhler','14/2/2023',86000000,8,'PMDP','GOOD',35401370],
  ['D0020','MZAL - 12','Flow Balancer 2','Mesin','Kelompok 2','Buhler','14/2/2023',86000000,8,'PMDP','GOOD',35401370],
  ['D0021','MZAL - 12','Flow Balancer 3','Mesin','Kelompok 2','Buhler','14/2/2023',86000000,8,'PMDP','GOOD',35401370],
  ['D0022','DSC 10 CHUTE + COMPRESSOR 50HP','Color Sorter','Mesin','Kelompok 2','Buhler','14/2/2023',1076000000,8,'PMDP','GOOD',442928767],
  ['D0023','','Rice Packing Machine 1','Mesin','Kelompok 2','Li Jiang','14/2/2023',66033333,8,'PMDP','GOOD',27182215],
  ['D0024','','Rice Packing Machine 2','Mesin','Kelompok 2','Li Jiang','14/2/2023',66033333,8,'PMDP','GOOD',27182215],
  ['D0025','','Rice Packing Machine 3','Mesin','Kelompok 2','Li Jiang','14/2/2023',66033333,8,'PMDP','GOOD',27182215],
  ['D0026','','Elevator 8 Inch Tinggi 11 Meter','Mesin','Kelompok 2','','14/2/2023',36100000,8,'PMDP','GOOD',14860342],
  ['D0027','','Elevator 8 Inch Tinggi 12 Meter','Mesin','Kelompok 2','','14/2/2023',45300000,8,'PMDP','GOOD',18647466],
  ['D0028','','Elevator 8 Inch Tinggi 9,6 Meter','Mesin','Kelompok 2','','14/2/2023',39800000,8,'PMDP','GOOD',16383425],
  ['D0029','','Elevator 8 Inch Tinggi 6,6 Meter','Mesin','Kelompok 2','','14/2/2023',32900000,8,'PMDP','GOOD',13543082],
  ['D0030','','Elevator 8 Inch Tinggi 10,2 Meter','Mesin','Kelompok 2','','14/2/2023',41200000,8,'PMDP','GOOD',16959726],
  ['D0031','','Elevator 8 Inch Tinggi 10 Meter 1','Mesin','Kelompok 2','','14/2/2023',40700000,8,'PMDP','GOOD',16753904],
  ['D0032','','Elevator 8 Inch Tinggi 10 Meter 2','Mesin','Kelompok 2','','14/2/2023',40700000,8,'PMDP','GOOD',16753904],
  ['D0033','','Elevator 8 Inch Tinggi 10 Meter 3','Mesin','Kelompok 2','','14/2/2023',40700000,8,'PMDP','GOOD',16753904],
  ['D0034','','Elevator 8 Inch Tinggi 9,2 Meter 1','Mesin','Kelompok 2','','14/2/2023',38900000,8,'PMDP','GOOD',16012945],
  ['D0035','','Elevator 8 Inch Tinggi 9,2 Meter 2','Mesin','Kelompok 2','','14/2/2023',38900000,8,'PMDP','GOOD',16012945],
  ['D0036','','Elevator 8 Inch Tinggi 9,2 Meter 3','Mesin','Kelompok 2','','14/2/2023',38900000,8,'PMDP','GOOD',16012945],
  ['D0037','','Elevator 8 Inch Tinggi 9,2 Meter 4','Mesin','Kelompok 2','','14/2/2023',38900000,8,'PMDP','GOOD',16012945],
  ['D0038','','Elevator 8 Inch Tinggi 9,2 Meter 5','Mesin','Kelompok 2','','14/2/2023',38900000,8,'PMDP','GOOD',16012945],
  ['D0039','','Elevator 8 Inch Tinggi 9,2 Meter 6','Mesin','Kelompok 2','','14/2/2023',38900000,8,'PMDP','GOOD',16012945],
  ['D0040','','Elevator 8 Inch Tinggi 9,2 Meter 7','Mesin','Kelompok 2','','14/2/2023',38900000,8,'PMDP','GOOD',16012945],
  ['D0041','','Elevator 8 Inch Tinggi 9,2 Meter 8','Mesin','Kelompok 2','','14/2/2023',38900000,8,'PMDP','GOOD',16012945],
  ['D0042','','Elevator 8 Inch Tinggi 9,2 Meter 9','Mesin','Kelompok 2','','14/2/2023',38900000,8,'PMDP','GOOD',16012945],
  ['D0043','','Elevator 6 Inch Tinggi 9,2 Meter 1','Mesin','Kelompok 2','','14/2/2023',32600000,8,'PMDP','GOOD',13419589],
  ['D0044','','Elevator 6 Inch Tinggi 9,2 Meter 2','Mesin','Kelompok 2','','14/2/2023',32600000,8,'PMDP','GOOD',13419589],
  ['D0045','','Elevator 8 Inch Tinggi 9,6 Meter','Mesin','Kelompok 2','','14/2/2023',39800000,8,'PMDP','GOOD',16383425],
  ['D0046','','Elevator 8 Inch Tinggi 12,5 Meter 1','Mesin','Kelompok 2','','14/2/2023',53200000,8,'PMDP','GOOD',21899452],
  ['D0046','','Elevator 8 Inch Tinggi 12,5 Meter 2','Mesin','Kelompok 2','','14/2/2023',53200000,8,'PMDP','GOOD',21899452],
  ['D0046','','Elevator 8 Inch Tinggi 12,5 Meter 3','Mesin','Kelompok 2','','14/2/2023',53200000,8,'PMDP','GOOD',21899452],
  ['D0046','','Elevator 8 Inch Tinggi 12,5 Meter 4','Mesin','Kelompok 2','','14/2/2023',53200000,8,'PMDP','GOOD',21899452],
  ['D0046','','Blower Beras KG Double Fan Jumbo','Mesin','Kelompok 2','','14/2/2023',37600000,8,'PMDP','GOOD',15477808],
  ['D0047','','Blower Abu DGB 4,5','Mesin','Kelompok 2','','14/2/2023',10500000,8,'PMDP','GOOD',4322260],
  ['D0048','','Blower Abu DGB 5A 1','Mesin','Kelompok 2','','14/2/2023',23600000,8,'PMDP','GOOD',9714795],
  ['D0049','','Blower Abu DGB 5A 2','Mesin','Kelompok 2','','14/2/2023',23600000,8,'PMDP','GOOD',9714795],
  ['D0050','','Blower Abu DGB 5A 3','Mesin','Kelompok 2','','14/2/2023',23600000,8,'PMDP','GOOD',9714795],
  ['D0051','','Blower Abu DGB 5A 4','Mesin','Kelompok 2','','14/2/2023',23600000,8,'PMDP','GOOD',9714795],
  ['D0052','','Blower Abu DGB 5A 5','Mesin','Kelompok 2','','14/2/2023',23600000,8,'PMDP','GOOD',9714795],
  ['D0053','','Blower Abu DGB 5A 6','Mesin','Kelompok 2','','14/2/2023',23600000,8,'PMDP','GOOD',9714795],
  ['D0054','','Siklon Galvanis 125 CM 1','Mesin','Kelompok 2','','14/2/2023',14900000,8,'PMDP','GOOD',6133493],
  ['D0055','','Siklon Galvanis 125 CM 2','Mesin','Kelompok 2','','14/2/2023',14900000,8,'PMDP','GOOD',6133493],
  ['D0056','','Siklon Galvanis 140 CM 1','Mesin','Kelompok 2','','14/2/2023',19900000,8,'PMDP','GOOD',8191712],
  ['D0057','','Siklon Galvanis 140 CM 2','Mesin','Kelompok 2','','14/2/2023',19900000,8,'PMDP','GOOD',8191712],
  ['D0058','','Siklon Galvanis 140 CM 3','Mesin','Kelompok 2','','14/2/2023',19900000,8,'PMDP','GOOD',8191712],
  ['D0059','','Siklon Galvanis 140 CM 4','Mesin','Kelompok 2','','14/2/2023',19900000,8,'PMDP','GOOD',8191712],
  ['D0060','','Blower Katol Polos, 6A 20 HP 1','Mesin','Kelompok 2','','14/2/2023',30600000,8,'PMDP','GOOD',12596301],
  ['D0061','','Blower Katol Polos, 6A 20 HP 2','Mesin','Kelompok 2','','14/2/2023',30600000,8,'PMDP','GOOD',12596301],
  ['D0062','','Blower Katol Polos, 6A 20 HP 3','Mesin','Kelompok 2','','14/2/2023',30600000,8,'PMDP','GOOD',12596301],
  ['D0063','','Blower Katol Polos, 6A 20 HP 4','Mesin','Kelompok 2','','14/2/2023',30600000,8,'PMDP','GOOD',12596301],
  ['D0064','','V Belt Conveyor 60 Cm, Panjang 9,8 Meter','Mesin','Kelompok 2','','14/2/2023',68800000,8,'PMDP','GOOD',28321096],
];

// ─── Pipeline ────────────────────────────────────────────────────────────
function buildDescription(row, idSuffix) {
  const [origId, mech, , , tax, brand, , , , locn, cond] = row;
  const finalId = idSuffix ? `${origId}${idSuffix}` : origId;
  const parts = [`ID: ${finalId}`];
  if (mech) parts.push(`Mesin: ${mech}`);
  if (brand && brand !== 'No Brand') parts.push(`Brand: ${brand}`);
  parts.push(`Lokasi: ${locn}`);
  if (tax && tax !== '-') parts.push(`Tax: ${tax}`);
  parts.push(`Kondisi: ${cond}`);
  return parts.join(' | ');
}

async function prepare() {
  // Dedupe D0046 → assign suffixes
  const seen = new Map();
  const suffixOrder = ['', '-B', '-C', '-D', '-E', '-F', '-G'];
  const prepared = [];

  for (const row of ASSETS) {
    const [origId, , name, category, , , dateStr, costStr, lifeYears, , , accumStr] = row;
    if (!CATEGORY_MAP[category]) {
      throw new Error(`Kategori tidak dikenal: "${category}" untuk ${origId} ${name}`);
    }
    const seenCount = seen.get(origId) ?? 0;
    seen.set(origId, seenCount + 1);
    const suffix = suffixOrder[seenCount] ?? `-X${seenCount}`;
    const description = buildDescription(row, suffix);

    const cost = parseRp(costStr);
    const accumOpening = parseRp(accumStr);
    const isTanah = category === 'Tanah';

    const usefulLifeMonths = isTanah ? 1200 : Number(lifeYears) * 12;
    const salvageValue = isTanah ? cost : 0;
    const bookValue = Math.max(0, cost - accumOpening);

    prepared.push({
      origId,
      finalId: suffix ? `${origId}${suffix}` : origId,
      name,
      category,
      description,
      acquisitionDate: parseDate(dateStr),
      acquisitionCost: cost,
      usefulLifeMonths,
      salvageValue,
      accumulatedDepreciation: accumOpening,
      bookValue,
      isTanah,
    });
  }
  return prepared;
}

async function loadAccounts() {
  const needed = new Set();
  for (const m of Object.values(CATEGORY_MAP)) {
    if (m.asset) needed.add(m.asset);
    if (m.dep) needed.add(m.dep);
    if (m.accum) needed.add(m.accum);
  }
  const accts = await prisma.account.findMany({
    where: { accountNumber: { in: Array.from(needed) } },
    select: { id: true, accountNumber: true, name: true },
  });
  const byNum = new Map(accts.map((a) => [a.accountNumber, a]));
  const missing = Array.from(needed).filter((n) => !byNum.has(n));
  if (missing.length > 0) {
    throw new Error(`Akun tidak ditemukan: ${missing.join(', ')}`);
  }
  return byNum;
}

function pickFiscalYear(fys, date) {
  // Return FY that covers `date`; fallback ke FY paling baru.
  const found = fys.find((f) => f.startDate <= date && date <= f.endDate);
  return found ?? fys[fys.length - 1];
}

async function printPreview(prepared, accts) {
  console.log('\n══════════════════════════════════════════════════════════════════════════════');
  console.log('  DRY RUN PREVIEW — Import Fixed Assets PMD');
  console.log('══════════════════════════════════════════════════════════════════════════════');

  // Category summary
  const byCategory = {};
  for (const p of prepared) {
    byCategory[p.category] = byCategory[p.category] ?? { count: 0, totalCost: 0, totalAccum: 0, totalBV: 0 };
    byCategory[p.category].count++;
    byCategory[p.category].totalCost += p.acquisitionCost;
    byCategory[p.category].totalAccum += p.accumulatedDepreciation;
    byCategory[p.category].totalBV += p.bookValue;
  }

  console.log('\n📊 RINGKASAN PER KATEGORI');
  console.log('────────────────────────────────────────────────────────────────────────');
  console.log('Kategori   | Jumlah |     Total Harga |  Akum. Penyusutan |    Nilai Buku');
  console.log('────────────────────────────────────────────────────────────────────────');
  for (const [cat, d] of Object.entries(byCategory)) {
    const row = `${cat.padEnd(10)} | ${String(d.count).padStart(6)} | ${fmtRp(d.totalCost).padStart(15)} | ${fmtRp(d.totalAccum).padStart(17)} | ${fmtRp(d.totalBV).padStart(13)}`;
    console.log(row);
  }
  const totalCost = Object.values(byCategory).reduce((s, d) => s + d.totalCost, 0);
  const totalAccum = Object.values(byCategory).reduce((s, d) => s + d.totalAccum, 0);
  const totalBV = Object.values(byCategory).reduce((s, d) => s + d.totalBV, 0);
  console.log('────────────────────────────────────────────────────────────────────────');
  console.log(`TOTAL      | ${String(prepared.length).padStart(6)} | ${fmtRp(totalCost).padStart(15)} | ${fmtRp(totalAccum).padStart(17)} | ${fmtRp(totalBV).padStart(13)}`);

  console.log('\n🗂  AKUN YANG DIPAKAI');
  console.log('────────────────────────────────────────────────────────────────────────');
  for (const [cat, m] of Object.entries(CATEGORY_MAP)) {
    const a = accts.get(m.asset);
    const d = m.dep ? accts.get(m.dep) : null;
    const ad = m.accum ? accts.get(m.accum) : null;
    console.log(`${cat.padEnd(10)} → asset: ${a.accountNumber} ${a.name}`);
    if (d) console.log(`            beban: ${d.accountNumber} ${d.name}`);
    if (ad) console.log(`           akum.: ${ad.accountNumber} ${ad.name}`);
  }

  // Duplicates info
  const dups = prepared.filter((p) => p.finalId !== p.origId);
  if (dups.length > 0) {
    console.log('\n⚠️  DUPLIKAT ID DI-RENAME OTOMATIS');
    console.log('────────────────────────────────────────────────────────────────────────');
    for (const d of dups) {
      console.log(`  ${d.origId} → ${d.finalId.padEnd(8)} | ${d.name}`);
    }
  }

  console.log('\n📋 BREAKDOWN SEMUA ASET (dikelompokkan per kategori)');
  console.log('═'.repeat(120));
  const showFmt = (i, p, faSeq) => {
    const dateStr = p.acquisitionDate.toISOString().substring(0, 10);
    return [
      String(i).padStart(3),
      `FA-${String(faSeq).padStart(4, '0')}`,
      p.finalId.padEnd(8),
      p.name.padEnd(40).substring(0, 40),
      dateStr,
      fmtRp(p.acquisitionCost).padStart(17),
      fmtRp(p.accumulatedDepreciation).padStart(17),
      fmtRp(p.bookValue).padStart(17),
      `${p.usefulLifeMonths}mo`.padStart(7),
    ].join(' | ');
  };
  const header = [
    ' No'.padStart(3),
    'FA-Auto ',
    'Kode    ',
    'Nama'.padEnd(40),
    'Acq Date  ',
    '      Harga Beli ',
    '      Akum Peny. ',
    '       Nilai Buku',
    '   Umur',
  ].join(' | ');

  const grouped = {};
  prepared.forEach((p, idx) => {
    grouped[p.category] = grouped[p.category] ?? [];
    grouped[p.category].push({ p, faSeq: idx + 1 });
  });

  let counter = 0;
  for (const [cat, list] of Object.entries(grouped)) {
    console.log(`\n▾ ${cat} (${list.length} aset)`);
    console.log('─'.repeat(120));
    console.log(header);
    console.log('─'.repeat(120));
    for (const { p, faSeq } of list) {
      counter++;
      console.log(showFmt(counter, p, faSeq));
    }
    const sub = list.reduce(
      (acc, { p }) => {
        acc.cost += p.acquisitionCost;
        acc.accum += p.accumulatedDepreciation;
        acc.bv += p.bookValue;
        return acc;
      },
      { cost: 0, accum: 0, bv: 0 },
    );
    console.log('─'.repeat(120));
    console.log(
      `  Subtotal ${cat.padEnd(10)} (${list.length}): cost ${fmtRp(sub.cost).padStart(15)} | accum ${fmtRp(sub.accum).padStart(15)} | bv ${fmtRp(sub.bv).padStart(15)}`,
    );
  }

  console.log('\n📅 JADWAL DEPRESIASI (ringkasan)');
  console.log('────────────────────────────────────────────────────────────────────────');
  const nonTanah = prepared.filter((p) => !p.isTanah);
  let totalEntries = 0;
  const today = new Date(2026, 5, 1, 12, 0, 0); // 1 Juni 2026 (start point)
  for (const p of nonTanah) {
    const elapsed = monthsBetween(p.acquisitionDate, today);
    const remaining = Math.max(0, p.usefulLifeMonths - elapsed);
    totalEntries += remaining;
  }
  const tanahCount = prepared.filter((p) => p.isTanah).length;
  console.log(`Tanah                : ${tanahCount} aset — SKIP jadwal (tidak disusut)`);
  console.log(`Aset disusut         : ${nonTanah.length} aset`);
  console.log(`Total entry depresiasi (per bulan, mulai Juni 2026): ${totalEntries}`);
  console.log(`Rata-rata sisa umur  : ${(totalEntries / nonTanah.length).toFixed(1)} bulan/aset`);

  console.log('\n✅ Preview selesai. Tidak ada data ditulis ke DB.');
  console.log('   Untuk eksekusi sungguhan: node scripts/import-fixed-assets.cjs --run');
  console.log('══════════════════════════════════════════════════════════════════════════════\n');
}

function monthsBetween(from, to) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

// ─── Insert (only with --run) ────────────────────────────────────────────
async function executeImport(prepared, accts, fy, userId) {
  const SCHEDULE_START = new Date(2026, 5, 1, 12, 0, 0); // 1 Juni 2026
  const existingCount = await prisma.fixedAsset.count();
  let seq = existingCount;
  let createdCount = 0;
  let entriesCount = 0;

  for (const p of prepared) {
    seq++;
    const assetNumber = `FA-${String(seq).padStart(4, '0')}`;
    const map = CATEGORY_MAP[p.category];
    const assetAcct = accts.get(map.asset);
    const depAcct = map.dep ? accts.get(map.dep) : assetAcct;     // Tanah: pakai asset acct sebagai placeholder
    const accumAcct = map.accum ? accts.get(map.accum) : assetAcct;

    await prisma.$transaction(async (tx) => {
      const created = await tx.fixedAsset.create({
        data: {
          assetNumber,
          name: p.name,
          category: p.category,
          description: p.description,
          acquisitionDate: p.acquisitionDate,
          acquisitionCost: p.acquisitionCost,
          usefulLifeMonths: p.usefulLifeMonths,
          salvageValue: p.salvageValue,
          depreciationMethod: 'straight_line',
          accumulatedDepreciation: p.accumulatedDepreciation,
          bookValue: p.bookValue,
          assetAccountId: assetAcct.id,
          depreciationAccountId: depAcct.id,
          accumulatedDepAccountId: accumAcct.id,
          fiscalYearId: fy.id,
          createdBy: userId,
        },
      });

      // Skip schedule for Tanah (nothing to depreciate)
      if (p.isTanah) return;

      // Generate schedule from Juni 2026 → end of useful life
      const monthly = (p.acquisitionCost - p.salvageValue) / p.usefulLifeMonths;
      const monthlyRound = Math.round(monthly * 100) / 100;
      const elapsedMonths = monthsBetween(p.acquisitionDate, SCHEDULE_START);
      const remainingMonths = Math.max(0, p.usefulLifeMonths - elapsedMonths);

      const entries = [];
      for (let i = 0; i < remainingMonths; i++) {
        const periodDate = new Date(2026, 5 + i, 30, 12, 0, 0); // end-of-month approx
        // last entry absorbs rounding residue
        const isLast = i === remainingMonths - 1;
        const amount = isLast
          ? Math.max(0, p.bookValue - monthlyRound * (remainingMonths - 1))
          : monthlyRound;
        entries.push({
          fixedAssetId: created.id,
          periodDate,
          amount,
        });
      }
      if (entries.length > 0) {
        await tx.depreciationEntry.createMany({ data: entries });
        entriesCount += entries.length;
      }
    });

    createdCount++;
    if (createdCount % 10 === 0) {
      console.log(`  inserted ${createdCount}/${prepared.length}…`);
    }
  }

  return { createdCount, entriesCount };
}

// ─── Main ────────────────────────────────────────────────────────────────
async function main() {
  const isRun = process.argv.includes('--run');

  const prepared = await prepare();
  const accts = await loadAccounts();

  if (!isRun) {
    await printPreview(prepared, accts);
    return;
  }

  // Live execution
  const fys = await prisma.fiscalYear.findMany({ orderBy: { startDate: 'asc' } });
  if (fys.length === 0) throw new Error('Tidak ada Fiscal Year aktif.');
  const fy = pickFiscalYear(fys, new Date()) ?? fys[fys.length - 1];

  // pick any admin user for createdBy
  const admin = await prisma.user.findFirst({ where: { role: 'Admin' }, select: { id: true } });
  if (!admin) throw new Error('Tidak ada user Admin.');

  console.log(`\nRUN MODE — inserting ${prepared.length} assets …\n`);
  console.log(`FY=${fy.name} | createdBy=${admin.id}\n`);

  const t0 = Date.now();
  const { createdCount, entriesCount } = await executeImport(prepared, accts, fy, admin.id);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n✅ Selesai: ${createdCount} aset dibuat, ${entriesCount} jadwal depresiasi (${dt}s).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('\n❌ ERROR:', err.message);
    if (err.stack) console.error(err.stack);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
