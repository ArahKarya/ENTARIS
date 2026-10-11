// GA vehicles: vehicle data (1-1 per asset), service log and service requests with approval.
// Mounted with requirePerm('ga_vehicle') in index.ts.

import { Router } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { parseCategoryKind, resolveCategoryIds } from '../../services/gaCategoryKind';
import { AuthRequest } from '../../middleware/auth';
import { postVehicleServiceJournalInTx, cancelVehicleServiceJournalInTx } from '../../services/gaVehicleServiceJournal';
import {
  buildFleetRows,
  filterFleetRows,
  pageFleetRows,
  parseFleetFilters,
  parseFleetSort,
  sortFleetRows,
} from '../../services/gaFleetList';
import { dueBoundaries } from '../../services/projectGuaranteeList';
import { bumpVehicleOdometer } from '../../services/gaVehicleOdometer';
import { effectiveTaxCost } from '../../services/gaVehicleTaxCost';
import { parseListPaging } from '../../utils/listQuery';
import { validateBody } from '../../utils/validate';
import { handleRouteError, BusinessError } from '../../utils/errors';

const router = Router();

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || './uploads');
const INSPECTION_PHOTOS_DIR = path.join(UPLOADS_DIR, 'ga', 'inspections');

// Upload foto inspeksi — pola sama dgn foto aset (memory storage, 5MB, image only).
const inspectionPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// Zod schemas
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
  // Integrasi GL: kalau true, sistem membuat jurnal DR beban / CR kas-bank
  postJournal: z.boolean().optional(),
  accountId: z.string().uuid().optional().nullable(),
  creditAccountId: z.string().uuid().optional().nullable(),
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

// Fleet management schemas
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

