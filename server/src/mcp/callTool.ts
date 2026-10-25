// Orkestrasi satu tools/call: meta tool → atau tool domain (kebijakan tier → RBAC → idempotensi →
// eksekusi langsung / antrian approval) → catat riwayat. Selalu mengembalikan CallToolResult
// (kegagalan = isError dengan teks Indonesia), tidak pernah melempar ke transport.

import type { McpToken, Prisma } from '@prisma/client';
import { logger } from '../lib/logger';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { emitCall } from './callBus';
import { buildCard, type CardHint } from './cards';
import { buildIdentityBlock, type IdentityChannel } from '../ai/identityBlock';
import { claimIdempotency, finishClaimed, hashArgs, recordCall, releaseClaim, type CallDecision } from './callLog';
import type { ActorContext } from './context';
import { callHandler, ArgsError, missingRequired, validateArgs } from './execute';
import { findBadIds, formatBadIds } from './idShape';
import { findMissingIds, formatMissingIds } from './idExists';
import { cariTool, dokumenTool, isMetaTool, whoami, type MetaResult } from './meta';
import { effectiveUserTier } from './policy';
import { buildPreview } from './preview';
import { queueToolCall } from './queue';
import { formatHandlerResult, type AgentResult } from './resultFormat';
import { allowedToolsFor, decideCall, loadActiveTools, type CallVerdict, type ToolEntry } from './toolAccess';

export interface CallContext {
  token: McpToken;
  actor: ActorContext;
  clientIp?: string;
}

