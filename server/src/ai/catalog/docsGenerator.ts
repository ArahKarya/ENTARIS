// Generator dokumentasi katalog tool (deterministik, idempoten, tanpa timestamp).
// Input: registry JSON + inventori route + panduan tulisan tangan (docs/ai-tools/_guides) + denylist.
// Output: map path-relatif -> isi file (INDEX.md, <toolset>.md, DENYLIST.md, README.md, catalog.json).

import fs from 'node:fs';
import path from 'node:path';
import { buildRouteInventory, normalizeHandlerPath, serverRoot, type RouteRecord } from './inventoryRoutes';
import { DENY_RULES, type DenyRule } from './denylist';
import { riskToTier } from '../registry';
import { TOOLSETS, type ToolDef, type ToolParam, type ToolRegistry, type Toolset } from '../types';

export interface GeneratorInput {
  registry: ToolRegistry;
  inventory: RouteRecord[];
  guides: Record<string, string>;
  denyRules: DenyRule[];
}

export const TOOLSET_META: Record<Toolset, { title: string; blurb: string }> = {
  penjualan: { title: 'Penjualan', blurb: 'Penawaran, Sales Order, Surat Jalan, Invoice Penjualan, Retur, Uang Muka Pelanggan.' },
  pembelian: { title: 'Pembelian', blurb: 'PO, Penerimaan Barang (STT/BPB), Invoice Pembelian, Uang Muka Vendor.' },
  persediaan: { title: 'Persediaan', blurb: 'Barang, gudang, mutasi stok, transfer, stok opname.' },
  produksi: { title: 'Produksi', blurb: 'Draft & posting produksi, standar biaya, proses, mesin.' },
  akuntansi: { title: 'Akuntansi', blurb: 'COA, jurnal, tahun buku, pajak, akun sistem, aset tetap.' },
  'kas-bank': { title: 'Kas & Bank', blurb: 'Pembayaran/penerimaan, rekonsiliasi bank, transaksi berulang, uang jaminan proyek.' },
  'aset-umum': { title: 'Aset & Umum (EAM)', blurb: 'Aset, kendaraan, gedung, equipment, maintenance, dokumen legal, inventaris umum, MR.' },
  'pengajuan-pembayaran': { title: 'Pengajuan Pembayaran', blurb: 'Pengajuan pembayaran, verifikasi, pembayaran, pertanggungjawaban, antrian Tagihan EAM.' },
  persetujuan: { title: 'Persetujuan', blurb: 'Antrian approval, keputusan setuju/tolak/revisi, aturan approval.' },
  laporan: { title: 'Laporan', blurb: 'Laporan keuangan, operasional dan pembelian.' },
  dashboard: { title: 'Dashboard', blurb: 'Ringkasan dan indikator dashboard.' },
  'master-data': { title: 'Master Data', blurb: 'Pelanggan & vendor (Party).' },
  sistem: { title: 'Sistem', blurb: 'Jejak audit, notifikasi, pencarian, profil perusahaan, kesehatan sistem.' },
};

const GUIDES_DIR = 'docs/ai-tools/_guides';
const OUT_DIR = 'docs/ai-tools';

export function repoRoot(): string {
  return path.resolve(serverRoot(), '..');
}

export function loadGeneratorInput(): GeneratorInput {
  const reg = JSON.parse(fs.readFileSync(path.join(serverRoot(), 'src/ai/aira-tool-router.json'), 'utf8')) as ToolRegistry;
  const gdir = path.join(repoRoot(), GUIDES_DIR);
  const guides: Record<string, string> = {};
  if (fs.existsSync(gdir)) for (const f of fs.readdirSync(gdir).sort()) if (f.endsWith('.md')) guides[f] = fs.readFileSync(path.join(gdir, f), 'utf8');
  return { registry: reg, inventory: buildRouteInventory(), guides, denyRules: DENY_RULES };
}

// ─── Contoh nilai ────────────────────────────────────────────────────────────
function sample(p: ToolParam): unknown {
  if (p.enum?.length) return p.enum[0];
  if (p.type.startsWith('array<object')) {
    const row: Record<string, unknown> = {};
    for (const f of (p.fields ?? []).filter((x) => x.required).slice(0, 6)) row[f.name] = sample(f);
    return [row];
  }
  if (p.type.startsWith('array')) return [];
  switch (p.type) {
    case 'number': return 1;
    case 'boolean': return true;
    case 'date': return '2026-01-31';
    case 'uuid': return '00000000-0000-0000-0000-000000000000';
    case 'email': return 'nama@contoh.id';
    case 'object': return {};
    default: return p.name === 'id' || p.name.endsWith('Id') ? '<id>' : `<${p.name}>`;
  }
}

