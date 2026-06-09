// GA Vehicle — data kendaraan (1-1 per asset), service log, dan service request
// dengan flow approval. Di-mount di /api/ga/vehicle dengan requirePerm('ga_vehicle').
// Auth + RBAC ditangani di mount (index.ts), bukan di file ini.

import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AuthRequest } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { handleRouteError } from '../../utils/errors';
import { logger } from '../../lib/logger';

const router = Router();

// ── Zod schemas ──────────────────────────────────────────────────────
const VEHICLE_FUEL_TYPES = [
  'BENSIN', 'SOLAR', 'PERTAMAX', 'PERTALITE', 'DEX', 'LPG', 'LISTRIK', 'HYBRID', 'LAINNYA',
] as const;

const VEHICLE_SERVICE_TYPES = [
  'OLI', 'TUNE_UP', 'SERVIS_BERKALA', 'PERBAIKAN', 'GANTI_BAN', 'ELEKTRIKAL', 'AC', 'LAINNYA',
] as const;

const WORK_ORDER_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

const VehicleDataSchema = z.object({
  noPlat: z.string().max(20).optional().nullable(),
  brand: z.string().max(100).optional().nullable(),
  tipe: z.string().max(100).optional().nullable(),
  tahunProduksi: z.number().int().min(1900).max(2100).optional().nullable(),
  noMesin: z.string().max(100).optional().nullable(),
  noRangka: z.string().max(100).optional().nullable(),
  jenisBBM: z.enum(VEHICLE_FUEL_TYPES).optional().nullable(),
  kapasitasTangki: z.number().nonnegative().optional().nullable(),
  warna: z.string().max(50).optional().nullable(),
  odometerSaatBeli: z.number().int().nonnegative().optional().nullable(),
  odometerTerakhir: z.number().int().nonnegative().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const VehicleServiceLogSchema = z.object({
  tanggal: z.string().min(1, 'Tanggal wajib diisi.'),
  odometer: z.number().int().nonnegative().optional().nullable(),
  jenisService: z.enum(VEHICLE_SERVICE_TYPES),
  deskripsi: z.string().min(1).max(500),
  bengkel: z.string().max(200).optional().nullable(),
  biaya: z.number().nonnegative().optional().nullable(),
});

const VehicleServiceRequestSchema = z.object({
  jenisService: z.enum(VEHICLE_SERVICE_TYPES),
  odometer: z.number().int().nonnegative().optional().nullable(),
  deskripsi: z.string().min(1).max(1000),
  urgensi: z.enum(WORK_ORDER_PRIORITIES).default('MEDIUM'),
});

const RejectServiceRequestSchema = z.object({
  reason: z.string().min(1, 'Alasan wajib diisi.').max(500),
});

// ═══════════════════════════════════════════════════════════════════
// VEHICLE DATA (1-to-1 dengan Asset, scoped via /assets/:id)
// ═══════════════════════════════════════════════════════════════════

router.get('/assets/:id', async (req, res) => {
  try {
    const data = await prisma.gaVehicleData.findUnique({
      where: { assetId: String(req.params.id) },
    });
    return res.json(data ?? null);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/vehicle/assets/:id', 'Gagal mengambil data kendaraan.');
  }
});

router.put('/assets/:id', async (req, res) => {
  const input = validateBody(VehicleDataSchema, req.body, res);
  if (!input) return;

  const assetId = String(req.params.id);
  try {
    const baseData = {
      noPlat: input.noPlat ?? null,
      brand: input.brand ?? null,
      tipe: input.tipe ?? null,
      tahunProduksi: input.tahunProduksi ?? null,
      noMesin: input.noMesin ?? null,
      noRangka: input.noRangka ?? null,
      jenisBBM: input.jenisBBM ?? null,
      kapasitasTangki:
        input.kapasitasTangki != null ? new Prisma.Decimal(input.kapasitasTangki) : null,
      warna: input.warna ?? null,
      odometerSaatBeli: input.odometerSaatBeli ?? null,
      odometerTerakhir: input.odometerTerakhir ?? null,
      notes: input.notes ?? null,
    };

    const result = await prisma.gaVehicleData.upsert({
      where: { assetId },
      create: { assetId, ...baseData },
      update: baseData,
    });
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PUT /ga/vehicle/assets/:id', 'Gagal simpan data kendaraan.');
  }
});

// ═══════════════════════════════════════════════════════════════════
// SERVICE LOG (1-to-many, scoped via /assets/:id/services)
// ═══════════════════════════════════════════════════════════════════

router.get('/assets/:id/services', async (req, res) => {
  try {
    const logs = await prisma.gaVehicleServiceLog.findMany({
      where: { assetId: String(req.params.id) },
      orderBy: { tanggal: 'desc' },
      include: {
        workOrder: { select: { id: true, code: true } },
      },
    });
    return res.json(logs);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/vehicle/assets/:id/services', 'Gagal mengambil service log.');
  }
});

router.post('/assets/:id/services', async (req: AuthRequest, res) => {
  const input = validateBody(VehicleServiceLogSchema, req.body, res);
  if (!input) return;

  const assetId = String(req.params.id);
  try {
    const created = await prisma.gaVehicleServiceLog.create({
      data: {
        assetId,
        tanggal: new Date(input.tanggal),
        odometer: input.odometer ?? null,
        jenisService: input.jenisService,
        deskripsi: input.deskripsi,
        bengkel: input.bengkel ?? null,
        biaya: input.biaya != null ? new Prisma.Decimal(input.biaya) : null,
        createdById: req.user!.userId,
      },
    });

    // Auto-update odometer terakhir on GaVehicleData if greater
    if (input.odometer != null) {
      const vd = await prisma.gaVehicleData.findUnique({ where: { assetId } });
      if (vd && (vd.odometerTerakhir == null || input.odometer > vd.odometerTerakhir)) {
        await prisma.gaVehicleData.update({
          where: { assetId },
          data: { odometerTerakhir: input.odometer },
        });
      }
    }

    return res.status(201).json(created);
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/vehicle/assets/:id/services', 'Gagal simpan service log.');
  }
});

router.patch('/assets/:id/services/:sid', async (req, res) => {
  const input = validateBody(VehicleServiceLogSchema.partial(), req.body, res);
  if (!input) return;

  try {
    const data: Prisma.GaVehicleServiceLogUpdateInput = {};
    if (input.tanggal) data.tanggal = new Date(input.tanggal);
    if (input.odometer !== undefined) data.odometer = input.odometer ?? null;
    if (input.jenisService) data.jenisService = input.jenisService;
    if (input.deskripsi) data.deskripsi = input.deskripsi;
    if (input.bengkel !== undefined) data.bengkel = input.bengkel ?? null;
    if (input.biaya !== undefined) {
      data.biaya = input.biaya != null ? new Prisma.Decimal(input.biaya) : null;
    }

    const updated = await prisma.gaVehicleServiceLog.update({
      where: { id: String(req.params.sid) },
      data,
    });
    return res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/vehicle/assets/:id/services/:sid', 'Gagal update service log.');
  }
});

router.delete('/assets/:id/services/:sid', async (req, res) => {
  try {
    await prisma.gaVehicleServiceLog.delete({ where: { id: String(req.params.sid) } });
    return res.status(204).end();
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /ga/vehicle/assets/:id/services/:sid', 'Gagal hapus service log.');
  }
});

// ═══════════════════════════════════════════════════════════════════
// SERVICE REQUEST (Pengajuan service dengan flow approval)
// ═══════════════════════════════════════════════════════════════════

// Submit pengajuan
router.post('/assets/:id/service-requests', async (req: AuthRequest, res) => {
  const input = validateBody(VehicleServiceRequestSchema, req.body, res);
  if (!input) return;

  const assetId = String(req.params.id);
  try {
    const created = await prisma.gaVehicleServiceRequest.create({
      data: {
        assetId,
        requestedById: req.user!.userId,
        jenisService: input.jenisService,
        odometer: input.odometer ?? null,
        deskripsi: input.deskripsi,
        urgensi: input.urgensi,
        status: 'SUBMITTED',
      },
    });
    return res.status(201).json({ id: created.id, status: created.status });
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/vehicle/assets/:id/service-requests', 'Gagal mengirim pengajuan.');
  }
});

// List service requests (admin view)
router.get('/service-requests', async (req: AuthRequest, res) => {
  try {
    const where: Prisma.GaVehicleServiceRequestWhereInput = {};
    if (req.query.status) where.status = req.query.status as never;
    if (req.query.assetId) where.assetId = String(req.query.assetId);
    if (req.query.mine === 'true' && req.user) {
      where.requestedById = req.user.userId;
    }

    const items = await prisma.gaVehicleServiceRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { urgensi: 'desc' }, { createdAt: 'desc' }],
      include: {
        asset: { select: { id: true, code: true, name: true } },
        workOrder: { select: { id: true, code: true, status: true } },
      },
    });
    return res.json(items);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/vehicle/service-requests', 'Gagal mengambil pengajuan.');
  }
});

