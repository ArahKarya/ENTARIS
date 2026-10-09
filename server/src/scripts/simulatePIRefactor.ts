// End-to-end simulation of the new purchase invoice flow.
// Creates a realistic rice purchase, verifies storage + computed values,
// then rolls back the transaction so DB stays clean.

import { prisma } from '../lib/prisma';
import { computePurchaseItem, sumPotonganItem } from '../services/purchaseInvoiceCalc';

async function main() {
  console.log('═══ SIMULASI REFACTOR INVOICE PEMBELIAN ═══\n');

  // Pick any active supplier and inventory item from DB
  const supplier = await prisma.party.findFirst({ where: { partyType: 'Supplier', isActive: true } });
  if (!supplier) throw new Error('Tidak ada supplier aktif');
  const invItem = await prisma.inventoryItem.findFirst({ where: { isActive: true } });
  if (!invItem) throw new Error('Tidak ada inventory item aktif');
  const fy = await prisma.fiscalYear.findFirst({ where: { isClosed: false } });
  if (!fy) throw new Error('Tidak ada fiscal year terbuka');
  const user = await prisma.user.findFirst();
  if (!user) throw new Error('Tidak ada user');

  console.log(`Supplier  : ${supplier.name}`);
  console.log(`Item      : ${invItem.name} (akun ${invItem.accountId ?? 'default'})`);
  console.log(`Fiscal Yr : ${fy.name}\n`);

  // Simulasi 3 baris
  const items = [
    {
      itemName: invItem.name,
      inventoryItemId: invItem.id,
      quantity: 1000,
      unit: 'Kg',
      rate: 6500,
      taxPct: 0,
      pphPct: 0.5,
      potonganItem: 50_000,
      kualitas: 'KA 18% bersih',
      refaksi: 50,
      timbanganTruk: 1050,
      timbanganDiterima: 1000,
    },
    {
      itemName: invItem.name + ' (lot 2)',
      inventoryItemId: invItem.id,
      quantity: 1500,
      unit: 'Kg',
      rate: 7000,
      taxPct: 0,
      pphPct: 0.5,
      potonganItem: 30_000,
      kualitas: 'Premium',
      refaksi: 0,
      timbanganTruk: 1500,
      timbanganDiterima: 1500,
    },
  ];

  console.log('─── PER-ITEM CALC (computePurchaseItem) ───');
  const calcs = items.map((it) => {
    const c = computePurchaseItem(it);
    console.log(
      `  ${it.itemName.padEnd(30)} qty=${c.effectiveQuantity.toFixed(0).padStart(5)}` +
        ` × ${it.rate} = ${c.subtotal.toFixed(0).padStart(12)}` +
        ` − pph${c.pphAmount.toFixed(0)} − pot${it.potonganItem} → ${c.hargaAkhir.toFixed(0).padStart(12)}`,
    );
    return c;
  });

  const itemsTotal = calcs.reduce((s, c) => s.plus(c.hargaAkhir), calcs[0].hargaAkhir.minus(calcs[0].hargaAkhir));
  const headerPotongan = sumPotonganItem(items);
  const grandTotal = itemsTotal.plus(0); // biayaLain = 0 in simulation
  console.log(`\n  Subtotal items   : ${itemsTotal.toFixed(2)}`);
  console.log(`  Header potongan  : ${headerPotongan.toFixed(2)}  (cache = SUM items.potonganItem)`);
  console.log(`  Grand Total      : ${grandTotal.toFixed(2)}\n`);

  // Sanity asserts
  // Line 1: 1000×6500=6,500,000; pph 0.5%=32,500; pot 50,000 → 6,417,500
  const ok1 = calcs[0].hargaAkhir.toNumber() === 6_417_500;
  // Line 2: 1500×7000=10,500,000; pph 0.5%=52,500; pot 30,000 → 10,417,500
  const ok2 = calcs[1].hargaAkhir.toNumber() === 10_417_500;
  // Total: 16,835,000
  const ok3 = itemsTotal.toNumber() === 16_835_000;
  // Header potongan: 80,000
  const ok4 = headerPotongan.toNumber() === 80_000;

  console.log('─── ASSERTIONS ───');
  console.log(`  ✓ Line 1 hargaAkhir = 6,417,500 : ${ok1 ? 'PASS' : 'FAIL'}`);
  console.log(`  ✓ Line 2 hargaAkhir = 10,417,500: ${ok2 ? 'PASS' : 'FAIL'}`);
  console.log(`  ✓ Items total = 16,835,000     : ${ok3 ? 'PASS' : 'FAIL'}`);
  console.log(`  ✓ Header potongan = 80,000     : ${ok4 ? 'PASS' : 'FAIL'}`);

  // DB write (rolled back)
  console.log('\n─── DB INTEGRATION (rolled back) ───');
  await prisma
    .$transaction(async (tx) => {
      const inv = await tx.purchaseInvoice.create({
        data: {
          invoiceNumber: `SIM-${Date.now()}`,
          date: new Date(),
          partyId: supplier.id,
          status: 'Submitted',
          grandTotal: grandTotal.toNumber(),
          outstanding: grandTotal.toNumber(),
          taxPct: 0,
          potongan: headerPotongan.toNumber(),
          biayaLain: 0,
          fiscalYearId: fy.id,
          createdBy: user.id,
          submittedAt: new Date(),
          items: {
            create: items.map((it, i) => ({
              itemName: it.itemName,
              inventoryItemId: it.inventoryItemId,
              quantity: calcs[i].effectiveQuantity.toNumber(),
              unit: it.unit,
              rate: it.rate,
              discount: 0,
              amount: calcs[i].hargaAkhir.toNumber(),
              taxPct: it.taxPct,
              pphPct: it.pphPct,
              potonganItem: it.potonganItem,
              kualitas: it.kualitas,
              refaksi: it.refaksi,
              timbanganTruk: it.timbanganTruk,
              timbanganDiterima: it.timbanganDiterima,
              accountId: invItem.accountId!,
            })),
          },
        },
        include: { items: true },
      });

      console.log(`  Created invoice id=${inv.id} number=${inv.invoiceNumber}`);
      console.log(`  Items stored: ${inv.items.length}`);
      console.log(`  Sample item:`);
      const s = inv.items[0];
      console.log(
        `    timbanganTruk=${s.timbanganTruk} refaksi=${s.refaksi} timbanganDiterima=${s.timbanganDiterima}`,
      );
      console.log(`    kualitas="${s.kualitas}" pphPct=${s.pphPct} potonganItem=${s.potonganItem}`);
      console.log(`    quantity=${s.quantity} amount=${s.amount}`);

      // Verify roundtrip: amount stored == calc.hargaAkhir
      const ok5 = Number(s.amount) === calcs[0].hargaAkhir.toNumber();
      console.log(`  ✓ DB roundtrip amount: ${ok5 ? 'PASS' : 'FAIL'}`);

      // Rollback
      throw new Error('__ROLLBACK_SIMULATION__');
    })
    .catch((e) => {
      if (e.message !== '__ROLLBACK_SIMULATION__') throw e;
      console.log('  ↩ rolled back (DB clean)\n');
    });

  console.log('═══ SIMULASI SELESAI ═══');
}

main()
  .catch((e) => {
    console.error('FAIL:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
