// Notifications must never fail a business operation: every function catches and returns the
// created count (0 on failure). Call after the business transaction commits, with standalone `prisma`.

import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { pushTelegram, pushTelegramToUser, isPersonalTelegramOn } from './telegramService';
import { hasCap } from './permissionService';
import { businessToday, daysOverdue, purchaseOrderOverdueWhere } from './purchaseOrderOverdue';

type Db = Prisma.TransactionClient | typeof prisma;

interface NotifyOpts {
  // Saat true, jangan kirim ke Telegram di sini (notifyRole mengirim sekali
  // sendiri agar fan-out ke banyak user tidak jadi banyak pesan grup).
  skipTelegram?: boolean;
}

interface NotifyInput {
  userIds: string[];
  type: string;
  title: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
}

/** Buat notifikasi utk daftar user. Never throws — return jumlah yang dibuat. */
export async function notifyUsers(db: Db, input: NotifyInput, opts?: NotifyOpts): Promise<number> {
  if (!input.userIds || input.userIds.length === 0) return 0;
  try {
    const res = await db.notification.createMany({
      data: input.userIds.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        message: input.message,
        metadata: input.metadata ?? {},
      })),
    });
    // Telegram echo: direct message to each recipient with a linked account; broadcast types are
    // optionally mirrored to the group (no-op without a group chat ID). notifyRole sets skipTelegram.
    if (!opts?.skipTelegram) {
      void (async () => {
        try {
          if (await isPersonalTelegramOn()) {
            const linked = await prisma.user.findMany({
              where: { id: { in: input.userIds }, telegramChatId: { not: null } },
              select: { telegramChatId: true, role: true },
            });
            // Tombol aksi hanya utk approval_pending ke user dgn capability
            // 'approval.decide' (default Admin/super) — japri pemutus saja.
            const requestId = (input.metadata as any)?.requestId as string | undefined;
            for (const u of linked) {
              if (u.telegramChatId) {
                const withApprovalButtons =
                  input.type === 'approval_pending' && !!requestId && (await hasCap(u.role, 'approval.decide'));
                void pushTelegramToUser({
                  chatId: u.telegramChatId,
                  type: input.type,
                  title: input.title,
                  message: input.message,
                  requestId,
                  withApprovalButtons,
                });
              }
            }
          }
          // Mirror grup (opsional) utk pengumuman broadcast.
          const broadcastTypes = ['approval_pending', 'invoice_overdue', 'low_stock', 'guarantee_due'];
          if (broadcastTypes.includes(input.type)) {
            void pushTelegram({ type: input.type, title: input.title, message: input.message });
          }
        } catch { /* never throw */ }
      })();
    }
    return res.count;
  } catch (err) {
    logger.error({ err, type: input.type }, 'notifyUsers gagal (diabaikan)');
    return 0;
  }
}

/** Notifikasi ke semua user aktif dgn role tertentu (opsi exclude diri sendiri). */
export async function notifyRole(
  roles: string | string[],
  input: Omit<NotifyInput, 'userIds'> & { excludeUserId?: string },
): Promise<number> {
  try {
    const roleList = Array.isArray(roles) ? roles : [roles];
    const users = await prisma.user.findMany({
      where: { isActive: true, role: { in: roleList as any } },
      select: { id: true },
    });
    const userIds = users
      .map((u) => u.id)
      .filter((id) => id !== input.excludeUserId);
    // notifyUsers menangani japri ke tiap anggota role tertaut + mirror grup
    // opsional (utk tipe broadcast). Tak perlu skipTelegram lagi.
    return await notifyUsers(
      prisma,
      { userIds, type: input.type, title: input.title, message: input.message, metadata: input.metadata },
    );
  } catch (err) {
    logger.error({ err, type: input.type }, 'notifyRole gagal (diabaikan)');
    return 0;
  }
}

/** Notifikasi ke semua Admin aktif. */
export async function notifyAdmins(
  input: Omit<NotifyInput, 'userIds'> & { excludeUserId?: string },
): Promise<number> {
  return notifyRole('Admin', input);
}

/**
 * Scheduled checks (overdue invoices, low stock, guarantees, late POs), deduplicated against the
 * last 24 hours via metadata. Used by the daily cron and POST /notifications/check.
 */
