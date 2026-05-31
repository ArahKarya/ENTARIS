const { PrismaPg } = require('/app/server/node_modules/@prisma/adapter-pg');
const { PrismaClient } = require('/app/server/node_modules/@prisma/client');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
(async () => {
  const parties = await prisma.party.findMany({
    where: { name: { contains: 'ambang', mode: 'insensitive' } },
    select: { id: true, name: true, partyType: true },
  });
  const si28 = await prisma.salesInvoice.findMany({
    where: { date: { gte: new Date('2026-05-28T00:00:00Z'), lte: new Date('2026-05-28T23:59:59Z') } },
    include: { customer: { select: { name: true } }, items: { include: { inventoryItem: { select: { code: true } } } } },
    orderBy: { invoiceNumber: 'asc' },
  });
  const out = {
    parties_match_bambang: parties,
    invoices_28mei: si28.map(i => ({
      no: i.invoiceNumber, status: i.status, cust: i.customer?.name, grand: String(i.grandTotal),
      items: i.items.map(it => `${it.itemName} [${it.inventoryItem?.code||'-'}] qty=${it.quantity} rate=${it.rate}`),
    })),
  };
  require('fs').writeFileSync('/tmp/bambang.json', JSON.stringify(out, null, 2));
  console.log('parties:', parties.length, 'inv28:', si28.length);
  await prisma.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