interface Outcome {
  result: AgentResult;
  decision: CallDecision;
  httpStatus?: number;
  approvalId?: string;
  error?: string;
  card?: CardHint;
  /** id baris mcp_call_logs bila sudah dicatat oleh klaim idempotensi. */
  logId?: string;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function errorResult(message: string, extra: Record<string, unknown> = {}): AgentResult {
  return { isError: true, structured: { ok: false, error: message, ...extra }, text: message };
}

function toCallToolResult(r: AgentResult): CallToolResult {
  return { content: [{ type: 'text', text: r.text }], structuredContent: r.structured, isError: r.isError };
}

const fromMeta = (m: MetaResult): AgentResult => ({ isError: m.isError, structured: m.structured, text: JSON.stringify(m.structured) });

export async function handleToolCall(ctx: CallContext, name: string, rawArgs: unknown): Promise<CallToolResult> {
  const started = Date.now();
  let toolName = name;
  let args = isPlainObject(rawArgs) ? rawArgs : {};
  let risk = 'read';
  let out: Outcome;
  let idemKey: string | undefined;
  const ref = ctx.actor.ref;
  if (ref) emitCall({ phase: 'start', ref, tool: name === 'panggil_tool' && typeof args.tool === 'string' ? args.tool : name });

  try {
    // Mode ringkas: panggil_tool membungkus tool domain; riwayat dicatat atas nama tool dalam.
    if (name === 'panggil_tool') {
      const inner = typeof args.tool === 'string' ? args.tool : '';
      if (!inner || isMetaTool(inner)) {
        out = { result: errorResult(inner ? `'${inner}' dipanggil langsung, bukan lewat panggil_tool.` : 'Argumen tool wajib diisi.'), decision: 'denied' };
        toolName = 'panggil_tool';
      } else {
        toolName = inner;
        args = isPlainObject(args.args) ? args.args : {};
        const r = await runDomainTool(ctx, toolName, args);
        out = r.outcome;
        risk = r.risk;
        idemKey = r.idemKey;
      }
    } else if (name === 'pratinjau_tool') {
      // Dicatat atas nama pratinjau_tool (risk read): tidak ada yang dijalankan.
      out = await previewDomainTool(ctx, args);
    } else if (isMetaTool(name)) {
      out = { result: await runMeta(ctx, name, args), decision: 'allowed' };
    } else {
      const r = await runDomainTool(ctx, name, args);
      out = r.outcome;
      risk = r.risk;
      idemKey = r.idemKey;
    }
  } catch (err) {
    logger.error({ err, tool: toolName }, 'MCP: tools/call gagal tak terduga');
    out = { result: errorResult('Terjadi kesalahan internal saat memproses tool. Coba lagi; bila berulang hubungi admin.'), decision: 'error', error: err instanceof Error ? err.message : String(err) };
  }

  // Panggilan ber-idempotencyKey sudah dicatat oleh runDomainTool (klaim) — jangan duplikasi.
  let callId: string | undefined = out.logId;
  if (!idemKey) {
    callId = await recordCall({
      tokenId: ctx.token.id,
      actorUserId: ctx.actor.id,
      channel: ctx.actor.channel,
      tool: toolName,
      risk,
      argsHash: hashArgs(args),
      decision: out.decision,
      httpStatus: out.httpStatus,
      durationMs: Date.now() - started,
      approvalId: out.approvalId,
      error: out.error,
      ref,
      card: out.card as unknown as Prisma.InputJsonValue | undefined,
    });
  }
  if (ref) {
    emitCall({
      phase: 'end', ref, tool: toolName, risk, decision: out.decision, callId,
      durationMs: Date.now() - started, error: out.error ?? null, card: (out.card as unknown as Record<string, unknown>) ?? null,
    });
  }
  return toCallToolResult(out.result);
}

async function runMeta(ctx: CallContext, name: string, args: Record<string, unknown>): Promise<AgentResult> {
  const allowed = await allowedToolsFor({ role: ctx.actor.role, airaTier: ctx.actor.airaTier, groupFloor: ctx.actor.groupFloor });
  if (name === 'cari_tool') return fromMeta(cariTool(allowed, args));
  if (name === 'dokumen_tool') return fromMeta(dokumenTool(args, new Set(allowed.map((a) => a.tool.name))));
  const channel: IdentityChannel = ctx.actor.channel ?? 'cli';
  const identity = await buildIdentityBlock(ctx.actor.id, { channel, groupFloor: ctx.actor.groupFloor }).catch(() => null);
  return fromMeta(whoami(ctx.actor, ctx.token.name, allowed, identity?.text));
}

interface CheckedCall {
  entry: ToolEntry;
  verdict: Exclude<CallVerdict, { decision: 'deny' }>;
  args: Record<string, unknown>;
  idempotencyKey: unknown;
}

/** Tool aktif, tier + RBAC, argumen wajib dan valid: sama untuk panggilan dan pratinjau. */
async function checkDomainCall(
  ctx: CallContext,
  name: string,
  rawArgs: Record<string, unknown>,
): Promise<{ ok: true; call: CheckedCall } | { ok: false; risk: string; outcome: Outcome }> {
  const entry = (await loadActiveTools()).find((e) => e.tool.name === name);
  if (!entry) {
    return {
      ok: false,
      risk: 'read',
      outcome: { result: errorResult(`Tool '${name}' tidak tersedia (tidak terdaftar, dinonaktifkan, atau termasuk denylist). Gunakan cari_tool.`), decision: 'denied', error: 'tool_not_available' },
    };
  }
  const { tool } = entry;
  const verdict = await decideCall(entry, ctx.actor);
  if (verdict.decision === 'deny') {
    const msg = verdict.reason === 'tier'
      ? `Level akses AIRA Anda (${effectiveUserTier(ctx.actor.airaTier, ctx.actor.groupFloor)}) hanya mengizinkan tool baca. Tool '${name}' bersifat ${tool.risk}.`
      : `Akses ditolak: peran ${ctx.actor.role} tidak memiliki izin untuk '${name}' (modul ${tool.module}).`;
    return { ok: false, risk: tool.risk, outcome: { result: errorResult(msg), decision: 'denied', error: verdict.reason } };
  }

  const { idempotencyKey, ...args } = rawArgs;
  if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || idempotencyKey.length < 1 || idempotencyKey.length > 100)) {
    return { ok: false, risk: tool.risk, outcome: { result: errorResult('idempotencyKey harus teks 1-100 karakter.'), decision: 'error', httpStatus: 400, error: 'bad_idempotency_key' } };
  }
  const missing = missingRequired(tool, args);
  if (missing.length) {
    return { ok: false, risk: tool.risk, outcome: { result: errorResult(`Argumen wajib belum diisi: ${missing.join(', ')}. Lihat dokumen_tool(name="${name}").`), decision: 'error', httpStatus: 400, error: 'missing_args' } };
  }

  const invalid = validateArgs(tool, args);
  if (invalid.length) {
    return { ok: false, risk: tool.risk, outcome: { result: errorResult(`Argumen tidak valid: ${invalid.join('; ')}.`), decision: 'error', httpStatus: 400, error: 'invalid_args' } };
  }
  // Bentuk ID (UUID/CUID) untuk tool tulis: nama/nomor dokumen ditolak SEBELUM antrean persetujuan,
  // bukan baru gagal saat disetujui. Keberadaan di DB dicek terpisah (mcp/idExists.ts).
  const badIds = findBadIds(tool, args);
  if (badIds.length) {
    return { ok: false, risk: tool.risk, outcome: { result: errorResult(`Argumen tidak valid: ${formatBadIds(badIds)}.`), decision: 'error', httpStatus: 400, error: 'invalid_id' } };
  }
  const missingIds = await findMissingIds(tool, args);
  if (missingIds.length) {
    return { ok: false, risk: tool.risk, outcome: { result: errorResult(`Argumen tidak valid: ${formatMissingIds(missingIds)}.`), decision: 'error', httpStatus: 404, error: 'id_not_found' } };
  }
  return { ok: true, call: { entry, verdict, args, idempotencyKey } };
}

async function previewDomainTool(ctx: CallContext, rawArgs: Record<string, unknown>): Promise<Outcome> {
  const name = typeof rawArgs.tool === 'string' ? rawArgs.tool : '';
  if (!name || isMetaTool(name)) {
    return { result: errorResult(name ? `'${name}' bukan tool domain.` : 'Argumen tool wajib diisi.'), decision: 'denied', error: 'bad_preview_target' };
  }
  const checked = await checkDomainCall(ctx, name, isPlainObject(rawArgs.args) ? rawArgs.args : {});
  if (!checked.ok) return checked.outcome;
  const { entry, verdict, args } = checked.call;
  const structured = (await buildPreview(entry.tool, verdict.decision, args)) as unknown as Record<string, unknown>;
  return { result: { isError: false, structured, text: JSON.stringify(structured) }, decision: 'allowed' };
}

