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

// ── Fleet management schemas ─────────────────────────────────────────
const VEHICLE_TAX_TYPES = ['STNK_TAHUNAN', 'STNK_5_TAHUNAN', 'KIR', 'PAJAK_KENDARAAN'] as const;
const VEHICLE_TAX_STATUSES = ['ACTIVE', 'EXPIRED', 'IN_PROCESS'] as const;
const VEHICLE_INSURANCE_TYPES = ['ALL_RISK', 'TLO', 'KECELAKAAN_DIRI', 'LAINNYA'] as const;
const VEHICLE_INSURANCE_STATUSES = ['ACTIVE', 'EXPIRED', 'CANCELLED'] as const;
const VEHICLE_INSPECTION_RESULTS = ['BAIK', 'PERLU_PERHATIAN', 'TIDAK_LAYAK'] as const;
const VEHICLE_INCIDENT_SEVERITIES = ['RINGAN', 'SEDANG', 'BERAT'] as const;
const VEHICLE_INCIDENT_STATUSES = ['DILAPORKAN', 'DALAM_PROSES', 'SELESAI', 'KLAIM_ASURANSI'] as const;

const DriverAssignSchema = z.object({
  picUserId: z.string().min(1).optional().nullable(),
});

const VehicleTaxSchema = z.object({
  type: z.enum(VEHICLE_TAX_TYPES),
  periodYear: z.number().int().min(2000).max(2100),
  amount: z.number().nonnegative().optional().nullable(),
  paidAt: z.string().optional().nullable(),
  dueDate: z.string().min(1, 'Jatuh tempo wajib diisi.'),
  status: z.enum(VEHICLE_TAX_STATUSES).default('ACTIVE'),
  documentId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const VehicleInsuranceSchema = z.object({
  type: z.enum(VEHICLE_INSURANCE_TYPES),
  provider: z.string().min(1).max(200),
  policyNumber: z.string().max(100).optional().nullable(),
  premium: z.number().nonnegative().optional().nullable(),
  coverageValue: z.number().nonnegative().optional().nullable(),
  startDate: z.string().min(1, 'Tanggal mulai wajib diisi.'),
  endDate: z.string().min(1, 'Tanggal berakhir wajib diisi.'),
  status: z.enum(VEHICLE_INSURANCE_STATUSES).default('ACTIVE'),
  documentId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const VehicleFuelLogSchema = z.object({
  tanggal: z.string().min(1, 'Tanggal wajib diisi.'),
  odometer: z.number().int().nonnegative().optional().nullable(),
  liters: z.number().positive('Liter harus lebih dari 0.'),
  pricePerLiter: z.number().nonnegative().optional().nullable(),
  totalCost: z.number().nonnegative(),
  spbu: z.string().max(200).optional().nullable(),
  driverName: z.string().max(100).optional().nullable(),
  notes: z.string().optional().nullable(),
});

const VEHICLE_INSPECTION_CHECKPOINTS = [
  'ban', 'rem', 'oli', 'lampu', 'klakson', 'wiper', 'kaca_spion', 'sabuk_pengaman',
  'ac', 'aki', 'radiator', 'kelengkapan_p3k_apar',
] as const;

const VehicleInspectionSchema = z.object({
  tanggal: z.string().min(1, 'Tanggal wajib diisi.'),
  odometer: z.number().int().nonnegative().optional().nullable(),
  checklist: z.record(z.string(), z.enum(['OK', 'PERLU_PERHATIAN', 'RUSAK'])),
  overallResult: z.enum(VEHICLE_INSPECTION_RESULTS),
  notes: z.string().optional().nullable(),
});

const VehicleIncidentSchema = z.object({
  tanggal: z.string().min(1, 'Tanggal wajib diisi.'),
  location: z.string().max(300).optional().nullable(),
  driverName: z.string().max(100).optional().nullable(),
  description: z.string().min(1).max(2000),
  severity: z.enum(VEHICLE_INCIDENT_SEVERITIES),
  status: z.enum(VEHICLE_INCIDENT_STATUSES).default('DILAPORKAN'),
  estimatedCost: z.number().nonnegative().optional().nullable(),
  actualCost: z.number().nonnegative().optional().nullable(),
  insuranceClaimNo: z.string().max(100).optional().nullable(),
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

// ═══════════════════════════════════════════════════════════════════
// DRIVER ASSIGNMENT (pakai GaAsset.picUserId yang sudah ada -- scoped
// ke sini karena 'siapa driver kendaraan ini' adalah konsep vehicle,
// meskipun field-nya generic di GaAsset)
// ═══════════════════════════════════════════════════════════════════

router.patch('/assets/:id/driver', async (req: AuthRequest, res) => {
  const input = validateBody(DriverAssignSchema, req.body, res);
  if (!input) return;

  const assetId = String(req.params.id);
  try {
    const updated = await prisma.gaAsset.update({
      where: { id: assetId },
      data: { picUserId: input.picUserId ?? null },
      select: { id: true, picUserId: true },
    });
    let picName: string | null = null;
    if (updated.picUserId) {
      const u = await prisma.user.findUnique({ where: { id: updated.picUserId }, select: { fullName: true } });
      picName = u?.fullName ?? null;
    }
    return res.json({ id: updated.id, picUserId: updated.picUserId, picName });
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/vehicle/assets/:id/driver', 'Gagal menugaskan driver.');
  }
});

// ═══════════════════════════════════════════════════════════════════
// PAJAK / STNK / KIR (1-to-many, histori per tahun)
// ═══════════════════════════════════════════════════════════════════

router.get('/assets/:id/taxes', async (req, res) => {
  try {
    const items = await prisma.gaVehicleTax.findMany({
      where: { assetId: String(req.params.id) },
      orderBy: { dueDate: 'desc' },
      include: { document: { select: { id: true, code: true, title: true } } },
    });
    return res.json(items);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/vehicle/assets/:id/taxes', 'Gagal mengambil data pajak.');
  }
});

router.post('/assets/:id/taxes', async (req: AuthRequest, res) => {
  const input = validateBody(VehicleTaxSchema, req.body, res);
  if (!input) return;
  try {
    const created = await prisma.gaVehicleTax.create({
      data: {
        assetId: String(req.params.id),
        type: input.type,
        periodYear: input.periodYear,
        amount: input.amount != null ? new Prisma.Decimal(input.amount) : null,
        paidAt: input.paidAt ? new Date(input.paidAt) : null,
        dueDate: new Date(input.dueDate),
        status: input.status,
        documentId: input.documentId ?? null,
        notes: input.notes ?? null,
        createdById: req.user!.userId,
      },
    });
    return res.status(201).json(created);
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/vehicle/assets/:id/taxes', 'Gagal simpan data pajak.');
  }
});

router.patch('/assets/:id/taxes/:tid', async (req, res) => {
  const input = validateBody(VehicleTaxSchema.partial(), req.body, res);
  if (!input) return;
  try {
    const data: Prisma.GaVehicleTaxUpdateInput = {};
    if (input.type) data.type = input.type;
    if (input.periodYear !== undefined) data.periodYear = input.periodYear;
    if (input.amount !== undefined) data.amount = input.amount != null ? new Prisma.Decimal(input.amount) : null;
    if (input.paidAt !== undefined) data.paidAt = input.paidAt ? new Date(input.paidAt) : null;
    if (input.dueDate) data.dueDate = new Date(input.dueDate);
    if (input.status) data.status = input.status;
    if (input.documentId !== undefined) data.document = input.documentId ? { connect: { id: input.documentId } } : { disconnect: true };
    if (input.notes !== undefined) data.notes = input.notes ?? null;

    const updated = await prisma.gaVehicleTax.update({ where: { id: String(req.params.tid) }, data });
    return res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/vehicle/assets/:id/taxes/:tid', 'Gagal update data pajak.');
  }
});

router.delete('/assets/:id/taxes/:tid', async (req, res) => {
  try {
    await prisma.gaVehicleTax.delete({ where: { id: String(req.params.tid) } });
    return res.status(204).end();
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /ga/vehicle/assets/:id/taxes/:tid', 'Gagal hapus data pajak.');
  }
});

// ═══════════════════════════════════════════════════════════════════
// ASURANSI (1-to-many, histori polis)
// ═══════════════════════════════════════════════════════════════════

router.get('/assets/:id/insurances', async (req, res) => {
  try {
    const items = await prisma.gaVehicleInsurance.findMany({
      where: { assetId: String(req.params.id) },
      orderBy: { endDate: 'desc' },
      include: { document: { select: { id: true, code: true, title: true } } },
    });
    return res.json(items);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/vehicle/assets/:id/insurances', 'Gagal mengambil data asuransi.');
  }
});

router.post('/assets/:id/insurances', async (req: AuthRequest, res) => {
  const input = validateBody(VehicleInsuranceSchema, req.body, res);
  if (!input) return;
  try {
    const created = await prisma.gaVehicleInsurance.create({
      data: {
        assetId: String(req.params.id),
        type: input.type,
        provider: input.provider,
        policyNumber: input.policyNumber ?? null,
        premium: input.premium != null ? new Prisma.Decimal(input.premium) : null,
        coverageValue: input.coverageValue != null ? new Prisma.Decimal(input.coverageValue) : null,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        status: input.status,
        documentId: input.documentId ?? null,
        notes: input.notes ?? null,
        createdById: req.user!.userId,
      },
    });
    return res.status(201).json(created);
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/vehicle/assets/:id/insurances', 'Gagal simpan data asuransi.');
  }
});

router.patch('/assets/:id/insurances/:iid', async (req, res) => {
  const input = validateBody(VehicleInsuranceSchema.partial(), req.body, res);
  if (!input) return;
  try {
    const data: Prisma.GaVehicleInsuranceUpdateInput = {};
    if (input.type) data.type = input.type;
    if (input.provider) data.provider = input.provider;
    if (input.policyNumber !== undefined) data.policyNumber = input.policyNumber ?? null;
    if (input.premium !== undefined) data.premium = input.premium != null ? new Prisma.Decimal(input.premium) : null;
    if (input.coverageValue !== undefined) data.coverageValue = input.coverageValue != null ? new Prisma.Decimal(input.coverageValue) : null;
    if (input.startDate) data.startDate = new Date(input.startDate);
    if (input.endDate) data.endDate = new Date(input.endDate);
    if (input.status) data.status = input.status;
    if (input.documentId !== undefined) data.document = input.documentId ? { connect: { id: input.documentId } } : { disconnect: true };
    if (input.notes !== undefined) data.notes = input.notes ?? null;

    const updated = await prisma.gaVehicleInsurance.update({ where: { id: String(req.params.iid) }, data });
    return res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/vehicle/assets/:id/insurances/:iid', 'Gagal update data asuransi.');
  }
});

router.delete('/assets/:id/insurances/:iid', async (req, res) => {
  try {
    await prisma.gaVehicleInsurance.delete({ where: { id: String(req.params.iid) } });
    return res.status(204).end();
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /ga/vehicle/assets/:id/insurances/:iid', 'Gagal hapus data asuransi.');
  }
});

// ═══════════════════════════════════════════════════════════════════
// LOG BBM (1-to-many, per pengisian)
// ═══════════════════════════════════════════════════════════════════

router.get('/assets/:id/fuel-logs', async (req, res) => {
  try {
    const items = await prisma.gaVehicleFuelLog.findMany({
      where: { assetId: String(req.params.id) },
      orderBy: { tanggal: 'desc' },
    });
    return res.json(items);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/vehicle/assets/:id/fuel-logs', 'Gagal mengambil log BBM.');
  }
});

router.post('/assets/:id/fuel-logs', async (req: AuthRequest, res) => {
  const input = validateBody(VehicleFuelLogSchema, req.body, res);
  if (!input) return;
  const assetId = String(req.params.id);
  try {
    const created = await prisma.gaVehicleFuelLog.create({
      data: {
        assetId,
        tanggal: new Date(input.tanggal),
        odometer: input.odometer ?? null,
        liters: new Prisma.Decimal(input.liters),
        pricePerLiter: input.pricePerLiter != null ? new Prisma.Decimal(input.pricePerLiter) : null,
        totalCost: new Prisma.Decimal(input.totalCost),
        spbu: input.spbu ?? null,
        driverName: input.driverName ?? null,
        notes: input.notes ?? null,
        createdById: req.user!.userId,
      },
    });

    // Sinkron dengan pola service log: update odometer terakhir kalau lebih besar.
    if (input.odometer != null) {
      const vd = await prisma.gaVehicleData.findUnique({ where: { assetId } });
      if (vd && (vd.odometerTerakhir == null || input.odometer > vd.odometerTerakhir)) {
        await prisma.gaVehicleData.update({ where: { assetId }, data: { odometerTerakhir: input.odometer } });
      }
    }

    return res.status(201).json(created);
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/vehicle/assets/:id/fuel-logs', 'Gagal simpan log BBM.');
  }
});

router.delete('/assets/:id/fuel-logs/:fid', async (req, res) => {
  try {
    await prisma.gaVehicleFuelLog.delete({ where: { id: String(req.params.fid) } });
    return res.status(204).end();
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /ga/vehicle/assets/:id/fuel-logs/:fid', 'Gagal hapus log BBM.');
  }
});

// ═══════════════════════════════════════════════════════════════════
// INSPEKSI BERKALA (checklist ban/rem/oli/dll, beda dari service log)
// ═══════════════════════════════════════════════════════════════════

router.get('/inspection-checkpoints', async (_req, res) => {
  return res.json(VEHICLE_INSPECTION_CHECKPOINTS);
});

router.get('/assets/:id/inspections', async (req, res) => {
  try {
    const items = await prisma.gaVehicleInspection.findMany({
      where: { assetId: String(req.params.id) },
      orderBy: { tanggal: 'desc' },
    });
    return res.json(items);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/vehicle/assets/:id/inspections', 'Gagal mengambil data inspeksi.');
  }
});

router.post('/assets/:id/inspections', async (req: AuthRequest, res) => {
  const input = validateBody(VehicleInspectionSchema, req.body, res);
  if (!input) return;
  try {
    const created = await prisma.gaVehicleInspection.create({
      data: {
        assetId: String(req.params.id),
        tanggal: new Date(input.tanggal),
        odometer: input.odometer ?? null,
        checklist: input.checklist,
        overallResult: input.overallResult,
        notes: input.notes ?? null,
        inspectedById: req.user!.userId,
      },
    });
    return res.status(201).json(created);
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/vehicle/assets/:id/inspections', 'Gagal simpan data inspeksi.');
  }
});

router.delete('/assets/:id/inspections/:iid', async (req, res) => {
  try {
    await prisma.gaVehicleInspection.delete({ where: { id: String(req.params.iid) } });
    return res.status(204).end();
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /ga/vehicle/assets/:id/inspections/:iid', 'Gagal hapus data inspeksi.');
  }
});

// ═══════════════════════════════════════════════════════════════════
// INSIDEN / KECELAKAAN
// ═══════════════════════════════════════════════════════════════════

router.get('/assets/:id/incidents', async (req, res) => {
  try {
    const items = await prisma.gaVehicleIncident.findMany({
      where: { assetId: String(req.params.id) },
      orderBy: { tanggal: 'desc' },
    });
    return res.json(items);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/vehicle/assets/:id/incidents', 'Gagal mengambil data insiden.');
  }
});

router.post('/assets/:id/incidents', async (req: AuthRequest, res) => {
  const input = validateBody(VehicleIncidentSchema, req.body, res);
  if (!input) return;
  try {
    const created = await prisma.gaVehicleIncident.create({
      data: {
        assetId: String(req.params.id),
        tanggal: new Date(input.tanggal),
        location: input.location ?? null,
        driverName: input.driverName ?? null,
        description: input.description,
        severity: input.severity,
        status: input.status,
        estimatedCost: input.estimatedCost != null ? new Prisma.Decimal(input.estimatedCost) : null,
        actualCost: input.actualCost != null ? new Prisma.Decimal(input.actualCost) : null,
        insuranceClaimNo: input.insuranceClaimNo ?? null,
        reportedById: req.user!.userId,
      },
    });
    return res.status(201).json(created);
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/vehicle/assets/:id/incidents', 'Gagal simpan data insiden.');
  }
});

router.patch('/assets/:id/incidents/:iid', async (req, res) => {
  const input = validateBody(VehicleIncidentSchema.partial(), req.body, res);
  if (!input) return;
  try {
    const data: Prisma.GaVehicleIncidentUpdateInput = {};
    if (input.tanggal) data.tanggal = new Date(input.tanggal);
    if (input.location !== undefined) data.location = input.location ?? null;
    if (input.driverName !== undefined) data.driverName = input.driverName ?? null;
    if (input.description) data.description = input.description;
    if (input.severity) data.severity = input.severity;
    if (input.status) data.status = input.status;
    if (input.estimatedCost !== undefined) data.estimatedCost = input.estimatedCost != null ? new Prisma.Decimal(input.estimatedCost) : null;
    if (input.actualCost !== undefined) data.actualCost = input.actualCost != null ? new Prisma.Decimal(input.actualCost) : null;
    if (input.insuranceClaimNo !== undefined) data.insuranceClaimNo = input.insuranceClaimNo ?? null;

    const updated = await prisma.gaVehicleIncident.update({ where: { id: String(req.params.iid) }, data });
    return res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/vehicle/assets/:id/incidents/:iid', 'Gagal update data insiden.');
  }
});

router.delete('/assets/:id/incidents/:iid', async (req, res) => {
  try {
    await prisma.gaVehicleIncident.delete({ where: { id: String(req.params.iid) } });
    return res.status(204).end();
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /ga/vehicle/assets/:id/incidents/:iid', 'Gagal hapus data insiden.');
  }
});

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD ARMADA — ringkasan lintas-kendaraan (bukan per-asset)
// ═══════════════════════════════════════════════════════════════════

router.get('/fleet-summary', async (req: AuthRequest, res) => {
  try {
    const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;
    const assetWhere: Prisma.GaAssetWhereInput = categoryId ? { categoryId } : {};
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 3600 * 1000); // 30 hari ke depan
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalVehicles, taxExpiringSoon, taxExpired, insuranceExpiringSoon, insuranceExpired,
      openIncidents, serviceThisMonth, fuelThisMonth] = await Promise.all([
      prisma.gaAsset.count({ where: assetWhere }),
      prisma.gaVehicleTax.count({ where: { status: 'ACTIVE', dueDate: { gte: now, lte: soon } } }),
      prisma.gaVehicleTax.count({ where: { status: 'ACTIVE', dueDate: { lt: now } } }),
      prisma.gaVehicleInsurance.count({ where: { status: 'ACTIVE', endDate: { gte: now, lte: soon } } }),
      prisma.gaVehicleInsurance.count({ where: { status: 'ACTIVE', endDate: { lt: now } } }),
      prisma.gaVehicleIncident.count({ where: { status: { in: ['DILAPORKAN', 'DALAM_PROSES'] } } }),
      prisma.gaVehicleServiceLog.aggregate({ where: { tanggal: { gte: monthStart } }, _sum: { biaya: true } }),
      prisma.gaVehicleFuelLog.aggregate({ where: { tanggal: { gte: monthStart } }, _sum: { totalCost: true } }),
    ]);

    return res.json({
      totalVehicles,
      taxExpiringSoon,
      taxExpired,
      insuranceExpiringSoon,
      insuranceExpired,
      openIncidents,
      serviceCostThisMonth: Number(serviceThisMonth._sum.biaya ?? 0),
      fuelCostThisMonth: Number(fuelThisMonth._sum.totalCost ?? 0),
    });
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/vehicle/fleet-summary', 'Gagal mengambil ringkasan armada.');
  }
});

export default router;
