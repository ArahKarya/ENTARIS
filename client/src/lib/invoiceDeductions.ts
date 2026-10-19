// Receive-payment splits to non-cash accounts (e.g. Beban Komisi) are shown as "potongan" lines
// on the invoice without changing GL revenue; derived from paymentAllocations[].payment.splits.

export interface DeductionLine {
  /** Stable key for React lists. */
  key: string;
  /** Human label shown in the UI ("Beban Komisi", "Potongan Sales", ...). */
  label: string;
  /** Account number (e.g. 6.10). */
  accountNumber: string;
  /** Optional notes that the staff entered when inputting the split. */
  notes: string | null;
  /** Positive amount (rupiah). */
  amount: number;
  /** Originating payment number for traceability. */
  paymentNumber: string;
  /** Originating payment date (ISO). */
  paymentDate: string;
}

export interface DeductionsSummary {
  lines: DeductionLine[];
  total: number;
  /** Aggregated by account label for compact summary rendering. */
  byAccount: { label: string; accountNumber: string; total: number }[];
}

interface PaymentAllocationLike {
  allocatedAmount: number | string;
  payment?: {
    paymentNumber?: string;
    date?: string;
    status?: string;
    account?: { accountNumber?: string } | null;
    splits?: Array<{
      amount: number | string;
      notes?: string | null;
      account: { accountNumber: string; name: string };
    }>;
  } | null;
}

/** A split is a deduction when its account is not cash/bank (cash/bank accounts live under `1.1.x`). */
function isCashAccount(accountNumber: string | undefined | null): boolean {
  return !!accountNumber && accountNumber.startsWith('1.1');
}

export function computeDeductions(
  paymentAllocations: PaymentAllocationLike[] | undefined | null,
): DeductionsSummary {
  const lines: DeductionLine[] = [];
  if (!paymentAllocations || paymentAllocations.length === 0) {
    return { lines: [], total: 0, byAccount: [] };
  }

  for (const alloc of paymentAllocations) {
    const pay = alloc.payment;
    if (!pay) continue;
    if (pay.status === 'Cancelled') continue;
    const paymentNumber = pay.paymentNumber ?? '—';
    const paymentDate = pay.date ?? '';
    const splits = pay.splits ?? [];

    if (splits.length > 0) {
      // Multi-split payment: each non-cash split is a deduction.
      for (let i = 0; i < splits.length; i++) {
        const s = splits[i];
        if (isCashAccount(s.account.accountNumber)) continue;
        const amount = Number(s.amount);
        if (!(amount > 0)) continue;
        lines.push({
          key: `${paymentNumber}-${i}`,
          label: s.account.name,
          accountNumber: s.account.accountNumber,
          notes: s.notes ?? null,
          amount,
          paymentNumber,
          paymentDate,
        });
      }
    }
    // Single-account payments (no splits) never produce deductions: by
    // definition a Receive payment without splits goes to a cash/bank account.
  }

  const total = lines.reduce((s, l) => s + l.amount, 0);

  // Aggregate by accountNumber so the UI can show "Komisi: Rp 10jt" once
  // even if there are multiple payments contributing to it.
  const grouped = new Map<string, { label: string; accountNumber: string; total: number }>();
  for (const l of lines) {
    const key = l.accountNumber;
    const existing = grouped.get(key);
    if (existing) {
      existing.total += l.amount;
    } else {
      grouped.set(key, { label: l.label, accountNumber: l.accountNumber, total: l.amount });
    }
  }
  const byAccount = Array.from(grouped.values()).sort((a, b) => b.total - a.total);

  return { lines, total, byAccount };
}
