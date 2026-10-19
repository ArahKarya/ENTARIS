// AIRA tool registry runtime: loads aira-tool-router.json at startup, validates each entry (BRD
// AIRA §8.9; invalid entries are skipped and logged), and merges DB overrides (AiToolConfig).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../lib/logger';
import { CAPABILITY_KEYS } from '../constants/modules';
import { TOOLSETS } from './types';
import type {
  ToolDef,
  ToolRegistry,
  ToolRisk,
  ToolTier,
  EffectiveTool,
  ValidationResult,
} from './types';

const REGISTRY_PATH = join(__dirname, 'aira-tool-router.json');
const VALID_RISK = new Set<ToolRisk>(['read', 'write', 'critical']);
const HANDLER_RE = /^(GET|POST|PUT|PATCH|DELETE) \/.+/;
const NAME_RE = /^[a-z][a-z0-9_]*$/;

/** Tier default diturunkan dari risk (read→auto, write→draft, critical→must_approve). */
export function riskToTier(risk: ToolRisk): ToolTier {
  if (risk === 'read') return 'auto';
  if (risk === 'write') return 'draft';
  return 'must_approve';
}

/**
 * Validasi satu entri tool. Mengembalikan daftar error (kosong = valid).
 * Aturan inti BRD AIRA §8.9:
 *  - field wajib: name/desc/risk/roles/module/handler
 *  - name snake_case & unik
 *  - risk ∈ read/write/critical; module/role/capability terdaftar
 *  - handler "METHOD /path"
 *  - read → handler GET (kecuali safeNonGet); write/critical → wajib confirm_template
 *  - toolset (opsional) ∈ TOOLSETS
 *  - level 1..3
 */
export function validateTool(
  t: Partial<ToolDef>,
  ctx: {
    validModules: Set<string>;
    validRoles: Set<string>;
    validCaps: Set<string>;
    seen: Set<string>;
  },
): string[] {
  const errors: string[] = [];
  const at = `tool${t.name ? ` '${t.name}'` : ''}`;

  for (const k of ['name', 'desc', 'risk', 'roles', 'module', 'handler'] as const) {
    const v = t[k];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
      errors.push(`${at}: field wajib '${k}' kosong`);
    }
  }

  if (t.name) {
    if (ctx.seen.has(t.name)) errors.push(`${at}: nama DUPLIKAT`);
    ctx.seen.add(t.name);
    if (!NAME_RE.test(t.name)) errors.push(`${at}: nama harus snake_case`);
  }

  if (t.risk && !VALID_RISK.has(t.risk)) {
    errors.push(`${at}: risk '${t.risk}' invalid (read/write/critical)`);
  }
  if (t.module && !ctx.validModules.has(t.module)) {
    errors.push(`${at}: module '${t.module}' TIDAK terdaftar`);
  }
  if (t.requiresCapability && !ctx.validCaps.has(t.requiresCapability)) {
    errors.push(`${at}: capability '${t.requiresCapability}' TIDAK terdaftar`);
  }
  if (Array.isArray(t.roles)) {
    for (const r of t.roles) {
      if (!ctx.validRoles.has(r)) errors.push(`${at}: role '${r}' TIDAK terdaftar`);
    }
  }
  if (t.handler && !HANDLER_RE.test(t.handler)) {
    errors.push(`${at}: handler harus 'METHOD /path'`);
  }
  if (t.risk === 'read' && t.handler && !t.handler.startsWith('GET ') && !t.safeNonGet) {
    errors.push(`${at}: risk=read WAJIB handler GET (kecuali safeNonGet=true utk preview/search murni baca)`);
  }
  if (t.safeNonGet && t.risk !== 'read') {
    errors.push(`${at}: safeNonGet hanya valid untuk risk=read`);
  }
  if (t.toolset !== undefined && !(TOOLSETS as readonly string[]).includes(t.toolset)) {
    errors.push(`${at}: toolset '${t.toolset}' TIDAK terdaftar`);
  }
  if ((t.risk === 'write' || t.risk === 'critical') && !t.confirm_template) {
    errors.push(`${at}: risk=${t.risk} WAJIB confirm_template (human-in-the-loop)`);
  }
  if (t.level !== undefined && (t.level < 1 || t.level > 3)) {
    errors.push(`${at}: level ${t.level} di luar 1-3`);
  }

  return errors;
}

let cache: { registry: ToolRegistry; byName: Map<string, ToolDef>; result: ValidationResult } | null =
  null;

/** Baca + validasi registry dari file. Entri rusak di-skip (tak menggagalkan load). */
export function loadRegistry(force = false): {
  registry: ToolRegistry;
  byName: Map<string, ToolDef>;
  result: ValidationResult;
} {
  if (cache && !force) return cache;

  let raw: ToolRegistry;
  try {
    raw = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as ToolRegistry;
  } catch (err) {
    logger.error({ err }, 'AIRA registry: gagal baca aira-tool-router.json');
    const empty: ToolRegistry = {
      app: 'unknown',
      version: '0',
      modules: [],
      roles: [],
      capabilities: [],
      tools: [],
    };
    cache = {
      registry: empty,
      byName: new Map(),
      result: { valid: false, errors: ['registry tidak terbaca'], loaded: 0, skipped: [] },
    };
    return cache;
  }

  const ctx = {
    validModules: new Set(raw.modules || []),
    validRoles: new Set(raw.roles || []),
    // capability boleh dari header config ATAU dari taksonomi RBAC ERP
    validCaps: new Set<string>([...(raw.capabilities || []), ...CAPABILITY_KEYS]),
    seen: new Set<string>(),
  };

  const valid: ToolDef[] = [];
  const byName = new Map<string, ToolDef>();
  const allErrors: string[] = [];
  const skipped: string[] = [];

  for (const t of raw.tools || []) {
    const errs = validateTool(t, ctx);
    if (errs.length) {
      allErrors.push(...errs);
      skipped.push(t.name || '(tanpa-nama)');
      logger.warn({ tool: t.name, errors: errs }, 'AIRA registry: tool di-skip (invalid)');
      continue;
    }
    valid.push(t as ToolDef);
    byName.set(t.name, t as ToolDef);
  }

  const result: ValidationResult = {
    valid: allErrors.length === 0,
    errors: allErrors,
    loaded: valid.length,
    skipped,
  };

  logger.info(
    { app: raw.app, version: raw.version, loaded: valid.length, skipped: skipped.length },
    'AIRA registry dimuat',
  );

  cache = { registry: { ...raw, tools: valid }, byName, result };
  return cache;
}

/** Lookup satu tool (hanya yang lolos validasi). */
export function getTool(name: string): ToolDef | undefined {
  return loadRegistry().byName.get(name);
}

/** Semua tool valid. */
export function listTools(): ToolDef[] {
  return loadRegistry().registry.tools;
}

/**
 * Status efektif tool = registry default + override DB.
 * @param overrides Map toolName → { enabled?, tier? } dari tabel AiToolConfig.
 */
export function effectiveTools(
  overrides: Map<string, { enabled?: boolean | null; tier?: string | null }>,
): EffectiveTool[] {
  return listTools().map((t) => {
    const ov = overrides.get(t.name);
    const enabled = ov?.enabled ?? t.enabled;
    const tier = (ov?.tier as ToolTier) ?? riskToTier(t.risk);
    return {
      ...t,
      enabled,
      tier,
      source: ov ? 'override' : 'registry',
    };
  });
}

/** Reset cache (dipakai test / setelah ubah file). */
export function resetRegistryCache(): void {
  cache = null;
}
