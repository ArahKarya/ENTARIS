// Antrian persetujuan untuk tool write/critical: panggilan TIDAK dijalankan, disimpan sebagai
// ApprovalRequest `ai_tool:<nama>`. Saat manusia menyetujui (services/approvalDecision.ts),
// panggilan yang sama dijalankan lewat handler internal sebagai AKTOR ASLI. Ditolak = tak ada efek.

import type { ApprovalRequest, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { getTool } from '../ai/registry';
import { approvalsLink } from '../services/approvalGate';
import { notifyAdmins } from '../services/notificationService';
import { redactSecrets } from '../utils/redact';
import { callHandler, type HandlerResult } from './execute';
import { formatHandlerResult } from './resultFormat';
import { AI_TOOL_DOC_PREFIX, isAiToolDocumentType } from './constants';

export { AI_TOOL_DOC_PREFIX, isAiToolDocumentType };

export interface QueuedToolPayload {
  tool: string;
  args: Record<string, unknown>;
  handler: string;
  risk: string;
  confirm: string;
  actor: { userId: string; name: string; role: string; jabatan: string | null };
  via: 'mcp';
  tokenName: string;
  channel: string | null;
  ref?: string;
  idempotencyKey?: string;
  result?: { status: number; at: string; summary: unknown };
}

/** Render confirm_template dengan args (`{id}` → nilai; yang tak ada dibiarkan). */
export function renderConfirm(tpl: string | undefined, args: Record<string, unknown>): string {
  if (!tpl) return '';
  return tpl.replace(/\{(\w+)\}/g, (_m, k: string) => {
    const v = args[k];
    if (Array.isArray(v)) return String(v.length);
    return v === undefined || v === null || typeof v === 'object' ? `{${k}}` : String(v);
  });
}

function numericAmount(args: Record<string, unknown>): number | undefined {
  const a = args.amount;
  if (typeof a === 'number' && Number.isFinite(a)) return a;
  if (typeof a === 'string' && a.trim() !== '' && Number.isFinite(Number(a))) return Number(a);
  return undefined;
}

export interface QueueInput {
  tool: { name: string; handler: string; risk: string; confirm_template?: string };
  args: Record<string, unknown>;
  actor: { id: string; fullName: string; role: string; airaJabatan: string | null };
  tokenName: string;
  channel: string | null;
  ref?: string;
  idempotencyKey?: string;
}

export async function queueToolCall(input: QueueInput): Promise<{ approvalId: string; confirm: string }> {
  const confirm = renderConfirm(input.tool.confirm_template, input.args);
  const payload: QueuedToolPayload = {
    tool: input.tool.name,
    args: input.args,
    handler: input.tool.handler,
    risk: input.tool.risk,
    confirm,
    actor: { userId: input.actor.id, name: input.actor.fullName, role: input.actor.role, jabatan: input.actor.airaJabatan },
    via: 'mcp',
    tokenName: input.tokenName,
    channel: input.channel,
    ...(input.ref ? { ref: input.ref } : {}),
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  };
  const amount = numericAmount(input.args);
  const req = await prisma.approvalRequest.create({
    data: {
      documentType: `${AI_TOOL_DOC_PREFIX}${input.tool.name}`,
      amount,
      payload: payload as unknown as Prisma.InputJsonValue,
      status: 'Pending',
      requestedBy: input.actor.id,
      notes: confirm || null,
    },
  });
  const link = approvalsLink(req.id);
  await notifyAdmins({
    type: 'approval_pending',
    title: '🔔 Persetujuan: Permintaan AIRA',
    message: `${input.actor.fullName} (via AIRA/${input.channel ?? 'mcp'}) meminta: ${confirm || input.tool.name}${link ? `\n\n🔗 Buka & proses: ${link}` : ''}`,
    metadata: { kind: 'approval', requestId: req.id, documentType: `${AI_TOOL_DOC_PREFIX}${input.tool.name}` },
    excludeUserId: input.actor.id,
  }).catch((err) => logger.error({ err }, 'MCP: notifikasi approval gagal'));
  return { approvalId: req.id, confirm };
}

export interface ApprovedExecution {
  ok: boolean;
  status?: number;
  docNumber?: string;
  error?: string;
}

function pickRef(data: unknown): { id?: string; number?: string } {
  if (!data || typeof data !== 'object') return {};
  const o = data as Record<string, unknown>;
  const inner = (o.request && typeof o.request === 'object' ? (o.request as Record<string, unknown>) : o);
  const number = [inner.documentNumber, inner.invoiceNumber, inner.poNumber, inner.runNumber, inner.number, inner.doNumber, inner.draftNumber]
    .find((x) => typeof x === 'string') as string | undefined;
  return { id: typeof inner.id === 'string' ? inner.id : undefined, number };
}

/**
 * Jalankan panggilan tersimpan sebagai aktor asli. Dipanggil approvalDecision pada approve.
 * Gagal (upstream non-2xx / aktor tak valid) → {ok:false,error}; pemanggil mengembalikan
 * pengajuan ke Pending agar approver bisa menolak / mencoba lagi.
 */
export async function executeApprovedToolCall(request: ApprovalRequest, deps: { call?: typeof callHandler } = {}): Promise<ApprovedExecution & { payload?: QueuedToolPayload; documentId?: string }> {
  const payload = request.payload as unknown as QueuedToolPayload | null;
  if (!payload?.tool) return { ok: false, error: 'Payload pengajuan AIRA tidak valid.' };
  const tool = getTool(payload.tool);
  if (!tool) return { ok: false, error: `Tool '${payload.tool}' sudah tidak terdaftar di registry.` };

  const actor = await prisma.user.findUnique({ where: { id: request.requestedBy }, select: { id: true, role: true, isActive: true, airaEnabled: true, fullName: true } });
  if (!actor || !actor.isActive) return { ok: false, error: 'Pengaju sudah tidak aktif; pengajuan tidak dapat dijalankan.' };
  if (!actor.airaEnabled) return { ok: false, error: `Akses AIRA untuk ${actor.fullName} sudah dicabut; pengajuan tidak dapat dijalankan.` };

  let res: HandlerResult;
  try {
    res = await (deps.call ?? callHandler)({
      tool,
      args: payload.args ?? {},
      actor: { id: actor.id, role: actor.role },
      tokenName: payload.tokenName,
      channel: payload.channel,
      approvalId: request.id,
      ref: payload.ref,
    });
  } catch (err) {
    logger.error({ err, requestId: request.id }, 'MCP: eksekusi pengajuan gagal (jaringan/argumen)');
    return { ok: false, error: err instanceof Error ? err.message : 'Eksekusi gagal.' };
  }
  const formatted = formatHandlerResult(res, 4000);
  if (!res.ok) {
    return { ok: false, status: res.status, error: String(formatted.structured.error ?? `Handler menolak (HTTP ${res.status}).`) };
  }
  const ref = pickRef(res.body.kind === 'json' ? res.body.data : null);
  const next: QueuedToolPayload = {
    ...payload,
    result: { status: res.status, at: new Date().toISOString(), summary: redactSecrets(formatted.structured.data) },
  };
  return { ok: true, status: res.status, docNumber: ref.number, documentId: ref.id, payload: next };
}
