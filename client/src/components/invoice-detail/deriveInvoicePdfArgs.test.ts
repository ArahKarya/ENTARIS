import { describe, expect, it } from 'vitest';
import { deriveInvoicePdfArgs } from './buildInvoicePdf';

const pay = (n: string, status: string, allocated: number) => ({
  allocatedAmount: allocated,
  payment: {
    paymentNumber: n,
    status,
    date: '2026-10-10',
    amount: allocated,
    referenceNo: null,
    notes: null,
    account: { accountNumber: '1.1.3', name: 'Bank', rootType: 'ASSET' },
    splits: [],
  },
});

describe('deriveInvoicePdfArgs', () => {
  it('sales: pisahkan tunai vs deposit, abaikan pembayaran batal & deposit batal', () => {
    const r = deriveInvoicePdfArgs('sales', {
      grandTotal: 1000,
      outstanding: 300,
      customer: { name: 'CV A', customerDepositBalance: '250' },
      items: [{ itemName: 'x' }],
      paymentAllocations: [pay('PAY-1', 'Posted', 500), pay('PAY-2', 'Cancelled', 999)],
      depositApplications: [
        { appliedAmount: 200, isCancelled: false },
        { appliedAmount: 777, isCancelled: true },
      ],
    });
    expect(r.paidFromDeposit).toBe(200);
    expect(r.paidFromCash).toBe(500); // (1000-300) - 200
    expect(r.outstanding).toBe(300);
    expect(r.partyDepositBalance).toBe(250);
    expect(r.paymentBreakdown.map((p: { paymentNumber: string }) => p.paymentNumber)).toEqual(['PAY-1']);
    expect(r.party.name).toBe('CV A');
  });

  it('purchase: pakai supplier & depositBalance; tak pernah negatif', () => {
    const r = deriveInvoicePdfArgs('purchase', {
      grandTotal: 100,
      outstanding: 0,
      supplier: { name: 'PT B', depositBalance: 40 },
      depositApplications: [{ appliedAmount: 150, isCancelled: false }],
    });
    expect(r.party.name).toBe('PT B');
    expect(r.partyDepositBalance).toBe(40);
    expect(r.paidFromCash).toBe(0);
    expect(r.items).toEqual([]);
  });
});
