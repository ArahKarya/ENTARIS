// Persetujuan pengajuan `ai_tool:*`: klaim atomik → jalankan sebagai aktor asli → tandai Approved.
// Dipanggil dari services/approvalDecision.ts (web /approvals dan tombol Telegram memakai jalur sama).

import type { ApprovalRequest, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { notifyUsers } from '../services/notificationService';
import { executeApprovedToolCall, type QueuedToolPayload } from './queue';
import { explainExecutionError } from './idShape';

export interface AiToolApprovalOutcome {
  ok: boolean;
  status?: 'Approved';
  docNumber?: string;
  documentType?: string;
  error?: string;
}

export async function approveQueuedToolCall(
  request: ApprovalRequest,
  deciderUserId: string,
  note: string,
): Promise<AiToolApprovalOutcome> {
  // Klaim: Pending → Executing (tak bisa dobel-eksekusi walau dua approver menekan bersamaan).
  const claimed = await prisma.approvalRequest.updateMany({
    where: { id: request.id, status: 'Pending' },
    data: { status: 'Executing' },
  });
  if (claimed.count === 0) return { ok: false, error: 'Pengajuan sudah diproses.' };

  const exec = await executeApprovedToolCall(request);
  const original = request.payload as unknown as QueuedToolPayload | null;

  if (!exec.ok) {
    // Tak ada efek (handler menolak / aktor tak valid) → kembali Pending; approver boleh menolak.
    const failed = { ...(original ?? {}), lastError: explainExecutionError(exec.error ?? 'Eksekusi gagal.'), lastErrorAt: new Date().toISOString() };
    await prisma.approvalRequest.update({
      where: { id: request.id },
      data: { status: 'Pending', payload: failed as unknown as Prisma.InputJsonValue },
    });
    logger.warn({ requestId: request.id, error: exec.error }, 'MCP: eksekusi pengajuan AIRA gagal; dikembalikan ke Pending');
    return { ok: false, error: `Eksekusi gagal: ${exec.error ?? 'tidak diketahui'}` };
  }

  await prisma.approvalRequest.update({
    where: { id: request.id },
    data: {
      status: 'Approved',
      approvedBy: deciderUserId,
      decidedAt: new Date(),
      ...(note ? { notes: note } : {}),
      ...(exec.documentId ? { documentId: exec.documentId } : {}),
      ...(exec.docNumber ? { documentNumber: exec.docNumber } : {}),
      payload: exec.payload as unknown as Prisma.InputJsonValue,
    },
  });
  await notifyUsers(prisma, {
    userIds: [request.requestedBy],
    type: 'approval_approved',
    title: 'Permintaan AIRA disetujui',
    message: `${original?.confirm || original?.tool || 'Permintaan'} telah disetujui dan dijalankan${exec.docNumber ? ` (${exec.docNumber})` : ''}.`,
    metadata: { kind: 'approval', requestId: request.id, documentType: request.documentType },
  });
  logger.info({ requestId: request.id, tool: original?.tool, approvedBy: deciderUserId, status: exec.status }, 'MCP: pengajuan AIRA disetujui + dieksekusi sebagai aktor asli');
  return { ok: true, status: 'Approved', docNumber: exec.docNumber, documentType: request.documentType };
}
