#!/usr/bin/env node
/* eslint-disable */
/**
 * Post Opening Balance Journal Entry untuk Aset Tetap PMD.
 *
 * Konteks:
 *   - Script `import-fixed-assets.cjs` insert 79 aset langsung ke tabel
 *     `fixed_assets` tanpa post jurnal.
 *   - Akibat: akun 1.6.x (Aset Tetap) saldonya 0, akun 1.7.x (Akm
 *     Penyusutan) juga 0, padahal nilai aset di neraca real seharusnya:
 *       cost  Rp 16.359 M  (cost agregat)
 *     − akum  Rp  5.040 M  (akumulasi penyusutan opening)
 *       = bv  Rp 11.319 M  (book value yg masuk neraca)
 *
 * Solusi: 1 jurnal opening balance:
 *   DR 1.6.1 Tanah                cost Tanah
 *   DR 1.6.2.1 Bangunan           cost Bangunan
 *   DR 1.6.6 Peralatan            cost Peralatan
 *   DR 1.6.4 Mesin                cost Mesin
 *        CR 1.7.1 Akm Gedung           accum Bangunan (contra-asset)
 *        CR 1.7.3 Akm Mesin            accum Mesin
 *        CR 1.7.5 Akm Peralatan        accum Peralatan
 *        CR 3.1 Equitas Saldo Awal     net book value (cost − accum)
 *
 * Total DR = Total CR = sum cost.
 * Net effect: Aset (gross) +cost, Akm (contra) +accum, Equity +bookValue.
 *
 * Default DRY RUN. Pakai --run untuk eksekusi sungguhan.
 */
const path = require('path');
const APP_ROOT = process.env.APP_ROOT || '/app/server';
const { PrismaClient } = require(path.join(APP_ROOT, 'node_modules', '@prisma', 'client'));
const { PrismaPg } = require(path.join(APP_ROOT, 'node_modules', '@prisma', 'adapter-pg'));
const { Pool } = require(path.join(APP_ROOT, 'node_modules', 'pg'));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const fmtRp = (n) => 'Rp ' + Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 });

// Mapping kategori → akun aset & akum penyusutan (number → meta).
// Sama dengan mapping di import-fixed-assets.cjs.
const ASSET_MAP = {
  Tanah:     { asset: '1.6.1',   accum: null },     // Tanah tidak disusut
  Bangunan:  { asset: '1.6.2.1', accum: '1.7.1' },
  Peralatan: { asset: '1.6.6',   accum: '1.7.5' },
  Mesin:     { asset: '1.6.4',   accum: '1.7.3' },
};
const EQUITY_OPENING = '3.1'; // Equitas Saldo Awal

