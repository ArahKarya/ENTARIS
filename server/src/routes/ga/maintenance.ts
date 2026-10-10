// GA maintenance: preventive schedules and work orders, mounted with requirePerm('ga_maintenance') in index.ts.
// Completing a linked WO rolls the schedule forward; WO parts consume GA inventory atomically (OUT movement) in a transaction.

import { Router, type Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { prisma } from '../../lib/prisma';
import { bumpVehicleOdometer } from '../../services/gaVehicleOdometer';
import { buildWorkOrderServiceLogData } from '../../services/gaWorkOrderServiceLog';
import { AuthRequest } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { BusinessError, handleRouteError } from '../../utils/errors';
import { logger } from '../../lib/logger';
import { parseListPaging, parseSort } from '../../utils/listQuery';
import {
  WO_SORT_FIELDS,
  buildWorkOrderWhere,
  workOrderOrderBy,
  workOrderSummaryWheres,
} from '../../services/gaWorkOrderList';

const router = Router();

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || './uploads');
const WO_PHOTOS_DIR = path.join(UPLOADS_DIR, 'ga', 'workorders');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// Validation schemas
const PRIORITY = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

const MaintenanceScheduleSchema = z
  .object({
    assetId: z.string().min(1, 'assetId wajib diisi.'),
    intervalDays: z.number().int().positive().optional().nullable(),
    intervalHours: z.number().int().positive().optional().nullable(),
    intervalKm: z.number().int().positive().optional().nullable(),
    nextDueAt: z.string().min(1, 'nextDueAt wajib diisi.'),
    notes: z.string().optional().nullable(),
    isActive: z.boolean().default(true),
  })
  .refine((d) => d.intervalDays || d.intervalHours || d.intervalKm, {
    message: 'Isi salah satu interval (hari, jam, atau km).',
  });

const UpdateScheduleSchema = z.object({
  intervalDays: z.number().int().positive().optional().nullable(),
  intervalHours: z.number().int().positive().optional().nullable(),
  intervalKm: z.number().int().positive().optional().nullable(),
  nextDueAt: z.string().min(1).optional(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

const CreateWorkOrderSchema = z.object({
  assetId: z.string().min(1, 'assetId wajib diisi.'),
  type: z.enum(['PREVENTIVE', 'CORRECTIVE']).default('CORRECTIVE'),
  title: z.string().min(1, 'Judul wajib diisi.').max(200),
  description: z.string().optional().nullable(),
  component: z.string().max(200).optional().nullable(),
  priority: z.enum(PRIORITY).default('MEDIUM'),
  scheduleId: z.string().optional().nullable(),
  dueAt: z.string().optional().nullable(),
});

const AssignWoSchema = z.object({
  assignedToId: z.string().min(1, 'Teknisi wajib dipilih.'),
  priority: z.enum(PRIORITY).optional(),
});

const CompleteWoSchema = z.object({
  resolution: z.string().optional().nullable(),
  checklist: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        required: z.boolean().default(false),
        done: z.boolean().default(false),
        notes: z.string().optional().nullable(),
      }),
    )
    .optional()
    .nullable(),
  laborHours: z.number().nonnegative().optional().nullable(),
  laborCost: z.number().nonnegative().optional().nullable(),
  externalVendor: z.string().optional().nullable(),
  externalCost: z.number().nonnegative().optional().nullable(),
});

const CancelWoSchema = z.object({
  reason: z.string().min(1, 'Alasan wajib diisi.').max(500),
});

const PartInputSchema = z.object({
  inventoryItemId: z.string().min(1, 'Item wajib dipilih.'),
  fromLocationId: z.string().optional().nullable(),
  quantity: z.number().positive('Qty harus lebih dari 0.'),
  unitCost: z.number().nonnegative(),
});

/** Generate next WO code WO-YYYY-NNNN, serialized via a year-scoped advisory lock. */
async function generateWorkOrderCode(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `WO-${year}-`;
  const lockKey = 0xa70000 + (year - 2000);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

  const latest = await tx.gaWorkOrder.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });

  const lastSeq = latest ? parseInt(latest.code.slice(prefix.length), 10) : 0;
  const next = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

