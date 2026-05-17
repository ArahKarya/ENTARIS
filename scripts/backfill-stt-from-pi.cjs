/**
 * Backfill: create virtual GoodsReceipt (STT) per existing PurchaseInvoice.
 *
 * Goal: unified UI/data model where every PI has an associated STT row.
 * For historical PIs (before refactor):
 *   - JV stays as-is (DR Persediaan / CR Hutang Usaha — old style)
 *   - StockMovement stays referenced to PurchaseInvoice (no ownership transfer)
 *   - We create a "shadow" GoodsReceipt + GoodsReceiptItem with:
 *       isLegacyBackfill = true
 *       stockMovementId  = the existing SM created by PI submit
 *       lockedUnitCost   = PI line rate
 *   - PI.isLegacyStockFlow = true so app knows to skip "create STT first" guard
 *   - GoodsReceipt.invoiceId = PI.id (so detail UI shows linked)
 *
 * Idempotent: skips PIs that already have a GoodsReceipt linked.
 */

process.chdir('/app/server');
const { PrismaClient } = require('/app/server/node_modules/@prisma/client');
const { PrismaPg } = require('/app/server/node_modules/@prisma/adapter-pg');
const { Pool } = require('/app/server/node_modules/pg');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const admin = await prisma.user.findFirst({ where: { role: 'Admin', isActive: true } });
    if (!admin) throw new Error('No admin user');

    const defaultWh = await prisma.warehouse.findFirst({ where: { isDefault: true, isActive: true } });
    const fallbackWhId = defaultWh?.id ?? (await prisma.warehouse.findFirst({ where: { isActive: true } }))?.id;
    if (!fallbackWhId) throw new Error('No active warehouse for fallback');

    // Pull PIs that don't already have a backfilled STT
    const pis = await prisma.purchaseInvoice.findMany({
      where: {
        status: { not: 'Cancelled' },
        goodsReceipt: null, // no linked STT yet
      },
      include: {
        items: { include: { inventoryItem: true } },
      },
      orderBy: { date: 'asc' },
    });

    console.log(`Found ${pis.length} PIs to backfill`);

    let created = 0;
    let skipped = 0;
    const errors = [];

    for (const pi of pis) {
      const inventoryLines = pi.items.filter((it) => it.inventoryItemId);
      if (inventoryLines.length === 0) {
        skipped++;
        continue; // service-only PI — no stock to model
      }

      try {
        await prisma.$transaction(async (tx) => {
          // Generate STT number from PI number
          const sttNumber = `STT-LEG-${pi.invoiceNumber}`;

          // Safety: skip if STT already exists (idempotent re-run)
          const existing = await tx.goodsReceipt.findUnique({ where: { sttNumber } });
          if (existing) {
            skipped++;
            return;
          }

          const gr = await tx.goodsReceipt.create({
            data: {
              sttNumber,
              date: pi.date,
              partyId: pi.partyId,
              status: 'Submitted',
              notes: `Backfill otomatis dari ${pi.invoiceNumber}. Stok asli ter-record via PI di flow lama.`,
              invoiceId: pi.id,
              invoicedAt: pi.date,
              isLegacyBackfill: true,
              fiscalYearId: pi.fiscalYearId,
              createdBy: admin.id,
              submittedAt: pi.submittedAt ?? pi.createdAt,
            },
          });

          // Pre-fetch SMs created by this PI submit (one per line typically)
          const sms = await tx.stockMovement.findMany({
            where: {
              referenceType: 'PurchaseInvoice',
              referenceId: pi.id,
              isCancelled: false,
              movementType: 'In',
            },
            orderBy: { createdAt: 'asc' },
          });

          // For each PI line, try to match an SM by (itemId, quantity).
          // Best-effort: same item + same qty. If duplicate, use first unused.
          const usedSmIds = new Set();

          for (const line of inventoryLines) {
            const matchSm = sms.find(
              (sm) =>
                !usedSmIds.has(sm.id) &&
                sm.itemId === line.inventoryItemId &&
                Number(sm.quantity) === Number(line.quantity),
            );
            if (matchSm) usedSmIds.add(matchSm.id);

            const grItem = await tx.goodsReceiptItem.create({
              data: {
                goodsReceiptId: gr.id,
                inventoryItemId: line.inventoryItemId,
                warehouseId: line.warehouseId ?? matchSm?.warehouseId ?? fallbackWhId,
                itemName: line.itemName,
                quantity: line.quantity,
                unit: line.unit,
                lockedUnitCost: line.rate, // use PI rate as the "locked" cost
                description: line.description,
                stockMovementId: matchSm?.id ?? null,
              },
            });

            // Back-link PI line to STT line
            await tx.purchaseInvoiceItem.update({
              where: { id: line.id },
              data: { goodsReceiptItemId: grItem.id },
            });
          }

          // Flag PI as legacy flow
          await tx.purchaseInvoice.update({
            where: { id: pi.id },
            data: { isLegacyStockFlow: true },
          });

          created++;
        }, { timeout: 30000 });
      } catch (err) {
        errors.push({ invoice: pi.invoiceNumber, error: err.message });
      }
    }

    console.log(`\n=== BACKFILL SUMMARY ===`);
    console.log(`Created: ${created}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors:  ${errors.length}`);
    if (errors.length > 0) {
      console.log('\nErrors:');
      errors.forEach((e) => console.log(`  ${e.invoice}: ${e.error}`));
    }

    // Sanity checks
    const totalPiActive = await prisma.purchaseInvoice.count({ where: { status: { not: 'Cancelled' } } });
    const totalLegacyStt = await prisma.goodsReceipt.count({ where: { isLegacyBackfill: true } });
    const orphanPis = await prisma.purchaseInvoice.count({
      where: {
        status: { not: 'Cancelled' },
        isLegacyStockFlow: false,
        goodsReceipt: null,
        items: { some: { inventoryItemId: { not: null } } },
      },
    });

    console.log(`\n=== SANITY CHECK ===`);
    console.log(`Total active PIs:                 ${totalPiActive}`);
    console.log(`Total legacy backfill STTs:       ${totalLegacyStt}`);
    console.log(`Orphan PIs (no STT, not flagged): ${orphanPis} (should be 0 or service-only)`);
  } catch (err) {
    console.error('FAIL:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();
