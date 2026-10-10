import type { Prisma } from '@prisma/client';
import { updateBalancesForItems } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { BusinessError } from '../utils/errors';
import { calcWeightedAverage } from '../utils/weightedAverage';
import { adjustWarehouseStock, resolveWarehouseId } from '../utils/warehouseStock';
import { systemAccounts } from './systemAccounts';

type Tx = Prisma.TransactionClient;

export interface OpeningStockItem {
  id: string;
  code: string;
  name: string;
  accountId: string | null;
  currentStock: Prisma.Decimal | number;
  averageCost: Prisma.Decimal | number;
}

export interface OpeningStockInput {
  item: OpeningStockItem;
  quantity: number;
  unitCost: number;
  totalValue: number;
  /** Optional warehouse code from the import file; the default warehouse is used when empty. */
  warehouseCode?: string;
  userId: string;
  now?: Date;
}

/** Resolve the import row's warehouse: explicit code first, else the default warehouse. */
async function resolveImportWarehouseId(tx: Tx, warehouseCode?: string): Promise<string> {
  if (warehouseCode) {
    const wh = await tx.warehouse.findUnique({ where: { code: warehouseCode }, select: { id: true } });
    if (!wh) throw new BusinessError(`Gudang dengan kode "${warehouseCode}" tidak ditemukan.`);
    return wh.id;
  }
  const id = await resolveWarehouseId(tx, null);
  if (!id) {
    throw new BusinessError('Gudang belum ditentukan: isi kolom warehouseCode atau set salah satu gudang sebagai default.');
  }
  return id;
}

/**
 * Post an imported opening stock balance: GL DR Persediaan / CR Ekuitas Saldo
 * Awal, then an In movement linked to that journal (warehouse, counter account
 * and journal stored) and the per-warehouse stock, like other inbound paths.
 */
export async function postOpeningStockInTx(tx: Tx, input: OpeningStockInput) {
  const { item, quantity, unitCost, totalValue, userId } = input;
  const now = input.now ?? new Date();
  const fiscalYear = await getOpenFiscalYear(tx, now);
  const warehouseId = await resolveImportWarehouseId(tx, input.warehouseCode);

  // GL: DR Inventory / CR Ekuitas Saldo Awal
  const invAccount = item.accountId
    ? await tx.account.findUnique({ where: { id: item.accountId } })
    : await systemAccounts.getAccount('INVENTORY');
  const openingEquity = await systemAccounts.getAccount('OPENING_EQUITY');

  let journalEntryId: string | null = null;
  if (invAccount) {
    const description = `Saldo awal stok: ${item.code}`;
    const jvNumber = await generateDocumentNumber(tx, 'JV', now, fiscalYear.id);
    const journal = await tx.journalEntry.create({
      data: {
        entryNumber: jvNumber,
        date: now,
        narration: `Saldo awal stok: ${item.code} - ${item.name}`,
        status: 'Submitted',
        fiscalYearId: fiscalYear.id,
        createdBy: userId,
        submittedAt: now,
        items: {
          create: [
            { accountId: invAccount.id, debit: totalValue, credit: 0, description },
            { accountId: openingEquity.id, debit: 0, credit: totalValue, description },
          ],
        },
      },
      include: { items: true },
    });

    await tx.accountingLedgerEntry.createMany({
      data: journal.items.map((ji) => ({
        date: now,
        accountId: ji.accountId,
        debit: ji.debit,
        credit: ji.credit,
        referenceType: 'JournalEntry' as const,
        referenceId: journal.id,
        description: ji.description || description,
        fiscalYearId: fiscalYear.id,
      })),
    });

    await updateBalancesForItems(
      tx,
      journal.items.map((i) => ({ accountId: i.accountId, debit: Number(i.debit), credit: Number(i.credit) })),
    );
    journalEntryId = journal.id;
  }

  const mvNumber = await generateDocumentNumber(tx, 'SM', now, fiscalYear.id);
  const movement = await tx.stockMovement.create({
    data: {
      movementNumber: mvNumber,
      itemId: item.id,
      warehouseId,
      movementType: 'In',
      quantity,
      unitCost,
      totalValue,
      date: now,
      referenceType: 'OpeningBalance',
      offsetAccountId: journalEntryId ? openingEquity.id : null,
      journalEntryId,
      notes: `Stok awal dari import: ${item.code} - ${item.name}`,
      createdById: userId,
      fiscalYearId: fiscalYear.id,
    },
  });

  // Update currentStock and averageCost on the item, then the per-warehouse balance.
  const newAvgCost = calcWeightedAverage(item.currentStock, item.averageCost, quantity, unitCost);
  await tx.inventoryItem.update({
    where: { id: item.id },
    data: { currentStock: { increment: quantity }, averageCost: newAvgCost },
  });
  await adjustWarehouseStock(tx, item.id, warehouseId, quantity);

  return { movementId: movement.id, journalEntryId, warehouseId };
}
