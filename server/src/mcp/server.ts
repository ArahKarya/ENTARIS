// Pembangun MCP Server (SDK resmi, low-level `Server` agar JSON Schema registry dipakai apa adanya).
// Stateless: satu instance per request HTTP; aktor/token ditutup (closure) di handler.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { handleToolCall, type CallContext } from './callTool';
import { metaToolDefs } from './meta';
import { toMcpTool } from './schema';
import { allowedToolsFor } from './toolAccess';
import type { ActorContext } from './context';

export const MCP_SERVER_VERSION = '1.0.0';

const INSTRUCTIONS = [
  'Entaris ERP (AIRA). Anda bertindak atas nama satu user Entaris; izin efektif = RBAC user tersebut ∩ level akses AIRA-nya.',
  'Mulai dengan whoami. Bila belum tahu nama tool, pakai cari_tool lalu dokumen_tool.',
  'Tool baca dijalankan langsung. Tool tulis yang hanya membuat draft dijalankan langsung; tulis lain dan semua tool kritis TIDAK dijalankan — hasilnya status "pending_approval" dan harus disetujui manusia di Entaris. Sampaikan hal itu apa adanya kepada pengguna.',
  'Jangan mengarang angka: semua data berasal dari hasil tool. Untuk tool tulis, sertakan idempotencyKey unik per niat agar pengulangan tidak menggandakan transaksi.',
].join(' ');

export function isCompactMode(headers: Record<string, string | string[] | undefined>, query: Record<string, unknown>): boolean {
  const h = headers['x-entaris-tools'];
  const hv = Array.isArray(h) ? h[0] : h;
  return hv?.toLowerCase() === 'compact' || query.mode === 'compact';
}

export interface ServerInput {
  ctx: CallContext;
  compact: boolean;
}

export async function listToolsFor(actor: ActorContext, compact: boolean): Promise<Tool[]> {
  const meta = metaToolDefs(compact) as unknown as Tool[];
  if (compact) return meta;
  const allowed = await allowedToolsFor({ role: actor.role, airaTier: actor.airaTier, groupFloor: actor.groupFloor });
  const domain = allowed.map((a) => toMcpTool(a.tool, a.decision) as unknown as Tool);
  return [...meta, ...domain];
}

/** Server untuk request yang BERAKTOR (tools/list, tools/call). */
export function buildActorServer({ ctx, compact }: ServerInput): Server {
  const server = new Server({ name: 'entaris', version: MCP_SERVER_VERSION }, { capabilities: { tools: {} }, instructions: INSTRUCTIONS });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: await listToolsFor(ctx.actor, compact) }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => handleToolCall(ctx, req.params.name, req.params.arguments));
  return server;
}

/** Server untuk method protokol tanpa aktor (initialize, ping). tools/* ditolak router (aktor wajib). */
export function buildAnonymousServer(compact = false): Server {
  const server = new Server({ name: 'entaris', version: MCP_SERVER_VERSION }, { capabilities: { tools: {} }, instructions: INSTRUCTIONS });
  // Mode ringkas tanpa aktor: hanya definisi meta-tool statis (tanpa data & tanpa tool domain).
  if (compact) server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: metaToolDefs(true) as unknown as Tool[] }));
  return server;
}
