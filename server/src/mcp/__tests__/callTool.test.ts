import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-jwt-secret-value-0123456789';
  return {
    can: vi.fn(),
    hasCap: vi.fn(),
    callHandler: vi.fn(),
    queueToolCall: vi.fn(),
    recordCall: vi.fn().mockResolvedValue(undefined),
    claimIdempotency: vi.fn(),
    finishClaimed: vi.fn().mockResolvedValue(undefined),
    releaseClaim: vi.fn().mockResolvedValue(undefined),
    overrides: [] as Array<{ toolName: string; enabled: boolean | null; tier: string | null }>,
  };
});
vi.mock('../../lib/prisma', () => ({ prisma: { aiToolConfig: { findMany: async () => m.overrides } } }));
vi.mock('../../services/permissionService', () => ({ can: m.can, hasCap: m.hasCap }));
vi.mock('../execute', async () => ({ ...(await vi.importActual<typeof import('../execute')>('../execute')), callHandler: m.callHandler }));
vi.mock('../queue', () => ({ queueToolCall: m.queueToolCall }));
vi.mock('../callLog', async () => ({
  ...(await vi.importActual<typeof import('../callLog')>('../callLog')),
  recordCall: m.recordCall,
  claimIdempotency: m.claimIdempotency,
  finishClaimed: m.finishClaimed,
  releaseClaim: m.releaseClaim,
}));

import { handleToolCall, type CallContext } from '../callTool';

const DRAFT = { date: '2026-10-01', inputs: [{ itemId: '11111111-1111-4111-8111-111111111111', quantity: 1 }], outputs: [{ itemId: '22222222-2222-4222-8222-222222222222', quantity: 1 }] };
const actor = (over: Record<string, unknown> = {}) => ({
  id: 'u1', fullName: 'Budi', email: 'b@x', role: 'Accountant', airaTier: 'standard', airaJabatan: 'Kasir', channel: 'whatsapp' as const, groupFloor: false, viaAssertion: true, ...over,
});
const ctx = (over: Record<string, unknown> = {}): CallContext => ({ token: { id: 't1', name: 'aira-dev' } as never, actor: actor(over) as never, clientIp: '100.64.0.1' });
const json = (data: unknown, status = 200) => ({ status, ok: status < 400, body: { kind: 'json', data } });
const sc = (r: any) => r.structuredContent;
const logged = () => m.recordCall.mock.calls.map((c) => c[0]);

beforeEach(() => {
  vi.clearAllMocks();
  m.overrides = [];
  m.can.mockResolvedValue(true);
  m.hasCap.mockResolvedValue(true);
  m.callHandler.mockResolvedValue(json({ ok: 1 }));
  m.queueToolCall.mockResolvedValue({ approvalId: 'apr-1', confirm: 'Buat pelanggan X. Setujui?' });
});

