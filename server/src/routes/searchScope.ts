export interface SearchScope {
  parties: boolean;
  accounts: boolean;
  salesInvoices: boolean;
  purchaseInvoices: boolean;
  payments: boolean;
  journals: boolean;
}

/**
 * Decide which record types global search may return for the caller.
 * Mirrors the gates on each resource's own list endpoint (server/src/index.ts):
 * parties and COA are mounted with requireWrite (GET open to every user), the
 * rest with requirePerm(module). A failing permission check denies (fail closed).
 */
export async function resolveSearchScope(
  canView: (module: string) => Promise<boolean>,
): Promise<SearchScope> {
  const safe = async (module: string): Promise<boolean> => {
    try {
      return await canView(module);
    } catch {
      return false;
    }
  };

  const [salesInvoices, purchaseInvoices, payments, journals] = await Promise.all([
    safe('sales_invoice'),
    safe('purchase_invoice'),
    safe('payment'),
    safe('journal'),
  ]);

  return { parties: true, accounts: true, salesInvoices, purchaseInvoices, payments, journals };
}