/** Next due date for a preventive schedule after completion. */
function computeNextDue(
  current: Date,
  intervalDays: number | null,
  intervalHours: number | null,
): Date {
  const d = new Date(current);
  if (intervalDays) {
    d.setDate(d.getDate() + intervalDays);
  } else if (intervalHours) {
    d.setDate(d.getDate() + Math.ceil(intervalHours / 24));
  }
  return d;
}

/** Total cost of a WO (labor + external + parts). */
function computeWorkOrderTotalCost(
  laborCost: Prisma.Decimal | null | undefined,
  externalCost: Prisma.Decimal | null | undefined,
  parts: Array<{ quantity: Prisma.Decimal; unitCost: Prisma.Decimal }>,
): number {
  const labor = laborCost ? Number(laborCost) : 0;
  const ext = externalCost ? Number(externalCost) : 0;
  const partsTotal = parts.reduce(
    (sum, p) => sum + Number(p.quantity) * Number(p.unitCost),
    0,
  );
  return labor + ext + partsTotal;
}

// Schedules

// GET /schedules — list, optional filters assetId/active
router.get('/schedules', async (req: AuthRequest, res) => {
  try {
    const where: Prisma.GaMaintenanceScheduleWhereInput = {};
    if (req.query.assetId) where.assetId = String(req.query.assetId);
    if (req.query.active === 'true') where.isActive = true;
    if (req.query.active === 'false') where.isActive = false;

    const items = await prisma.gaMaintenanceSchedule.findMany({
      where,
      orderBy: { nextDueAt: 'asc' },
      include: {
        asset: { select: { id: true, code: true, name: true, picUserId: true } },
      },
    });
    return res.json(items);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/maintenance/schedules', 'Gagal mengambil jadwal maintenance.');
  }
});

// POST /schedules — create preventive schedule
router.post('/schedules', async (req: AuthRequest, res) => {
  const input = validateBody(MaintenanceScheduleSchema, req.body, res);
  if (!input) return;

  try {
    const asset = await prisma.gaAsset.findUnique({ where: { id: input.assetId }, select: { id: true } });
    if (!asset) throw new BusinessError('Aset tidak ditemukan.');

    const created = await prisma.gaMaintenanceSchedule.create({
      data: {
        assetId: input.assetId,
        intervalDays: input.intervalDays ?? null,
        intervalHours: input.intervalHours ?? null,
        intervalKm: input.intervalKm ?? null,
        nextDueAt: new Date(input.nextDueAt),
        notes: input.notes ?? null,
        isActive: input.isActive,
        createdBy: req.user!.userId,
      },
    });
    return res.status(201).json({ id: created.id });
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/maintenance/schedules', 'Gagal membuat jadwal maintenance.');
  }
});

// PUT /schedules/:id — update schedule
router.put('/schedules/:id', async (req: AuthRequest, res) => {
  const input = validateBody(UpdateScheduleSchema, req.body, res);
  if (!input) return;

  try {
    const data: Prisma.GaMaintenanceScheduleUpdateInput = {};
    if (input.intervalDays !== undefined) data.intervalDays = input.intervalDays ?? null;
    if (input.intervalHours !== undefined) data.intervalHours = input.intervalHours ?? null;
    if (input.intervalKm !== undefined) data.intervalKm = input.intervalKm ?? null;
    if (input.nextDueAt) data.nextDueAt = new Date(input.nextDueAt);
    if (input.notes !== undefined) data.notes = input.notes ?? null;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const updated = await prisma.gaMaintenanceSchedule.update({
      where: { id: String(req.params.id) },
      data,
    });
    return res.json({ id: updated.id });
  } catch (error) {
    return handleRouteError(res, error, 'PUT /ga/maintenance/schedules/:id', 'Gagal update jadwal maintenance.');
  }
});

// Work orders

