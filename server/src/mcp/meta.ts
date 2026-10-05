// Meta tool MCP: cari_tool, dokumen_tool, whoami (+ panggil_tool untuk mode ringkas).
// Hanya membaca registry/katalog — tidak menyentuh data bisnis.

import { TOOLSETS } from '../ai/types';
import { summarizeToolsets, tierMeaning } from '../ai/identityBlock';
import { effectiveUserTier } from './policy';
import { docForTool, docForToolset } from './catalogDocs';
import type { AllowedTool } from './toolAccess';
import type { ActorContext } from './context';
import type { McpToolDef } from './schema';

export const META_TOOL_NAMES = ['cari_tool', 'dokumen_tool', 'whoami', 'panggil_tool'] as const;
export type MetaToolName = (typeof META_TOOL_NAMES)[number];
export const isMetaTool = (n: string): n is MetaToolName => (META_TOOL_NAMES as readonly string[]).includes(n);

const ro = (title: string) => ({ title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });

export function metaToolDefs(compact: boolean): McpToolDef[] {
  const defs: McpToolDef[] = [
    {
      name: 'cari_tool',
      description: 'Cari tool Entaris yang boleh Anda pakai berdasarkan kata kunci / toolset / risk. Mulai dari sini bila belum tahu nama tool-nya. Hasil menyertakan tier (langsung / persetujuan) dan argumen wajib.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Kata kunci (nama, deskripsi, modul), mis. "invoice penjualan".' },
          toolset: { type: 'string', enum: [...TOOLSETS], description: 'Batasi ke satu toolset.' },
          risk: { type: 'string', enum: ['read', 'write', 'critical'], description: 'Batasi ke tingkat risiko.' },
          limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Maksimal hasil (default 20).' },
        },
      },
      annotations: ro('Cari tool'),
    },
    {
      name: 'dokumen_tool',
      description: 'Ambil dokumentasi (markdown) satu tool (parameter, contoh, efek pembukuan) atau satu toolset (alur bisnis). Baca sebelum memakai tool write/critical yang belum dikenal.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nama tool, mis. so_submit.' },
          toolset: { type: 'string', enum: [...TOOLSETS], description: 'ID toolset (alur bisnis + daftar tool).' },
        },
      },
      annotations: ro('Dokumentasi tool'),
    },
    {
      name: 'whoami',
      description: 'Siapa Anda bertindak sebagai: user Entaris, jabatan AIRA, level akses (read/standard/direct), channel, dan toolset yang boleh dipakai. Hasil menyertakan identity_prompt (blok identitas siap pakai). Panggil di awal percakapan untuk menyesuaikan persona dan batasan.',
      inputSchema: { type: 'object', properties: {} },
      annotations: ro('Identitas aktor'),
    },
  ];
  if (compact) {
    defs.push({
      name: 'panggil_tool',
      description: 'Panggil tool Entaris berdasarkan nama (mode ringkas). Cari dulu dengan cari_tool, baca dokumen_tool, lalu panggil di sini dengan {tool, args}. Aturan tier/persetujuan sama persis dengan memanggil tool langsung.',
      inputSchema: {
        type: 'object',
        properties: {
          tool: { type: 'string', description: 'Nama tool dari cari_tool.' },
          args: { type: 'object', additionalProperties: true, description: 'Argumen tool.' },
        },
        required: ['tool'],
      },
      annotations: { title: 'Panggil tool', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    });
  }
  return defs;
}

export interface MetaResult {
  structured: Record<string, unknown>;
  isError: boolean;
}

const short = (s: string, n = 200) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function cariTool(allowed: AllowedTool[], args: Record<string, unknown>): MetaResult {
  const q = typeof args.query === 'string' ? args.query.toLowerCase().trim() : '';
  const toolset = typeof args.toolset === 'string' ? args.toolset : undefined;
  const risk = typeof args.risk === 'string' ? args.risk : undefined;
  const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
  const words = q.split(/\s+/).filter(Boolean);

  const scored = allowed
    .filter((a) => (!toolset || a.tool.toolset === toolset) && (!risk || a.tool.risk === risk))
    .map((a) => {
      const name = a.tool.name.toLowerCase();
      const hay = `${a.tool.desc} ${a.tool.module} ${a.tool.toolset ?? ''} ${a.tool.group}`.toLowerCase();
      const score = words.length === 0 ? 1 : words.reduce((s, w) => s + (name.includes(w) ? 3 : 0) + (hay.includes(w) ? 1 : 0), 0);
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || x.a.tool.name.localeCompare(y.a.tool.name));

  return {
    isError: false,
    structured: {
      total: scored.length,
      shown: Math.min(limit, scored.length),
      tools: scored.slice(0, limit).map(({ a }) => ({
        name: a.tool.name,
        toolset: a.tool.toolset,
        risk: a.tool.risk,
        tier: a.decision === 'queue' ? 'persetujuan' : 'langsung',
        desc: short(a.tool.desc),
        wajib: (a.tool.params ?? []).filter((p) => p.required).map((p) => p.name),
      })),
      ...(scored.length > limit ? { hint: `Ada ${scored.length - limit} hasil lagi; persempit query/toolset/risk.` } : {}),
    },
  };
}

export function dokumenTool(args: Record<string, unknown>, allowedNames: Set<string>): MetaResult {
  const name = typeof args.name === 'string' ? args.name : undefined;
  const toolset = typeof args.toolset === 'string' ? args.toolset : undefined;
  if (!name && !toolset) return { isError: true, structured: { ok: false, error: 'Isi salah satu: name (tool) atau toolset.' } };
  if (name) {
    const doc = docForTool(name);
    if (!doc) return { isError: true, structured: { ok: false, error: `Tool '${name}' tidak ditemukan. Gunakan cari_tool.` } };
    return { isError: false, structured: { name, boleh_dipakai: allowedNames.has(name), markdown: doc } };
  }
  const doc = docForToolset(toolset as string);
  if (!doc) return { isError: true, structured: { ok: false, error: `Toolset '${toolset}' tidak dikenal. Pilihan: ${TOOLSETS.join(', ')}.` } };
  return { isError: false, structured: { toolset, markdown: doc } };
}

export function whoami(actor: ActorContext, tokenName: string, allowed: AllowedTool[], identityPrompt?: string): MetaResult {
  const effective = effectiveUserTier(actor.airaTier, actor.groupFloor);
  return {
    isError: false,
    structured: {
      actor: { id: actor.id, nama: actor.fullName, email: actor.email, role: actor.role, jabatan: actor.airaJabatan },
      aira: {
        level: actor.airaTier,
        level_efektif: effective,
        lantai_grup: actor.groupFloor,
        arti: tierMeaning(effective),
      },
      channel: actor.channel,
      ref: actor.ref ?? null,
      token: tokenName,
      identitas_dari: actor.viaAssertion ? 'actor_assertion' : 'aktor_default_token',
      toolset: summarizeToolsets(allowed),
      total_tool: allowed.length,
      ...(identityPrompt ? { identity_prompt: identityPrompt } : {}),
    },
  };
}
