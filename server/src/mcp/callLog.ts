// Riwayat panggilan MCP (satu baris per tools/call) + idempotensi tulis per token.
// Argumen TIDAK disimpan — hanya hash (args_hash); hasil hanya disimpan bila ada idempotencyKey.

import { createHash } from 'node:crypto';
import type { McpCallLog, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

export type CallDecision = 'allowed' | 'queued' | 'denied' | 'error' | 'inflight';

function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, stable(x)]));
  }
  return v;
}

export function hashArgs(args: unknown): string {
  return createHash('sha256').update(JSON.stringify(stable(args ?? {}))).digest('hex');
}

export interface CallLogEntry {
  tokenId: string;
  actorUserId?: string | null;
  channel?: string | null;
  tool: string;
  risk: string;
  argsHash: string;
  decision: CallDecision;
  httpStatus?: number | null;
  durationMs: number;
  approvalId?: string | null;
  error?: string | null;
  idempotencyKey?: string | null;
  resultJson?: Prisma.InputJsonValue | null;
}

function toData(e: CallLogEntry): Prisma.McpCallLogUncheckedCreateInput {
  return {
    tokenId: e.tokenId,
    actorUserId: e.actorUserId ?? null,
    channel: e.channel ?? null,
    tool: e.tool,
    risk: e.risk,
    argsHash: e.argsHash,
    decision: e.decision,
    httpStatus: e.httpStatus ?? null,
    durationMs: Math.max(0, Math.round(e.durationMs)),
    approvalId: e.approvalId ?? null,
    error: e.error ? e.error.slice(0, 500) : null,
    idempotencyKey: e.idempotencyKey ?? null,
    resultJson: e.resultJson ?? undefined,
  };
}

/** Catat panggilan. Tidak pernah melempar (log gagal tak boleh menggagalkan panggilan). */
export async function recordCall(e: CallLogEntry): Promise<void> {
  try {
    await prisma.mcpCallLog.create({ data: toData(e) });
  } catch (err) {
    logger.error({ err, tool: e.tool }, 'MCP call log gagal ditulis');
  }
}

export type IdempotencyClaim =
  | { kind: 'claimed'; logId: string }
  | { kind: 'replay'; row: McpCallLog }
  | { kind: 'inflight' };

/** Klaim (tokenId, key) secara atomik (unique). Pemenang menjalankan tool; lainnya replay/menunggu. */
export async function claimIdempotency(entry: CallLogEntry & { idempotencyKey: string }): Promise<IdempotencyClaim> {
  try {
    const row = await prisma.mcpCallLog.create({ data: toData({ ...entry, decision: 'inflight' }) });
    return { kind: 'claimed', logId: row.id };
  } catch (err) {
    if ((err as { code?: string })?.code !== 'P2002') throw err;
    const existing = await prisma.mcpCallLog.findUnique({
      where: { tokenId_idempotencyKey: { tokenId: entry.tokenId, idempotencyKey: entry.idempotencyKey } },
    });
    if (!existing || existing.decision === 'inflight') return { kind: 'inflight' };
    return { kind: 'replay', row: existing };
  }
}

export async function finishClaimed(logId: string, e: Partial<CallLogEntry> & { decision: CallDecision; durationMs: number }): Promise<void> {
  try {
    await prisma.mcpCallLog.update({
      where: { id: logId },
      data: {
        decision: e.decision,
        httpStatus: e.httpStatus ?? null,
        durationMs: Math.max(0, Math.round(e.durationMs)),
        approvalId: e.approvalId ?? null,
        error: e.error ? e.error.slice(0, 500) : null,
        resultJson: e.resultJson ?? undefined,
      },
    });
  } catch (err) {
    logger.error({ err, logId }, 'MCP call log (idempotency) gagal diperbarui');
  }
}

/** Lepas klaim bila eksekusi ditolak sebelum berefek, agar kunci yang sama bisa dicoba lagi. */
export async function releaseClaim(logId: string): Promise<void> {
  await prisma.mcpCallLog.delete({ where: { id: logId } }).catch(() => undefined);
}
