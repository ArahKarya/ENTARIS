import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { effectiveTaxCost } from '../gaVehicleTaxCost';

describe('effectiveTaxCost', () => {
  it('uses paidAmount for a paid tax even when amount is empty', () => {
    expect(effectiveTaxCost({ amount: null, paidAmount: new Prisma.Decimal(1750000), paidAt: new Date(), status: 'PAID' })).toBe(1750000);
  });

  it('prefers paidAmount over the planned amount once paid', () => {
    expect(effectiveTaxCost({ amount: 1000000, paidAmount: 1250000, paidAt: new Date(), status: 'PAID' })).toBe(1250000);
  });

  it('treats paidAt as paid even if the status was reset by an asset edit', () => {
    expect(effectiveTaxCost({ amount: 1000000, paidAmount: 1250000, paidAt: new Date(), status: 'ACTIVE' })).toBe(1250000);
  });

  it('falls back to amount when unpaid or paidAmount is missing', () => {
    expect(effectiveTaxCost({ amount: 900000, paidAmount: null, paidAt: null, status: 'ACTIVE' })).toBe(900000);
    expect(effectiveTaxCost({ amount: '800000', paidAmount: null, paidAt: new Date(), status: 'PAID' })).toBe(800000);
    expect(effectiveTaxCost({ amount: null, paidAmount: null, paidAt: null })).toBe(0);
  });
});
