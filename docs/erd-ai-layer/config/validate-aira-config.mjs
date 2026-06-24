#!/usr/bin/env node
/**
 * Validator AIRA Tool Router config — Simple ERP (selaras BRD AIRA §8.9)
 * Cek: struktur, role/module/capability terdaftar, nama unik, konsistensi risk/handler,
 *      write/critical wajib confirm_template, read wajib handler GET.
 *
 * Pakai: node validate-aira-config.mjs
 * Exit 0 = lolos. Exit 1 = ada error. Jalankan tiap nambah/ubah tool.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(__dir, 'aira-tool-router.json'), 'utf8'));
const errors = [];
const warnings = [];

// Ajv opsional (validasi schema penuh)
let ajvUsed = false;
try {
  const { default: Ajv } = await import('ajv');
  const schema = JSON.parse(readFileSync(join(__dir, 'aira-tool-router.schema.json'), 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(cfg)) for (const e of validate.errors) errors.push(`[schema] ${e.instancePath || '/'} ${e.message}`);
  ajvUsed = true;
} catch { warnings.push('Ajv tidak terpasang (npm i -D ajv) — pakai validasi manual aturan inti.'); }

// Validasi manual (guard utama, selalu jalan)
const validModules = new Set(cfg.modules || []);
const validRoles = new Set(cfg.roles || []);
const validCaps = new Set(cfg.capabilities || []);
const seen = new Set();
const validRisk = new Set(['read', 'write', 'critical']);

if (!cfg.app) errors.push('config: field "app" wajib (1 file per aplikasi)');
if (typeof cfg.version !== 'number') errors.push('config: field "version" harus integer');

for (const [i, t] of (cfg.tools || []).entries()) {
  const at = `tools[${i}]${t.name ? ` (${t.name})` : ''}`;
  for (const k of ['name', 'desc', 'risk', 'roles', 'module', 'handler']) {
    if (t[k] === undefined || t[k] === null || t[k] === '' || (Array.isArray(t[k]) && t[k].length === 0))
      errors.push(`${at}: field wajib '${k}' kosong`);
  }
  if (t.name) {
    if (seen.has(t.name)) errors.push(`${at}: nama DUPLIKAT '${t.name}'`);
    seen.add(t.name);
    if (!/^[a-z][a-z0-9_]*$/.test(t.name)) errors.push(`${at}: nama harus snake_case`);
  }
  if (t.risk && !validRisk.has(t.risk)) errors.push(`${at}: risk '${t.risk}' invalid (read/write/critical)`);
  if (t.module && !validModules.has(t.module)) errors.push(`${at}: module '${t.module}' TIDAK terdaftar`);
  if (t.requiresCapability && !validCaps.has(t.requiresCapability)) errors.push(`${at}: capability '${t.requiresCapability}' TIDAK terdaftar`);
  // roles subset dari roles valid
  if (Array.isArray(t.roles)) for (const r of t.roles) if (!validRoles.has(r)) errors.push(`${at}: role '${r}' TIDAK terdaftar di config.roles`);
  // handler format "METHOD /path"
  if (t.handler && !/^(GET|POST|PUT|PATCH|DELETE) \/.+/.test(t.handler)) errors.push(`${at}: handler harus 'METHOD /path' (mis. 'POST /api/payments')`);
  // aturan AIRA: read => handler GET + tanpa confirm_template; write/critical => wajib confirm_template
  if (t.risk === 'read') {
    if (t.handler && !t.handler.startsWith('GET ')) errors.push(`${at}: risk=read WAJIB handler GET`);
    if (t.confirm_template) warnings.push(`${at}: risk=read tak perlu confirm_template`);
  }
  if ((t.risk === 'write' || t.risk === 'critical') && !t.confirm_template)
    errors.push(`${at}: risk=${t.risk} WAJIB punya confirm_template (BRD §8.9 — human-in-the-loop)`);
  if (t.level !== undefined && (t.level < 1 || t.level > 3)) errors.push(`${at}: level ${t.level} di luar 1-3`);
}

// Statistik
const stats = { total: cfg.tools.length, byRisk: {}, byGroup: {}, byLevel: {}, enabled: 0 };
for (const t of cfg.tools) {
  stats.byRisk[t.risk] = (stats.byRisk[t.risk] || 0) + 1;
  stats.byGroup[t.group || '-'] = (stats.byGroup[t.group || '-'] || 0) + 1;
  if (t.level) stats.byLevel[`L${t.level}`] = (stats.byLevel[`L${t.level}`] || 0) + 1;
  if (t.enabled !== false) stats.enabled++;
}

console.log(`AIRA Tool Router — app="${cfg.app}" v${cfg.version} — ${stats.total} tools (${stats.enabled} enabled)`);
console.log(`  validasi: ${ajvUsed ? 'Ajv + manual' : 'manual (Ajv absen)'}`);
console.log(`  risk:`, stats.byRisk);
console.log(`  level:`, stats.byLevel);
console.log(`  group:`, stats.byGroup);
for (const w of warnings) console.log(`  ⚠️  ${w}`);

if (errors.length) {
  console.error(`\n❌ ${errors.length} ERROR:`);
  for (const e of errors) console.error(`   - ${e}`);
  process.exit(1);
}
console.log(`\n✅ Config valid. Semua ${stats.total} tool lolos cek (selaras BRD AIRA §8.9).`);
process.exit(0);
