/**
 * Notifications for Pengajuan Pembayaran transitions. Called AFTER the
 * transaction commits; never throws (notifyUsers swallows its own errors).
 * Every notification links straight to the detail page via metadata.link.
 */
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { notifyUsers } from './notificationService';
import { roleKeysWithPerm } from './permissionService';
import type { PrEvent } from './paymentRequestService';
import { PR_MODULE } from './paymentRequestRules';
import { advanceAgeDays, isAdvanceOverdue } from './paymentRequestSettlementRules';

const formatRupiahPlain = (n: number): string => `Rp ${n.toLocaleString('id-ID', { maximumFractionDigits: 2 })}`;

async function activeUserIdsByRoles(roleKeys: string[]): Promise<string[]> {
  if (roleKeys.length === 0) return [];
  const users = await prisma.user.findMany({ where: { isActive: true, role: { in: roleKeys } }, select: { id: true } });
  return users.map((u) => u.id);
}

async function financeUserIds(): Promise<string[]> {
  return activeUserIdsByRoles(await roleKeysWithPerm(PR_MODULE, 'edit'));
}

interface Plan {
  userIds: string[];
  type: string;
  title: string;
  message: string;
}

async function planFor(e: PrEvent): Promise<Plan | null> {
  const amount = formatRupiahPlain(e.amount);
  const note = e.note ? ` Catatan: ${e.note}` : '';
  switch (e.kind) {
    case 'pending_supervisor':
      return e.supervisorId
        ? { userIds: [e.supervisorId], type: 'payment_request_pending', title: 'Pengajuan pembayaran menunggu persetujuan Anda', message: `${e.number} (${amount}) menunggu persetujuan atasan.` }
        : null;
    case 'pending_finance':
      return { userIds: await financeUserIds(), type: 'payment_request_pending', title: 'Pengajuan pembayaran perlu verifikasi Keuangan', message: `${e.number} (${amount}) menunggu verifikasi Keuangan.` };
    case 'pending_director':
      return {
        userIds: await activeUserIdsByRoles(e.directorRole ? [e.directorRole] : []),
        type: 'payment_request_pending',
        title: 'Pengajuan pembayaran menunggu persetujuan Direktur',
        message: `${e.number} (${amount}) melewati batas nilai dan menunggu persetujuan Anda.`,
      };
    case 'approved':
      return { userIds: [e.requesterId, ...(await financeUserIds())], type: 'payment_request_approved', title: 'Pengajuan pembayaran disetujui', message: `${e.number} (${amount}) disetujui dan siap dibayar.${note}` };
    case 'rejected':
      return { userIds: [e.requesterId], type: 'payment_request_rejected', title: 'Pengajuan pembayaran ditolak', message: `${e.number} ditolak.${note}` };
    case 'revision':
      return { userIds: [e.requesterId], type: 'payment_request_revision', title: 'Pengajuan pembayaran perlu revisi', message: `${e.number} dikembalikan untuk direvisi.${note}` };
    case 'paid':
      return { userIds: [e.requesterId], type: 'payment_request_paid', title: 'Pengajuan pembayaran sudah dibayar', message: `${e.number} (${amount}) sudah dibayarkan.` };
    case 'payment_cancelled':
      return { userIds: [e.requesterId], type: 'payment_request_revision', title: 'Pembayaran pengajuan dibatalkan', message: `Pembayaran ${e.number} dibatalkan Keuangan dan kembali ke Siap Dibayar.${note}` };
    case 'settlement_pending_supervisor':
      return e.supervisorId
        ? { userIds: [e.supervisorId], type: 'payment_request_pending', title: 'Pertanggungjawaban uang muka menunggu persetujuan Anda', message: `Pertanggungjawaban ${e.number} (realisasi ${amount}) menunggu persetujuan atasan.` }
        : null;
    case 'settlement_pending_finance':
      return { userIds: await financeUserIds(), type: 'payment_request_pending', title: 'Pertanggungjawaban uang muka perlu diposting Keuangan', message: `Pertanggungjawaban ${e.number} (realisasi ${amount}) menunggu verifikasi dan posting Keuangan.${note}` };
    case 'settlement_revision':
      return { userIds: [e.requesterId], type: 'payment_request_revision', title: 'Pertanggungjawaban perlu revisi', message: `Pertanggungjawaban ${e.number} dikembalikan untuk direvisi.${note}` };
    case 'settlement_settled':
      return { userIds: [e.requesterId], type: 'payment_request_paid', title: 'Pertanggungjawaban uang muka selesai', message: `Pertanggungjawaban ${e.number} (realisasi ${amount}) sudah diposting.` };
    case 'settlement_posting_cancelled':
      return { userIds: [e.requesterId], type: 'payment_request_revision', title: 'Posting pertanggungjawaban dibatalkan', message: `Posting pertanggungjawaban ${e.number} dibatalkan Keuangan dan kembali ke verifikasi.${note}` };
    case 'cancelled':
      return {
        userIds: [...(e.supervisorId ? [e.supervisorId] : []), ...(await financeUserIds())],
        type: 'payment_request_cancelled',
        title: 'Pengajuan pembayaran dibatalkan pengaju',
        message: `${e.number} (${amount}) dibatalkan oleh pengaju.${note}`,
      };
    default:
      return null;
  }
}

