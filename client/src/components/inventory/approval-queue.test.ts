import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(async () => ({
      data: [
        { id: '1', documentType: 'ProductionRun' },
        { id: '2', documentType: 'PurchaseInvoice' },
      ],
    })),
  },
}));

import api from '@/lib/api';
import { approvalRequestsKey, fetchApprovalRequests, formatQueueCount, oldestWaitingDays, waitingDays } from './approval-queue';

describe('approval queue helpers', () => {
  it('uses the ApprovalPanel cache key', () => {
    expect(approvalRequestsKey('ProductionRun', 'Pending')).toEqual(['approval-requests', 'ProductionRun', 'Pending']);
    expect(approvalRequestsKey(undefined, 'Approved')).toEqual(['approval-requests', 'all', 'Approved']);
  });

  it('fetches by status and filters by document type', async () => {
    const rows = await fetchApprovalRequests('ProductionRun', 'Pending');
    expect(rows.map((r) => r.id)).toEqual(['1']);
    expect(api.get).toHaveBeenCalledWith('/approvals/requests', { params: { status: 'Pending' } });
    expect(await fetchApprovalRequests(undefined, 'Pending')).toHaveLength(2);
  });

  it('formats capped counts', () => {
    expect(formatQueueCount(undefined)).toBe('');
    expect(formatQueueCount(7)).toBe('7');
    expect(formatQueueCount(100)).toBe('100+');
  });

  it('counts waiting days', () => {
    const now = new Date('2026-10-04T07:59:00.000Z');
    expect(waitingDays('2026-10-01T08:00:00.000Z', now)).toBe(2);
    expect(waitingDays('invalid', now)).toBe(0);
    expect(oldestWaitingDays([{ createdAt: '2026-10-03T00:00:00.000Z' }, { createdAt: '2026-09-30T00:00:00.000Z' }], now)).toBe(4);
    expect(oldestWaitingDays([], now)).toBe(0);
  });
});