const VehicleTaxRequestSchema = z.object({
  type: z.enum(VEHICLE_TAX_TYPES),
  periodYear: z.number().int().min(2000).max(2100),
  estimatedAmount: z.number().nonnegative().optional().nullable(),
  dueDate: z.string().min(1, 'Jatuh tempo wajib diisi.'),
  deskripsi: z.string().max(1000).optional().nullable(),
  urgensi: z.enum(WORK_ORDER_PRIORITIES).default('MEDIUM'),
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

// Inspeksi berkala: checklist detail per kategori
// Struktur baru = kategori + sub-item. Key sub-item tetap flat di JSON
// `checklist` (Record<string, 'OK'|'PERLU_PERHATIAN'|'RUSAK'>) supaya data
// inspeksi LAMA (12 checkpoint datar) tetap terbaca tanpa migrasi data.
const VEHICLE_INSPECTION_CATEGORIES = [
  {
    key: 'mesin',
    label: 'Mesin & Cairan',
    items: [
      { key: 'oli_mesin', label: 'Oli Mesin' },
      { key: 'oli_rem', label: 'Oli Rem' },
      { key: 'air_radiator', label: 'Air Radiator / Coolant' },
      { key: 'air_aki', label: 'Air Aki' },
      { key: 'air_wiper', label: 'Air Wiper' },
    ],
  },
  {
    key: 'kelistrikan',
    label: 'Kelistrikan',
    items: [
      { key: 'lampu_depan', label: 'Lampu Depan' },
      { key: 'lampu_belakang', label: 'Lampu Belakang' },
      { key: 'lampu_sein', label: 'Lampu Sein' },
      { key: 'lampu_rem', label: 'Lampu Rem' },
      { key: 'lampu_mundur', label: 'Lampu Mundur' },
      { key: 'klakson', label: 'Klakson' },
    ],
  },
  {
    key: 'rem_kemudi',
    label: 'Rem & Kemudi',
    items: [
      { key: 'rem_depan', label: 'Rem Depan' },
      { key: 'rem_belakang', label: 'Rem Belakang' },
      { key: 'rem_tangan', label: 'Rem Tangan' },
      { key: 'kemudi_suspensi', label: 'Kemudi / Suspensi' },
    ],
  },
  {
    key: 'ban_roda',
    label: 'Ban & Roda',
    items: [
      { key: 'ban_depan', label: 'Ban Depan' },
      { key: 'ban_belakang', label: 'Ban Belakang' },
      { key: 'ban_serep', label: 'Ban Serep' },
      { key: 'tekanan_ban', label: 'Tekanan Ban' },
      { key: 'velg', label: 'Velg' },
    ],
  },
  {
    key: 'keselamatan',
    label: 'Keselamatan',
    items: [
      { key: 'sabuk_pengaman', label: 'Sabuk Pengaman' },
      { key: 'p3k', label: 'P3K' },
      { key: 'apar', label: 'APAR' },
      { key: 'segitiga_pengaman', label: 'Segitiga Pengaman' },
      { key: 'dongkrak', label: 'Dongkrak' },
      { key: 'kunci_roda', label: 'Kunci Roda' },
    ],
  },
  {
    key: 'lain',
    label: 'Lain-lain',
    items: [
      { key: 'kaca_spion', label: 'Kaca Spion' },
      { key: 'kaca_depan', label: 'Kaca Depan' },
      { key: 'kaca_belakang', label: 'Kaca Belakang' },
      { key: 'wiper', label: 'Wiper' },
      { key: 'ac', label: 'AC' },
      { key: 'body_cat', label: 'Body / Cat' },
      { key: 'dashboard_indikator', label: 'Dashboard / Indikator' },
    ],
  },
] as const;

const VEHICLE_INSPECTION_CATEGORY_KEYS = VEHICLE_INSPECTION_CATEGORIES.map((c) => c.key) as unknown as string[];

// Checkpoint format LAMA (12 item datar) — dipertahankan supaya riwayat inspeksi
// lama tetap punya label yang benar di FE. Endpoint checkpoints legacy tetap ada.
const VEHICLE_INSPECTION_CHECKPOINTS = [
  'ban', 'rem', 'oli', 'lampu', 'klakson', 'wiper', 'kaca_spion', 'sabuk_pengaman',
  'ac', 'aki', 'radiator', 'kelengkapan_p3k_apar',
] as const;

const VEHICLE_FUEL_LEVELS = ['KOSONG', 'SEPEREMPAT', 'SETENGAH', 'TIGA_PEREMPAT', 'PENUH'] as const;

/** Interval default jadwal inspeksi berikutnya (hari). */
const INSPECTION_DEFAULT_INTERVAL_DAYS = 30;

const VehicleInspectionSchema = z.object({
  tanggal: z.string().min(1, 'Tanggal wajib diisi.'),
  odometer: z.number().int().nonnegative().optional().nullable(),
  checklist: z.record(z.string(), z.enum(['OK', 'PERLU_PERHATIAN', 'RUSAK'])),
  overallResult: z.enum(VEHICLE_INSPECTION_RESULTS),
  notes: z.string().optional().nullable(),
  inspectorName: z.string().max(150).optional().nullable(),
  inspectorUserId: z.string().max(100).optional().nullable(),
  fuelLevel: z.enum(VEHICLE_FUEL_LEVELS).optional().nullable(),
  nextDueDate: z.string().optional().nullable(),
  intervalDays: z.number().int().min(1).max(730).optional().nullable(),
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

// Tire & Oil schemas
const TIRE_POSITIONS = [
  'DEPAN_KIRI', 'DEPAN_KANAN', 'BELAKANG_KIRI', 'BELAKANG_KANAN',
  'BELAKANG_KIRI_DALAM', 'BELAKANG_KIRI_LUAR', 'BELAKANG_KANAN_DALAM', 'BELAKANG_KANAN_LUAR', 'CADANGAN',
] as const;
const TIRE_STATUSES = ['ACTIVE', 'ARCHIVED', 'SPARE'] as const;

const VehicleTireSchema = z.object({
  serialNumber: z.string().min(1, 'Nomor seri wajib diisi.').max(100),
  brand: z.string().min(1, 'Merek ban wajib diisi.').max(100),
  model: z.string().max(100).optional().nullable(),
  size: z.string().max(50).optional().nullable(),
  position: z.enum(TIRE_POSITIONS),
  installedAt: z.string().min(1, 'Tanggal pasang wajib diisi.'),
  installedOdometer: z.number().int().nonnegative().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(TIRE_STATUSES).default('ACTIVE'),
});

const VehicleOilLogSchema = z.object({
  tanggal: z.string().min(1, 'Tanggal wajib diisi.'),
  odometer: z.number().int().nonnegative(),
  nextOdometerDue: z.number().int().nonnegative(),
  brand: z.string().min(1, 'Merek oli wajib diisi.').max(100),
  volume: z.number().positive('Volume harus lebih dari 0.'),
  notes: z.string().optional().nullable(),
});

// Vehicle data (1-1 with Asset, scoped via /assets/:id)

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

// Service log (1-many, scoped via /assets/:id/services)

router.get('/assets/:id/services', async (req, res) => {
  try {
    const logs = await prisma.gaVehicleServiceLog.findMany({
      where: { assetId: String(req.params.id) },
      orderBy: { tanggal: 'desc' },
      include: {
        workOrder: { select: { id: true, code: true } },
        journalEntry: { select: { id: true, entryNumber: true, status: true } },
        account: { select: { accountNumber: true, name: true } },
        creditAccount: { select: { accountNumber: true, name: true } },
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
  const wantJournal = input.postJournal === true;
  if (wantJournal && !(Number(input.biaya ?? 0) > 0)) {
    return res.status(400).json({ error: 'Biaya harus > 0 untuk diposting ke jurnal.' });
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const log = await tx.gaVehicleServiceLog.create({
        data: {
          assetId,
          tanggal: new Date(input.tanggal),
          odometer: input.odometer ?? null,
          jenisService: input.jenisService,
          deskripsi: input.deskripsi,
          bengkel: input.bengkel ?? null,
          biaya: input.biaya != null ? new Prisma.Decimal(input.biaya) : null,
          source: 'EAM',
          createdById: req.user!.userId,
        },
      });

      // Raise odometer terakhir (creates the vehicle data row when missing).
      await bumpVehicleOdometer(tx, assetId, input.odometer);

      if (wantJournal) {
        await postVehicleServiceJournalInTx(tx, {
          serviceLogId: log.id,
          accountId: input.accountId ?? null,
          creditAccountId: input.creditAccountId ?? null,
          userId: req.user!.userId,
        });
      }

      return tx.gaVehicleServiceLog.findUnique({
        where: { id: log.id },
        include: {
          journalEntry: { select: { id: true, entryNumber: true, status: true } },
          account: { select: { accountNumber: true, name: true } },
          creditAccount: { select: { accountNumber: true, name: true } },
        },
      });
    }, { timeout: 20000 });

    return res.status(201).json(created);
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/vehicle/assets/:id/services', 'Gagal simpan service log.');
  }
});

// POST /ga/vehicle/assets/:id/services/:sid/journal — posting menyusul untuk log yang belum berjurnal
router.post('/assets/:id/services/:sid/journal', async (req: AuthRequest, res) => {
  const body = req.body ?? {};
  try {
    const entry = await prisma.$transaction(async (tx) => {
      return postVehicleServiceJournalInTx(tx, {
        serviceLogId: String(req.params.sid),
        accountId: body.accountId ?? null,
        creditAccountId: body.creditAccountId ?? null,
        userId: req.user!.userId,
      });
    }, { timeout: 20000 });
    return res.status(201).json({ message: `Jurnal ${entry.entryNumber} dibuat.`, journalEntry: entry });
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/vehicle/assets/:id/services/:sid/journal', 'Gagal posting jurnal.');
  }
});

// DELETE .../journal — batalkan jurnal service log (soft-cancel + lepas tautan)
router.delete('/assets/:id/services/:sid/journal', async (req: AuthRequest, res) => {
  try {
    const entry = await prisma.$transaction(async (tx) => {
      return cancelVehicleServiceJournalInTx(tx, String(req.params.sid));
    }, { timeout: 20000 });
    return res.json({ message: `Jurnal ${entry.entryNumber} dibatalkan.` });
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /ga/vehicle/assets/:id/services/:sid/journal', 'Gagal membatalkan jurnal.');
  }
});

router.patch('/assets/:id/services/:sid', async (req, res) => {
  const input = validateBody(VehicleServiceLogSchema.partial(), req.body, res);
  if (!input) return;

  try {
    // Guard: log yang sudah punya jurnal aktif tidak boleh diubah nilainya —
    // GL akan desync. Batalkan jurnalnya dulu lewat DELETE .../journal.
    const existing = await prisma.gaVehicleServiceLog.findUnique({
      where: { id: String(req.params.sid) },
      select: { journalEntryId: true },
    });
    if (existing?.journalEntryId) {
      const touchesGl =
        input.biaya !== undefined || input.tanggal !== undefined || input.deskripsi !== undefined;
      if (touchesGl) {
        return res.status(400).json({
          error:
            'Service log ini sudah diposting ke jurnal. Batalkan jurnalnya dulu sebelum mengubah biaya/tanggal/deskripsi.',
        });
      }
    }

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
    const existing = await prisma.gaVehicleServiceLog.findUnique({
      where: { id: String(req.params.sid) },
      select: { journalEntryId: true },
    });
    if (existing?.journalEntryId) {
      return res.status(400).json({
        error: 'Service log ini sudah diposting ke jurnal. Batalkan jurnalnya dulu sebelum menghapus log.',
      });
    }
    await prisma.gaVehicleServiceLog.delete({ where: { id: String(req.params.sid) } });
    return res.status(204).end();
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /ga/vehicle/assets/:id/services/:sid', 'Gagal hapus service log.');
  }
});

// Service requests with an approval flow

// Auto Work Order dari pengajuan servis
/** Generate next WO code WO-YYYY-NNNN (advisory lock sama dgn maintenance.ts). */
async function generateWorkOrderCodeTx(tx: Prisma.TransactionClient): Promise<string> {
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

const SERVICE_TYPE_LABEL: Record<string, string> = {
  OLI: 'Ganti Oli',
  TUNE_UP: 'Tune Up',
  SERVIS_BERKALA: 'Servis Berkala',
  PERBAIKAN: 'Perbaikan',
  GANTI_BAN: 'Ganti Ban',
  ELEKTRIKAL: 'Perbaikan Elektrikal',
  AC: 'Servis AC',
  LAINNYA: 'Servis Lainnya',
};

/** Servis rutin = PREVENTIVE, sisanya CORRECTIVE. */
const PREVENTIVE_SERVICE_TYPES = new Set(['OLI', 'TUNE_UP', 'SERVIS_BERKALA']);

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

    const result = await prisma.$transaction(async (tx) => {
      // WO dibuat sekali saja — kalau sudah ada, pakai yang lama (idempoten).
      let workOrderId = sr.workOrderId;
      let workOrderCode: string | null = null;

      if (workOrderId) {
        const existing = await tx.gaWorkOrder.findUnique({
          where: { id: workOrderId },
          select: { code: true },
        });
        workOrderCode = existing?.code ?? null;
      } else {
        const asset = await tx.gaAsset.findUnique({
          where: { id: sr.assetId },
          select: {
            name: true,
            code: true,
            vehicleData: { select: { noPlat: true } },
          },
        });
        const plat = asset?.vehicleData?.noPlat || asset?.code || '';
        const label = SERVICE_TYPE_LABEL[sr.jenisService] || 'Servis Kendaraan';
        const code = await generateWorkOrderCodeTx(tx);

        const wo = await tx.gaWorkOrder.create({
          data: {
            code,
            assetId: sr.assetId,
            type: PREVENTIVE_SERVICE_TYPES.has(sr.jenisService) ? 'PREVENTIVE' : 'CORRECTIVE',
            status: 'OPEN',
            priority: sr.urgensi,
            title: plat ? `${label} - ${plat}` : label,
            description:
              `${sr.deskripsi}\n\n[Dibuat otomatis dari pengajuan servis` +
              (sr.odometer != null ? ` | Odometer: ${sr.odometer} km` : '') +
              `]`,
            reportedById: sr.requestedById,
            reportedAt: sr.createdAt,
          },
          select: { id: true, code: true },
        });
        workOrderId = wo.id;
        workOrderCode = wo.code;
      }

      const updated = await tx.gaVehicleServiceRequest.update({
        where: { id: sr.id },
        data: {
          status: 'APPROVED',
          approvedById: req.user!.userId,
          approvedAt: new Date(),
          workOrderId,
        },
        select: { id: true, status: true },
      });

      return { ...updated, workOrderId, workOrderCode };
    });

    return res.json(result);
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

// Driver assignment: stored in the generic GaAsset.picUserId, exposed here because the driver is a vehicle concept.

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

// Tax, STNK and KIR records (1-many, history per year)

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
    // Guard keuangan: kalau record pajak sudah masuk antrian/pembukuan
    // (IN_PROCESS / sudah terjurnal / sudah ada faktur), edit data aset
    // TIDAK boleh menurunkan statusnya kembali ke ACTIVE — itu bikin
    // tagihan hilang dari antrian Tagihan GA.
    const current = await prisma.gaVehicleTax.findUnique({
      where: { id: String(req.params.tid) },
      select: { status: true, journalEntryId: true, purchaseInvoiceId: true },
    });
    if (!current) return res.status(404).json({ error: 'Data pajak tidak ditemukan.' });
    const terkunci =
      current.status === 'IN_PROCESS' ||
      current.journalEntryId != null ||
      current.purchaseInvoiceId != null;

    // Kalau user memang minta ganti status tapi record terkunci → tolak
    // eksplisit, jangan diam-diam skip (bikin user bingung "kok gak berubah").
    if (input.status && input.status !== current.status && terkunci) {
      const alasan = current.journalEntryId
        ? 'sudah terjurnal di pembukuan'
        : current.purchaseInvoiceId
          ? 'sudah punya faktur pembelian'
          : 'sudah masuk antrian Tagihan GA (IN_PROCESS)';
      return res.status(409).json({
        error: `Status tidak bisa diubah ke ${input.status}: data pajak ini ${alasan}. Batalkan dulu jurnal/invoice terkait di menu Tagihan GA, baru status bisa diubah.`,
      });
    }

    const data: Prisma.GaVehicleTaxUpdateInput = {};
    if (input.type) data.type = input.type;
    if (input.periodYear !== undefined) data.periodYear = input.periodYear;
    if (input.amount !== undefined) data.amount = input.amount != null ? new Prisma.Decimal(input.amount) : null;
    if (input.paidAt !== undefined) data.paidAt = input.paidAt ? new Date(input.paidAt) : null;
    if (input.dueDate) data.dueDate = new Date(input.dueDate);
    if (input.status && !terkunci) data.status = input.status;
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


// Tax/STNK/KIR requests with an approval flow
// Approve => otomatis membuat record GaVehicleTax status IN_PROCESS.

router.post('/assets/:id/tax-requests', async (req: AuthRequest, res) => {
  const input = validateBody(VehicleTaxRequestSchema, req.body, res);
  if (!input) return;

  try {
    const created = await prisma.gaVehicleTaxRequest.create({
      data: {
        assetId: String(req.params.id),
        requestedById: req.user!.userId,
        type: input.type,
        periodYear: input.periodYear,
        estimatedAmount: input.estimatedAmount ?? null,
        dueDate: new Date(input.dueDate),
        deskripsi: input.deskripsi ?? null,
        urgensi: input.urgensi,
        status: 'SUBMITTED',
      },
    });
    return res.status(201).json({ id: created.id, status: created.status });
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/vehicle/assets/:id/tax-requests', 'Gagal mengirim pengajuan pajak.');
  }
});

router.get('/tax-requests', async (req: AuthRequest, res) => {
  try {
    const where: Prisma.GaVehicleTaxRequestWhereInput = {};
    if (req.query.status) where.status = req.query.status as never;
    if (req.query.assetId) where.assetId = String(req.query.assetId);
    if (req.query.mine === 'true' && req.user) where.requestedById = req.user.userId;

    const items = await prisma.gaVehicleTaxRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { urgensi: 'desc' }, { createdAt: 'desc' }],
      include: {
        asset: { select: { id: true, code: true, name: true } },
        tax: { select: { id: true, status: true, periodYear: true } },
      },
    });
    return res.json(items);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/vehicle/tax-requests', 'Gagal mengambil pengajuan pajak.');
  }
});

router.get('/tax-requests/:id', async (req, res) => {
  try {
    const item = await prisma.gaVehicleTaxRequest.findUnique({
      where: { id: String(req.params.id) },
      include: {
        asset: {
          select: {
            id: true, code: true, name: true,
            vehicleData: { select: { noPlat: true, brand: true, tipe: true } },
          },
        },
        tax: true,
      },
    });
    if (!item) return res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });
    return res.json(item);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/vehicle/tax-requests/:id', 'Gagal mengambil pengajuan pajak.');
  }
});

// Approve — buat record pajak IN_PROCESS lalu tautkan (atomik).
router.patch('/tax-requests/:id/approve', async (req: AuthRequest, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const tr = await tx.gaVehicleTaxRequest.findUnique({ where: { id: String(req.params.id) } });
      if (!tr) throw new BusinessError('Pengajuan tidak ditemukan.');
      if (tr.status !== 'SUBMITTED') throw new BusinessError(`Tidak bisa approve dari status ${tr.status}.`);

      const tax = await tx.gaVehicleTax.create({
        data: {
          assetId: tr.assetId,
          type: tr.type,
          periodYear: tr.periodYear,
          amount: tr.estimatedAmount,
          dueDate: tr.dueDate,
          status: 'IN_PROCESS',
          notes: tr.deskripsi ? `Dari pengajuan: ${tr.deskripsi}` : 'Dibuat dari pengajuan pajak.',
          createdById: tr.requestedById,
        },
      });

      const updated = await tx.gaVehicleTaxRequest.update({
        where: { id: tr.id },
        data: {
          status: 'APPROVED',
          approvedById: req.user!.userId,
          approvedAt: new Date(),
          taxId: tax.id,
        },
      });
      return { id: updated.id, status: updated.status, taxId: tax.id };
    });
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/vehicle/tax-requests/:id/approve', 'Gagal approve pengajuan pajak.');
  }
});