// GET /work-orders: without `page` a bare array of every match (GA dashboard and AIRA gm_wo_list depend on it);
// with `page` returns `{ data, total, page, limit }` (limit <= 200) with `assignee`. Invalid filters -> 400.
router.get('/work-orders', async (req: AuthRequest, res) => {
  try {
    if (req.query.page !== undefined) return await listWorkOrdersPaged(req, res);
    const where: Prisma.GaWorkOrderWhereInput = {};
    if (req.query.status) where.status = req.query.status as Prisma.EnumGaWorkOrderStatusFilter['equals'];
    if (req.query.priority) where.priority = req.query.priority as Prisma.EnumGaWorkOrderPriorityFilter['equals'];
    if (req.query.type) where.type = req.query.type as Prisma.EnumGaWorkOrderTypeFilter['equals'];
    if (req.query.assetId) where.assetId = String(req.query.assetId);
    if (req.query.assignedToId) where.assignedToId = String(req.query.assignedToId);
    if (req.query.mine === 'true' && req.user) where.assignedToId = req.user.userId;

    const items = await prisma.gaWorkOrder.findMany({
      where,
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
      include: {
        asset: { select: { id: true, code: true, name: true } },
        _count: { select: { parts: true, photos: true } },
        parts: { select: { quantity: true, unitCost: true } },
      },
    });
    // Expose totalCost per WO di list juga (bukan cuma detail) supaya FE bisa
    // render KPI cards (Total Biaya Maintenance) & kolom biaya di tabel tanpa
    // N+1 request ke endpoint detail per baris.
    const withTotalCost = items.map(({ parts, ...wo }) => ({
      ...wo,
      totalCost: computeWorkOrderTotalCost(wo.laborCost, wo.externalCost, parts),
    }));
    return res.json(withTotalCost);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/maintenance/work-orders', 'Gagal mengambil work order.');
  }
});

const WO_LIST_INCLUDE = {
  asset: { select: { id: true, code: true, name: true } },
  _count: { select: { parts: true, photos: true } },
  parts: { select: { quantity: true, unitCost: true } },
} as const;

async function resolveUserNames(ids: Array<string | null>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, fullName: true } });
  return new Map(users.map((u) => [u.id, u.fullName]));
}

async function listWorkOrdersPaged(req: AuthRequest, res: Response) {
  const query = req.query as Record<string, unknown>;
  const { page, limit, skip } = parseListPaging(query, { defaultLimit: 25, maxLimit: 200 });
  const filter = buildWorkOrderWhere(query, { userId: req.user?.userId });
  if (!filter.ok) return res.status(400).json({ error: filter.error });
  const sortRaw = typeof query.sort === 'string' && query.sort.trim() ? query.sort : undefined;
  const sort = sortRaw ? parseSort(sortRaw, WO_SORT_FIELDS, { field: 'code', dir: 'desc' }) : null;

  const [items, total] = await prisma.$transaction([
    prisma.gaWorkOrder.findMany({
      where: filter.where,
      orderBy: workOrderOrderBy(sort),
      skip,
      take: limit,
      include: WO_LIST_INCLUDE,
    }),
    prisma.gaWorkOrder.count({ where: filter.where }),
  ]);
  const names = await resolveUserNames(items.map((wo) => wo.assignedToId));
  const data = items.map(({ parts, ...wo }) => ({
    ...wo,
    totalCost: computeWorkOrderTotalCost(wo.laborCost, wo.externalCost, parts),
    assignee: wo.assignedToId ? { id: wo.assignedToId, fullName: names.get(wo.assignedToId) ?? null } : null,
  }));
  return res.json({ data, total, page, limit });
}

