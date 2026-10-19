import { Prisma } from '@prisma/client';
import { ACCOUNT_NUMBERS } from '../constants/accountNumbers';

type PartyImpactItem = {
  partyId: string | null;
  debit: number;
  credit: number;
  accountNumber: string;
  rootType: string;
};

/**
 * Classify a party-tagged JE line and update the correct denormalized party field.
 *
 *   2.1.2 (Uang Muka Penjualan)   → customerDepositBalance   (credit-normal)
 *   1.3   (Uang Muka Pembelian)   → depositBalance           (debit-normal)
 *   otherwise (1.2.1, 2.1.1, ...) → outstandingAmount        (rootType-driven)
 *
 * Both post (apply) and cancel (reverse) must use this helper, or a cancelled JV
 * leaks balance into the wrong denormalized field.
 */
export async function applyPartyImpact(
  tx: Prisma.TransactionClient,
  items: PartyImpactItem[],
  direction: 'apply' | 'reverse',
): Promise<void> {
  for (const it of items) {
    if (!it.partyId) continue;

    const debit = direction === 'apply' ? it.debit : it.credit;
    const credit = direction === 'apply' ? it.credit : it.debit;
    if (debit === 0 && credit === 0) continue;

    let field: 'customerDepositBalance' | 'depositBalance' | 'outstandingAmount';
    let impact: number;

    if (it.accountNumber === ACCOUNT_NUMBERS.CUSTOMER_DEPOSIT) {
      field = 'customerDepositBalance';
      impact = credit - debit;
    } else if (it.accountNumber === ACCOUNT_NUMBERS.VENDOR_DEPOSIT) {
      field = 'depositBalance';
      impact = debit - credit;
    } else {
      field = 'outstandingAmount';
      impact =
        it.rootType === 'ASSET' || it.rootType === 'EXPENSE'
          ? debit - credit
          : credit - debit;
    }

    if (impact === 0) continue;

    await tx.party.update({
      where: { id: it.partyId },
      data: { [field]: { increment: impact } },
    });
  }
}
