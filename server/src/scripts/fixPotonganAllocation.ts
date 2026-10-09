// One-shot fix: per non-cancelled PI, pool = biayaLain - potongan (may be negative) is moved from 1.4.0 to linked items
// pro rata by amount. Correction JE: DR 1.4.0 -pool / CR item accounts (mirrored when pool > 0); stock_movements updated.

import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma';
import { systemAccounts } from '../services/systemAccounts';
import { updateAccountBalance } from '../utils/accountBalance';

async function main() {
  const invoices = await prisma.purchaseInvoice.findMany({
    where: { status: { not: 'Cancelled' } },
    include: { items: true },
    orderBy: { date: 'asc' },
  });

  const inventoryAccount = await systemAccounts.getAccount('INVENTORY');
  let fixed = 0;
  let skipped = 0;

  for (const invoice of invoices) {
    const pool = new Decimal(invoice.biayaLain.toString()).minus(
      new Decimal(invoice.potongan.toString()),
    );
    if (pool.isZero()) {
      skipped++;
      continue;
    }

    const linked = invoice.items.filter((i) => i.inventoryItemId);
    if (linked.length === 0) {
      skipped++;
      continue;
    }
    const linkedSubtotal = linked.reduce(
      (s, i) => s.plus(new Decimal(i.amount.toString())),
      new Decimal(0),
    );
    if (linkedSubtotal.lte(0)) {
      skipped++;
      continue;
    }

    const jvNumber = `JV-COR2-${invoice.invoiceNumber}`;
    const existing = await prisma.journalEntry.findUnique({ where: { entryNumber: jvNumber } });
    if (existing) {
      console.log(`  SKIP ${invoice.invoiceNumber}: already corrected`);
      skipped++;
      continue;
    }

    console.log(`Fixing ${invoice.invoiceNumber}: pool=${pool.toFixed(2)} (biayaLain=${invoice.biayaLain}, potongan=${invoice.potongan})`);

    // Allocate pool to linked items (last item absorbs rounding remainder)
    const allocations: Array<{
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
          const invItem = await tx.inventoryItem.findUnique({ where: { id: alloc.invItemId } });
          const accountId = invItem?.accountId || inventoryAccount.id;
          const existingEntry = shareByAccount.get(accountId);
          if (existingEntry) {
            existingEntry.amount = existingEntry.amount.plus(alloc.share);
            existingEntry.names.push(invItem?.name || 'Item');
          } else {
            shareByAccount.set(accountId, {
              amount: alloc.share,
              names: [invItem?.name || 'Item'],
            });
          }

          // Update stock_movement effective cost
          // NOTE: existing movements may already include previous landed cost
          // correction; we add THIS share on top of current totalValue.
          const movements = await tx.stockMovement.findMany({
            where: {
              referenceType: 'PurchaseInvoice',
              referenceId: invoice.id,
              itemId: alloc.invItemId,
              isCancelled: false,
            },
          });
          // Distribute alloc.share across movements proportional to their current qty
          const totalMvtQty = movements.reduce(
            (s, m) => s.plus(new Decimal(m.quantity.toString())),
            new Decimal(0),
          );
          if (totalMvtQty.gt(0)) {
            let mvtSoFar = new Decimal(0);
            for (let k = 0; k < movements.length; k++) {
              const m = movements[k];
              const mqty = new Decimal(m.quantity.toString());
              let mshare: Decimal;
              if (k === movements.length - 1) {
                mshare = alloc.share.minus(mvtSoFar);
              } else {
                mshare = alloc.share
                  .mul(mqty)
                  .div(totalMvtQty)
                  .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
                mvtSoFar = mvtSoFar.plus(mshare);
              }
              const newTotal = new Decimal(m.totalValue.toString()).plus(mshare);
              const newUnit = newTotal.div(mqty).toDecimalPlaces(2);
              await tx.stockMovement.update({
                where: { id: m.id },
                data: {
                  totalValue: newTotal.toNumber(),
                  unitCost: newUnit.toNumber(),
                },
              });
            }
          }
        }

        // Build correction JE entries.
        // Accounting: we want to ADD share to each item account (can be negative)
        // and REMOVE pool from 1.4.0 (which is -pool, can be positive or negative).
        // Normalize: for each entry, positive value → debit, negative → credit.
        type Line = { accountId: string; debit: number; credit: number; description: string };
        const lines: Line[] = [];

        for (const [accountId, data] of shareByAccount.entries()) {
          const v = data.amount;
          if (v.isZero()) continue;
          lines.push({
            accountId,
            debit: v.gt(0) ? v.toNumber() : 0,
            credit: v.lt(0) ? v.abs().toNumber() : 0,
            description: `Koreksi potongan/biaya ${data.names.join(', ')}: ${invoice.invoiceNumber}`,
          });
        }
        // Reverse entry on 1.4.0: -pool
        const inv140 = pool.neg();
        if (!inv140.isZero()) {
          lines.push({
            accountId: inventoryAccount.id,
            debit: inv140.gt(0) ? inv140.toNumber() : 0,
            credit: inv140.lt(0) ? inv140.abs().toNumber() : 0,
            description: `Reverse potongan/biaya dari 1.4.0: ${invoice.invoiceNumber}`,
          });
        }

        const je = await tx.journalEntry.create({
          data: {
            entryNumber: jvNumber,
            date: invoice.date,
            narration: `Koreksi potongan/biaya: ${invoice.invoiceNumber}`,
            status: 'Submitted',
            fiscalYearId: invoice.fiscalYearId!,
            createdBy: invoice.createdBy,
            submittedAt: new Date(),
            items: { create: lines },
          },
        });

        await tx.accountingLedgerEntry.createMany({
          data: lines.map((l) => ({
            date: invoice.date,
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            referenceType: 'JournalEntry',
            referenceId: je.id,
            description: l.description,
            fiscalYearId: invoice.fiscalYearId!,
          })),
        });

        for (const l of lines) {
          await updateAccountBalance(tx, l.accountId, l.debit, l.credit);
        }
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
