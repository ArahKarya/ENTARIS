import { describe, it, expect, beforeEach } from 'vitest';
import { decideForTool, effectiveUserTier } from '../policy';
import { checkRate, resetRateLimits } from '../rateLimit';
import { cariTool, dokumenTool, whoami, metaToolDefs } from '../meta';
import { inputSchemaFor, toMcpTool } from '../schema';
import { getTool, listTools } from '../../ai/registry';
import type { AllowedTool } from '../toolAccess';
import type { EffectiveTool } from '../../ai/types';

const T = (risk: 'read' | 'write' | 'critical', draftCapable = false) => ({ risk, draftCapable });

describe('decideForTool (tier matrix)', () => {
  it('read tools always execute, even for read-level users', () => {
    for (const u of ['read', 'standard', 'direct'] as const) expect(decideForTool(T('read'), 'auto', false, u)).toBe('execute');
  });

  it('read-level users cannot write/critical (deny)', () => {
    expect(decideForTool(T('write', true), 'draft', false, 'read')).toBe('deny');
    expect(decideForTool(T('critical'), 'must_approve', false, 'read')).toBe('deny');
  });

  it('standard: draftCapable write executes; other write + all critical are queued', () => {
    expect(decideForTool(T('write', true), 'draft', false, 'standard')).toBe('execute');
    expect(decideForTool(T('write', false), 'draft', false, 'standard')).toBe('queue');
    expect(decideForTool(T('critical', false), 'must_approve', false, 'standard')).toBe('queue');
    // critical + draftCapable (e.g. prod_draft_post) is STILL queued
    expect(decideForTool(T('critical', true), 'must_approve', false, 'standard')).toBe('queue');
  });

  it('direct: write and critical execute directly', () => {
    expect(decideForTool(T('write', false), 'draft', false, 'direct')).toBe('execute');
    expect(decideForTool(T('critical', false), 'must_approve', false, 'direct')).toBe('execute');
  });

  it('an explicit admin override pins the tier regardless of user level', () => {
    expect(decideForTool(T('write', true), 'must_approve', true, 'direct')).toBe('queue');
    expect(decideForTool(T('critical'), 'auto', true, 'standard')).toBe('execute');
    expect(decideForTool(T('critical'), 'auto', true, 'read')).toBe('deny');
  });

  it('group floor downgrades direct to standard; unknown values fall back to standard', () => {
    expect(effectiveUserTier('direct', true)).toBe('standard');
    expect(effectiveUserTier('direct', false)).toBe('direct');
    expect(effectiveUserTier('read', true)).toBe('read');
    expect(effectiveUserTier('weird', false)).toBe('standard');
    expect(effectiveUserTier(null, false)).toBe('standard');
  });
});

describe('checkRate (sliding window)', () => {
  beforeEach(resetRateLimits);

  it('allows up to the limit, then blocks with a retry-after, per token', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(checkRate('a', 3, t0 + i).ok).toBe(true);
    const blocked = checkRate('a', 3, t0 + 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(checkRate('b', 3, t0 + 10).ok).toBe(true);
  });

  it('recovers once the window slides past', () => {
    const t0 = 5_000_000;
    for (let i = 0; i < 2; i++) checkRate('a', 2, t0);
    expect(checkRate('a', 2, t0 + 1000).ok).toBe(false);
    expect(checkRate('a', 2, t0 + 60_001).ok).toBe(true);
  });
});

describe('inputSchemaFor / toMcpTool (real registry)', () => {
  it('path + body params, required list, enums and idempotencyKey on writes', () => {
    const tool = getTool('payreq_pay')!;
    const s = inputSchemaFor(tool) as any;
    expect(s.required).toEqual(expect.arrayContaining(['id', 'cashAccountId', 'paymentDate']));
    expect(s.properties.id.type).toBe('string');
    expect(s.properties.idempotencyKey.type).toBe('string');
  });

  it('read tools do not get idempotencyKey; annotations follow risk', () => {
    const read = toMcpTool(getTool('coa_list')!, 'execute');
    expect((read.inputSchema as any).properties?.idempotencyKey).toBeUndefined();
    expect(read.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    const crit = toMcpTool(getTool('payreq_pay')!, 'queue');
    expect(crit.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(crit.description).toContain('menunggu persetujuan manusia');
  });

  it('every registry tool converts to a JSON-schema object without throwing', () => {
    const bad = listTools().filter((t) => {
      const s = inputSchemaFor(t) as any;
      return s.type !== 'object' || (s.required && !s.required.every((r: string) => r in s.properties));
    });
    expect(bad.map((b) => b.name)).toEqual([]);
  });

  it('meta tool list: compact adds panggil_tool', () => {
    expect(metaToolDefs(false).map((d) => d.name)).toEqual(['cari_tool', 'dokumen_tool', 'whoami']);
    expect(metaToolDefs(true).map((d) => d.name)).toContain('panggil_tool');
  });
});

const entry = (name: string, decision: 'execute' | 'queue'): AllowedTool => ({
  tool: { ...(getTool(name) as object), tier: 'draft', source: 'registry' } as EffectiveTool,
  pinned: false,
  decision,
});

describe('meta tools', () => {
  const allowed = [entry('coa_list', 'execute'), entry('party_create', 'queue'), entry('so_submit', 'queue')];

  it('cari_tool ranks name hits, filters by risk/toolset, reports tier', () => {
    const r = cariTool(allowed, { query: 'party' }).structured as any;
    expect(r.tools[0].name).toBe('party_create');
    expect(r.tools[0].tier).toBe('persetujuan');
    expect(r.tools[0].wajib).toEqual(expect.arrayContaining(['name']));
    expect((cariTool(allowed, { risk: 'read' }).structured as any).tools.map((t: any) => t.name)).toEqual(['coa_list']);
    expect((cariTool(allowed, { query: 'zzzz-no-match' }).structured as any).total).toBe(0);
  });

  it('dokumen_tool returns markdown for a tool and a toolset; errors clearly otherwise', () => {
    const d = dokumenTool({ name: 'party_create' }, new Set(['party_create']));
    expect(d.isError).toBe(false);
    expect((d.structured as any).markdown).toContain('party_create');
    expect((d.structured as any).boleh_dipakai).toBe(true);
    expect((dokumenTool({ toolset: 'penjualan' }, new Set()).structured as any).markdown.length).toBeGreaterThan(50);
    expect(dokumenTool({ name: 'nope' }, new Set()).isError).toBe(true);
    expect(dokumenTool({}, new Set()).isError).toBe(true);
  });

  it('whoami summarises actor, effective tier and toolsets', () => {
    const r = whoami(
      { id: 'u1', fullName: 'Budi', email: 'b@x', role: 'Accountant', airaTier: 'direct', airaJabatan: 'Kasir', channel: 'whatsapp', groupFloor: true, viaAssertion: true },
      'aira-dev',
      allowed,
    ).structured as any;
    expect(r.actor).toMatchObject({ nama: 'Budi', jabatan: 'Kasir', role: 'Accountant' });
    expect(r.aira).toMatchObject({ level: 'direct', level_efektif: 'standard', lantai_grup: true });
    expect(r.total_tool).toBe(3);
  });
});