export function exampleArgs(t: ToolDef): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const p of t.params ?? []) if (p.required) args[p.name] = sample(p);
  if (!Object.keys(args).length) for (const p of (t.params ?? []).slice(0, 2)) args[p.name] = sample(p);
  return args;
}

function renderConfirm(tpl: string | undefined, args: Record<string, unknown>): string {
  return (tpl ?? '').replace(/\{(\w+)\}/g, (_m, k: string) => (args[k] === undefined ? `{${k}}` : typeof args[k] === 'object' ? '[...]' : String(args[k])));
}

function exampleResult(t: ToolDef, args: Record<string, unknown>): string {
  if (t.risk === 'read') {
    return JSON.stringify({ ok: true, kind: 'read', data: t.outputSummary ? `<${t.outputSummary.replace(/\s+/g, ' ').slice(0, 90)}>` : '<hasil>' }, null, 2);
  }
  return JSON.stringify({ ok: true, kind: 'action', status: 'pending_approval', approvalId: '<id>', confirm: renderConfirm(t.confirm_template, args) }, null, 2);
}

// ─── Render ──────────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function paramRows(params: ToolParam[], prefix = ''): string[] {
  const rows: string[] = [];
  for (const p of params) {
    const type = p.enum ? `enum: ${p.enum.map((e) => `\`${e}\``).join(', ')}` : `\`${p.type}\``;
    rows.push(`| \`${prefix}${p.name}\` | ${p.in} | ${type} | ${p.required ? 'ya' : 'tidak'} | ${esc(p.description ?? '')} |`);
    if (p.fields?.length) rows.push(...paramRows(p.fields, `${prefix}${p.name}${p.type.startsWith('array') ? '[]' : ''}.`));
  }
  return rows;
}

function relatedLink(name: string, from: Toolset | undefined, byName: Map<string, ToolDef>): string {
  const t = byName.get(name);
  if (!t) return `\`${name}\``;
  return t.toolset === from ? `[\`${name}\`](#${name})` : `[\`${name}\`](${t.toolset}.md#${name})`;
}

function roleLine(t: ToolDef): string {
  const cap = t.requiresCapability ? `, capability \`${t.requiresCapability}\`` : '';
  return `${t.roles.join(', ')} (modul \`${t.module}\` / \`${t.permAction}\`${cap})`;
}

function renderTool(t: ToolDef, fileOf: Map<string, string>, byName: Map<string, ToolDef>): string {
  const args = exampleArgs(t);
  const L: string[] = [];
  L.push(`### ${t.name}`, '');
  L.push(`**Ringkasan:** ${t.desc}`, '');
  const tier = { auto: 'Auto', draft: 'Draft/Approve', must_approve: 'Wajib-Approve' }[riskToTier(t.risk)];
  L.push(`- **Risk / tier:** \`${t.risk}\` / ${tier}${t.safeNonGet ? ' (POST murni baca)' : ''}`);
  if (t.risk !== 'read') L.push(`- **Draft-capable:** ${t.draftCapable ? 'ya (hanya membuat draft / pengajuan pending)' : 'tidak (efek langsung)'}`);
  L.push(`- **Roles & izin:** ${roleLine(t)}`);
  if (t.accessNote) L.push(`- **Catatan akses:** ${t.accessNote}`);
  L.push(`- **Handler:** \`${t.handler}\`${fileOf.get(t.handler) ? ` (${fileOf.get(t.handler)})` : ''}`);
  L.push(`- **Status default:** ${t.enabled ? 'aktif' : 'nonaktif (diaktifkan owner)'}`, '');
  if (t.params?.length) {
    L.push('**Parameter**', '', '| Nama | Lokasi | Tipe | Wajib | Keterangan |', '|---|---|---|---|---|', ...paramRows(t.params), '');
  } else L.push('**Parameter:** tidak ada.', '');
  L.push('**Contoh pemanggilan**', '', '```json', JSON.stringify({ tool: t.name, args }, null, 2), '```', '');
  L.push('**Contoh hasil (dipersingkat)**', '', '```json', exampleResult(t, args), '```', '');
  if (t.outputSummary) L.push(`**Isi hasil:** ${t.outputSummary}`, '');
  if (t.risk !== 'read') {
    L.push(`**Efek pembukuan/stok:** ${t.postingEffect ?? '-'}`, '');
    L.push(`**Teks konfirmasi:** ${t.confirm_template ?? '-'}`, '');
  }
  if (t.prerequisites?.length) L.push('**Prasyarat**', '', ...t.prerequisites.map((x) => `- ${x}`), '');
  if (t.errors?.length) L.push('**Error umum**', '', ...t.errors.map((x) => `- ${x}`), '');
  if (t.related?.length) L.push(`**Tool terkait:** ${t.related.map((n) => relatedLink(n, t.toolset, byName)).join(', ')}`, '');
  return L.join('\n');
}

