// Drift guard katalog tool AIRA/MCP:
//  (a) handler registry harus cocok route nyata,
//  (b) route non-denylist harus punya tool,
//  (c) tool write/critical wajib confirm_template + postingEffect (+ draftCapable boolean),
//  (d) tool wajib punya deskripsi & dokumentasi parameter,
//  (e) docs/ai-tools harus mutakhir terhadap registry.
import { describe, expect, it } from 'vitest';
import { buildRouteInventory, normalizeHandlerPath } from '../catalog/inventoryRoutes';
import { DENY_RULES, matchDenylist } from '../catalog/denylist';
import { diffDocs, generateDocs, loadGeneratorInput } from '../catalog/docsGenerator';
import { loadRegistry } from '../registry';
import { TOOLSETS } from '../types';

const key = (method: string, p: string) => `${method} ${normalizeHandlerPath(p)}`;
const handlerKey = (h: string) => {
  const [m, ...p] = h.split(' ');
  return key(m, p.join(' '));
};

const inventory = buildRouteInventory();
const { registry, result } = loadRegistry(true);
const tools = registry.tools;

describe('katalog tool — registry valid', () => {
  it('semua entri lolos validasi runtime', () => {
    expect(result.errors).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('nama & handler unik; semua tool nonaktif secara default', () => {
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
    expect(new Set(tools.map((t) => handlerKey(t.handler))).size).toBe(tools.length);
    expect(tools.filter((t) => t.enabled).map((t) => t.name)).toEqual([]);
  });
});

describe('(a) handler registry ↔ route nyata', () => {
  it('setiap handler cocok dengan satu route di inventori', () => {
    const real = new Set(inventory.map((r) => key(r.method, r.path)));
    const stale = tools.filter((t) => !real.has(handlerKey(t.handler))).map((t) => `${t.name}: ${t.handler}`);
    expect(stale).toEqual([]);
  });

  it('tool tidak boleh menunjuk route yang di-denylist', () => {
    const bad = tools
      .filter((t) => {
        const [m, ...p] = t.handler.split(' ');
        return matchDenylist(m, p.join(' '), DENY_RULES);
      })
      .map((t) => t.name);
    expect(bad).toEqual([]);
  });

  it('inventori tidak memuat path template yang belum terselesaikan', () => {
    expect(inventory.filter((r) => r.path.includes('${')).map((r) => r.path)).toEqual([]);
  });
});

describe('(b) route nyata ↔ tool', () => {
  it('setiap route non-denylist punya tool', () => {
    const have = new Set(tools.map((t) => handlerKey(t.handler)));
    const missing = inventory
      .filter((r) => !matchDenylist(r.method, r.path) && !have.has(key(r.method, r.path)))
      .map((r) => `${r.method} ${r.path} (${r.file}:${r.line})`);
    expect(missing).toEqual([]);
  });
});

describe('(c) tool write/critical', () => {
  const writes = tools.filter((t) => t.risk !== 'read');
  it('wajib confirm_template, postingEffect dan draftCapable boolean', () => {
    const bad = writes
      .filter((t) => !t.confirm_template || !t.postingEffect || typeof t.draftCapable !== 'boolean')
      .map((t) => t.name);
    expect(bad).toEqual([]);
  });

  it('placeholder confirm_template merujuk parameter nyata', () => {
    const bad: string[] = [];
    for (const t of writes) {
      const names = new Set((t.params ?? []).map((p) => p.name));
      for (const m of (t.confirm_template ?? '').matchAll(/\{(\w+)\}/g)) if (!names.has(m[1])) bad.push(`${t.name}: {${m[1]}}`);
    }
    expect(bad).toEqual([]);
  });

  it('read non-GET wajib safeNonGet', () => {
    const bad = tools.filter((t) => t.risk === 'read' && !t.handler.startsWith('GET ') && !t.safeNonGet).map((t) => t.name);
    expect(bad).toEqual([]);
  });
});

describe('(d) dokumentasi tool', () => {
  it('deskripsi, toolset, ringkasan hasil dan params terisi', () => {
    const bad: string[] = [];
    for (const t of tools) {
      if (!t.desc || t.desc.length < 30) bad.push(`${t.name}: desc`);
      if (!t.toolset || !(TOOLSETS as readonly string[]).includes(t.toolset)) bad.push(`${t.name}: toolset`);
      if (!t.outputSummary) bad.push(`${t.name}: outputSummary`);
      if (!Array.isArray(t.params)) bad.push(`${t.name}: params`);
    }
    expect(bad).toEqual([]);
  });

  it('semua :param path ada di params dan input', () => {
    const bad: string[] = [];
    for (const t of tools) {
      const path = t.handler.split(' ').slice(1).join(' ');
      for (const m of path.matchAll(/:([A-Za-z0-9_]+)/g)) {
        if (!t.params?.some((p) => p.name === m[1] && p.in === 'path' && p.required)) bad.push(`${t.name}: path :${m[1]}`);
        if (!(m[1] in t.input)) bad.push(`${t.name}: input.${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('param wajib & path punya keterangan', () => {
    const bad: string[] = [];
    for (const t of tools) for (const p of t.params ?? []) if ((p.required || p.in === 'path') && !p.description) bad.push(`${t.name}.${p.name}`);
    expect(bad).toEqual([]);
  });
});

describe('(e) docs/ai-tools mutakhir', () => {
  it('hasil generate identik dengan file di docs/ai-tools (jalankan: npm run ai-tools:docs)', () => {
    const stale = diffDocs(generateDocs(loadGeneratorInput()));
    expect(stale).toEqual([]);
  });
});
