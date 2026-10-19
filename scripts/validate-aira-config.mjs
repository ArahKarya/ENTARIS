#!/usr/bin/env node
// Validator standalone AIRA Tool Router config.
// Mereplikasi PERSIS aturan validateTool() di server/src/ai/registry.ts +
// types.ts (BRD AIRA §8.9). Dipakai untuk memvalidasi registry baru TANPA
// harus build TypeScript. Capability valid = capabilities header config +
// taksonomi RBAC ERP (CAPABILITY_KEYS dari constants/modules.ts).
//
// Usage: node scripts/validate-aira-config.mjs [path-to-registry.json]
//   default path: server/src/ai/aira-tool-router.json

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');

const argPath = process.argv[2];
const REGISTRY_PATH = argPath
  ? resolve(process.cwd(), argPath)
  : join(REPO, 'server/src/ai/aira-tool-router.json');

// ── Taksonomi RBAC ERP (CAPABILITY_KEYS) — sinkron dgn constants/modules.ts ──
const CAPABILITY_KEYS = [
  'doc.cancel',
  'approval.decide',
  'approval.bypass',
  'approval.view_all',
  'inventory.negative_stock',
  'rbac.manage',
];

const VALID_RISK = new Set(['read', 'write', 'critical']);
const HANDLER_RE = /^(GET|POST|PUT|PATCH|DELETE) \/.+/;
const NAME_RE = /^[a-z][a-z0-9_]*$/;

function validateTool(t, ctx) {
  const errors = [];
  const at = `tool${t.name ? ` '${t.name}'` : ''}`;

  for (const k of ['name', 'desc', 'risk', 'roles', 'module', 'handler']) {
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
  if (t.risk === 'read' && t.handler && !t.handler.startsWith('GET ')) {
    errors.push(`${at}: risk=read WAJIB handler GET`);
  }
  if ((t.risk === 'write' || t.risk === 'critical') && !t.confirm_template) {
    errors.push(`${at}: risk=${t.risk} WAJIB confirm_template (human-in-the-loop)`);
  }
  if (t.level !== undefined && (t.level < 1 || t.level > 3)) {
    errors.push(`${at}: level ${t.level} di luar 1-3`);
  }
  return errors;
}

const raw = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
const ctx = {
  validModules: new Set(raw.modules || []),
  validRoles: new Set(raw.roles || []),
  validCaps: new Set([...(raw.capabilities || []), ...CAPABILITY_KEYS]),
  seen: new Set(),
};

const allErrors = [];
const skipped = [];
let loaded = 0;
const byRisk = { read: 0, write: 0, critical: 0 };
const byModule = {};

for (const t of raw.tools || []) {
  const errs = validateTool(t, ctx);
  if (errs.length) {
    allErrors.push(...errs);
    skipped.push(t.name || '(tanpa-nama)');
    continue;
  }
  loaded++;
  if (byRisk[t.risk] !== undefined) byRisk[t.risk]++;
  byModule[t.module] = (byModule[t.module] || 0) + 1;
}

console.log(`Registry : ${REGISTRY_PATH}`);
console.log(`App      : ${raw.app}  v${raw.version}`);
console.log(`Modules  : ${(raw.modules || []).length}`);
console.log(`Tools    : ${(raw.tools || []).length} total`);
console.log(`Loaded   : ${loaded} valid, ${skipped.length} skipped`);
console.log(`By risk  : read=${byRisk.read} write=${byRisk.write} critical=${byRisk.critical}`);
console.log(`By module:`);
for (const m of Object.keys(byModule).sort()) {
  console.log(`   ${m.padEnd(22)} ${byModule[m]}`);
}
if (allErrors.length) {
  console.log(`\n❌ ${allErrors.length} ERROR:`);
  for (const e of allErrors) console.log('  - ' + e);
  process.exit(1);
}
console.log(`\n✅ VALID — 0 error. ${loaded} tool lolos validator.`);
process.exit(0);