function splitGuide(guides: Record<string, string>, toolset: string): { purpose: string; flow: string } {
  const files = Object.keys(guides).filter((f) => f === `${toolset}.md` || f.startsWith(`${toolset}.part`)).sort();
  const main = guides[`${toolset}.md`] ?? '';
  const idx = main.search(/^### /m);
  const purpose = (idx === -1 ? main : main.slice(0, idx)).trim();
  const rest = idx === -1 ? '' : main.slice(idx).trim();
  const parts = files.filter((f) => f !== `${toolset}.md`).map((f) => guides[f].trim());
  return { purpose, flow: [rest, ...parts].filter(Boolean).join('\n\n') };
}

const countBy = <T>(xs: T[], f: (x: T) => string) => xs.reduce<Record<string, number>>((m, x) => ({ ...m, [f(x)]: (m[f(x)] ?? 0) + 1 }), {});

export function generateDocs(input: GeneratorInput): Record<string, string> {
  const { registry, inventory, guides, denyRules } = input;
  const tools = [...registry.tools].sort((a, b) => a.name.localeCompare(b.name));
  const byName = new Map(tools.map((t) => [t.name, t]));
  const fileOf = new Map(inventory.map((r) => [`${r.method} ${r.path}`, r.file]));
  const out: Record<string, string> = {};

  // per-toolset
  for (const ts of TOOLSETS) {
    const list = tools.filter((t) => t.toolset === ts);
    const meta = TOOLSET_META[ts];
    const g = splitGuide(guides, ts);
    const rc = countBy(list, (t) => t.risk);
    const L = [
      `# Toolset: ${meta.title} (\`${ts}\`)`,
      '',
      '> Dibangkitkan otomatis dari `server/src/ai/aira-tool-router.json` — jangan edit manual. Panduan alur: `docs/ai-tools/_guides/`.',
      '',
      `Endpoint MCP target: \`/mcp/${ts}\` · ${list.length} tool (read ${rc.read ?? 0}, write ${rc.write ?? 0}, critical ${rc.critical ?? 0})`,
      '',
      '## Tujuan',
      '',
      g.purpose || meta.blurb,
      '',
      '## ALUR BISNIS',
      '',
      g.flow || '_Panduan belum ditulis._',
      '',
      '## Daftar tool',
      '',
      '| Tool | Risk | Draft | Handler |',
      '|---|---|---|---|',
      ...list.map((t) => `| [\`${t.name}\`](#${t.name}) | ${t.risk} | ${t.risk === 'read' ? '-' : t.draftCapable ? 'ya' : 'tidak'} | \`${t.handler}\` |`),
      '',
      '## Rincian tool',
      '',
      ...list.map((t) => renderTool(t, fileOf, byName)),
    ];
    out[`${ts}.md`] = `${L.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
  }

  // INDEX
  const rt = countBy(tools, (t) => t.risk);
  const I = [
    '# Indeks Katalog Tool AIRA/MCP',
    '',
    '> Dibangkitkan otomatis — jangan edit manual (`npm run ai-tools:docs`).',
    '',
    `Total **${tools.length}** tool (read ${rt.read ?? 0} · write ${rt.write ?? 0} · critical ${rt.critical ?? 0}); semuanya nonaktif secara default. Endpoint terlarang: [DENYLIST.md](DENYLIST.md). Istilah: [GLOSARIUM.md](GLOSARIUM.md).`,
    '',
    '## Toolset',
    '',
    '| Toolset | Tool | read | write | critical | Ringkas |',
    '|---|---|---|---|---|---|',
    ...TOOLSETS.map((ts) => {
      const l = tools.filter((t) => t.toolset === ts);
      const c = countBy(l, (t) => t.risk);
      return `| [${TOOLSET_META[ts].title}](${ts}.md) | ${l.length} | ${c.read ?? 0} | ${c.write ?? 0} | ${c.critical ?? 0} | ${TOOLSET_META[ts].blurb} |`;
    }),
    '',
    '## Semua tool',
    '',
    '| Tool | Toolset | Risk | Draft | Roles | Handler |',
    '|---|---|---|---|---|---|',
    ...tools.map((t) => `| [\`${t.name}\`](${t.toolset}.md#${t.name}) | ${t.toolset} | ${t.risk} | ${t.risk === 'read' ? '-' : t.draftCapable ? 'ya' : 'tidak'} | ${t.roles.join(', ')} | \`${t.handler}\` |`),
  ];
  out['INDEX.md'] = `${I.join('\n')}\n`;

  // DENYLIST
  const D = [
    '# Denylist — Endpoint yang TIDAK BOLEH menjadi Tool',
    '',
    '> Dibangkitkan dari `server/src/ai/catalog/denylist.ts`. Menambah/menghapus entri = keputusan owner.',
    '',
    'Route non-denylist **wajib** punya tool di registry (drift guard). Route di bawah ini sengaja tidak tersedia bagi agen.',
    '',
    '| Aturan | Kategori | Cakupan | Alasan |',
    '|---|---|---|---|',
    ...denyRules.map((r) => {
      const cover = [r.pathPrefix ? `\`${r.pathPrefix}*\`` : '', ...(r.exact ?? []).map((e) => `\`${e}\``), r.pathRegex ? `regex \`${r.pathRegex}\`` : ''].filter(Boolean).join('<br>');
      return `| \`${r.id}\` | ${r.category} | ${cover} | ${esc(r.reason)} |`;
    }),
  ];
  out['DENYLIST.md'] = `${D.join('\n')}\n`;

  // README
  const readme = guides['_README.md'] ?? '# Katalog Tool AIRA/MCP\n';
  out['README.md'] = `${readme.replace('{{COUNTS}}', `**${tools.length}** tool dalam **${TOOLSETS.length}** toolset (read ${rt.read ?? 0}, write ${rt.write ?? 0}, critical ${rt.critical ?? 0}); ${inventory.length} route API terinventaris.`).trimEnd()}\n`;

  // catalog.json
  const catalog = {
    app: registry.app,
    version: registry.version,
    counts: { tools: tools.length, byRisk: rt, byToolset: countBy(tools, (t) => String(t.toolset)), routes: inventory.length },
    toolsets: TOOLSETS.map((ts) => {
      const g = splitGuide(guides, ts);
      return { id: ts, title: TOOLSET_META[ts].title, purpose: g.purpose || TOOLSET_META[ts].blurb, guide: g.flow, tools: tools.filter((t) => t.toolset === ts).map((t) => t.name) };
    }),
    tools: tools.map((t) => ({ ...t, doc: renderTool(t, fileOf, byName), example: { tool: t.name, args: exampleArgs(t) } })),
    denylist: denyRules,
  };
  out['catalog.json'] = `${JSON.stringify(catalog, null, 2)}\n`;
  return out;
}

/** Tulis ke docs/ai-tools; kembalikan daftar file yang berubah. */
export function writeDocs(files: Record<string, string>): string[] {
  const dir = path.join(repoRoot(), OUT_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const changed: string[] = [];
  for (const [name, content] of Object.entries(files)) {
    const p = path.join(dir, name);
    if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== content) {
      fs.writeFileSync(p, content);
      changed.push(name);
    }
  }
  return changed;
}

/** File di docs/ai-tools yang berbeda dari hasil generate (untuk drift guard). */
export function diffDocs(files: Record<string, string>): string[] {
  const dir = path.join(repoRoot(), OUT_DIR);
  return Object.entries(files)
    .filter(([name, content]) => !fs.existsSync(path.join(dir, name)) || fs.readFileSync(path.join(dir, name), 'utf8') !== content)
    .map(([name]) => name);
}

export { normalizeHandlerPath };
