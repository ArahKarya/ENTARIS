/** Draft expense lines of the payment request form. */
export interface DraftLine {
  key: string;
  description: string;
  amount: number | null;
  expenseDate: string;
  expenseAccountId: string | null;
}

let seq = 0;
export const newLine = (over: Partial<DraftLine> = {}): DraftLine => ({
  key: `l${Date.now()}-${(seq += 1)}`,
  description: '',
  amount: null,
  expenseDate: '',
  expenseAccountId: null,
  ...over,
});

export const linesTotal = (lines: readonly DraftLine[]): number =>
  Math.round(lines.reduce((s, l) => s + (l.amount ?? 0), 0) * 100) / 100;
