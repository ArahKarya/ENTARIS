import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({ create: vi.fn().mockResolvedValue({}) }));
vi.mock('../../lib/prisma', () => ({ prisma: { auditLog: { create: m.create } } }));
vi.mock('../auditSnapshot', () => ({ captureBeforeSnapshot: vi.fn().mockResolvedValue(null) }));

import { auditTrailMiddleware } from '../auditTrail';
import { redactSecrets } from '../../utils/redact';

function run(user: Record<string, unknown>, body: unknown) {
  const res: any = { json: (b: unknown) => b };
  const req: any = { user, method: 'POST', originalUrl: '/api/parties', ip: '100.64.0.9', headers: { 'user-agent': 'entaris-mcp/1 (aira-dev)' } };
  return auditTrailMiddleware(req, res, () => undefined).then(() => res.json(body));
}

beforeEach(() => vi.clearAllMocks());

describe('auditTrail via=mcp marker', () => {
  it('records via + token/channel/tool/approval for agent-originated mutations', async () => {
    await run({ userId: 'u1', role: 'Accountant', via: 'mcp', mcpToken: 'aira-dev', mcpChannel: 'whatsapp', mcpTool: 'party_create', mcpApprovalId: 'apr-1' }, { id: 'p1' });
    expect(m.create.mock.calls[0][0].data).toMatchObject({
      userId: 'u1', action: 'CREATE', entityType: 'parties',ipAddress: '100.64.0.9',
      via: 'mcp', viaMeta: { token: 'aira-dev', channel: 'whatsapp', tool: 'party_create', approvalId: 'apr-1' },
    });
  });

  it('leaves normal user mutations untouched (no via)', async () => {
    await run({ userId: 'u1', role: 'Accountant' }, { id: 'p1' });
    const data = m.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('via');
    expect(data).not.toHaveProperty('viaMeta');
  });
});

describe('redactSecrets x MCP', () => {
  it('masks signingSecret and token in audited responses', () => {
    expect(redactSecrets({ token: 'entmcp_x', signingSecret: 'entsig_y', name: 'a' })).toEqual({ token: '[REDACTED]', signingSecret: '[REDACTED]', name: 'a' });
  });
});
