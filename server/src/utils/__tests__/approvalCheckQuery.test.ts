import { describe, it, expect } from 'vitest';
import { parseApprovalCheckQuery } from '../approvalCheckQuery';

describe('parseApprovalCheckQuery', () => {
  it('accepts a document type with a numeric amount', () => {
    expect(parseApprovalCheckQuery({ documentType: 'PurchaseInvoice', amount: '1500000' })).toEqual({
      documentType: 'PurchaseInvoice',
      amount: 1_500_000,
    });
  });

  it('rejects a missing or non-numeric amount instead of querying with NaN', () => {
    expect(parseApprovalCheckQuery({ documentType: 'PurchaseInvoice' })).toBeNull();
    expect(parseApprovalCheckQuery({ documentType: 'PurchaseInvoice', amount: '' })).toBeNull();
    expect(parseApprovalCheckQuery({ documentType: 'PurchaseInvoice', amount: 'abc' })).toBeNull();
  });

  it('rejects a missing document type', () => {
    expect(parseApprovalCheckQuery({ amount: '10' })).toBeNull();
    expect(parseApprovalCheckQuery({ documentType: '  ', amount: '10' })).toBeNull();
  });
});
