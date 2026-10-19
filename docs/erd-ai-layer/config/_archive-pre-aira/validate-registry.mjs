#!/usr/bin/env node
/**
 * Validator AI Tool Registry — Entaris
 * Cek: (1) registry valid terhadap JSON Schema, (2) semua module/capability tool terdaftar,
 *      (3) nama tool unik, (4) konsistensi kind/tier/method.
 *
 * Pakai: node validate-registry.mjs
 * Exit 0 = lolos. Exit 1 = ada error (dicetak). Jalankan tiap nambah/ubah tool.
 *
 * Catatan: pakai Ajv kalau tersedia (npm i -D ajv). Kalau tidak, fallback validasi manual
 * untuk aturan inti (cukup untuk guard "tinggal tambah list").
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const registryPath = join(__dir, 'ai-tool-registry.json');
const schemaPath = join(__dir, 'ai-tool-registry.schema.json');

const reg = JSON.parse(readFileSync(registryPath, 'utf8'));
const errors = [];
const warnings = [];

// --- Validasi via Ajv kalau ada ---
let ajvUsed = false;
try {
  const { default: Ajv } = await import('ajv');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(reg)) {
    for (const e of validate.errors) errors.push(`[schema] ${e.instancePath || '/'} ${e.message}`);
  }
  ajvUsed = true;
} catch (e) {
  warnings.push('Ajv tidak terpasang (npm i -D ajv) — pakai validasi manual aturan inti.');
}

// --- Validasi manual aturan inti (selalu jalan, guard utama) ---
const validModules = new Set(reg.modules || []);
const validCaps = new Set(reg.capabilities || []);
const seenNames = new Set();
const validKind = new Set(['read', 'draft', 'action']);
const validTier = new Set(['auto', 'draft', 'must_approve']);
const validMethod = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

for (const [i, t] of (reg.tools || []).entries()) {
  const at = `tools[${i}]${t.name ? ` (${t.name})` : ''}`;
  // wajib
  for (const k of ['name', 'group', 'module', 'kind', 'tier', 'method', 'path', 'summary']) {
    if (t[k] === undefined || t[k] === null || t[k] === '') errors.push(`${at}: field wajib '${k}' kosong`);
  }
  // nama unik
  if (t.name) {
    if (seenNames.has(t.name)) errors.push(`${at}: nama tool DUPLIKAT '${t.name}'`);
    seenNames.add(t.name);
    if (!/^[a-z][a-z0-9_]*$/.test(t.name)) errors.push(`${at}: nama harus snake_case`);
  }
  // module terdaftar
  if (t.module && !validModules.has(t.module)) errors.push(`${at}: module '${t.module}' TIDAK terdaftar di registry.modules`);
  // capability terdaftar
  if (t.requiresCapability && !validCaps.has(t.requiresCapability)) errors.push(`${at}: capability '${t.requiresCapability}' TIDAK terdaftar`);
  // enum
  if (t.kind && !validKind.has(t.kind)) errors.push(`${at}: kind '${t.kind}' invalid`);
  if (t.tier && !validTier.has(t.tier)) errors.push(`${at}: tier '${t.tier}' invalid`);
  if (t.method && !validMethod.has(t.method)) errors.push(`${at}: method '${t.method}' invalid`);
  if (t.path && !t.path.startsWith('/')) errors.push(`${at}: path harus diawali '/'`);
  // aturan konsistensi: read => auto + GET
  if (t.kind === 'read') {
    if (t.tier !== 'auto') errors.push(`${at}: kind=read WAJIB tier=auto (read-only tak boleh approval)`);
    if (t.method !== 'GET') errors.push(`${at}: kind=read WAJIB method=GET`);
  }
  // aturan: action tak boleh auto
  if (t.kind === 'action' && t.tier === 'auto') errors.push(`${at}: kind=action TIDAK boleh tier=auto (mutasi wajib konfirmasi/approval)`);
  // phase range
  if (t.phase !== undefined && (t.phase < 0 || t.phase > 6)) errors.push(`${at}: phase ${t.phase} di luar 0-6`);
}

// --- Ringkasan statistik ---
const stats = { total: reg.tools.length, byKind: {}, byTier: {}, byGroup: {}, enabled: 0 };
for (const t of reg.tools) {
  stats.byKind[t.kind] = (stats.byKind[t.kind] || 0) + 1;
  stats.byTier[t.tier] = (stats.byTier[t.tier] || 0) + 1;
  stats.byGroup[t.group] = (stats.byGroup[t.group] || 0) + 1;
  if (t.enabled !== false) stats.enabled++;
}

// --- Output ---
console.log(`AI Tool Registry v${reg.version} — ${stats.total} tools (${stats.enabled} enabled)`);
console.log(`  validasi: ${ajvUsed ? 'Ajv + manual' : 'manual (Ajv absen)'}`);
console.log(`  kind:`, stats.byKind);
console.log(`  tier:`, stats.byTier);
console.log(`  group:`, stats.byGroup);
for (const w of warnings) console.log(`  ⚠️  ${w}`);

if (errors.length) {
  console.error(`\n❌ ${errors.length} ERROR:`);
  for (const e of errors) console.error(`   - ${e}`);
  process.exit(1);
}
console.log(`\n✅ Registry valid. Semua ${stats.total} tool lolos cek.`);
process.exit(0);
