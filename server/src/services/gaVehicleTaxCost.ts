// Effective cost of a vehicle tax record. Paying through the EAM bill queue stores the
// actual nominal in paidAmount (amount may be empty or an estimate), so a paid record
// uses paidAmount and anything else falls back to amount.

import type { Prisma } from '@prisma/client';

type Money = Prisma.Decimal | number | string | null | undefined;

export interface TaxCostSource {
  amount?: Money;
  paidAmount?: Money;
  paidAt?: Date | string | null;
  status?: string | null;
}

export function effectiveTaxCost(t: TaxCostSource): number {
  const paid = t.status === 'PAID' || t.paidAt != null;
  const value = paid && t.paidAmount != null ? t.paidAmount : t.amount;
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}
