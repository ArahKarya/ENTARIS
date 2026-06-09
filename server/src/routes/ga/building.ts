// GA Building — data bangunan (1-1 per asset) dan rental (1-many).
// Di-mount di /api/ga/building dengan requirePerm('ga_building').
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
const BUILDING_TYPES = ['KANTOR', 'GUDANG', 'PABRIK', 'RUMAH', 'MESS', 'RUKO', 'LAINNYA'] as const;
const BUILDING_OWNERSHIP = ['MILIK_SENDIRI', 'SEWA_MASUK', 'SEWA_KELUAR', 'PINJAM_PAKAI'] as const;
const LAND_CERT_TYPES = ['HM', 'HGB', 'HGU', 'HP_AKTA', 'GIRIK', 'BELUM_SERTIFIKAT'] as const;
const RENTAL_ARAH = ['SEWA_MASUK', 'SEWA_KELUAR'] as const;
const RENTAL_PERIODE = ['BULANAN', 'TAHUNAN'] as const;

const BuildingDataSchema = z.object({
  jenis: z.enum(BUILDING_TYPES),
  ownership: z.enum(BUILDING_OWNERSHIP).default('MILIK_SENDIRI'),
  luasTanah: z.number().nonnegative().optional().nullable(),
  luasBangunan: z.number().nonnegative().optional().nullable(),
  jumlahLantai: z.number().int().positive().optional().nullable(),
  tahunBangun: z.number().int().min(1800).max(2100).optional().nullable(),
  tahunRenovasi: z.number().int().min(1800).max(2100).optional().nullable(),
  alamatLengkap: z.string().max(500).optional().nullable(),
  kelurahan: z.string().max(100).optional().nullable(),
  kecamatan: z.string().max(100).optional().nullable(),
  kota: z.string().max(100).optional().nullable(),
  provinsi: z.string().max(100).optional().nullable(),
  kodePos: z.string().max(10).optional().nullable(),
  certificateType: z.enum(LAND_CERT_TYPES).optional().nullable(),
  certificateNumber: z.string().max(100).optional().nullable(),
  njopTanah: z.number().nonnegative().optional().nullable(),
  njopBangunan: z.number().nonnegative().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const BuildingRentalSchema = z.object({
  arah: z.enum(RENTAL_ARAH),
  pihak: z.string().min(1).max(200),
  kontak: z.string().max(100).optional().nullable(),
  nilaiSewa: z.number().nonnegative(),
  periode: z.enum(RENTAL_PERIODE),
  tanggalMulai: z.string().min(1),
  tanggalAkhir: z.string().min(1),
  documentId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// ═══════════════════════════════════════════════════════════════════
// BUILDING DATA (1-1 dengan Asset)
// ═══════════════════════════════════════════════════════════════════

router.get('/assets/:id', async (req, res) => {
  try {
    const data = await prisma.gaBuildingData.findUnique({
      where: { assetId: String(req.params.id) },
    });
    return res.json(data ?? null);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/building/assets/:id', 'Gagal mengambil data bangunan.');
  }
});

router.put('/assets/:id', async (req, res) => {
  const input = validateBody(BuildingDataSchema, req.body, res);
  if (!input) return;

  const assetId = String(req.params.id);
  try {
    const baseData = {
      jenis: input.jenis,
      ownership: input.ownership,
      luasTanah: input.luasTanah != null ? new Prisma.Decimal(input.luasTanah) : null,
      luasBangunan: input.luasBangunan != null ? new Prisma.Decimal(input.luasBangunan) : null,
      jumlahLantai: input.jumlahLantai ?? null,
      tahunBangun: input.tahunBangun ?? null,
      tahunRenovasi: input.tahunRenovasi ?? null,
      alamatLengkap: input.alamatLengkap ?? null,
      kelurahan: input.kelurahan ?? null,
      kecamatan: input.kecamatan ?? null,
      kota: input.kota ?? null,
      provinsi: input.provinsi ?? null,
      kodePos: input.kodePos ?? null,
      certificateType: input.certificateType ?? null,
      certificateNumber: input.certificateNumber ?? null,
      njopTanah: input.njopTanah != null ? new Prisma.Decimal(input.njopTanah) : null,
      njopBangunan: input.njopBangunan != null ? new Prisma.Decimal(input.njopBangunan) : null,
      notes: input.notes ?? null,
    };

    const result = await prisma.gaBuildingData.upsert({
      where: { assetId },
      create: { assetId, ...baseData },
      update: baseData,
    });
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PUT /ga/building/assets/:id', 'Gagal simpan data bangunan.');
  }
});

// ═══════════════════════════════════════════════════════════════════
// RENTAL (1-many dengan Asset)
// ═══════════════════════════════════════════════════════════════════

router.get('/assets/:id/rentals', async (req, res) => {
  try {
    const items = await prisma.gaBuildingRental.findMany({
      where: { assetId: String(req.params.id) },
      orderBy: [{ status: 'asc' }, { tanggalMulai: 'desc' }],
      include: {
        document: { select: { id: true, code: true, title: true } },
      },
    });
    return res.json(items);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/building/assets/:id/rentals', 'Gagal mengambil rental.');
  }
});

router.post('/assets/:id/rentals', async (req: AuthRequest, res) => {
  const input = validateBody(BuildingRentalSchema, req.body, res);
  if (!input) return;

  try {
    const created = await prisma.gaBuildingRental.create({
      data: {
        assetId: String(req.params.id),
        arah: input.arah,
        pihak: input.pihak,
        kontak: input.kontak ?? null,
        nilaiSewa: new Prisma.Decimal(input.nilaiSewa),
        periode: input.periode,
        tanggalMulai: new Date(input.tanggalMulai),
        tanggalAkhir: new Date(input.tanggalAkhir),
        documentId: input.documentId ?? null,
        notes: input.notes ?? null,
        createdById: req.user!.userId,
      },
    });
    return res.status(201).json(created);
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/building/assets/:id/rentals', 'Gagal simpan rental.');
  }
});

router.patch('/assets/:id/rentals/:rid', async (req, res) => {
  const input = validateBody(BuildingRentalSchema.partial(), req.body, res);
  if (!input) return;

  try {
    const data: Prisma.GaBuildingRentalUpdateInput = {};
    if (input.arah) data.arah = input.arah;
    if (input.pihak) data.pihak = input.pihak;
    if (input.kontak !== undefined) data.kontak = input.kontak ?? null;
    if (input.nilaiSewa != null) data.nilaiSewa = new Prisma.Decimal(input.nilaiSewa);
    if (input.periode) data.periode = input.periode;
    if (input.tanggalMulai) data.tanggalMulai = new Date(input.tanggalMulai);
    if (input.tanggalAkhir) data.tanggalAkhir = new Date(input.tanggalAkhir);
    if (input.documentId !== undefined) {
      data.document = input.documentId
        ? { connect: { id: input.documentId } }
        : { disconnect: true };
    }
    if (input.notes !== undefined) data.notes = input.notes ?? null;

    const updated = await prisma.gaBuildingRental.update({
      where: { id: String(req.params.rid) },
      data,
    });
    return res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/building/assets/:id/rentals/:rid', 'Gagal update rental.');
  }
});

router.patch('/assets/:id/rentals/:rid/end', async (req, res) => {
  try {
    const updated = await prisma.gaBuildingRental.update({
      where: { id: String(req.params.rid) },
      data: { status: 'BERAKHIR' },
    });
    return res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/building/assets/:id/rentals/:rid/end', 'Gagal akhiri rental.');
  }
});

router.delete('/assets/:id/rentals/:rid', async (req, res) => {
  try {
    await prisma.gaBuildingRental.delete({ where: { id: String(req.params.rid) } });
    return res.status(204).end();
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /ga/building/assets/:id/rentals/:rid', 'Gagal hapus rental.');
  }
});

export default router;