export async function runNotificationChecks(): Promise<{ created: number }> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const targetUsers = await prisma.user.findMany({
    where: { isActive: true, role: { in: ['Admin', 'Accountant'] } },
    select: { id: true },
  });
  const userIds = targetUsers.map((u) => u.id);
  if (userIds.length === 0) return { created: 0 };

  let created = 0;

  const overdueSales = await prisma.salesInvoice.findMany({
    where: { status: { notIn: ['Paid', 'Cancelled', 'Draft'] }, dueDate: { lt: now } },
    include: { customer: { select: { name: true } } },
  });

  const existingInvoiceNotifs = await prisma.notification.findMany({
    where: { type: 'invoice_overdue', createdAt: { gte: oneDayAgo } },
    select: { metadata: true },
  });
  const existingInvoiceIds = new Set(
    existingInvoiceNotifs.map((n) => (n.metadata as any)?.invoiceId).filter(Boolean),
  );

  for (const inv of overdueSales) {
    if (existingInvoiceIds.has(inv.id)) continue;
    created += await notifyUsers(prisma, {
      userIds,
      type: 'invoice_overdue',
      title: 'Invoice Penjualan Jatuh Tempo',
      message: `Invoice ${inv.invoiceNumber} untuk ${inv.customer.name} sudah melewati jatuh tempo.`,
      metadata: { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, invoiceType: 'sales' },
    });
  }

  const overduePurchase = await prisma.purchaseInvoice.findMany({
    where: { status: { notIn: ['Paid', 'Cancelled', 'Draft'] }, dueDate: { lt: now } },
    include: { supplier: { select: { name: true } } },
  });
  for (const inv of overduePurchase) {
    if (existingInvoiceIds.has(inv.id)) continue;
    created += await notifyUsers(prisma, {
      userIds,
      type: 'invoice_overdue',
      title: 'Invoice Pembelian Jatuh Tempo',
      message: `Invoice ${inv.invoiceNumber} untuk ${inv.supplier.name} sudah melewati jatuh tempo.`,
      metadata: { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, invoiceType: 'purchase' },
    });
  }

  const lowItems = await prisma.$queryRaw<any[]>`
    SELECT id, code, name, unit, current_stock AS "currentStock", minimum_stock AS "minimumStock"
    FROM inventory_items
    WHERE is_active = true AND minimum_stock > 0 AND current_stock <= minimum_stock
  `;
  const existingStockNotifs = await prisma.notification.findMany({
    where: { type: 'low_stock', createdAt: { gte: oneDayAgo } },
    select: { metadata: true },
  });
  const existingItemIds = new Set(
    existingStockNotifs.map((n) => (n.metadata as any)?.itemId).filter(Boolean),
  );
  for (const item of lowItems) {
    if (existingItemIds.has(item.id)) continue;
    created += await notifyUsers(prisma, {
      userIds,
      type: 'low_stock',
      title: 'Stok Rendah',
      message: `Stok ${item.name} (${item.code}) tersisa ${Number(item.currentStock)} ${item.unit}, di bawah minimum ${Number(item.minimumStock)} ${item.unit}.`,
      metadata: { itemId: item.id, itemCode: item.code },
    });
  }

  // Project guarantees near or past their return due date.
  const dueSoon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const dueGuarantees = await prisma.projectGuarantee.findMany({
    where: { status: 'Disetor', expectedReturnDate: { not: null, lte: dueSoon } },
    include: {
      party: { select: { name: true } },
      settlements: { where: { isCancelled: false }, select: { returnAmount: true, forfeitAmount: true } },
    },
  });
  const existingGuaranteeNotifs = await prisma.notification.findMany({
    where: { type: 'guarantee_due', createdAt: { gte: oneDayAgo } },
    select: { metadata: true },
  });
  const existingGuaranteeIds = new Set(
    existingGuaranteeNotifs.map((n) => (n.metadata as any)?.guaranteeId).filter(Boolean),
  );
  for (const g of dueGuarantees) {
    if (existingGuaranteeIds.has(g.id)) continue;
    const settled = g.settlements.reduce(
      (sum, s) => sum + Number(s.returnAmount) + Number(s.forfeitAmount),
      0,
    );
    const outstanding = Number(g.amount) - settled;
    if (outstanding <= 0.01) continue;

    const dueDate = g.expectedReturnDate!;
    const overdue = dueDate < now;
    const dueStr = dueDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    created += await notifyUsers(prisma, {
      userIds,
      type: 'guarantee_due',
      title: overdue ? 'Uang Jaminan Lewat Jatuh Tempo' : 'Uang Jaminan Mendekati Jatuh Tempo',
      message: `${g.guaranteeNumber} (${g.projectName}) ke ${g.party.name}: sisa Rp ${outstanding.toLocaleString('id-ID')}, ${overdue ? 'jatuh tempo pengembalian sudah lewat' : 'jatuh tempo pengembalian'} ${dueStr}. Tagih pengembalian ke pemberi proyek.`,
      metadata: { guaranteeId: g.id, guaranteeNumber: g.guaranteeNumber },
    });
  }

  // Late POs: Submitted, not closed, target date before today (WIB), not fully received.
  created += await notifyOverduePurchaseOrders(userIds, now, oneDayAgo);

  return { created };
}

async function notifyOverduePurchaseOrders(userIds: string[], now: Date, since: Date): Promise<number> {
  try {
    const overduePOs = await prisma.purchaseOrder.findMany({
      where: purchaseOrderOverdueWhere(now, prisma.purchaseOrderItem.fields.quantity),
      select: { id: true, poNumber: true, expectedDeliveryDate: true, supplier: { select: { name: true } } },
      orderBy: { expectedDeliveryDate: 'asc' },
      take: 200,
    });
    if (overduePOs.length === 0) return 0;
    const existing = await prisma.notification.findMany({
      where: { type: 'po_overdue', createdAt: { gte: since } },
      select: { metadata: true },
    });
    const notified = new Set(existing.map((n) => (n.metadata as any)?.purchaseOrderId).filter(Boolean));
    const today = businessToday(now);
    let created = 0;
    for (const po of overduePOs) {
      if (notified.has(po.id)) continue;
      const days = daysOverdue(po.expectedDeliveryDate!, today);
      created += await notifyUsers(prisma, {
        userIds,
        type: 'po_overdue',
        title: 'PO Terlambat Diterima',
        message: `${po.poNumber}${po.supplier ? ` (${po.supplier.name})` : ''} melewati target terima ${days} hari dan belum diterima penuh.`,
        metadata: { purchaseOrderId: po.id, poNumber: po.poNumber, daysOverdue: days },
      });
    }
    return created;
  } catch (err) {
    logger.error({ err }, 'po_overdue check gagal (diabaikan)');
    return 0;
  }
}