async function main() {
  const isRun = process.argv.includes('--run');

  // 1. Aggregate fixed assets by category
  const assets = await prisma.fixedAsset.findMany({
    where: { status: 'Active' },
    select: { category: true, acquisitionCost: true, accumulatedDepreciation: true, bookValue: true },
  });

  const aggByCat = new Map();
  for (const a of assets) {
    const entry = aggByCat.get(a.category) ?? { count: 0, cost: 0, accum: 0, bv: 0 };
    entry.count++;
    entry.cost += Number(a.acquisitionCost);
    entry.accum += Number(a.accumulatedDepreciation);
    entry.bv += Number(a.bookValue);
    aggByCat.set(a.category, entry);
  }

  // 2. Load accounts (need numbers from ASSET_MAP + equity)
  const neededNums = new Set([EQUITY_OPENING]);
  for (const m of Object.values(ASSET_MAP)) {
    if (m.asset) neededNums.add(m.asset);
    if (m.accum) neededNums.add(m.accum);
  }
  const accts = await prisma.account.findMany({
    where: { accountNumber: { in: Array.from(neededNums) } },
    select: { id: true, accountNumber: true, name: true, balance: true },
  });
  const byNum = new Map(accts.map((a) => [a.accountNumber, a]));
  const missing = Array.from(neededNums).filter((n) => !byNum.has(n));
  if (missing.length > 0) {
    throw new Error(`Akun tidak ditemukan: ${missing.join(', ')}`);
  }

  // 3. Build JE line items
  const lines = [];
  let totalDR = 0, totalCR = 0;

  for (const [cat, d] of aggByCat) {
    const map = ASSET_MAP[cat];
    if (!map) throw new Error(`Kategori "${cat}" tidak punya mapping akun.`);
    // DR Asset cost
    if (d.cost > 0) {
      const acct = byNum.get(map.asset);
      lines.push({
        accountId: acct.id, accountNumber: acct.accountNumber, accountName: acct.name,
        debit: +d.cost.toFixed(2), credit: 0,
        description: `Opening ${cat}: ${d.count} aset @ cost`,
      });
      totalDR += d.cost;
    }
    // CR Akm Penyusutan (contra-asset)
    if (map.accum && d.accum > 0) {
      const acct = byNum.get(map.accum);
      lines.push({
        accountId: acct.id, accountNumber: acct.accountNumber, accountName: acct.name,
        debit: 0, credit: +d.accum.toFixed(2),
        description: `Opening akm. penyusutan ${cat}`,
      });
      totalCR += d.accum;
    }
  }

  // 4. CR Equity Saldo Awal: net book value (cost - accum)
  const netBookValue = +(totalDR - totalCR).toFixed(2);
  const equityAcct = byNum.get(EQUITY_OPENING);
  lines.push({
    accountId: equityAcct.id, accountNumber: equityAcct.accountNumber, accountName: equityAcct.name,
    debit: 0, credit: netBookValue,
    description: 'Opening balance nilai buku aset tetap PMD',
  });
  totalCR += netBookValue;

  // Sanity check
  if (Math.abs(totalDR - totalCR) > 0.01) {
    throw new Error(`JE tidak balance: DR ${totalDR} ≠ CR ${totalCR}`);
  }

  // 5. Print preview
  console.log('\n══════════════════════════════════════════════════════════════════════════════');
  console.log('  Opening JE — Aset Tetap PMD');
  console.log('══════════════════════════════════════════════════════════════════════════════');
  console.log('\n📊 RINGKASAN PER KATEGORI');
  console.log('────────────────────────────────────────────────────────────────────────');
  for (const [cat, d] of aggByCat) {
    console.log(`  ${cat.padEnd(10)} (${d.count}): cost ${fmtRp(d.cost).padStart(18)} | accum ${fmtRp(d.accum).padStart(15)} | bv ${fmtRp(d.bv).padStart(15)}`);
  }

  console.log('\n📋 JOURNAL ENTRY YANG AKAN DI-POST');
  console.log('────────────────────────────────────────────────────────────────────────');
  console.log('Akun       | Nama                                  |        Debit |        Kredit');
  console.log('────────────────────────────────────────────────────────────────────────');
  for (const l of lines) {
    const dr = l.debit > 0 ? fmtRp(l.debit).padStart(12) : ''.padStart(12);
    const cr = l.credit > 0 ? fmtRp(l.credit).padStart(12) : ''.padStart(12);
    console.log(`${l.accountNumber.padEnd(10)} | ${(l.accountName).padEnd(38)} | ${dr} | ${cr}`);
  }
  console.log('────────────────────────────────────────────────────────────────────────');
  console.log(`${'TOTAL'.padEnd(10)} | ${''.padEnd(38)} | ${fmtRp(totalDR).padStart(12)} | ${fmtRp(totalCR).padStart(12)}`);

  console.log('\n💡 EFEK KE NERACA');
  console.log('────────────────────────────────────────────────────────────────────────');
  console.log(`  Aset (1.6.x) gross naik     : ${fmtRp(totalDR)}`);
  console.log(`  Akm (1.7.x) contra naik     : ${fmtRp(totalCR - netBookValue)}`);
  console.log(`  Equity (3.1) naik           : ${fmtRp(netBookValue)}`);
  console.log(`  Net asset effect (book val) : ${fmtRp(netBookValue)}`);

  if (!isRun) {
    console.log('\n✅ DRY RUN selesai. Tidak ada data ditulis.');
    console.log('   Untuk eksekusi sungguhan: node scripts/post-fa-opening-je.cjs --run\n');
    return;
  }

  // 6. Execute (--run)
  const fy = await prisma.fiscalYear.findFirst({ orderBy: { startDate: 'desc' } });
  if (!fy) throw new Error('Tidak ada fiscal year.');
  const admin = await prisma.user.findFirst({ where: { role: 'Admin' }, select: { id: true } });
  if (!admin) throw new Error('Tidak ada user Admin.');

  // entryNumber unik — pakai JV-FA-OPENING-<timestamp>
  const entryNumber = `JV-FA-OPENING-${new Date().toISOString().substring(0, 10).replace(/-/g, '')}`;

  // Reject kalau sudah pernah di-post
  const existing = await prisma.journalEntry.findUnique({ where: { entryNumber } });
  if (existing) {
    throw new Error(`Journal entry ${entryNumber} sudah ada. Cancel dulu via UI sebelum re-post.`);
  }

  const txDate = new Date();
  console.log(`\nRUN MODE — posting JE ${entryNumber} (FY=${fy.name}) ...`);

  await prisma.$transaction(async (tx) => {
    // a. Create JE + items
    const je = await tx.journalEntry.create({
      data: {
        entryNumber,
        date: txDate,
        status: 'Submitted',
        submittedAt: txDate,
        narration: 'Opening balance Aset Tetap PMD (import 79 aset, snapshot per Mei 2026)',
        fiscalYearId: fy.id,
        createdBy: admin.id,
        items: {
          create: lines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            description: l.description,
          })),
        },
      },
    });

    // b. Create ALE for each line
    await tx.accountingLedgerEntry.createMany({
      data: lines.map((l) => ({
        date: txDate,
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
        referenceType: 'JournalEntry',
        referenceId: je.id,
        description: l.description,
        fiscalYearId: fy.id,
      })),
    });

    // c. Update account balances
    //    ASSET & EXPENSE: balance += debit - credit (debit-natural)
    //    LIABILITY/EQUITY/REVENUE: balance += credit - debit (credit-natural)
    // 1.7.x akm penyusutan is ASSET (contra-asset) — credit increases its
    //    balance in negative direction. Schema treats balance as raw signed
    //    number; payment service uses updateAccountBalance(tx, id, debit, credit)
    //    which encapsulates sign per rootType.
    //    We'll just call balance update directly here.
    for (const l of lines) {
      const acct = byNum.get(l.accountNumber);
      // Look up rootType: we have it from earlier accts query
      const dbAcct = await tx.account.findUnique({
        where: { id: l.accountId },
        select: { rootType: true },
      });
      const isDebitNatural = dbAcct.rootType === 'ASSET' || dbAcct.rootType === 'EXPENSE';
      const delta = isDebitNatural ? (l.debit - l.credit) : (l.credit - l.debit);
      await tx.account.update({
        where: { id: l.accountId },
        data: { balance: Number(acct.balance) + delta },
      });
      // Update local cache so subsequent same-account lines see latest
      acct.balance = Number(acct.balance) + delta;
    }
  });

  console.log(`\n✅ JE ${entryNumber} berhasil di-post.`);
  console.log('   Verify: dashboard → Keuangan → Rasio Keuangan');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('\n❌ ERROR:', err.message);
    if (err.stack) console.error(err.stack);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