async function runDomainTool(
  ctx: CallContext,
  name: string,
  rawArgs: Record<string, unknown>,
): Promise<{ outcome: Outcome; risk: string; idemKey?: string }> {
  const started = Date.now();
  const checked = await checkDomainCall(ctx, name, rawArgs);
  if (!checked.ok) return { risk: checked.risk, outcome: checked.outcome };
  const { entry: { tool }, verdict, args, idempotencyKey } = checked.call;

  const baseLog = {
    tokenId: ctx.token.id,
    actorUserId: ctx.actor.id,
    channel: ctx.actor.channel,
    tool: name,
    risk: tool.risk,
    argsHash: hashArgs(args),
    durationMs: 0,
    ref: ctx.actor.ref ?? null,
  };
  const useIdem = typeof idempotencyKey === 'string' && tool.risk !== 'read';
  let claimId: string | undefined;
  if (useIdem) {
    const claim = await claimIdempotency({ ...baseLog, decision: 'inflight', idempotencyKey });
    if (claim.kind === 'replay') {
      const stored = claim.row.resultJson as Record<string, unknown> | null;
      const body = { ...(stored ?? { ok: true }), replayed: true };
      return {
        risk: tool.risk,
        idemKey: undefined,
        outcome: { result: { isError: false, structured: body, text: JSON.stringify(body) }, decision: 'allowed', error: 'idempotent_replay' },
      };
    }
    if (claim.kind === 'inflight') {
      return { risk: tool.risk, outcome: { result: errorResult('Panggilan dengan idempotencyKey ini sedang diproses. Coba lagi sebentar.'), decision: 'error', httpStatus: 409, error: 'idempotency_inflight' } };
    }
    claimId = claim.logId;
  }

  const finish = async (o: Outcome): Promise<{ outcome: Outcome; risk: string; idemKey?: string }> => {
    if (!o.result.isError) {
      const card = buildCard(name, o.result.structured);
      if (card) {
        const structured = { ...o.result.structured, card };
        o.card = card;
        o.result = { ...o.result, structured, text: JSON.stringify(structured) };
      }
    }
    if (claimId) {
      // Hanya hasil sukses/antrian yang dikunci untuk replay; gagal → lepas klaim, catat sebagai baris biasa.
      const keep = !o.result.isError;
      if (keep) {
        await finishClaimed(claimId, {
          decision: o.decision, httpStatus: o.httpStatus, durationMs: Date.now() - started, approvalId: o.approvalId, error: o.error,
          resultJson: o.result.structured as never,
          card: o.card as never,
        });
        o.logId = claimId;
        return { outcome: o, risk: tool.risk, idemKey: idempotencyKey as string };
      }
      await releaseClaim(claimId);
    }
    return { outcome: o, risk: tool.risk };
  };

  try {
    if (verdict.decision === 'queue') {
      const q = await queueToolCall({
        tool, args,
        actor: { id: ctx.actor.id, fullName: ctx.actor.fullName, role: ctx.actor.role, airaJabatan: ctx.actor.airaJabatan },
        tokenName: ctx.token.name, channel: ctx.actor.channel, ref: ctx.actor.ref,
        ...(typeof idempotencyKey === 'string' ? { idempotencyKey } : {}),
      });
      const structured = {
        ok: true,
        status: 'pending_approval',
        approvalId: q.approvalId,
        confirm: q.confirm,
        message: 'Belum dijalankan. Permintaan menunggu persetujuan manusia di Entaris (menu Persetujuan). Beritahu pengguna bahwa permintaan sudah diajukan; hasilnya akan diproses setelah disetujui.',
      };
      return finish({ result: { isError: false, structured, text: JSON.stringify(structured) }, decision: 'queued', approvalId: q.approvalId });
    }

    const res = await callHandler({
      tool, args,
      actor: { id: ctx.actor.id, role: ctx.actor.role },
      tokenName: ctx.token.name, channel: ctx.actor.channel, clientIp: ctx.clientIp, ref: ctx.actor.ref,
    });
    const formatted = formatHandlerResult(res);
    const decision: CallDecision = res.status === 401 || res.status === 403 ? 'denied' : res.status >= 500 ? 'error' : 'allowed';
    return finish({
      result: formatted,
      decision,
      httpStatus: res.status,
      error: res.ok ? undefined : String(formatted.structured.error ?? ''),
    });
  } catch (err) {
    if (err instanceof ArgsError) {
      return finish({ result: errorResult(err.message), decision: 'error', httpStatus: 400, error: err.message });
    }
    const aborted = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    logger.error({ err, tool: name }, 'MCP: eksekusi handler gagal');
    return finish({
      result: errorResult(aborted ? 'Sistem tidak merespons tepat waktu. Operasi mungkin belum selesai; periksa datanya sebelum mengulang.' : 'Gagal menghubungi layanan Entaris. Coba lagi.'),
      decision: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
