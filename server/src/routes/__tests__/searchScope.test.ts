import { describe, it, expect } from 'vitest';
import { resolveSearchScope } from '../searchScope';

const allow = (modules: string[]) => async (module: string) => modules.includes(module);

describe('resolveSearchScope', () => {
  it('limits gated sources to modules the role can view', async () => {
    const scope = await resolveSearchScope(allow(['sales_invoice']));
    expect(scope).toEqual({
      parties: true,
      accounts: true,
      salesInvoices: true,
      purchaseInvoices: false,
      payments: false,
      journals: false,
    });
  });

  it('grants every source when all modules are viewable', async () => {
    const scope = await resolveSearchScope(
      allow(['sales_invoice', 'purchase_invoice', 'payment', 'journal']),
    );
    expect(Object.values(scope).every(Boolean)).toBe(true);
  });

  it('keeps reference data (parties, accounts) open like their own GET endpoints', async () => {
    const scope = await resolveSearchScope(allow([]));
    expect(scope.parties).toBe(true);
    expect(scope.accounts).toBe(true);
    expect(scope.salesInvoices || scope.purchaseInvoices || scope.payments || scope.journals).toBe(false);
  });

  it('fails closed when the permission check throws', async () => {
    const scope = await resolveSearchScope(async () => {
      throw new Error('db down');
    });
    expect(scope.salesInvoices || scope.purchaseInvoices || scope.payments || scope.journals).toBe(false);
  });
});
