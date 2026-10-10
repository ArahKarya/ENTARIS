import type { Prisma } from '@prisma/client';
import { systemAccounts } from './systemAccounts';

type Tx = Prisma.TransactionClient;

/**
 * Account the sales invoice debits for COGS when it invoices delivered
 * stock: HPP Beras (5.1) when present, else the COGS system account. Used as
 * the "akun lawan" metadata of delivery-order stock-out movements; returns
 * null instead of throwing so a missing mapping never blocks a delivery.
 */
export async function resolveCogsAccountId(tx: Tx): Promise<string | null> {
  const hppBeras = await tx.account.findFirst({ where: { accountNumber: '5.1' }, select: { id: true } });
  if (hppBeras) return hppBeras.id;
  const [cogs] = await systemAccounts.getAccounts('COGS');
  return cogs?.id ?? null;
}
