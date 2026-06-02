// Notification helpers + scheduled checks.
//
// Prinsip: pembuatan notifikasi TIDAK BOLEH menggagalkan operasi bisnis.
// Semua fungsi di sini di-guard try/catch dan mengembalikan jumlah yang dibuat
// (0 saat gagal) — TIDAK PERNAH throw. Panggil SETELAH transaksi bisnis commit,
// pakai `prisma` standalone (bukan tx dokumen) supaya kegagalan notifikasi tak
// me-rollback dokumen.

import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

type Db = Prisma.TransactionClient | typeof prisma;

interface NotifyInput {
  userIds: string[];
  type: string;
  title: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
}

/** Buat notifikasi utk daftar user. Never throws — return jumlah yang dibuat. */
export async function notifyUsers(db: Db, input: NotifyInput): Promise<number> {
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
    return await notifyUsers(prisma, {
      userIds,
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: input.metadata,
    });
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
 * Cek terjadwal: invoice jatuh tempo (sales+purchase) + stok rendah.
 * Dedup terhadap notifikasi sejenis dalam 24 jam terakhir (via metadata).
 * Dipakai oleh cron harian DAN endpoint POST /notifications/check (Admin).
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

  // 1. Overdue sales invoices
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

  // 2. Overdue purchase invoices
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

  // 3. Low stock items
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

  return { created };
}