router.patch('/tax-requests/:id/reject', async (req: AuthRequest, res) => {
  const input = validateBody(RejectServiceRequestSchema, req.body, res);
  if (!input) return;

  try {
    const tr = await prisma.gaVehicleTaxRequest.findUnique({
      where: { id: String(req.params.id) },
      select: { id: true, status: true },
    });
    if (!tr) return res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });
    if (tr.status !== 'SUBMITTED') return res.status(400).json({ error: `Tidak bisa reject dari status ${tr.status}.` });

    const updated = await prisma.gaVehicleTaxRequest.update({
      where: { id: tr.id },
      data: {
        status: 'REJECTED',
        approvedById: req.user!.userId,
        approvedAt: new Date(),
        rejectedReason: input.reason,
      },
    });
    return res.json({ id: updated.id, status: updated.status });
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/vehicle/tax-requests/:id/reject', 'Gagal reject pengajuan pajak.');
  }
});

router.patch('/tax-requests/:id/cancel', async (req: AuthRequest, res) => {
  try {
    const tr = await prisma.gaVehicleTaxRequest.findUnique({
      where: { id: String(req.params.id) },
      select: { id: true, status: true, requestedById: true },
    });
    if (!tr) return res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });
    if (tr.requestedById !== req.user!.userId) return res.status(403).json({ error: 'Hanya pengaju yang bisa membatalkan.' });
    if (tr.status !== 'SUBMITTED') return res.status(400).json({ error: `Tidak bisa cancel dari status ${tr.status}.` });

    const updated = await prisma.gaVehicleTaxRequest.update({
      where: { id: tr.id },
      data: { status: 'CANCELLED' },
    });
    return res.json({ id: updated.id, status: updated.status });
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/vehicle/tax-requests/:id/cancel', 'Gagal cancel pengajuan pajak.');
  }
});

// Insurance (1-many, policy history)

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

// Fuel log (1-many, one row per refill)

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

    await bumpVehicleOdometer(prisma, assetId, input.odometer);

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

// Periodic inspections (tire/brake/oil checklist, separate from the service log)

router.get('/inspection-checkpoints', async (_req, res) => {
  return res.json(VEHICLE_INSPECTION_CHECKPOINTS);
});

