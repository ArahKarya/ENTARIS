// Eksekusi satu tool = memanggil handler Express ASLI lewat loopback HTTP dengan JWT
// berumur pendek atas nama aktor. Dengan begitu RBAC, validasi Zod, needsApproval, auditTrail
// dan semua gate bisnis berjalan persis seperti user memakai UI — tanpa jalur khusus.

import { generateShortLivedToken } from '../utils/auth';
import type { ToolDef } from '../ai/types';
import { HANDLER_TIMEOUT_MS, INTERNAL_JWT_TTL_SEC } from './constants';

export class ArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgsError';
  }
}

export interface BuiltRequest {
  method: string;
  path: string;
  query: string;
  body?: Record<string, unknown>;
}

const SAFE_PATH_VALUE = /^[^\s/\\?#%]+$/;

function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) < 0x20) return true;
  return false;
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

/** Argumen wajib (menurut params registry) yang belum diisi. */
export function missingRequired(tool: ToolDef, args: Record<string, unknown>): string[] {
  return (tool.params ?? []).filter((p) => p.required && isEmpty(args[p.name])).map((p) => p.name);
}

/**
 * Validasi ringan (fail-fast, SEBELUM antrian approval): enum + tipe dasar sesuai params registry.
 * Longgar untuk angka/boolean berbentuk teks. Validasi Zod handler tetap otoritatif.
 */
export function validateArgs(tool: ToolDef, args: Record<string, unknown>): string[] {
  const issues: string[] = [];
  for (const p of tool.params ?? []) {
    const v = args[p.name];
    if (isEmpty(v)) continue;
    if (p.enum?.length) {
      if (!p.enum.includes(String(v))) issues.push(`${p.name} harus salah satu dari: ${p.enum.join(' / ')}`);
      continue;
    }
    if (p.type === 'number' && !(typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))))) issues.push(`${p.name} harus berupa angka`);
    else if (p.type === 'boolean' && !(typeof v === 'boolean' || v === 'true' || v === 'false')) issues.push(`${p.name} harus true/false`);
    else if (p.type.startsWith('array') && !Array.isArray(v)) issues.push(`${p.name} harus berupa daftar (array)`);
    else if (p.type === 'object' && !(typeof v === 'object' && !Array.isArray(v))) issues.push(`${p.name} harus berupa objek`);
    else if (['string', 'date', 'uuid', 'email'].includes(p.type) && typeof v !== 'string' && typeof v !== 'number') issues.push(`${p.name} harus berupa teks`);
  }
  return issues;
}

/**
 * Susun request HTTP dari tool + args:
 *  - `:param` di path disubstitusi dari args (wajib; bukan '.'/'..' agar tak keluar rute)
 *  - sisanya → query (GET/DELETE atau param ber-`in: query`) atau body JSON
 */
export function buildRequest(tool: ToolDef, args: Record<string, unknown>): BuiltRequest {
  const [method, rawPath] = tool.handler.split(' ');
  const inByName = new Map((tool.params ?? []).map((p) => [p.name, p.in]));
  const usedInPath = new Set<string>();
  const missing: string[] = [];

  const path = rawPath.replace(/:([A-Za-z0-9_]+)/g, (_m, key: string) => {
    const v = args[key];
    if (isEmpty(v)) {
      missing.push(key);
      return '';
    }
    if (typeof v !== 'string' && typeof v !== 'number') throw new ArgsError(`Argumen path '${key}' harus berupa teks atau angka.`);
    const s = String(v);
    if (!SAFE_PATH_VALUE.test(s) || /^\.+$/.test(s) || hasControlChar(s)) throw new ArgsError(`Argumen path '${key}' mengandung karakter yang tidak diizinkan.`);
    usedInPath.add(key);
    return encodeURIComponent(s);
  });
  if (missing.length) throw new ArgsError(`Argumen wajib belum diisi: ${missing.join(', ')}.`);

  const readsInQuery = method === 'GET' || method === 'DELETE';
  const qs = new URLSearchParams();
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (usedInPath.has(k) || isEmpty(v)) continue;
    const where = inByName.get(k) ?? (readsInQuery ? 'query' : 'body');
    if (where === 'path') continue; // param path yang tak muncul di handler: abaikan
    if (where === 'query') {
      if (Array.isArray(v)) for (const item of v) qs.append(k, typeof item === 'object' ? JSON.stringify(item) : String(item));
      else qs.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    } else {
      body[k] = v;
    }
  }
  const hasBody = !readsInQuery || Object.keys(body).length > 0;
  return { method, path, query: qs.toString(), ...(hasBody ? { body } : {}) };
}

export interface HandlerCallInput {
  tool: ToolDef;
  args: Record<string, unknown>;
  actor: { id: string; role: string };
  tokenName: string;
  channel?: string | null;
  approvalId?: string;
  clientIp?: string;
  /** Referensi opak chat/sesi (actor assertion `ref`). */
  ref?: string;
}

export type HandlerBody = { kind: 'json'; data: unknown } | { kind: 'text'; data: string } | { kind: 'binary'; contentType: string; bytes: number } | { kind: 'empty' };

export interface HandlerResult {
  status: number;
  ok: boolean;
  body: HandlerBody;
}

export async function callHandler(input: HandlerCallInput): Promise<HandlerResult> {
  const req = buildRequest(input.tool, input.args);
  const jwt = generateShortLivedToken(
    {
      userId: input.actor.id,
      role: input.actor.role,
      via: 'mcp',
      mcpToken: input.tokenName,
      mcpChannel: input.channel ?? undefined,
      mcpTool: input.tool.name,
      mcpApprovalId: input.approvalId,
      ...(input.ref ? { mcpRef: input.ref.slice(0, 200) } : {}),
    },
    INTERNAL_JWT_TTL_SEC,
  );
  const port = process.env.PORT || 3001;
  const url = `http://127.0.0.1:${port}${req.path}${req.query ? `?${req.query}` : ''}`;
  const res = await fetch(url, {
    method: req.method,
    redirect: 'manual',
    signal: AbortSignal.timeout(HANDLER_TIMEOUT_MS),
    headers: {
      authorization: `Bearer ${jwt}`,
      accept: 'application/json',
      'user-agent': `entaris-mcp/1 (${input.tokenName})`,
      ...(req.body ? { 'content-type': 'application/json' } : {}),
      // express `trust proxy: 1` → req.ip = IP klien MCP asli (audit + rate limit per klien, bukan 127.0.0.1)
      ...(input.clientIp ? { 'x-forwarded-for': input.clientIp } : {}),
    },
    body: req.body ? JSON.stringify(req.body) : undefined,
  });
  const ct = res.headers.get('content-type') ?? '';
  let body: HandlerBody;
  if (res.status === 204) body = { kind: 'empty' };
  else if (ct.includes('json')) body = { kind: 'json', data: await res.json().catch(() => null) };
  else if (ct.startsWith('text/')) body = { kind: 'text', data: await res.text() };
  else body = { kind: 'binary', contentType: ct || 'application/octet-stream', bytes: (await res.arrayBuffer()).byteLength };
  return { status: res.status, ok: res.ok, body };
}
