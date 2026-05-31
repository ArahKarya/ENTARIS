const { PrismaPg } = require('/app/server/node_modules/@prisma/adapter-pg');
const { PrismaClient } = require('/app/server/node_modules/@prisma/client');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
(async () => {
  const inv = await prisma.salesInvoice.findUnique({
    where: { invoiceNumber: 'SI-202605-0103' },
    include: { items: { include: { deliveryOrderItem: true } } },
  });
  const doItemId = inv.items[0].deliveryOrderItem?.id;
  const doItem = doItemId ? await prisma.deliveryOrderItem.findUnique({
    where: { id: doItemId },
    include: { stockMovement: true, deliveryOrder: true },
  }) : null;
  const cruise = await prisma.inventoryItem.findFirst({ where: { code: 'BRS-PGC-25KG' } });
  const walemu = await prisma.inventoryItem.findFirst({ where: { code: 'BRS-WLM-50KG' } });
  // COGS JE
  const cogsJe = await prisma.journalEntry.findUnique({
    where: { entryNumber: 'JV-COGS-SI-202605-0103' },
    include: { items: { include: { account: { select: { accountNumber: true, name: true } } } } },
  });
  // per-warehouse stock for both items at the DO warehouse
  const wh = doItem?.warehouseId;
  const cruiseWh = wh ? await prisma.inventoryStock.findUnique({ where: { itemId_warehouseId: { itemId: cruise.id, warehouseId: wh } } }) : null;
  const walemuWh = wh ? await prisma.inventoryStock.findUnique({ where: { itemId_warehouseId: { itemId: walemu.id, warehouseId: wh } } }) : null;

  const out = {
    invoice: { no: inv.invoiceNumber, status: inv.status, grand: String(inv.grandTotal), siiId: inv.items[0].id, qty: String(inv.items[0].quantity), rate: String(inv.items[0].rate) },
    doItem: doItem ? { id: doItem.id, itemName: doItem.itemName, invItemId: doItem.inventoryItemId, warehouseId: doItem.warehouseId, doNumber: doItem.deliveryOrder?.doNumber } : null,
    stockMovement: doItem?.stockMovement ? { id: doItem.stockMovement.id, no: doItem.stockMovement.movementNumber, itemId: doItem.stockMovement.itemId, type: doItem.stockMovement.movementType, qty: String(doItem.stockMovement.quantity), unitCost: String(doItem.stockMovement.unitCost), totalValue: String(doItem.stockMovement.totalValue), wh: doItem.stockMovement.warehouseId } : null,
    cruise: { id: cruise.id, code: cruise.code, currentStock: String(cruise.currentStock), avg: String(cruise.averageCost), accountId: cruise.accountId, whStock: cruiseWh ? String(cruiseWh.currentStock) : null },
    walemu: { id: walemu.id, code: walemu.code, currentStock: String(walemu.currentStock), avg: String(walemu.averageCost), accountId: walemu.accountId, whStock: walemuWh ? String(walemuWh.currentStock) : null },
    cogsJe: cogsJe ? { id: cogsJe.id, lines: cogsJe.items.map(i => ({ id: i.id, acc: i.account.accountNumber, name: i.account.name, debit: String(i.debit), credit: String(i.credit) })) } : null,
  };
  require('fs').writeFileSync('/tmp/si0103.json', JSON.stringify(out, null, 2));
  console.log('OK');
  await prisma.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