/** Struktur checklist detail per kategori (dipakai modal inspeksi baru). */
router.get('/inspection-categories', async (_req, res) => {
  return res.json(VEHICLE_INSPECTION_CATEGORIES);
});

router.get('/assets/:id/inspections', async (req, res) => {
  try {
    const items = await prisma.gaVehicleInspection.findMany({
      where: { assetId: String(req.params.id) },
      orderBy: { tanggal: 'desc' },
      include: { photos: { orderBy: { createdAt: 'asc' } } },
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
    const tanggal = new Date(input.tanggal);
    // Jadwal inspeksi berikutnya: pakai tanggal eksplisit kalau dikirim,
    // kalau tidak hitung otomatis = tanggal + interval (default 30 hari).
    let nextDueDate: Date | null = null;
    if (input.nextDueDate) {
      const parsed = new Date(input.nextDueDate);
      if (!Number.isNaN(parsed.getTime())) nextDueDate = parsed;
    }
    if (!nextDueDate && !Number.isNaN(tanggal.getTime())) {
      const days = input.intervalDays ?? INSPECTION_DEFAULT_INTERVAL_DAYS;
      nextDueDate = new Date(tanggal.getTime() + days * 24 * 3600 * 1000);
    }

    const created = await prisma.gaVehicleInspection.create({
      data: {
        assetId: String(req.params.id),
        tanggal,
        odometer: input.odometer ?? null,
        checklist: input.checklist,
        overallResult: input.overallResult,
        notes: input.notes ?? null,
        inspectorName: input.inspectorName ?? null,
        inspectorUserId: input.inspectorUserId ?? null,
        fuelLevel: input.fuelLevel ?? null,
        nextDueDate,
        inspectedById: req.user!.userId,
      },
      include: { photos: true },
    });
    await bumpVehicleOdometer(prisma, created.assetId, input.odometer);
    return res.status(201).json(created);
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/vehicle/assets/:id/inspections', 'Gagal simpan data inspeksi.');
  }
});

router.delete('/assets/:id/inspections/:iid', async (req, res) => {
  try {
    // Bersihkan file foto fisik dulu; row-nya ikut terhapus lewat cascade FK.
    const photos = await prisma.gaVehicleInspectionPhoto.findMany({
      where: { inspectionId: String(req.params.iid) },
      select: { filePath: true },
    });
    await Promise.all(
      photos.map((p) => fs.unlink(path.join(UPLOADS_DIR, p.filePath)).catch(() => undefined)),
    );
    await prisma.gaVehicleInspection.delete({ where: { id: String(req.params.iid) } });
    return res.status(204).end();
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /ga/vehicle/assets/:id/inspections/:iid', 'Gagal hapus data inspeksi.');
  }
});

// Foto bukti inspeksi (1 foto per kategori checklist)
router.post('/assets/:id/inspections/:iid/photos', inspectionPhotoUpload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File wajib diupload.' });
  const category = String(req.body.category ?? '').trim();
  if (!category) return res.status(400).json({ error: 'Kategori foto wajib diisi.' });
  if (!VEHICLE_INSPECTION_CATEGORY_KEYS.includes(category)) {
    return res.status(400).json({ error: 'Kategori foto tidak dikenal.' });
  }

  try {
    const inspection = await prisma.gaVehicleInspection.findUnique({
      where: { id: String(req.params.iid) },
      select: { id: true, assetId: true },
    });
    if (!inspection || inspection.assetId !== String(req.params.id)) {
      return res.status(404).json({ error: 'Data inspeksi tidak ditemukan.' });
    }

    await fs.mkdir(INSPECTION_PHOTOS_DIR, { recursive: true });
    const ext = req.file.mimetype === 'image/png' ? '.png' : req.file.mimetype === 'image/webp' ? '.webp' : '.jpg';
    const name = `${crypto.randomUUID()}${ext}`;
    await fs.writeFile(path.join(INSPECTION_PHOTOS_DIR, name), req.file.buffer);

    const photo = await prisma.gaVehicleInspectionPhoto.create({
      data: {
        inspectionId: inspection.id,
        category,
        filePath: path.join('ga', 'inspections', name),
        caption: (req.body.caption as string) || null,
      },
    });
    return res.status(201).json(photo);
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/vehicle/assets/:id/inspections/:iid/photos', 'Gagal upload foto inspeksi.');
  }
});

// GET file foto inspeksi. /uploads/* TIDAK di-serve sebagai static (request ke
// sana jatuh ke SPA fallback dan mengembalikan index.html), jadi file dibaca
// lewat endpoint ber-RBAC ini — dipakai <img> di riwayat maupun export PDF.
router.get('/assets/:id/inspections/:iid/photos/:pid/file', async (req, res) => {
  try {
    const photo = await prisma.gaVehicleInspectionPhoto.findFirst({
      where: { id: String(req.params.pid), inspectionId: String(req.params.iid) },
      select: { filePath: true, inspection: { select: { assetId: true } } },
    });
    if (!photo || photo.inspection.assetId !== String(req.params.id)) {
      return res.status(404).json({ error: 'Foto tidak ditemukan.' });
    }

    // Path-traversal guard: file hasil resolve wajib tetap di dalam UPLOADS_DIR.
    const full = path.normalize(path.join(UPLOADS_DIR, photo.filePath));
    if (!full.startsWith(UPLOADS_DIR + path.sep)) {
      return res.status(400).json({ error: 'Path file tidak valid.' });
    }

    const ext = path.extname(full).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.sendFile(full);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/vehicle/assets/:id/inspections/:iid/photos/:pid/file', 'Gagal mengambil foto inspeksi.');
  }
});

router.delete('/assets/:id/inspections/:iid/photos/:pid', async (req, res) => {
  try {
    const photo = await prisma.gaVehicleInspectionPhoto.findUnique({ where: { id: String(req.params.pid) } });
    if (photo) {
      await fs.unlink(path.join(UPLOADS_DIR, photo.filePath)).catch(() => undefined);
      await prisma.gaVehicleInspectionPhoto.delete({ where: { id: photo.id } });
    }
    return res.status(204).end();
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /ga/vehicle/assets/:id/inspections/:iid/photos/:pid', 'Gagal hapus foto inspeksi.');
  }
});

// Incidents and accidents

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

// Tires: master per wheel position, guards against tire swapping

router.get('/assets/:id/tires', async (req, res) => {
  try {
    const items = await prisma.gaVehicleTire.findMany({
      where: { assetId: String(req.params.id) },
      orderBy: { position: 'asc' },
    });
    return res.json(items);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/vehicle/assets/:id/tires', 'Gagal mengambil data ban.');
  }
});

router.post('/assets/:id/tires', async (req: AuthRequest, res) => {
  const input = validateBody(VehicleTireSchema, req.body, res);
  if (!input) return;
  const assetId = String(req.params.id);
  try {
    // Validasi @@unique: satu posisi cuma boleh diisi 1 ban aktif
    if (input.status === 'ACTIVE') {
      const existing = await prisma.gaVehicleTire.findFirst({
        where: { assetId, position: input.position, status: 'ACTIVE' },
      });
      if (existing) {
        return res.status(400).json({
          error: `Posisi ${input.position} sudah diisi oleh ban aktif (SN: ${existing.serialNumber}). Ganti status ban lama terlebih dahulu.`,
        });
      }
    }

    const created = await prisma.gaVehicleTire.create({
      data: {
        assetId,
        serialNumber: input.serialNumber,
        brand: input.brand,
        model: input.model ?? null,
        size: input.size ?? null,
        position: input.position,
        installedAt: new Date(input.installedAt),
        installedOdometer: input.installedOdometer ?? null,
        notes: input.notes ?? null,
        status: input.status,
        createdById: req.user!.userId,
      },
    });
    return res.status(201).json(created);
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/vehicle/assets/:id/tires', 'Gagal simpan data ban.');
  }
});

router.patch('/assets/:id/tires/:tid', async (req, res) => {
  const input = validateBody(VehicleTireSchema.partial(), req.body, res);
  if (!input) return;
  const assetId = String(req.params.id);
  const tireId = String(req.params.tid);
  try {
    if (input.status === 'ACTIVE' || input.position) {
      // Ambil data ban saat ini untuk resolusi posisi & status
      const current = await prisma.gaVehicleTire.findUnique({ where: { id: tireId } });
      if (!current) return res.status(404).json({ error: 'Ban tidak ditemukan.' });
      
      const targetPos = input.position ?? current.position;
      const targetStatus = input.status ?? current.status;

      if (targetStatus === 'ACTIVE') {
        const existing = await prisma.gaVehicleTire.findFirst({
          where: { assetId, position: targetPos, status: 'ACTIVE', id: { not: tireId } },
        });
        if (existing) {
          return res.status(400).json({
            error: `Posisi ${targetPos} sudah diisi oleh ban aktif lain (SN: ${existing.serialNumber}).`,
          });
        }
      }
    }

    const data: Prisma.GaVehicleTireUpdateInput = {};
    if (input.serialNumber) data.serialNumber = input.serialNumber;
    if (input.brand) data.brand = input.brand;
    if (input.model !== undefined) data.model = input.model ?? null;
    if (input.size !== undefined) data.size = input.size ?? null;
    if (input.position) data.position = input.position;
    if (input.installedAt) data.installedAt = new Date(input.installedAt);
    if (input.installedOdometer !== undefined) data.installedOdometer = input.installedOdometer ?? null;
    if (input.notes !== undefined) data.notes = input.notes ?? null;
    if (input.status) data.status = input.status;

    const updated = await prisma.gaVehicleTire.update({ where: { id: tireId }, data });
    return res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/vehicle/assets/:id/tires/:tid', 'Gagal update data ban.');
  }
});

router.delete('/assets/:id/tires/:tid', async (req, res) => {
  try {
    await prisma.gaVehicleTire.delete({ where: { id: String(req.params.tid) } });
    return res.status(204).end();
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /ga/vehicle/assets/:id/tires/:tid', 'Gagal hapus data ban.');
  }
});

// Oil log: periodic oil changes and target odometer

router.get('/assets/:id/oil-logs', async (req, res) => {
  try {
    const items = await prisma.gaVehicleOilLog.findMany({
      where: { assetId: String(req.params.id) },
      orderBy: { tanggal: 'desc' },
    });
    return res.json(items);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/vehicle/assets/:id/oil-logs', 'Gagal mengambil data log oli.');
  }
});

router.post('/assets/:id/oil-logs', async (req: AuthRequest, res) => {
  const input = validateBody(VehicleOilLogSchema, req.body, res);
  if (!input) return;
  const assetId = String(req.params.id);
  try {
    const created = await prisma.gaVehicleOilLog.create({
      data: {
        assetId,
        tanggal: new Date(input.tanggal),
        odometer: input.odometer,
        nextOdometerDue: input.nextOdometerDue,
        brand: input.brand,
        volume: new Prisma.Decimal(input.volume),
        notes: input.notes ?? null,
        createdById: req.user!.userId,
      },
    });

    await bumpVehicleOdometer(prisma, assetId, input.odometer);

    return res.status(201).json(created);
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/vehicle/assets/:id/oil-logs', 'Gagal simpan log oli.');
  }
});

router.delete('/assets/:id/oil-logs/:oid', async (req, res) => {
  try {
    await prisma.gaVehicleOilLog.delete({ where: { id: String(req.params.oid) } });
    return res.status(204).end();
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /ga/vehicle/assets/:id/oil-logs/:oid', 'Gagal hapus log oli.');
  }
});

// Fleet list (Kendaraan page)
// GET /fleet: paged FleetRow list for assets in the categoryKind categories (default vehicle),
// with due state per obligation (services/gaFleetList). Batch queries only, no N+1.
router.get('/fleet', async (req: AuthRequest, res) => {
  try {
    const kind = parseCategoryKind(req.query.categoryKind ?? 'vehicle');
    if (!kind) return res.status(400).json({ error: 'categoryKind tidak valid.' });
    const parsed = parseFleetFilters(req.query as Record<string, unknown>);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const paging = parseListPaging(req.query as Record<string, unknown>, { defaultLimit: 25, maxLimit: 200 });
    const sort = parseFleetSort(req.query.sort);

    const categoryIds = await resolveCategoryIds(kind);
    const assets = await prisma.gaAsset.findMany({
      where: { categoryId: { in: categoryIds } },
      select: {
        id: true, code: true, name: true, status: true, condition: true, picUserId: true,
        category: { select: { name: true } },
        vehicleData: {
          select: { noPlat: true, brand: true, tipe: true, tahunProduksi: true, jenisBBM: true, odometerTerakhir: true },
        },
      },
      orderBy: { code: 'asc' },
      take: 5000,
    });
    const ids = assets.map((a) => a.id);
    const assetFilter = { in: ids };
    const driverIds = [...new Set(assets.map((a) => a.picUserId).filter((id): id is string => !!id))];

    const [taxes, insurances, inspections, openIncidents, drivers] = ids.length === 0
      ? [[], [], [], [], []]
      : await Promise.all([
        prisma.gaVehicleTax.findMany({
          where: { assetId: assetFilter, status: 'ACTIVE' },
          select: { assetId: true, type: true, dueDate: true },
        }),
        prisma.gaVehicleInsurance.findMany({
          where: { assetId: assetFilter, status: 'ACTIVE' },
          select: { assetId: true, endDate: true },
        }),
        prisma.gaVehicleInspection.findMany({
          where: { assetId: assetFilter, nextDueDate: { not: null } },
          select: { assetId: true, nextDueDate: true },
          orderBy: { tanggal: 'desc' },
        }),
        prisma.gaVehicleIncident.findMany({
          where: { assetId: assetFilter, status: { in: ['DILAPORKAN', 'DALAM_PROSES'] } },
          select: { assetId: true },
        }),
        driverIds.length
          ? prisma.user.findMany({ where: { id: { in: driverIds } }, select: { id: true, fullName: true } })
          : Promise.resolve([] as Array<{ id: string; fullName: string | null }>),
      ]);

    const rows = buildFleetRows(
      {
        assets,
        taxes,
        insurances,
        inspections,
        openIncidents,
        driverNames: new Map(drivers.map((u) => [u.id, u.fullName])),
      },
      dueBoundaries(new Date()),
    );
    const filtered = sortFleetRows(filterFleetRows(rows, parsed.filters), sort);
    return res.json({
      data: pageFleetRows(filtered, paging),
      total: filtered.length,
      page: paging.page,
      limit: paging.limit,
    });
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/vehicle/fleet', 'Gagal mengambil daftar armada.');
  }
});

router.get('/fleet-summary', async (req: AuthRequest, res) => {
  try {
    const kind = parseCategoryKind(req.query.categoryKind);
    if (kind === null) return res.status(400).json({ error: 'categoryKind tidak valid.' });
    const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;
    const assetWhere: Prisma.GaAssetWhereInput = kind
      ? { categoryId: { in: await resolveCategoryIds(kind) } }
      : categoryId
        ? { categoryId }
        : {};
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

    // Reminder inspeksi berkala: pola sama dgn pajak/asuransi (EXPIRED/EXPIRING).
    // Hanya inspeksi TERAKHIR per kendaraan yang dihitung supaya riwayat lama
    // tidak ikut menaikkan angka jatuh tempo.
    const inspections = await prisma.gaVehicleInspection.findMany({
      where: { nextDueDate: { not: null }, asset: assetWhere },
      select: { assetId: true, tanggal: true, nextDueDate: true },
      orderBy: { tanggal: 'desc' },
    });
    const latestPerAsset = new Map<string, Date>();
    for (const insp of inspections) {
      if (!latestPerAsset.has(insp.assetId) && insp.nextDueDate) {
        latestPerAsset.set(insp.assetId, insp.nextDueDate);
      }
    }
    let inspectionOverdue = 0;
    let inspectionDueSoon = 0;
    for (const due of latestPerAsset.values()) {
      if (due < now) inspectionOverdue += 1;
      else if (due <= soon) inspectionDueSoon += 1;
    }

    return res.json({
      totalVehicles,
      taxExpiringSoon,
      taxExpired,
      insuranceExpiringSoon,
      insuranceExpired,
      openIncidents,
      inspectionOverdue,
      inspectionDueSoon,
      inspectionNeverDone: Math.max(totalVehicles - latestPerAsset.size, 0),
      serviceCostThisMonth: Number(serviceThisMonth._sum.biaya ?? 0),
      fuelCostThisMonth: Number(fuelThisMonth._sum.totalCost ?? 0),
    });
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/vehicle/fleet-summary', 'Gagal mengambil ringkasan armada.');
  }
});

// Vehicle report
// Read-only cost, compliance and condition aggregates. fleet-report aggregates in memory from one batch
// query per table, so the query count stays constant regardless of fleet size.

type ReportPeriod = { from: Date; to: Date; months: number };

/** Parse ?from=&to= (YYYY-MM-DD). Default: 12 bulan terakhir. */
function parseReportPeriod(fromRaw: unknown, toRaw: unknown): ReportPeriod {
  const now = new Date();
  const parse = (v: unknown): Date | null => {
    if (!v) return null;
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const toParsed = parse(toRaw);
  const to = toParsed ? new Date(toParsed.getFullYear(), toParsed.getMonth(), toParsed.getDate(), 23, 59, 59, 999)
    : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const fromParsed = parse(fromRaw);
  const from = fromParsed ? new Date(fromParsed.getFullYear(), fromParsed.getMonth(), fromParsed.getDate(), 0, 0, 0, 0)
    : new Date(to.getFullYear(), to.getMonth() - 11, 1, 0, 0, 0, 0);
  const msPerMonth = 30.44 * 24 * 3600 * 1000;
  const months = Math.max(1, Math.round((to.getTime() - from.getTime()) / msPerMonth));
  return { from, to, months };
}

const monthKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const dec = (v: Prisma.Decimal | number | null | undefined): number => Number(v ?? 0);

type CostCategory = 'service' | 'fuel' | 'tax' | 'insurance' | 'incident' | 'workorder';
const COST_CATEGORIES: CostCategory[] = [
  'service', 'fuel', 'tax', 'insurance', 'incident', 'workorder',
];

function emptyBreakdown(): Record<CostCategory, number> {
  return { service: 0, fuel: 0, tax: 0, insurance: 0, incident: 0, workorder: 0 };
}

/** Rakit trend bulanan kontinu (bulan tanpa data tetap muncul dengan 0). */
function buildMonthlyTrend(
  period: ReportPeriod,
  rows: { month: string; category: CostCategory; amount: number }[],
) {
  const buckets = new Map<string, Record<CostCategory, number> & { total: number }>();
  const cursor = new Date(period.from.getFullYear(), period.from.getMonth(), 1);
  const last = new Date(period.to.getFullYear(), period.to.getMonth(), 1);
  while (cursor <= last) {
    buckets.set(monthKey(cursor), { ...emptyBreakdown(), total: 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  for (const r of rows) {
    const bucket = buckets.get(r.month);
    if (!bucket) continue;
    bucket[r.category] += r.amount;
    bucket.total += r.amount;
  }
  return [...buckets.entries()].map(([month, v]) => ({ month, ...v }));
}

/** Status kepatuhan dokumen: EXPIRED / EXPIRING (<30 hari) / OK. */
function complianceState(dueDate: Date | null | undefined, now: Date): 'EXPIRED' | 'EXPIRING' | 'OK' | 'NONE' {
  if (!dueDate) return 'NONE';
  const days = Math.floor((dueDate.getTime() - now.getTime()) / (24 * 3600 * 1000));
  if (days < 0) return 'EXPIRED';
  if (days <= 30) return 'EXPIRING';
  return 'OK';
}

const daysUntil = (d: Date | null | undefined, now: Date): number | null =>
  d ? Math.floor((d.getTime() - now.getTime()) / (24 * 3600 * 1000)) : null;

router.get('/assets/:id/report', async (req: AuthRequest, res) => {
  const assetId = String(req.params.id);
  const period = parseReportPeriod(req.query.from, req.query.to);
  const range = { gte: period.from, lte: period.to };
  const now = new Date();

  try {
    const asset = await prisma.gaAsset.findUnique({
      where: { id: assetId },
      include: { category: { select: { id: true, name: true } }, vehicleData: true },
    });
    if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan.' });

    const [services, fuels, taxes, insurances, incidents, lastInspection, activeTires, lastOil] = await Promise.all([
      prisma.gaVehicleServiceLog.findMany({
        where: { assetId, tanggal: range },
        select: { tanggal: true, biaya: true, jenisService: true, odometer: true },
        orderBy: { tanggal: 'asc' },
      }),
      prisma.gaVehicleFuelLog.findMany({
        where: { assetId, tanggal: range },
        select: { tanggal: true, totalCost: true, liters: true, odometer: true },
        orderBy: { tanggal: 'asc' },
      }),
      prisma.gaVehicleTax.findMany({
        where: { assetId },
        select: { type: true, amount: true, paidAmount: true, paidAt: true, dueDate: true, status: true, periodYear: true },
        orderBy: { dueDate: 'desc' },
      }),
      prisma.gaVehicleInsurance.findMany({
        where: { assetId },
        select: { type: true, provider: true, premium: true, startDate: true, endDate: true, status: true },
        orderBy: { endDate: 'desc' },
      }),
      prisma.gaVehicleIncident.findMany({
        where: { assetId },
        select: { tanggal: true, severity: true, status: true, actualCost: true, estimatedCost: true, description: true },
        orderBy: { tanggal: 'desc' },
      }),
      prisma.gaVehicleInspection.findFirst({
        where: { assetId },
        orderBy: { tanggal: 'desc' },
        select: { tanggal: true, overallResult: true, odometer: true, notes: true },
      }),
      prisma.gaVehicleTire.findMany({
        where: { assetId, status: 'ACTIVE' },
        select: { position: true, brand: true, serialNumber: true, installedAt: true, installedOdometer: true },
        orderBy: { position: 'asc' },
      }),
      prisma.gaVehicleOilLog.findFirst({
        where: { assetId },
        orderBy: { tanggal: 'desc' },
        select: { tanggal: true, odometer: true, nextOdometerDue: true, brand: true, volume: true },
      }),
    ]);

    // TCO breakdown periode
    const breakdown = emptyBreakdown();
    const trendRows: { month: string; category: CostCategory; amount: number }[] = [];

    for (const s of services) {
      const amount = dec(s.biaya);
      breakdown.service += amount;
      if (amount) trendRows.push({ month: monthKey(s.tanggal), category: 'service', amount });
    }
    for (const f of fuels) {
      const amount = dec(f.totalCost);
      breakdown.fuel += amount;
      if (amount) trendRows.push({ month: monthKey(f.tanggal), category: 'fuel', amount });
    }
    // Pajak: pakai paidAt sebagai tanggal biaya (hanya yang benar-benar dibayar di periode).
    for (const t of taxes) {
      if (!t.paidAt || t.paidAt < period.from || t.paidAt > period.to) continue;
      const amount = effectiveTaxCost(t);
      breakdown.tax += amount;
      if (amount) trendRows.push({ month: monthKey(t.paidAt), category: 'tax', amount });
    }
    // Asuransi: premi diakui di bulan startDate polis yang mulai dalam periode.
    for (const i of insurances) {
      if (i.startDate < period.from || i.startDate > period.to) continue;
      const amount = dec(i.premium);
      breakdown.insurance += amount;
      if (amount) trendRows.push({ month: monthKey(i.startDate), category: 'insurance', amount });
    }
    // Insiden: actualCost bila ada, fallback estimatedCost.
    for (const inc of incidents) {
      if (inc.tanggal < period.from || inc.tanggal > period.to) continue;
      const amount = inc.actualCost != null ? dec(inc.actualCost) : dec(inc.estimatedCost);
      breakdown.incident += amount;
      if (amount) trendRows.push({ month: monthKey(inc.tanggal), category: 'incident', amount });
    }

    const totalCost = COST_CATEGORIES.reduce((sum, k) => sum + breakdown[k], 0);

    // Cost per KM: pakai rentang odometer dari log service/fuel/oil dalam periode
    const odometers = [
      ...services.map((s) => s.odometer),
      ...fuels.map((f) => f.odometer),
    ].filter((v): v is number => typeof v === 'number' && v > 0);
    const odoMin = odometers.length ? Math.min(...odometers) : null;
    const odoMax = odometers.length ? Math.max(...odometers) : null;
    const distanceKm = odoMin != null && odoMax != null && odoMax > odoMin ? odoMax - odoMin : null;
    const totalLiters = fuels.reduce((sum, f) => sum + dec(f.liters), 0);

    // Compliance
    const activeTaxes = taxes.filter((t) => t.status === 'ACTIVE');
    const activeInsurances = insurances.filter((i) => i.status === 'ACTIVE');
    const openIncidents = incidents.filter((i) => i.status === 'DILAPORKAN' || i.status === 'DALAM_PROSES');

    const compliance = {
      taxes: activeTaxes.map((t) => ({
        type: t.type,
        periodYear: t.periodYear,
        dueDate: t.dueDate,
        paidAt: t.paidAt,
        amount: dec(t.amount),
        state: complianceState(t.dueDate, now),
        daysRemaining: daysUntil(t.dueDate, now),
      })),
      insurances: activeInsurances.map((i) => ({
        type: i.type,
        provider: i.provider,
        endDate: i.endDate,
        premium: dec(i.premium),
        state: complianceState(i.endDate, now),
        daysRemaining: daysUntil(i.endDate, now),
      })),
      openIncidents: openIncidents.map((i) => ({
        tanggal: i.tanggal,
        severity: i.severity,
        status: i.status,
        description: i.description,
        cost: i.actualCost != null ? dec(i.actualCost) : dec(i.estimatedCost),
      })),
      issueCount:
        activeTaxes.filter((t) => complianceState(t.dueDate, now) !== 'OK').length +
        activeInsurances.filter((i) => complianceState(i.endDate, now) !== 'OK').length +
        openIncidents.length,
    };

    // Kondisi
    const odometerTerakhir = asset.vehicleData?.odometerTerakhir ?? null;
    const oilRemainingKm =
      lastOil && odometerTerakhir != null ? lastOil.nextOdometerDue - odometerTerakhir : null;

    return res.json({
      period: { from: period.from, to: period.to, months: period.months },
      asset: {
        id: asset.id,
        code: asset.code,
        name: asset.name,
        categoryName: asset.category?.name ?? null,
        status: asset.status,
        condition: asset.condition,
        noPlat: asset.vehicleData?.noPlat ?? null,
        brand: asset.vehicleData?.brand ?? null,
        tipe: asset.vehicleData?.tipe ?? null,
        tahunProduksi: asset.vehicleData?.tahunProduksi ?? null,
        odometerTerakhir,
      },
      tco: {
        breakdown,
        totalCost,
        costPerMonth: totalCost / period.months,
        distanceKm,
        costPerKm: distanceKm ? totalCost / distanceKm : null,
        fuelCostPerKm: distanceKm ? breakdown.fuel / distanceKm : null,
        totalLiters,
        kmPerLiter: distanceKm && totalLiters > 0 ? distanceKm / totalLiters : null,
        counts: {
          service: services.length,
          fuel: fuels.length,
          tax: taxes.filter((t) => t.paidAt && t.paidAt >= period.from && t.paidAt <= period.to).length,
          insurance: insurances.filter((i) => i.startDate >= period.from && i.startDate <= period.to).length,
          incident: incidents.filter((i) => i.tanggal >= period.from && i.tanggal <= period.to).length,
        },
      },
      monthlyTrend: buildMonthlyTrend(period, trendRows),
      compliance,
      condition: {
        lastInspection: lastInspection
          ? {
              tanggal: lastInspection.tanggal,
              overallResult: lastInspection.overallResult,
              odometer: lastInspection.odometer,
              notes: lastInspection.notes,
            }
          : null,
        activeTires: activeTires.map((t) => ({
          position: t.position,
          brand: t.brand,
          serialNumber: t.serialNumber,
          installedAt: t.installedAt,
          installedOdometer: t.installedOdometer,
          usageKm:
            t.installedOdometer != null && odometerTerakhir != null
              ? Math.max(0, odometerTerakhir - t.installedOdometer)
              : null,
        })),
        activeTireCount: activeTires.length,
        lastOil: lastOil
          ? {
              tanggal: lastOil.tanggal,
              odometer: lastOil.odometer,
              nextOdometerDue: lastOil.nextOdometerDue,
              brand: lastOil.brand,
              volume: dec(lastOil.volume),
              remainingKm: oilRemainingKm,
              isDue: oilRemainingKm != null ? oilRemainingKm <= 0 : null,
            }
          : null,
      },
    });
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/vehicle/assets/:id/report', 'Gagal menyusun report kendaraan.');
  }
});

router.get('/fleet-report', async (req: AuthRequest, res) => {
  const period = parseReportPeriod(req.query.from, req.query.to);
  const range = { gte: period.from, lte: period.to };
  const now = new Date();
  const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;

  try {
    const assetWhere: Prisma.GaAssetWhereInput = {
      ...(categoryId ? { categoryId } : {}),
      vehicleData: { isNot: null },
    };
    const assets = await prisma.gaAsset.findMany({
      where: assetWhere,
      select: {
        id: true, code: true, name: true, status: true, condition: true,
        category: { select: { name: true } },
        vehicleData: { select: { noPlat: true, brand: true, tipe: true, odometerTerakhir: true } },
      },
      orderBy: { code: 'asc' },
    });
    const assetIds = assets.map((a) => a.id);

    if (assetIds.length === 0) {
      return res.json({
        period: { from: period.from, to: period.to, months: period.months },
        vehicles: [],
        totals: { ...emptyBreakdown(), totalCost: 0, vehicleCount: 0, costPerVehicle: 0 },
        distribution: [],
        topSpenders: [],
        monthlyTrend: buildMonthlyTrend(period, []),
        compliance: { taxIssues: 0, insuranceIssues: 0, openIncidents: 0, vehiclesWithIssues: 0 },
      });
    }

    const idFilter = { in: assetIds };
    const [
      serviceRows, fuelRows, taxRows, insuranceRows, incidentRows,
      activeTaxes, activeInsurances, openIncidents, workOrderRows, materialRows,
    ] =
      await Promise.all([
        prisma.gaVehicleServiceLog.findMany({
          where: { assetId: idFilter, tanggal: range },
          select: { assetId: true, tanggal: true, biaya: true },
        }),
        prisma.gaVehicleFuelLog.findMany({
          where: { assetId: idFilter, tanggal: range },
          select: { assetId: true, tanggal: true, totalCost: true, liters: true },
        }),
        prisma.gaVehicleTax.findMany({
          where: { assetId: idFilter, paidAt: range },
          select: { assetId: true, paidAt: true, amount: true, paidAmount: true },
        }),
        prisma.gaVehicleInsurance.findMany({
          where: { assetId: idFilter, startDate: range },
          select: { assetId: true, startDate: true, premium: true },
        }),
        prisma.gaVehicleIncident.findMany({
          where: { assetId: idFilter, tanggal: range },
          select: { assetId: true, tanggal: true, actualCost: true, estimatedCost: true },
        }),
        prisma.gaVehicleTax.findMany({
          where: { assetId: idFilter, status: 'ACTIVE' },
          select: { assetId: true, dueDate: true },
        }),
        prisma.gaVehicleInsurance.findMany({
          where: { assetId: idFilter, status: 'ACTIVE' },
          select: { assetId: true, endDate: true },
        }),
        prisma.gaVehicleIncident.findMany({
          where: { assetId: idFilter, status: { in: ['DILAPORKAN', 'DALAM_PROSES'] } },
          select: { assetId: true },
        }),
        // Work Order: biaya jasa (labor + vendor eksternal) + sparepart yang dipakai.
        prisma.gaWorkOrder.findMany({
          where: { assetId: idFilter, status: { not: 'CANCELLED' } },
          select: {
            id: true, assetId: true, status: true,
            reportedAt: true, completedAt: true, closedAt: true,
            laborCost: true, externalCost: true,
            parts: { select: { quantity: true, unitCost: true } },
          },
        }),
        // Material Request yang sudah DIBAYAR (pengadaan sparepart lewat jalur MR).
        prisma.gaMaterialRequest.findMany({
          where: {
            status: 'PAID',
            OR: [{ assetId: idFilter }, { workOrder: { assetId: idFilter } }],
          },
          select: {
            assetId: true, paidAmount: true, paidAt: true, requestedAt: true,
            workOrder: { select: { assetId: true } },
          },
        }),
      ]);

    const perAsset = new Map<string, Record<CostCategory, number>>();
    const litersByAsset = new Map<string, number>();
    const trendRows: { month: string; category: CostCategory; amount: number }[] = [];
    const bump = (assetId: string, category: CostCategory, amount: number, tanggal: Date) => {
      if (!perAsset.has(assetId)) perAsset.set(assetId, emptyBreakdown());
      perAsset.get(assetId)![category] += amount;
      if (amount) trendRows.push({ month: monthKey(tanggal), category, amount });
    };

    for (const r of serviceRows) bump(r.assetId, 'service', dec(r.biaya), r.tanggal);
    for (const r of fuelRows) {
      bump(r.assetId, 'fuel', dec(r.totalCost), r.tanggal);
      litersByAsset.set(r.assetId, (litersByAsset.get(r.assetId) ?? 0) + dec(r.liters));
    }
    for (const r of taxRows) if (r.paidAt) bump(r.assetId, 'tax', effectiveTaxCost(r), r.paidAt);
    for (const r of insuranceRows) bump(r.assetId, 'insurance', dec(r.premium), r.startDate);
    for (const r of incidentRows) {
      bump(r.assetId, 'incident', r.actualCost != null ? dec(r.actualCost) : dec(r.estimatedCost), r.tanggal);
    }

    // Work Order (jasa + sparepart)
    // CATATAN: di deployment ini, biaya sparepart/jasa WO dibayar lewat Material Request (MR)
    // status PAID. Jadi SATU kategori 'workorder' saja = labor + vendor eksternal
    // + parts gudang + MR PAID, supaya tidak dobel hitung.
    const woCountByAsset = new Map<string, number>();
    const woOpenByAsset = new Map<string, number>();
    for (const w of workOrderRows) {
      if (w.status !== 'CLOSED') {
        woOpenByAsset.set(w.assetId, (woOpenByAsset.get(w.assetId) ?? 0) + 1);
      }
      const at = w.closedAt ?? w.completedAt ?? w.reportedAt;
      if (at < period.from || at > period.to) continue;
      const partCost = w.parts.reduce((s, p) => s + dec(p.quantity) * dec(p.unitCost), 0);
      const amount = dec(w.laborCost) + dec(w.externalCost) + partCost;
      woCountByAsset.set(w.assetId, (woCountByAsset.get(w.assetId) ?? 0) + 1);
      if (amount) bump(w.assetId, 'workorder', amount, at);
    }

    // MR PAID → masuk kategori 'workorder' yang sama (bukan kategori terpisah).
    const mrCountByAsset = new Map<string, number>();
    for (const m of materialRows) {
      const targetAsset = m.assetId ?? m.workOrder?.assetId ?? null;
      if (!targetAsset || !assetIds.includes(targetAsset)) continue;
      const at = m.paidAt ?? m.requestedAt;
      if (at < period.from || at > period.to) continue;
      const amount = dec(m.paidAmount);
      mrCountByAsset.set(targetAsset, (mrCountByAsset.get(targetAsset) ?? 0) + 1);
      if (amount) bump(targetAsset, 'workorder', amount, at);
    }

    // Compliance per aset
    const taxIssueByAsset = new Map<string, number>();
    for (const t of activeTaxes) {
      if (complianceState(t.dueDate, now) === 'OK') continue;
      taxIssueByAsset.set(t.assetId, (taxIssueByAsset.get(t.assetId) ?? 0) + 1);
    }
    const insIssueByAsset = new Map<string, number>();
    for (const i of activeInsurances) {
      if (complianceState(i.endDate, now) === 'OK') continue;
      insIssueByAsset.set(i.assetId, (insIssueByAsset.get(i.assetId) ?? 0) + 1);
    }
    const incidentByAsset = new Map<string, number>();
    for (const i of openIncidents) incidentByAsset.set(i.assetId, (incidentByAsset.get(i.assetId) ?? 0) + 1);

    // Tanggal jatuh tempo terdekat per aset (untuk badge di tabel)
    const nearestTax = new Map<string, Date>();
    for (const t of activeTaxes) {
      const cur = nearestTax.get(t.assetId);
      if (!cur || t.dueDate < cur) nearestTax.set(t.assetId, t.dueDate);
    }
    const nearestIns = new Map<string, Date>();
    for (const i of activeInsurances) {
      const cur = nearestIns.get(i.assetId);
      if (!cur || i.endDate < cur) nearestIns.set(i.assetId, i.endDate);
    }

    const vehicles = assets.map((a) => {
      const b = perAsset.get(a.id) ?? emptyBreakdown();
      const totalCost = COST_CATEGORIES.reduce((sum, k) => sum + b[k], 0);
      const taxDue = nearestTax.get(a.id) ?? null;
      const insDue = nearestIns.get(a.id) ?? null;
      return {
        assetId: a.id,
        code: a.code,
        name: a.name,
        noPlat: a.vehicleData?.noPlat ?? null,
        brand: a.vehicleData?.brand ?? null,
        tipe: a.vehicleData?.tipe ?? null,
        categoryName: a.category?.name ?? null,
        status: a.status,
        condition: a.condition,
        odometerTerakhir: a.vehicleData?.odometerTerakhir ?? null,
        breakdown: b,
        totalCost,
        costPerMonth: totalCost / period.months,
        totalLiters: litersByAsset.get(a.id) ?? 0,
        taxState: complianceState(taxDue, now),
        taxDueDate: taxDue,
        insuranceState: complianceState(insDue, now),
        insuranceEndDate: insDue,
        openIncidentCount: incidentByAsset.get(a.id) ?? 0,
        workOrderCount: woCountByAsset.get(a.id) ?? 0,
        openWorkOrderCount: woOpenByAsset.get(a.id) ?? 0,
        materialRequestCount: mrCountByAsset.get(a.id) ?? 0,
        issueCount:
          (taxIssueByAsset.get(a.id) ?? 0) + (insIssueByAsset.get(a.id) ?? 0) + (incidentByAsset.get(a.id) ?? 0)
          + (woOpenByAsset.get(a.id) ?? 0),
      };
    });

    const totals = vehicles.reduce(
      (acc, v) => {
        for (const k of COST_CATEGORIES) acc[k] += v.breakdown[k];
        acc.totalCost += v.totalCost;
        return acc;
      },
      { ...emptyBreakdown(), totalCost: 0 },
    );

    const distribution = COST_CATEGORIES.map((k) => ({
      category: k,
      amount: totals[k],
      percentage: totals.totalCost > 0 ? (totals[k] / totals.totalCost) * 100 : 0,
    }));

    const topSpenders = [...vehicles]
      .filter((v) => v.totalCost > 0)
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 10)
      .map((v) => ({
        assetId: v.assetId, code: v.code, name: v.name, noPlat: v.noPlat,
        totalCost: v.totalCost, costPerMonth: v.costPerMonth, breakdown: v.breakdown,
      }));

    return res.json({
      period: { from: period.from, to: period.to, months: period.months },
      vehicles,
      totals: {
        ...totals,
        vehicleCount: vehicles.length,
        costPerVehicle: vehicles.length ? totals.totalCost / vehicles.length : 0,
      },
      distribution,
      topSpenders,
      monthlyTrend: buildMonthlyTrend(period, trendRows),
      compliance: {
        taxIssues: [...taxIssueByAsset.values()].reduce((a, b) => a + b, 0),
        insuranceIssues: [...insIssueByAsset.values()].reduce((a, b) => a + b, 0),
        openIncidents: openIncidents.length,
        openWorkOrders: [...woOpenByAsset.values()].reduce((a, b) => a + b, 0),
        vehiclesWithIssues: vehicles.filter((v) => v.issueCount > 0).length,
      },
    });
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/vehicle/fleet-report', 'Gagal menyusun report armada.');
  }
});

export default router;