router.get('/service-requests/:id', async (req, res) => {
  try {
    const item = await prisma.gaVehicleServiceRequest.findUnique({
      where: { id: String(req.params.id) },
      include: {
        asset: {
          select: {
            id: true,
            code: true,
            name: true,
            vehicleData: { select: { noPlat: true, brand: true, tipe: true } },
          },
        },
        workOrder: true,
        serviceLog: true,
      },
    });
    if (!item) return res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });
    return res.json(item);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/vehicle/service-requests/:id', 'Gagal mengambil pengajuan.');
  }
});

// Approve
router.patch('/service-requests/:id/approve', async (req: AuthRequest, res) => {
  try {
    const sr = await prisma.gaVehicleServiceRequest.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!sr) return res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });
    if (sr.status !== 'SUBMITTED') {
      return res.status(400).json({ error: `Tidak bisa approve dari status ${sr.status}.` });
    }

    const updated = await prisma.gaVehicleServiceRequest.update({
      where: { id: sr.id },
      data: {
        status: 'APPROVED',
        approvedById: req.user!.userId,
        approvedAt: new Date(),
      },
    });
    return res.json({ id: updated.id, status: updated.status });
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/vehicle/service-requests/:id/approve', 'Gagal approve.');
  }
});

// Reject
router.patch('/service-requests/:id/reject', async (req: AuthRequest, res) => {
  const input = validateBody(RejectServiceRequestSchema, req.body, res);
  if (!input) return;

  try {
    const sr = await prisma.gaVehicleServiceRequest.findUnique({
      where: { id: String(req.params.id) },
      select: { id: true, status: true, requestedById: true },
    });
    if (!sr) return res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });
    if (sr.status !== 'SUBMITTED') {
      return res.status(400).json({ error: `Tidak bisa reject dari status ${sr.status}.` });
    }

    const updated = await prisma.gaVehicleServiceRequest.update({
      where: { id: sr.id },
      data: {
        status: 'REJECTED',
        approvedById: req.user!.userId,
        approvedAt: new Date(),
        rejectedReason: input.reason,
      },
    });
    return res.json({ id: updated.id, status: updated.status });
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/vehicle/service-requests/:id/reject', 'Gagal reject.');
  }
});

// Cancel oleh requester (selama masih SUBMITTED)
router.patch('/service-requests/:id/cancel', async (req: AuthRequest, res) => {
  try {
    const sr = await prisma.gaVehicleServiceRequest.findUnique({
      where: { id: String(req.params.id) },
      select: { id: true, status: true, requestedById: true },
    });
    if (!sr) return res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });
    if (sr.requestedById !== req.user!.userId) {
      return res.status(403).json({ error: 'Hanya pengaju yang bisa membatalkan.' });
    }
    if (sr.status !== 'SUBMITTED') {
      return res.status(400).json({ error: `Tidak bisa cancel dari status ${sr.status}.` });
    }

    const updated = await prisma.gaVehicleServiceRequest.update({
      where: { id: sr.id },
      data: { status: 'CANCELLED' },
    });
    return res.json({ id: updated.id, status: updated.status });
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/vehicle/service-requests/:id/cancel', 'Gagal cancel.');
  }
});

export default router;