// GET /work-orders/summary — KPI for the same filters as the paged list:
// { count, active, overdue, doneThisMonth, totalCost } (cost = labor +
// external + parts of every matching WO). Declared before '/work-orders/:id'.
router.get('/work-orders/summary', async (req: AuthRequest, res) => {
  try {
    const now = new Date();
    const filter = buildWorkOrderWhere(req.query as Record<string, unknown>, { userId: req.user?.userId, now });
    if (!filter.ok) return res.status(400).json({ error: filter.error });
    const wheres = workOrderSummaryWheres(filter.where, now);

    const [count, active, overdue, doneThisMonth, costs, parts] = await prisma.$transaction([
      prisma.gaWorkOrder.count({ where: filter.where }),
      prisma.gaWorkOrder.count({ where: wheres.active }),
      prisma.gaWorkOrder.count({ where: wheres.overdue }),
      prisma.gaWorkOrder.count({ where: wheres.doneThisMonth }),
      prisma.gaWorkOrder.aggregate({ where: filter.where, _sum: { laborCost: true, externalCost: true } }),
      prisma.gaWorkOrderPart.findMany({ where: { workOrder: filter.where }, select: { quantity: true, unitCost: true } }),
    ]);
    const totalCost = computeWorkOrderTotalCost(costs._sum.laborCost, costs._sum.externalCost, parts);
    return res.json({ count, active, overdue, doneThisMonth, totalCost });
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/maintenance/work-orders/summary', 'Gagal mengambil ringkasan work order.');
  }
});

