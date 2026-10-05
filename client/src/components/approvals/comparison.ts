import { formatNumber, formatRupiah, EMPTY_VALUE } from '@/lib/format';

export type ComparisonValue = number | string | null;
export interface ComparisonRow {
  label: string;
  before: ComparisonValue;
  after: ComparisonValue;
  kind: 'number' | 'currency' | 'percent' | 'text';
  changed: boolean;
  note?: string;
}
export interface ApprovalComparison {
  title: string;
  targetNumber: string | null;
  targetType: 'ProductionRun' | 'PurchaseInvoice';
  targetId: string | null;
  amountLabel: string;
  sections: Array<{ title: string; rows: ComparisonRow[] }>;
}

export function formatComparisonValue(v: ComparisonValue, kind: ComparisonRow['kind']): string {
  if (v === null || v === '') return EMPTY_VALUE;
  if (kind === 'text') return String(v);
  if (kind === 'currency') return formatRupiah(v, { decimals: 0 });
  if (kind === 'percent') return `${formatNumber(v, { maxDecimals: 2 })}%`;
  return formatNumber(v, { maxDecimals: 3 });
}

