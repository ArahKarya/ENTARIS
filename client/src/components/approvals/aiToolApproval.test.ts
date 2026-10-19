import { describe, expect, it } from 'vitest';
import { approvalTypeLabel, isAiToolApproval, isEditApprovalType } from './approval-utils';

describe('AI tool approvals', () => {
  it('recognises ai_tool:* request types and labels them', () => {
    expect(isAiToolApproval('ai_tool:party_create')).toBe(true);
    expect(isAiToolApproval('ProductionRun')).toBe(false);
    expect(approvalTypeLabel('ai_tool:payreq_pay')).toBe('Permintaan AIRA');
    expect(approvalTypeLabel('ProductionRunEdit')).not.toBe('ProductionRunEdit');
    expect(approvalTypeLabel('Unknown')).toBe('Unknown');
    expect(isEditApprovalType('ai_tool:x')).toBe(false);
  });
});
