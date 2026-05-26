// Link DO-202605-0068 (manual, AB Chicken) ke SO PSN-202605-0001.
// Staff lupa generate SJ dari SO, malah buat manual. Stok & invoice sudah
// jalan dari DO manual — ini PURELY linkage/tracking fix:
//   1. delivery_orders.sales_order_id = SO
//   2. delivery_order_items.sales_order_item_id = SO item
//   3. sales_order_items.delivered_qty += qty DO
//   4. recompute SO status (7000/7000 → FullyDelivered)
// TIDAK ada perubahan stok / JE.

const { PrismaPg } = require('/app/server/node_modules/@prisma/adapter-pg');
const { PrismaClient } = require('/app/server/node_modules/@prisma/client');

const SO_ID = 'ed386eda-199d-493c-a5d6-d2dd14643c2f';   // PSN-202605-0001
const SOI_ID = 'd3a2f334-0a6d-4820-9998-ac4573e224ad';  // SO line Pagi Jaya 5Kg
const DO_ID = '1ac77bb8-cb1c-4a0d-9852-190f17db349e';   // DO-202605-0068
const DOI_ID = 'e06039c1-9def-4823-8f79-6eb6d79dceab';  // DO line
const DO_QTY = 7000;

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Guard: pastikan item + qty cocok sebelum link
  const soi = await prisma.salesOrderItem.findUnique({ where: { id: SOI_ID } });
  const doi = await prisma.deliveryOrderItem.findUnique({ where: { id: DOI_ID } });
  if (!soi || !doi) throw new Error('SO item / DO item tidak ditemukan');
  if (soi.inventoryItemId !== doi.inventoryItemId) {
    throw new Error(`Item beda: SO=${soi.inventoryItemId} DO=${doi.inventoryItemId}`);
  }
  console.log(`SO item: ${soi.itemName} qty=${soi.quantity} delivered=${soi.deliveredQty}`);
  console.log(`DO item: ${doi.itemName} qty=${doi.quantity}`);

  if (process.env.APPLY !== '1') {
    console.log('\nSet APPLY=1 to execute.');
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx) => {
    // 1. Link DO header → SO
    await tx.deliveryOrder.update({ where: { id: DO_ID }, data: { salesOrderId: SO_ID } });
    // 2. Link DO line → SO line
    await tx.deliveryOrderItem.update({ where: { id: DOI_ID }, data: { salesOrderItemId: SOI_ID } });
    // 3. Increment delivered_qty
    await tx.salesOrderItem.update({ where: { id: SOI_ID }, data: { deliveredQty: { increment: DO_QTY } } });
    // 4. Recompute SO status
    const so = await tx.salesOrder.findUnique({ where: { id: SO_ID }, include: { items: true } });
    const allFully = so.items.every((it) => Number(it.deliveredQty) >= Number(it.quantity));
    const anyDelivered = so.items.some((it) => Number(it.deliveredQty) > 0);
    const newStatus = allFully ? 'FullyDelivered' : anyDelivered ? 'PartiallyDelivered' : 'Submitted';
    if (newStatus !== so.status) {
      await tx.salesOrder.update({ where: { id: SO_ID }, data: { status: newStatus } });
    }
    console.log(`\nSO status: ${so.status} → ${newStatus}`);
  }, { timeout: 30000 });

  console.log('Linked. Done.');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
