// GA Equipment (Alat Timbang) — data alat (1-1 per asset) dan calibration log
// (1-many). Membuat calibration log otomatis menyinkronkan EquipmentData
// (lastCalibratedAt + nextCalibrationDue dari validUntil).
// Di-mount di /api/ga/equipment dengan requirePerm('ga_equipment').
// Auth + RBAC ditangani di mount (index.ts), bukan di file ini.

import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AuthRequest } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { handleRouteError } from '../../utils/errors';

const router = Router();

// ── Zod schemas ──────────────────────────────────────────────────────
const WEIGHING_UNITS = ['KG', 'GRAM', 'TON', 'LBS'] as const;
const CALIB_RESULTS = ['PASS', 'FAIL', 'CONDITIONAL'] as const;
const CALIB_MODES = ['ON_SITE', 'SHIPPED'] as const;

const EquipmentDataSchema = z.object({
  maxCapacity: z.number().nonnegative().optional().nullable(),
  unit: z.enum(WEIGHING_UNITS).optional().nullable(),
  accuracy: z.number().nonnegative().optional().nullable(),
  classLabel: z.string().max(50).optional().nullable(),
  defaultCalibrator: z.string().max(200).optional().nullable(),
  intervalMonths: z.number().int().positive().default(12),
  lastCalibratedAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const CalibrationLogSchema = z.object({
  tanggal: z.string().min(1),
  lembaga: z.string().min(1).max(200),
  noSertifikat: z.string().min(1).max(100),
  mode: z.enum(CALIB_MODES).default('ON_SITE'),
  biaya: z.number().nonnegative().optional().nullable(),
  hasil: z.enum(CALIB_RESULTS),
  deviasi: z.string().max(500).optional().nullable(),
  rangeTested: z.string().max(100).optional().nullable(),
  validUntil: z.string().min(1),
  documentId: z.string().optional().nullable(),
  workOrderId: z.string().optional().nullable(),
});

// ═══════════════════════════════════════════════════════════════════
// EQUIPMENT DATA (1-1 Asset, kategori ALAT_TIMBANG)
// ═══════════════════════════════════════════════════════════════════

router.get('/assets/:id', async (req, res) => {
  try {
    const data = await prisma.gaEquipmentData.findUnique({
      where: { assetId: String(req.params.id) },
    });
    return res.json(data ?? null);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/equipment/assets/:id', 'Gagal mengambil data alat timbang.');
  }
});

router.put('/assets/:id', async (req, res) => {
  const input = validateBody(EquipmentDataSchema, req.body, res);
  if (!input) return;

  const assetId = String(req.params.id);
  try {
    const lastCalibratedAt = input.lastCalibratedAt ? new Date(input.lastCalibratedAt) : null;
    let nextCalibrationDue: Date | null = null;
    if (lastCalibratedAt && input.intervalMonths) {
      nextCalibrationDue = new Date(lastCalibratedAt);
      nextCalibrationDue.setMonth(nextCalibrationDue.getMonth() + input.intervalMonths);
    }

    const baseData = {
      maxCapacity: input.maxCapacity != null ? new Prisma.Decimal(input.maxCapacity) : null,
      unit: input.unit ?? null,
      accuracy: input.accuracy != null ? new Prisma.Decimal(input.accuracy) : null,
      classLabel: input.classLabel ?? null,
      defaultCalibrator: input.defaultCalibrator ?? null,
      intervalMonths: input.intervalMonths,
      lastCalibratedAt,
      nextCalibrationDue,
      notes: input.notes ?? null,
    };

    const result = await prisma.gaEquipmentData.upsert({
      where: { assetId },
      create: { assetId, ...baseData },
      update: baseData,
    });
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PUT /ga/equipment/assets/:id', 'Gagal simpan data alat timbang.');
  }
});

// ═══════════════════════════════════════════════════════════════════
// CALIBRATION LOG (1-many)
// ═══════════════════════════════════════════════════════════════════

router.get('/assets/:id/calibration-logs', async (req, res) => {
  try {
    const items = await prisma.gaCalibrationLog.findMany({
      where: { assetId: String(req.params.id) },
      orderBy: { tanggal: 'desc' },
      include: {
        document: { select: { id: true, code: true, title: true } },
        workOrder: { select: { id: true, code: true } },
      },
    });
    return res.json(items);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/equipment/assets/:id/calibration-logs', 'Gagal mengambil log kalibrasi.');
  }
});

router.post('/assets/:id/calibration-logs', async (req: AuthRequest, res) => {
  const input = validateBody(CalibrationLogSchema, req.body, res);
  if (!input) return;

  const assetId = String(req.params.id);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const log = await tx.gaCalibrationLog.create({
        data: {
          assetId,
          tanggal: new Date(input.tanggal),
          lembaga: input.lembaga,
          noSertifikat: input.noSertifikat,
          mode: input.mode,
          biaya: input.biaya != null ? new Prisma.Decimal(input.biaya) : null,
          hasil: input.hasil,
          deviasi: input.deviasi ?? null,
          rangeTested: input.rangeTested ?? null,
          validUntil: new Date(input.validUntil),
          documentId: input.documentId ?? null,
          workOrderId: input.workOrderId ?? null,
          createdById: req.user!.userId,
        },
      });

      // Sync GaEquipmentData: lastCalibratedAt + nextCalibrationDue (validUntil)
      const equipment = await tx.gaEquipmentData.findUnique({ where: { assetId } });
      if (equipment) {
        await tx.gaEquipmentData.update({
          where: { assetId },
          data: {
            lastCalibratedAt: log.tanggal,
            nextCalibrationDue: log.validUntil,
          },
        });
      }

      return log;
    });

    return res.status(201).json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/equipment/assets/:id/calibration-logs', 'Gagal simpan log kalibrasi.');
  }
});

router.delete('/assets/:id/calibration-logs/:lid', async (req, res) => {
  try {
    await prisma.gaCalibrationLog.delete({ where: { id: String(req.params.lid) } });
    return res.status(204).end();
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /ga/equipment/assets/:id/calibration-logs/:lid', 'Gagal hapus log kalibrasi.');
  }
});

export default router;