// GET /work-orders/:id — detail with parts/photos/schedule + total cost
router.get('/work-orders/:id', async (req: AuthRequest, res) => {
  try {
    const wo = await prisma.gaWorkOrder.findUnique({
      where: { id: String(req.params.id) },
      include: {
        asset: { select: { id: true, code: true, name: true, picUserId: true } },
        schedule: true,
        photos: { orderBy: { createdAt: 'asc' } },
        parts: {
          include: {
            inventoryItem: { select: { sku: true, name: true, uom: true } },
            fromLocation: { select: { code: true, name: true } },
          },
        },
        materialRequests: {
          select: { id: true, code: true, status: true, createdAt: true, _count: { select: { items: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!wo) return res.status(404).json({ error: 'Work order tidak ditemukan.' });

    const totalCost = computeWorkOrderTotalCost(
      wo.laborCost,
      wo.externalCost,
      wo.parts.map((p) => ({ quantity: p.quantity, unitCost: p.unitCost })),
    );
    return res.json({ ...wo, totalCost });
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/maintenance/work-orders/:id', 'Gagal mengambil detail work order.');
  }
});

// POST /work-orders — create WO (corrective or preventive), auto code
router.post('/work-orders', async (req: AuthRequest, res) => {
  const input = validateBody(CreateWorkOrderSchema, req.body, res);
  if (!input) return;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const asset = await tx.gaAsset.findUnique({ where: { id: input.assetId }, select: { id: true } });
      if (!asset) throw new BusinessError('Aset tidak ditemukan.');

      if (input.scheduleId) {
        const schedule = await tx.gaMaintenanceSchedule.findUnique({
          where: { id: input.scheduleId },
          select: { id: true },
        });
        if (!schedule) throw new BusinessError('Jadwal maintenance tidak ditemukan.');
      }

      const code = await generateWorkOrderCode(tx);
      return tx.gaWorkOrder.create({
        data: {
          code,
          assetId: input.assetId,
          type: input.type,
          status: 'OPEN',
          priority: input.priority,
          title: input.title,
          description: input.description ?? null,
          component: input.component ?? null,
          reportedById: req.user!.userId,
          reportedAt: new Date(),
          scheduleId: input.scheduleId ?? null,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
        },
      });
    });

    return res.status(201).json({ id: created.id, code: created.code });
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/maintenance/work-orders', 'Gagal membuat work order.');
  }
});

// PATCH /work-orders/:id/assign — OPEN/ASSIGNED → ASSIGNED
router.patch('/work-orders/:id/assign', async (req: AuthRequest, res) => {
  const input = validateBody(AssignWoSchema, req.body, res);
  if (!input) return;

  try {
    const wo = await prisma.gaWorkOrder.findUnique({
      where: { id: String(req.params.id) },
      select: { id: true, status: true },
    });
    if (!wo) throw new BusinessError('Work order tidak ditemukan.');
    if (!['OPEN', 'ASSIGNED'].includes(wo.status)) {
      throw new BusinessError(`Tidak bisa assign dari status ${wo.status}.`);
    }

    const updated = await prisma.gaWorkOrder.update({
      where: { id: wo.id },
      data: {
        assignedToId: input.assignedToId,
        assignedAt: new Date(),
        assignedById: req.user!.userId,
        status: 'ASSIGNED',
        priority: input.priority ?? undefined,
      },
    });
    return res.json({ id: updated.id, status: updated.status });
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/maintenance/work-orders/:id/assign', 'Gagal assign work order.');
  }
});

// PATCH /work-orders/:id/start — ASSIGNED → IN_PROGRESS (assignee only)
router.patch('/work-orders/:id/start', async (req: AuthRequest, res) => {
  try {
    const wo = await prisma.gaWorkOrder.findUnique({
      where: { id: String(req.params.id) },
      select: { id: true, status: true, assignedToId: true },
    });
    if (!wo) throw new BusinessError('Work order tidak ditemukan.');
    if (wo.assignedToId !== req.user!.userId) {
      return res.status(403).json({ error: 'Hanya teknisi yang ditugaskan yang bisa mulai.' });
    }
    if (wo.status !== 'ASSIGNED') {
      throw new BusinessError(`Tidak bisa start dari status ${wo.status}.`);
    }

    const updated = await prisma.gaWorkOrder.update({
      where: { id: wo.id },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    });
    return res.json({ id: updated.id, status: updated.status });
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/maintenance/work-orders/:id/start', 'Gagal memulai work order.');
  }
});

// PATCH /work-orders/:id/complete — ASSIGNED/IN_PROGRESS → DONE (assignee only)
router.patch('/work-orders/:id/complete', async (req: AuthRequest, res) => {
  const input = validateBody(CompleteWoSchema, req.body, res);
  if (!input) return;

  try {
    const wo = await prisma.gaWorkOrder.findUnique({
      where: { id: String(req.params.id) },
      include: { schedule: true },
    });
    if (!wo) throw new BusinessError('Work order tidak ditemukan.');
    if (wo.assignedToId !== req.user!.userId) {
      return res.status(403).json({ error: 'Hanya teknisi yang ditugaskan yang bisa tandai selesai.' });
    }
    if (!['ASSIGNED', 'IN_PROGRESS'].includes(wo.status)) {
      throw new BusinessError(`Tidak bisa complete dari status ${wo.status}.`);
    }

    if (input.checklist) {
      const missing = input.checklist.filter((c) => c.required && !c.done);
      if (missing.length > 0) {
        throw new BusinessError(`Checklist wajib belum lengkap: ${missing.map((m) => m.label).join(', ')}`);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const completedAt = new Date();
      const wasLate = wo.dueAt ? completedAt > wo.dueAt : false;

      const result = await tx.gaWorkOrder.update({
        where: { id: wo.id },
        data: {
          status: 'DONE',
          completedAt,
          completedById: req.user!.userId,
          resolution: input.resolution ?? null,
          checklist: input.checklist
            ? (input.checklist as unknown as Prisma.InputJsonValue)
            : undefined,
          laborHours: input.laborHours != null ? new Prisma.Decimal(input.laborHours) : null,
          laborCost: input.laborCost != null ? new Prisma.Decimal(input.laborCost) : null,
          externalVendor: input.externalVendor ?? null,
          externalCost: input.externalCost != null ? new Prisma.Decimal(input.externalCost) : null,
          wasLate,
        },
      });

      // Roll forward the preventive schedule that produced this WO.
      if (wo.scheduleId && wo.schedule) {
        const nextDue = computeNextDue(
          completedAt,
          wo.schedule.intervalDays,
          wo.schedule.intervalHours,
        );
        await tx.gaMaintenanceSchedule.update({
          where: { id: wo.scheduleId },
          data: { lastDoneAt: completedAt, nextDueAt: nextDue },
        });
      }

      return result;
    });

    return res.json({ id: updated.id, status: updated.status });
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/maintenance/work-orders/:id/complete', 'Gagal menyelesaikan work order.');
  }
});

// PATCH /work-orders/:id/close — DONE → CLOSED
// Also mirrors the WO cost (laborCost + externalCost) into GaVehicleServiceLog, one per unique workOrderId,
// so vehicle cost totals include it; the log is created even when the cost is null, as service history.
router.patch('/work-orders/:id/close', async (req: AuthRequest, res) => {
  try {
    const wo = await prisma.gaWorkOrder.findUnique({
      where: { id: String(req.params.id) },
      select: {
        id: true,
        status: true,
        assetId: true,
        title: true,
        description: true,
        laborCost: true,
        externalCost: true,
        externalVendor: true,
        vehicleServiceReq: { select: { id: true, odometer: true, jenisService: true, serviceLogId: true } },
      },
    });
    if (!wo) throw new BusinessError('Work order tidak ditemukan.');
    if (wo.status !== 'DONE') {
      throw new BusinessError(`Tidak bisa close dari status ${wo.status}.`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const closed = await tx.gaWorkOrder.update({
        where: { id: wo.id },
        data: { status: 'CLOSED', closedAt: new Date(), closedById: req.user!.userId },
      });

      const existingLog = await tx.gaVehicleServiceLog.findUnique({ where: { workOrderId: wo.id } });
      if (!existingLog) {
        // Carries odometer / service type from the source service request and the vendor as bengkel.
        const log = await tx.gaVehicleServiceLog.create({
          data: buildWorkOrderServiceLogData(wo, closed.closedAt ?? new Date(), req.user!.userId),
        });
        const serviceReq = wo.vehicleServiceReq;
        if (serviceReq) {
          await bumpVehicleOdometer(tx, wo.assetId, serviceReq.odometer);
          if (!serviceReq.serviceLogId) {
            await tx.gaVehicleServiceRequest.update({ where: { id: serviceReq.id }, data: { serviceLogId: log.id } });
          }
        }
      }

      return closed;
    });

    return res.json({ id: updated.id, status: updated.status });
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/maintenance/work-orders/:id/close', 'Gagal menutup work order.');
  }
});

// PATCH /work-orders/:id/cancel — any non-terminal status → CANCELLED
router.patch('/work-orders/:id/cancel', async (req: AuthRequest, res) => {
  const input = validateBody(CancelWoSchema, req.body, res);
  if (!input) return;

  try {
    const wo = await prisma.gaWorkOrder.findUnique({
      where: { id: String(req.params.id) },
      select: { id: true, status: true },
    });
    if (!wo) throw new BusinessError('Work order tidak ditemukan.');
    if (['DONE', 'CLOSED', 'CANCELLED'].includes(wo.status)) {
      throw new BusinessError(`Tidak bisa cancel dari status ${wo.status}.`);
    }

    const updated = await prisma.gaWorkOrder.update({
      where: { id: wo.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: req.user!.userId,
        cancelReason: input.reason,
      },
    });
    return res.json({ id: updated.id, status: updated.status });
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/maintenance/work-orders/:id/cancel', 'Gagal membatalkan work order.');
  }
});

// POST /work-orders/:id/photos — upload BEFORE/AFTER photo (multer, max 6)
router.post('/work-orders/:id/photos', upload.single('photo'), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'File wajib diupload.' });
  const type = String(req.body.type || '').toUpperCase();
  if (!['BEFORE', 'AFTER'].includes(type)) {
    return res.status(400).json({ error: 'type harus BEFORE atau AFTER.' });
  }

  try {
    const wo = await prisma.gaWorkOrder.findUnique({
      where: { id: String(req.params.id) },
      select: {
        id: true,
        assignedToId: true,
        reportedById: true,
        photos: { select: { id: true } },
      },
    });
    if (!wo) return res.status(404).json({ error: 'Work order tidak ditemukan.' });

    if (wo.photos.length >= 6) {
      return res.status(400).json({ error: 'Maksimal 6 foto per work order.' });
    }

    const uid = req.user!.userId;
    if (wo.reportedById !== uid && wo.assignedToId !== uid) {
      return res.status(403).json({ error: 'Hanya pelapor atau teknisi yang bisa upload foto.' });
    }

    await fs.mkdir(WO_PHOTOS_DIR, { recursive: true });
    const ext = req.file.mimetype === 'image/png' ? '.png' : req.file.mimetype === 'image/webp' ? '.webp' : '.jpg';
    const name = `${crypto.randomUUID()}${ext}`;
    await fs.writeFile(path.join(WO_PHOTOS_DIR, name), req.file.buffer);

    const photo = await prisma.gaWorkOrderPhoto.create({
      data: {
        workOrderId: wo.id,
        filePath: `ga/workorders/${name}`,
        type: type as 'BEFORE' | 'AFTER',
        caption: (req.body.caption as string) || null,
      },
    });
    return res.status(201).json(photo);
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/maintenance/work-orders/:id/photos', 'Gagal upload foto.');
  }
});

