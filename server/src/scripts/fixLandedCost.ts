// One-shot fix: moves landed cost of non-linked PI items (jasa, rental, komisi, resiko) to the item inventory accounts
// (correction JE DR item inventory / CR 1.4.0) and updates stock_movements. WAC is not recomputed: past runs depend on it.

import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma';
import { systemAccounts } from '../services/systemAccounts';
import { updateAccountBalance } from '../utils/accountBalance';

async function main() {
  const invoices = await prisma.purchaseInvoice.findMany({
    where: { status: { not: 'Cancelled' } },
    include: { items: true, supplier: true },
    orderBy: { date: 'asc' },
  });

  const inventoryAccount = await systemAccounts.getAccount('INVENTORY');
  let fixed = 0;
  let skipped = 0;

  for (const invoice of invoices) {
    const linked = invoice.items.filter((i) => i.inventoryItemId);
    const nonLinked = invoice.items.filter((i) => !i.inventoryItemId);
    if (linked.length === 0 || nonLinked.length === 0) {
      skipped++;
      continue;
    }

    const linkedSubtotal = linked.reduce(
      (s, i) => s.plus(new Decimal(i.amount.toString())),
      new Decimal(0),
    );
    const pool = nonLinked.reduce(
      (s, i) => s.plus(new Decimal(i.amount.toString())),
      new Decimal(0),
    );
    if (linkedSubtotal.lte(0) || pool.lte(0)) {
      skipped++;
      continue;
    }

    const jvNumber = `JV-COR-${invoice.invoiceNumber}`;
    const existingCorr = await prisma.journalEntry.findUnique({ where: { entryNumber: jvNumber } });
    if (existingCorr) {
      console.log(`  SKIP ${invoice.invoiceNumber}: correction JV already exists`);
      skipped++;
      continue;
    }

    console.log(
      `Fixing ${invoice.invoiceNumber}: pool=${pool.toFixed(2)}, linkedSubtotal=${linkedSubtotal.toFixed(2)}`,
    );

    // Compute allocations (last item absorbs rounding remainder)
    const allocations: Array<{
      invItemRowId: string;
      invItemId: string;
      share: Decimal;
      qty: Decimal;
      originalAmount: Decimal;
    }> = [];
    let soFar = new Decimal(0);
    linked.forEach((item, idx) => {
      const original = new Decimal(item.amount.toString());
      let share: Decimal;
      if (idx === linked.length - 1) {
        share = pool.minus(soFar);
      } else {
        share = pool
          .mul(original)
          .div(linkedSubtotal)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        soFar = soFar.plus(share);
      }
      allocations.push({
        invItemRowId: item.id,
        invItemId: item.inventoryItemId!,
        share,
        qty: new Decimal(item.quantity.toString()),
        originalAmount: original,
      });
    });

    await prisma.$transaction(
      async (tx) => {
        // Group shares by inventory account
        const shareByAccount = new Map<string, { amount: Decimal; names: string[] }>();
        for (const alloc of allocations) {
          const invItem = await tx.inventoryItem.findUnique({
            where: { id: alloc.invItemId },
          });
          const accountId = invItem?.accountId || inventoryAccount.id;
          const existing = shareByAccount.get(accountId);
          if (existing) {
            existing.amount = existing.amount.plus(alloc.share);
            existing.names.push(invItem?.name || 'Item');
          } else {
            shareByAccount.set(accountId, {
              amount: alloc.share,
              names: [invItem?.name || 'Item'],
            });
          }

          // Update stock movement totalValue/unitCost for audit accuracy
          const newTotal = alloc.originalAmount.plus(alloc.share);
          const newUnit = newTotal.div(alloc.qty).toDecimalPlaces(2);
          await tx.stockMovement.updateMany({
            where: {
              referenceType: 'PurchaseInvoice',
              referenceId: invoice.id,
              itemId: alloc.invItemId,
              isCancelled: false,
            },
            data: {
              totalValue: newTotal.toNumber(),
              unitCost: newUnit.toNumber(),
            },
          });
        }

        const debitItems = Array.from(shareByAccount.entries()).map(([accountId, data]) => ({
          accountId,
          debit: data.amount.toNumber(),
          credit: 0,
          description: `Koreksi landed cost ${data.names.join(', ')}: ${invoice.invoiceNumber}`,
        }));
        const creditAmount = pool.toNumber();

        const je = await tx.journalEntry.create({
          data: {
            entryNumber: jvNumber,
            date: invoice.date,
            narration: `Koreksi landed cost: ${invoice.invoiceNumber}`,
            status: 'Submitted',
            fiscalYearId: invoice.fiscalYearId!,
            createdBy: invoice.createdBy,
            submittedAt: new Date(),
            items: {
              create: [
                ...debitItems,
                {
                  accountId: inventoryAccount.id,
                  debit: 0,
                  credit: creditAmount,
                  description: `Koreksi dari Persediaan Umum: ${invoice.invoiceNumber}`,
                },
              ],
            },
          },
        });

        await tx.accountingLedgerEntry.createMany({
          data: [
            ...debitItems.map((d) => ({
              date: invoice.date,
              accountId: d.accountId,
              debit: d.debit,
              credit: 0,
              referenceType: 'JournalEntry',
              referenceId: je.id,
              description: d.description,
              fiscalYearId: invoice.fiscalYearId!,
            })),
            {
              date: invoice.date,
              accountId: inventoryAccount.id,
              debit: 0,
              credit: creditAmount,
              referenceType: 'JournalEntry',
              referenceId: je.id,
              description: `Koreksi dari Persediaan Umum: ${invoice.invoiceNumber}`,
              fiscalYearId: invoice.fiscalYearId!,
            },
          ],
        });

        // Update account balances (ASSET: debit→+, credit→-)
        for (const [accountId, data] of shareByAccount.entries()) {
          await updateAccountBalance(tx, accountId, data.amount.toNumber(), 0);
        }
        await updateAccountBalance(tx, inventoryAccount.id, 0, creditAmount);
      },
      { timeout: 30000 },
    );

    fixed++;
  }

  console.log(`\nDone. Fixed: ${fixed}, Skipped: ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
