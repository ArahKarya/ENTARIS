import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-jwt-secret-value-0123456789';
  return {
    can: vi.fn(),
    hasCap: vi.fn(),
    callHandler: vi.fn(),
    queueToolCall: vi.fn(),
    recordCall: vi.fn().mockResolvedValue('log-1'),
    findMany: vi.fn(),
  };
});
vi.mock('../../lib/prisma', () => ({ prisma: { aiToolConfig: { findMany: async () => [] }, mcpCallLog: { findMany: m.findMany } } }));
vi.mock('../../services/permissionService', () => ({ can: m.can, hasCap: m.hasCap }));
vi.mock('../execute', async () => ({ ...(await vi.importActual<typeof import('../execute')>('../execute')), callHandler: m.callHandler }));
vi.mock('../queue', () => ({ queueToolCall: m.queueToolCall }));
vi.mock('../callLog', async () => ({ ...(await vi.importActual<typeof import('../callLog')>('../callLog')), recordCall: m.recordCall }));

import { handleToolCall, type CallContext } from '../callTool';
import { onCall, type CallEvent } from '../callBus';
import { watchTurn, toolLabel } from '../../services/chat/toolEvents';

const ctx = (ref?: string): CallContext => ({
  token: { id: 't1', name: 'aira-dev' } as never,
  actor: { id: 'u1', fullName: 'Budi', email: 'b@x', role: 'Accountant', airaTier: 'standard', airaJabatan: null, channel: 'panel', groupFloor: false, viaAssertion: true, ref } as never,
  clientIp: '127.0.0.1',
});
const sc = (r: unknown) => (r as { structuredContent: Record<string, unknown> }).structuredContent;

beforeEach(() => {
  vi.clearAllMocks();
  m.can.mockResolvedValue(true);
  m.hasCap.mockResolvedValue(true);
  m.recordCall.mockResolvedValue('log-1');
  m.findMany.mockResolvedValue([]);
  m.queueToolCall.mockResolvedValue({ approvalId: 'apr-1', confirm: 'Posting draft?' });
});

describe('call log ref + card hint', () => {
  it('persists the assertion ref and a card hint, adds `card` to structuredContent (additive), emits start/end on the bus', async () => {
    const events: CallEvent[] = [];
    const off = onCall((e) => events.push(e));
    m.callHandler.mockResolvedValue({ status: 201, ok: true, body: { kind: 'json', data: { id: 'd1', draftNumber: 'DKB-1', title: 'T', status: 'Draft', rows: [{}] } } });
    const r = await handleToolCall(ctx('s1:t1'), 'kas_buat_draft_dari_baris', { entryDate: '2026-10-01', cashAccountId: 'a', rows: [{ description: 'x', amount: 1, direction: 'keluar' }] });
    off();
    expect(r.isError).toBe(false);
    expect(sc(r).card).toMatchObject({ kind: 'cash_book_draft', href: '/cash-book-drafts/d1' });
    expect(sc(r).ok).toBe(true); // bentuk lama tetap utuh
    const row = m.recordCall.mock.calls[0][0];
    expect(row).toMatchObject({ tool: 'kas_buat_draft_dari_baris', ref: 's1:t1', channel: 'panel', card: { kind: 'cash_book_draft' } });
    expect(events.map((e) => e.phase)).toEqual(['start', 'end']);
    expect(events[1]).toMatchObject({ ref: 's1:t1', tool: 'kas_buat_draft_dari_baris', decision: 'allowed', callId: 'log-1' });
  });

  it('queued tool → approval card + ref', async () => {
    const r = await handleToolCall(ctx('s1:t2'), 'kas_draft_posting', { id: 'd1' });
    expect(sc(r).status).toBe('pending_approval');
    expect(sc(r).card).toMatchObject({ kind: 'approval', href: '/approvals' });
    expect(m.recordCall.mock.calls[0][0]).toMatchObject({ decision: 'queued', ref: 's1:t2', card: { kind: 'approval' } });
  });

  it('no ref → nothing emitted, ref logged as null', async () => {
    const events: CallEvent[] = [];
    const off = onCall((e) => events.push(e));
    m.callHandler.mockResolvedValue({ status: 200, ok: true, body: { kind: 'json', data: [] } });
    await handleToolCall(ctx(undefined), 'coa_list', {});
    off();
    expect(events).toHaveLength(0);
    expect(m.recordCall.mock.calls[0][0].ref).toBeUndefined();
  });
});

describe('watchTurn', () => {
  it('relays bus events for its ref only, dedups bus vs polling by call id, and drains on stop', async () => {
    const seen: string[] = [];
    const cards: unknown[] = [];
    m.findMany.mockResolvedValue([
      { id: 'log-1', tool: 'coa_list', decision: 'allowed', card: null },
      { id: 'log-2', tool: 'kas_buat_draft_dari_baris', decision: 'allowed', card: { kind: 'cash_book_draft', title: 'D', href: '/cash-book-drafts/1' } },
    ]);
    const w = watchTurn('s9:t9', { tool: (e) => seen.push(`${e.name}:${e.state}`), card: (c) => cards.push(c) }, 10_000);
    m.recordCall.mockResolvedValue('log-1');
    m.callHandler.mockResolvedValue({ status: 200, ok: true, body: { kind: 'json', data: [] } });
    await handleToolCall(ctx('s9:t9'), 'coa_list', {});
    await handleToolCall(ctx('other:ref'), 'coa_list', {});
    await w.stop(); // pengurasan terakhir: log-1 sudah terlihat lewat bus → hanya log-2 baru
    expect(seen).toEqual(['coa_list:start', 'coa_list:done', 'kas_buat_draft_dari_baris:done']);
    expect(cards).toHaveLength(1);
    expect(w.calls().map((c) => c.name)).toEqual(['coa_list', 'kas_buat_draft_dari_baris']);
  });

  it('labels: meta tools and registry-derived Indonesian text', () => {
    expect(toolLabel('whoami')).toMatch(/identitas/);
    expect(toolLabel('coa_list')).toMatch(/…$/);
    expect(toolLabel('tidak_ada_tool')).toBe('Menjalankan tidak_ada_tool…');
    // deskripsi yang sudah berawalan kata kerja aktif tidak diberi kata kerja ganda
    expect(toolLabel('kas_buat_draft_dari_baris')).toMatch(/^Membuat DRAFT Buku Kas/);
    expect(toolLabel('kas_buat_draft_dari_baris')).not.toMatch(/^Menyiapkan membuat/);
  });
});