// POST /work-orders/:id/parts — consume GA inventory inside a tx.
// Creates a GaInventoryMovement (OUT), decrements GaStockByLocation atomically,
// and links the movement to the new GaWorkOrderPart.
router.post('/work-orders/:id/parts', async (req: AuthRequest, res) => {
  const input = validateBody(PartInputSchema, req.body, res);
  if (!input) return;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const wo = await tx.gaWorkOrder.findUnique({
        where: { id: String(req.params.id) },
        select: { id: true, code: true, status: true },
      });
      if (!wo) throw new BusinessError('Work order tidak ditemukan.');
      if (['CLOSED', 'CANCELLED'].includes(wo.status)) {
        throw new BusinessError(`Tidak bisa menambah part pada WO berstatus ${wo.status}.`);
      }

      const item = await tx.gaInventoryItem.findUnique({
        where: { id: input.inventoryItemId },
        select: { id: true },
      });
      if (!item) throw new BusinessError('Item inventory tidak ditemukan.');

      let movementId: string | null = null;
      let warning: string | null = null;

      if (input.fromLocationId) {
        const qty = new Decimal(input.quantity);

        // Atomic upsert + decrement to avoid TOCTOU race (Postgres ON CONFLICT).
        const updated = await tx.$queryRaw<Array<{ quantity: Prisma.Decimal }>>`
          INSERT INTO "ga_stock_by_location" ("id", "item_id", "location_id", "quantity", "updated_at")
          VALUES (gen_random_uuid()::text, ${input.inventoryItemId}, ${input.fromLocationId}, -${qty.toString()}::numeric, NOW())
          ON CONFLICT ("item_id", "location_id")
          DO UPDATE SET "quantity" = "ga_stock_by_location"."quantity" - ${qty.toString()}::numeric, "updated_at" = NOW()
          RETURNING "quantity"
        `;

        const newQty = updated[0]?.quantity
          ? new Decimal(updated[0].quantity.toString())
          : new Decimal(0);
        if (newQty.lessThan(0)) {
          warning = `Stok tidak cukup untuk item ${input.inventoryItemId} (sisa ${newQty.toString()}). Tetap diizinkan (stok negatif).`;
          logger.warn({ workOrderId: wo.id, itemId: input.inventoryItemId, newQty: newQty.toString() }, 'WO part consumed below zero stock');
        }

        const movement = await tx.gaInventoryMovement.create({
          data: {
            itemId: input.inventoryItemId,
            type: 'OUT',
            quantity: qty.toNumber(),
            fromLocationId: input.fromLocationId,
            toLocationId: null,
            referenceNo: `MAINTENANCE_${wo.code}`,
            notes: `Pemakaian untuk WO ${wo.code}`,
            createdBy: req.user!.userId,
          },
        });
        movementId = movement.id;
      }

      const part = await tx.gaWorkOrderPart.create({
        data: {
          workOrderId: wo.id,
          inventoryItemId: input.inventoryItemId,
          fromLocationId: input.fromLocationId ?? null,
          quantity: new Prisma.Decimal(input.quantity),
          unitCost: new Prisma.Decimal(input.unitCost),
          inventoryMovementId: movementId,
        },
      });

      return { part, warning };
    });

    return res.status(201).json({ id: result.part.id, warning: result.warning });
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/maintenance/work-orders/:id/parts', 'Gagal mencatat pemakaian part.');
  }
});

export default router;
