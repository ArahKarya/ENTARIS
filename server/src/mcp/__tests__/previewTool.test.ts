import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-jwt-secret-value-0123456789';
  return {
    can: vi.fn(),
    hasCap: vi.fn(),
    callHandler: vi.fn(),
    queueToolCall: vi.fn(),
    recordCall: vi.fn().mockResolvedValue('log-1'),
  };
});
vi.mock('../../lib/prisma', () => ({ prisma: { aiToolConfig: { findMany: async () => [] } } }));
vi.mock('../../services/permissionService', () => ({ can: m.can, hasCap: m.hasCap }));
vi.mock('../execute', async () => ({ ...(await vi.importActual<typeof import('../execute')>('../execute')), callHandler: m.callHandler }));
vi.mock('../queue', async () => ({ ...(await vi.importActual<typeof import('../queue')>('../queue')), queueToolCall: m.queueToolCall }));
vi.mock('../callLog', async () => ({ ...(await vi.importActual<typeof import('../callLog')>('../callLog')), recordCall: m.recordCall }));

import { handleToolCall, type CallContext } from '../callTool';
import { metaToolDefs } from '../meta';

const ctx = (airaTier = 'standard'): CallContext => ({
  token: { id: 't1', name: 'aira-dev' } as never,
  actor: { id: 'u1', fullName: 'Budi', email: 'b@x', role: 'Accountant', airaTier, airaJabatan: null, channel: 'telegram', groupFloor: false, viaAssertion: true } as never,
});
const sc = (r: unknown) => (r as { structuredContent: Record<string, unknown> }).structuredContent;
const DRAFT_ARGS = { entryDate: '2026-10-01', cashAccountId: 'a', rows: [{ description: 'x', amount: 1, direction: 'keluar' }] };

beforeEach(() => {
  vi.clearAllMocks();
  m.can.mockResolvedValue(true);
  m.hasCap.mockResolvedValue(true);
  m.recordCall.mockResolvedValue('log-1');
});

describe('pratinjau_tool', () => {
  it('is listed in both modes and is read-only', () => {
    for (const compact of [false, true]) {
      const def = metaToolDefs(compact).find((d) => d.name === 'pratinjau_tool');
      expect(def?.annotations).toMatchObject({ readOnlyHint: true });
    }
  });

  it('queued write: needs confirmation, official text, nothing runs', async () => {
    const r = await handleToolCall(ctx(), 'pratinjau_tool', { tool: 'kas_draft_posting', args: { id: 'DKB-1' } });
    expect(r.isError).toBe(false);
    expect(sc(r)).toMatchObject({ tool: 'kas_draft_posting', tindakan: 'persetujuan', perlu_konfirmasi: true });
    expect(String(sc(r).konfirmasi)).toContain('DKB-1');
    expect(sc(r).rincian).toEqual([{ label: 'id', value: 'DKB-1' }]);
    expect(m.callHandler).not.toHaveBeenCalled();
    expect(m.queueToolCall).not.toHaveBeenCalled();
    expect(m.recordCall.mock.calls[0][0]).toMatchObject({ tool: 'pratinjau_tool', risk: 'read', decision: 'allowed' });
  });

  it('direct level executes at once: still needs confirmation', async () => {
    const r = await handleToolCall(ctx('direct'), 'pratinjau_tool', { tool: 'kas_draft_posting', args: { id: 'DKB-1' } });
    expect(sc(r)).toMatchObject({ tindakan: 'langsung', perlu_konfirmasi: true });
  });

  it('draft and read tools need no confirmation', async () => {
    const draft = await handleToolCall(ctx(), 'pratinjau_tool', { tool: 'kas_buat_draft_dari_baris', args: DRAFT_ARGS });
    expect(sc(draft)).toMatchObject({ tindakan: 'draft', perlu_konfirmasi: false });
    expect(sc(draft).rincian).toContainEqual({ label: 'rows', value: '1 baris' });
    const read = await handleToolCall(ctx(), 'pratinjau_tool', { tool: 'coa_list', args: {} });
    expect(sc(read)).toMatchObject({ tindakan: 'baca', perlu_konfirmasi: false });
  });

  it('refuses what the real call would refuse', async () => {
    const missing = await handleToolCall(ctx(), 'pratinjau_tool', { tool: 'kas_draft_posting', args: {} });
    expect(missing.isError).toBe(true);
    const readOnly = await handleToolCall(ctx('read'), 'pratinjau_tool', { tool: 'kas_draft_posting', args: { id: 'x' } });
    expect(readOnly.isError).toBe(true);
    const meta = await handleToolCall(ctx(), 'pratinjau_tool', { tool: 'panggil_tool', args: {} });
    expect(meta.isError).toBe(true);
    const viaWrapper = await handleToolCall(ctx(), 'panggil_tool', { tool: 'pratinjau_tool', args: {} });
    expect(viaWrapper.isError).toBe(true);
  });
});
