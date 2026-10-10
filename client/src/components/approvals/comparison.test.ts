import { describe, it, expect } from 'vitest';
import { formatComparisonValue } from './comparison';
import { isEditApprovalType } from './approval-utils';

describe('formatComparisonValue', () => {
  it('formats by kind and shows a dash for empty', () => {
    expect(formatComparisonValue(null, 'number')).toBe('—');
    expect(formatComparisonValue(1234.5, 'number')).toBe('1.234,5');
    expect(formatComparisonValue(60, 'percent')).toBe('60%');
    expect(formatComparisonValue(10500, 'currency')).toContain('10.500');
    expect(formatComparisonValue('2026-10-01', 'text')).toBe('2026-10-01');
  });
  it('recognises edit approval types only', () => {
    expect(isEditApprovalType('ProductionRunEdit')).toBe(true);
    expect(isEditApprovalType('PurchaseInvoiceRevisePrice')).toBe(true);
    expect(isEditApprovalType('ProductionRun')).toBe(false);
  });
});
