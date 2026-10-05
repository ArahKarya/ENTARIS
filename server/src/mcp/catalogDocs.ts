// Dokumentasi tool untuk `dokumen_tool`: dari docs/ai-tools/catalog.json (hasil generate) bila
// tersedia di deployment; bila tidak (image Docker tanpa docs/), dirakit dari registry.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../lib/logger';
import { getTool, listTools } from '../ai/registry';
import type { ToolDef, ToolParam } from '../ai/types';

interface CatalogFile {
  tools: Array<{ name: string; doc?: string }>;
  toolsets: Array<{ id: string; title: string; purpose?: string; guide?: string }>;
}

let cached: { docs: Map<string, string>; toolsets: Map<string, string> } | null | undefined;

const CANDIDATES = [
  join(__dirname, '../../../docs/ai-tools/catalog.json'), // src/mcp atau dist/mcp → <repo>/docs
  join(__dirname, '../../docs/ai-tools/catalog.json'),
  join(__dirname, '../ai/catalog.json'),
];

function load(): { docs: Map<string, string>; toolsets: Map<string, string> } | null {
  if (cached !== undefined) return cached;
  cached = null;
  const file = (process.env.AI_CATALOG_PATH ? [process.env.AI_CATALOG_PATH] : CANDIDATES).find((p) => existsSync(p));
  if (!file) return cached;
  try {
    const c = JSON.parse(readFileSync(file, 'utf8')) as CatalogFile;
    cached = {
      docs: new Map(c.tools.filter((t) => t.doc).map((t) => [t.name, t.doc as string])),
      toolsets: new Map(c.toolsets.map((s) => [s.id, `# ${s.title}\n\n${s.purpose ?? ''}\n\n${s.guide ?? ''}`.trim()])),
    };
  } catch (err) {
    logger.warn({ err, file }, 'MCP: catalog.json tidak terbaca; dokumen_tool memakai registry');
  }
  return cached;
}

function paramRows(params: ToolParam[], prefix = ''): string[] {
  return params.flatMap((p) => [
    `| \`${prefix}${p.name}\` | ${p.in} | \`${p.type}\` | ${p.required ? 'ya' : 'tidak'} | ${(p.description ?? '').replace(/\|/g, '/')}${p.enum ? ` (${p.enum.join(' / ')})` : ''} |`,
    ...(p.fields ? paramRows(p.fields, `${prefix}${p.name}.`) : []),
  ]);
}

/** Dokumen markdown tool dibangun dari registry (fallback). */
export function docFromRegistry(t: ToolDef): string {
  const lines = [
    `### ${t.name}`,
    '',
    `**Ringkasan:** ${t.desc}`,
    '',
    `- **Risk:** \`${t.risk}\`${t.draftCapable ? ' (draft-capable)' : ''}`,
    `- **Handler:** \`${t.handler}\``,
    `- **Izin:** modul \`${t.module}\` / ${t.permAction}${t.requiresCapability ? `, capability \`${t.requiresCapability}\`` : ''}`,
  ];
  if (t.postingEffect) lines.push(`- **Efek:** ${t.postingEffect}`);
  if (t.confirm_template) lines.push(`- **Konfirmasi:** ${t.confirm_template}`);
  if (t.accessNote) lines.push(`- **Catatan akses:** ${t.accessNote}`);
  if (t.params?.length) lines.push('', '| Nama | Lokasi | Tipe | Wajib | Keterangan |', '|---|---|---|---|---|', ...paramRows(t.params));
  if (t.outputSummary) lines.push('', `**Hasil:** ${t.outputSummary}`);
  if (t.related?.length) lines.push('', `**Terkait:** ${t.related.join(', ')}`);
  return lines.join('\n');
}

export function docForTool(name: string): string | null {
  const t = getTool(name);
  if (!t) return null;
  return load()?.docs.get(name) ?? docFromRegistry(t);
}

export function docForToolset(id: string): string | null {
  const fromCatalog = load()?.toolsets.get(id);
  if (fromCatalog) return fromCatalog;
  const tools = listTools().filter((t) => t.toolset === id);
  if (tools.length === 0) return null;
  return [`# Toolset ${id}`, '', ...tools.map((t) => `- \`${t.name}\` (${t.risk}) — ${t.desc}`)].join('\n');
}

export function resetCatalogCache(): void {
  cached = undefined;
}