describe('handleToolCall: tier policy', () => {
  it('read tool executes directly and is logged as allowed', async () => {
    const r = await handleToolCall(ctx(), 'coa_list', {});
    expect(r.isError).toBe(false);
    expect(m.callHandler).toHaveBeenCalledTimes(1);
    expect(m.callHandler.mock.calls[0][0]).toMatchObject({ actor: { id: 'u1', role: 'Accountant' }, tokenName: 'aira-dev', clientIp: '100.64.0.1' });
    expect(logged()[0]).toMatchObject({ tool: 'coa_list', risk: 'read', decision: 'allowed', tokenId: 't1', actorUserId: 'u1', channel: 'whatsapp' });
    expect(logged()[0].argsHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('draftCapable write executes directly (standard)', async () => {
    const r = await handleToolCall(ctx(), 'prod_draft_create', DRAFT);
    expect(r.isError).toBe(false);
    expect(m.callHandler).toHaveBeenCalledTimes(1);
    expect(m.queueToolCall).not.toHaveBeenCalled();
  });

  it('non-draft write is QUEUED, not executed: pending_approval + id + confirm text', async () => {
    const r = await handleToolCall(ctx(), 'party_create', { name: 'PT X', partyType: 'Customer' });
    expect(m.callHandler).not.toHaveBeenCalled();
    expect(sc(r)).toMatchObject({ ok: true, status: 'pending_approval', approvalId: 'apr-1', confirm: expect.stringContaining('Setujui') });
    expect(m.queueToolCall.mock.calls[0][0]).toMatchObject({ tokenName: 'aira-dev', channel: 'whatsapp', actor: { id: 'u1' } });
    expect(logged()[0]).toMatchObject({ decision: 'queued', approvalId: 'apr-1' });
  });

  it('critical tool is queued for a standard actor, executed for a direct actor', async () => {
    const args = { id: '11111111-1111-4111-8111-111111111111', cashAccountId: '11111111-1111-4111-8111-111111111111', paymentDate: '2026-10-01' };
    expect(sc(await handleToolCall(ctx(), 'payreq_pay', args)).status).toBe('pending_approval');
    expect(m.callHandler).not.toHaveBeenCalled();
    const r = await handleToolCall(ctx({ airaTier: 'direct' }), 'payreq_pay', args);
    expect(r.isError).toBe(false);
    expect(m.callHandler).toHaveBeenCalledTimes(1);
  });

  it('group floor demotes a direct actor back to the approval queue', async () => {
    const r = await handleToolCall(ctx({ airaTier: 'direct', groupFloor: true }), 'party_create', { name: 'A', partyType: 'Customer' });
    expect(sc(r).status).toBe('pending_approval');
  });

  it('read-level actor is blocked from writes (denied, logged, no side effects)', async () => {
    const r = await handleToolCall(ctx({ airaTier: 'read' }), 'prod_draft_create', DRAFT);
    expect(r.isError).toBe(true);
    expect((r.content[0] as any).text).toContain('hanya mengizinkan tool baca');
    expect(m.callHandler).not.toHaveBeenCalled();
    expect(m.queueToolCall).not.toHaveBeenCalled();
    expect(logged()[0]).toMatchObject({ decision: 'denied' });
  });

  it('RBAC: a role without module permission is denied even for a read tool', async () => {
    m.can.mockResolvedValue(false);
    const r = await handleToolCall(ctx({ role: 'Viewer' }), 'coa_list', {});
    expect(r.isError).toBe(true);
    expect((r.content[0] as any).text).toContain('tidak memiliki izin');
    expect(m.callHandler).not.toHaveBeenCalled();
  });

  it('capability gate: tool needing a capability the role lacks is denied', async () => {
    m.hasCap.mockResolvedValue(false);
    const r = await handleToolCall(ctx({ airaTier: 'direct' }), 'appr_approve', { id: '11111111-1111-4111-8111-111111111111' });
    expect(r.isError).toBe(true);
    expect(m.callHandler).not.toHaveBeenCalled();
  });

  it('admin override: tool disabled -> not available; pinned must_approve beats direct', async () => {
    m.overrides = [{ toolName: 'coa_list', enabled: false, tier: null }, { toolName: 'prod_draft_create', enabled: null, tier: 'must_approve' }];
    const off = await handleToolCall(ctx(), 'coa_list', {});
    expect(off.isError).toBe(true);
    expect((off.content[0] as any).text).toContain('tidak tersedia');
    const pinned = await handleToolCall(ctx({ airaTier: 'direct' }), 'prod_draft_create', DRAFT);
    expect(sc(pinned).status).toBe('pending_approval');
  });

  it('denylisted / unknown tool names are simply not available', async () => {
    const r = await handleToolCall(ctx(), 'ai_router_invoke', {});
    expect(r.isError).toBe(true);
    expect(m.callHandler).not.toHaveBeenCalled();
    expect(logged()[0]).toMatchObject({ decision: 'denied', error: 'tool_not_available' });
  });
});

describe('handleToolCall: arguments + upstream results', () => {
  it('missing required args -> clear Indonesian error, no call', async () => {
    const r = await handleToolCall(ctx(), 'party_create', { name: 'PT X' });
    expect(r.isError).toBe(true);
    expect((r.content[0] as any).text).toContain('partyType');
    expect(m.callHandler).not.toHaveBeenCalled();
    expect(m.queueToolCall).not.toHaveBeenCalled();
  });

  it('fail-fast enum/type validation happens BEFORE queueing (agent can fix and retry)', async () => {
    const r = await handleToolCall(ctx(), 'party_create', { name: 'A', partyType: 'CUSTOMER' });
    expect(r.isError).toBe(true);
    expect((r.content[0] as any).text).toContain('partyType harus salah satu dari: Customer / Supplier / Both');
    expect(m.queueToolCall).not.toHaveBeenCalled();
  });

  it('upstream validation error surfaces faithfully as isError (allowed, status kept)', async () => {
    m.callHandler.mockResolvedValue(json({ error: 'Tanggal wajib diisi.' }, 400));
    const r = await handleToolCall(ctx(), 'prod_draft_create', { ...DRAFT, date: 'x' });
    expect(r.isError).toBe(true);
    expect((r.content[0] as any).text).toContain('Tanggal wajib diisi.');
    expect(logged()[0]).toMatchObject({ decision: 'allowed', httpStatus: 400 });
  });

  it('upstream 403 -> denied; 500 -> error; network failure -> friendly isError', async () => {
    m.callHandler.mockResolvedValueOnce(json({ error: 'Akses ditolak: Tidak memiliki izin.' }, 403));
    await handleToolCall(ctx(), 'coa_list', {});
    m.callHandler.mockResolvedValueOnce(json({ error: 'boom' }, 500));
    await handleToolCall(ctx(), 'coa_list', {});
    m.callHandler.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const net = await handleToolCall(ctx(), 'coa_list', {});
    expect(logged().map((l) => l.decision)).toEqual(['denied', 'error', 'error']);
    expect(net.isError).toBe(true);
    expect((net.content[0] as any).text).not.toContain('ECONNREFUSED');
  });

  it('panggil_tool (compact mode) routes to the same policy and logs the inner tool', async () => {
    const r = await handleToolCall(ctx(), 'panggil_tool', { tool: 'party_create', args: { name: 'A', partyType: 'Customer' } });
    expect(sc(r).status).toBe('pending_approval');
    expect(logged()[0]).toMatchObject({ tool: 'party_create', decision: 'queued' });
    expect((await handleToolCall(ctx(), 'panggil_tool', { tool: 'whoami' })).isError).toBe(true);
  });

  it('meta tools work and are logged', async () => {
    const r = await handleToolCall(ctx(), 'whoami', {});
    expect(sc(r).actor).toMatchObject({ nama: 'Budi', jabatan: 'Kasir' });
    expect(logged()[0]).toMatchObject({ tool: 'whoami', decision: 'allowed' });
  });
});

describe('handleToolCall: idempotency', () => {
  const args = { name: 'A', partyType: 'Customer', idempotencyKey: 'k-1' };

  it('first call claims, runs, stores the result; the claim row is the log (no duplicate row)', async () => {
    m.claimIdempotency.mockResolvedValue({ kind: 'claimed', logId: 'log-1' });
    await handleToolCall(ctx(), 'party_create', args);
    expect(m.claimIdempotency).toHaveBeenCalledWith(expect.objectContaining({ tokenId: 't1', idempotencyKey: 'k-1' }));
    expect(m.finishClaimed).toHaveBeenCalledWith('log-1', expect.objectContaining({ decision: 'queued', approvalId: 'apr-1', resultJson: expect.objectContaining({ approvalId: 'apr-1' }) }));
    expect(m.recordCall).not.toHaveBeenCalled();
    expect(m.queueToolCall.mock.calls[0][0].args).not.toHaveProperty('idempotencyKey');
  });

  it('replay returns the FIRST stored result without running again', async () => {
    m.claimIdempotency.mockResolvedValue({ kind: 'replay', row: { resultJson: { ok: true, status: 'pending_approval', approvalId: 'apr-1' } } });
    const r = await handleToolCall(ctx(), 'party_create', args);
    expect(sc(r)).toMatchObject({ approvalId: 'apr-1', replayed: true });
    expect(m.queueToolCall).not.toHaveBeenCalled();
    expect(m.callHandler).not.toHaveBeenCalled();
  });

  it('concurrent in-flight duplicate -> 409-style isError', async () => {
    m.claimIdempotency.mockResolvedValue({ kind: 'inflight' });
    const r = await handleToolCall(ctx(), 'party_create', args);
    expect(r.isError).toBe(true);
    expect(m.queueToolCall).not.toHaveBeenCalled();
  });

  it('a failed run releases the claim so the same key can be retried', async () => {
    m.claimIdempotency.mockResolvedValue({ kind: 'claimed', logId: 'log-9' });
    m.callHandler.mockResolvedValue(json({ error: 'Tanggal wajib diisi.' }, 400));
    await handleToolCall(ctx(), 'prod_draft_create', { ...DRAFT, date: 'x', idempotencyKey: 'k-2' });
    expect(m.releaseClaim).toHaveBeenCalledWith('log-9');
    expect(m.finishClaimed).not.toHaveBeenCalled();
    expect(m.recordCall).toHaveBeenCalledTimes(1);
  });

  it('idempotencyKey is ignored for read tools and validated for writes', async () => {
    await handleToolCall(ctx(), 'coa_list', { idempotencyKey: 'x' });
    expect(m.claimIdempotency).not.toHaveBeenCalled();
    const bad = await handleToolCall(ctx(), 'party_create', { name: 'A', partyType: 'Customer', idempotencyKey: 'x'.repeat(101) });
    expect(bad.isError).toBe(true);
  });
});