export async function dispatchPaymentRequestEvents(events: readonly PrEvent[]): Promise<void> {
  for (const e of events) {
    try {
      const plan = await planFor(e);
      if (!plan) continue;
      // Never notify the actor about their own action, and never twice.
      const userIds = [...new Set(plan.userIds)].filter((id) => id !== e.actorId);
      await notifyUsers(prisma, {
        userIds,
        type: plan.type,
        title: plan.title,
        message: plan.message,
        metadata: { paymentRequestId: e.requestId, number: e.number, link: `/payment-requests/${e.requestId}` },
      });
    } catch (err) {
      logger.error({ err, kind: e.kind, requestId: e.requestId }, 'payment request notification gagal (diabaikan)');
    }
  }
}

const REMINDER_TYPE = 'payment_request_settlement_due';

/**
 * Daily reminder to requesters whose advance is still unsettled after
 * SETTLEMENT_OVERDUE_DAYS (or past the deadline they set). At most one
 * reminder per request per 3 days; never throws.
 */
export async function runSettlementReminders(now: Date = new Date()): Promise<{ created: number }> {
  try {
    const rows = await prisma.paymentRequest.findMany({
      where: { status: 'PAID', settlementStatus: { in: ['OPEN', 'REVISION'] } },
      select: { id: true, number: true, requesterId: true, totalAmount: true, paymentDate: true, settlementDeadline: true },
    });
    const due = rows.filter((r) => isAdvanceOverdue(r, now));
    if (due.length === 0) return { created: 0 };
    const recent = await prisma.notification.findMany({
      where: { type: REMINDER_TYPE, createdAt: { gte: new Date(now.getTime() - 3 * 86_400_000) } },
      select: { metadata: true },
    });
    const already = new Set(recent.map((n) => (n.metadata as { paymentRequestId?: string } | null)?.paymentRequestId).filter(Boolean));
    let created = 0;
    for (const r of due) {
      if (already.has(r.id)) continue;
      const days = advanceAgeDays(r.paymentDate, now);
      created += await notifyUsers(prisma, {
        userIds: [r.requesterId],
        type: REMINDER_TYPE,
        title: 'Uang muka belum dipertanggungjawabkan',
        message: `${r.number} (${formatRupiahPlain(Number(r.totalAmount))}) sudah ${days} hari sejak dibayar. Segera isi pertanggungjawaban.`,
        metadata: { paymentRequestId: r.id, number: r.number, link: `/payment-requests/${r.id}` },
      });
    }
    return { created };
  } catch (err) {
    logger.error({ err }, 'settlement reminder gagal (diabaikan)');
    return { created: 0 };
  }
}
