import { describe, it, expect } from 'vitest';
import {
  loadRegistry,
  validateTool,
  riskToTier,
  effectiveTools,
  getTool,
  listTools,
} from '../ai/registry';
import type { ToolDef } from '../ai/types';

const baseCtx = () => ({
  validModules: new Set(['payment', 'reports']),
  validRoles: new Set(['Admin', 'Accountant', 'Viewer']),
  validCaps: new Set(['rbac.manage', 'doc.cancel']),
  seen: new Set<string>(),
});

describe('AIRA registry — load file nyata', () => {
  it('memuat registry tanpa error validasi (semua tool lolos)', () => {
    const { registry, result } = loadRegistry(true);
    expect(registry.app).toBeTruthy();
    expect(result.loaded).toBeGreaterThan(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('lookup by-name bekerja & menolak tool tak dikenal', () => {
    const tools = listTools();
    const first = tools[0].name;
    expect(getTool(first)?.name).toBe(first);
    expect(getTool('tool_ngawur_xyz')).toBeUndefined();
  });
});

describe('riskToTier', () => {
  it('read→auto, write→draft, critical→must_approve', () => {
    expect(riskToTier('read')).toBe('auto');
    expect(riskToTier('write')).toBe('draft');
    expect(riskToTier('critical')).toBe('must_approve');
  });
});

describe('validateTool — guard BRD AIRA §8.9', () => {
  it('tool read valid → nol error', () => {
    const t: Partial<ToolDef> = {
      name: 'rpt_x',
      desc: 'baca',
      risk: 'read',
      roles: ['Admin', 'Viewer'],
      module: 'reports',
      handler: 'GET /api/x',
      permAction: 'view',
    };
    expect(validateTool(t, baseCtx())).toHaveLength(0);
  });

  it('write TANPA confirm_template → ditolak', () => {
    const t: Partial<ToolDef> = {
      name: 'pay_x',
      desc: 'bayar',
      risk: 'write',
      roles: ['Admin'],
      module: 'payment',
      handler: 'POST /api/payments',
      permAction: 'edit',
    };
    const errs = validateTool(t, baseCtx());
    expect(errs.some((e) => e.includes('confirm_template'))).toBe(true);
  });

  it('role ngawur → ditolak', () => {
    const t: Partial<ToolDef> = {
      name: 'rpt_y',
      desc: 'baca',
      risk: 'read',
      roles: ['SuperHacker'],
      module: 'reports',
      handler: 'GET /api/y',
    };
    const errs = validateTool(t, baseCtx());
    expect(errs.some((e) => e.includes('SuperHacker'))).toBe(true);
  });

  it('read dengan handler non-GET → ditolak', () => {
    const t: Partial<ToolDef> = {
      name: 'rpt_z',
      desc: 'baca',
      risk: 'read',
      roles: ['Admin'],
      module: 'reports',
      handler: 'POST /api/z',
    };
    const errs = validateTool(t, baseCtx());
    expect(errs.some((e) => e.includes('read WAJIB handler GET'))).toBe(true);
  });

  it('nama duplikat → ditolak', () => {
    const ctx = baseCtx();
    const t: Partial<ToolDef> = {
      name: 'dup',
      desc: 'x',
      risk: 'read',
      roles: ['Admin'],
      module: 'reports',
      handler: 'GET /api/a',
    };
    validateTool(t, ctx);
    const errs = validateTool({ ...t }, ctx);
    expect(errs.some((e) => e.includes('DUPLIKAT'))).toBe(true);
  });

  it('module tak terdaftar → ditolak', () => {
    const t: Partial<ToolDef> = {
      name: 'rpt_m',
      desc: 'x',
      risk: 'read',
      roles: ['Admin'],
      module: 'modul_hantu',
      handler: 'GET /api/m',
    };
    const errs = validateTool(t, baseCtx());
    expect(errs.some((e) => e.includes('modul_hantu'))).toBe(true);
  });

  it('level di luar 1-3 → ditolak', () => {
    const t: Partial<ToolDef> = {
      name: 'rpt_l',
      desc: 'x',
      risk: 'read',
      roles: ['Admin'],
      module: 'reports',
      handler: 'GET /api/l',
      level: 9,
    };
    const errs = validateTool(t, baseCtx());
    expect(errs.some((e) => e.includes('di luar 1-3'))).toBe(true);
  });
});

describe('effectiveTools — merge override DB', () => {
  it('tanpa override → source=registry, tier dari risk', () => {
    const eff = effectiveTools(new Map());
    expect(eff.length).toBeGreaterThan(0);
    expect(eff.every((t) => t.source === 'registry')).toBe(true);
    const read = eff.find((t) => t.risk === 'read');
    if (read) expect(read.tier).toBe('auto');
  });

  it('override enabled+tier menang & source=override', () => {
    const name = listTools()[0].name;
    const ov = new Map([[name, { enabled: false, tier: 'must_approve' }]]);
    const eff = effectiveTools(ov);
    const target = eff.find((t) => t.name === name)!;
    expect(target.enabled).toBe(false);
    expect(target.tier).toBe('must_approve');
    expect(target.source).toBe('override');
  });
});
