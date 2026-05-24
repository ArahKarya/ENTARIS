// Link SI-202605-0059 (BGN Viva, 17 Mei, direct-sale) ke DO-202605-0034
// (BGN Viva 17 Mei, masih Submitted). Fix double stock-out:
//   - SM-0493 (DO): Out 1000 Kg (active)
//   - SM-0494 (SI direct): Out 1000 Kg (active) — DUPLIKAT
// Plan: cancel SM-0494, link SI line → DO item, link DO → SI invoice.
// GL tetap (JV-SI + JV-COGS-SI sudah benar 1x).

const { PrismaPg } = require('/app/server/node_modules/@prisma/adapter-pg');
const { PrismaClient } = require('/app/server/node_modules/@prisma/client');

const SI_ID = '5ba4b360-f4f0-42b9-9edc-cebbd124bed7';      // SI-202605-0059
const SII_ID = '5b0b59ca-f7ec-4f33-a94a-dfa389fb68d8';      // line di SI
const DO_ID = 'ec891556-1397-48ff-8ca1-da98cc281107';       // DO-202605-0034
const DOI_ID = '9ee8158e-1257-40b5-80de-3d415a9371d0';      // line di DO
const SI_DUP_SM_ID = '0227525e-920f-430f-92a0-7c4a545b8751'; // SM-0494 (SI direct)
const POLES_WH = 'ecdc5a46-ca7d-407b-95c3-f942d61501c5';
const ITEM_ID = '63f56a91-e484-4714-9aa8-0f04257c63f8';     // Beras Cruise 25Kg
const QTY = 1000;

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('=== PRE-FIX ===');
  const itemBefore = await prisma.inventoryItem.findUnique({ where: { id: ITEM_ID }, select: { code: true, currentStock: true } });
  const stockBefore = await prisma.inventoryStock.findUnique({
    where: { itemId_warehouseId: { itemId: ITEM_ID, warehouseId: POLES_WH } },
    select: { currentStock: true },
  });
  console.log(`Item ${itemBefore?.code}: global stock=${itemBefore?.currentStock}, POLES stock=${stockBefore?.currentStock}`);

  if (process.env.APPLY !== '1') {
    console.log('\nWill: cancel SM-0494, link SI line ↔ DO item, link DO ↔ SI invoice');
    console.log('Stock should increment +1000 (revert SI duplicate Out)');
    console.log('Set APPLY=1 to execute.');
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx) => {
    // 1. Cancel SM-0494 (SI's duplicate Out)
    await tx.stockMovement.update({
      where: { id: SI_DUP_SM_ID },
      data: { isCancelled: true },
    });
    // 2. Revert stock: increment +1000 at item level + per-warehouse POLES
    await tx.inventoryItem.update({
      where: { id: ITEM_ID },
      data: { currentStock: { increment: QTY } },
    });
    await tx.inventoryStock.update({
      where: { itemId_warehouseId: { itemId: ITEM_ID, warehouseId: POLES_WH } },
      data: { currentStock: { increment: QTY } },
    });
    // 3. Link SI line → DO item
    await tx.salesInvoiceItem.update({
      where: { id: SII_ID },
      data: { deliveryOrderItemId: DOI_ID },
    });
    // 4. Link DO → SI invoice
    await tx.deliveryOrder.update({
      where: { id: DO_ID },
      data: { invoiceId: SI_ID, invoicedAt: new Date() },
    });
  }, { timeout: 30000 });

  const itemAfter = await prisma.inventoryItem.findUnique({ where: { id: ITEM_ID }, select: { code: true, currentStock: true } });
  const stockAfter = await prisma.inventoryStock.findUnique({
    where: { itemId_warehouseId: { itemId: ITEM_ID, warehouseId: POLES_WH } },
    select: { currentStock: true },
  });
  console.log('\n=== POST-FIX ===');
  console.log(`Item ${itemAfter?.code}: global stock=${itemAfter?.currentStock}, POLES stock=${stockAfter?.currentStock}`);
  console.log('Done.');

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
