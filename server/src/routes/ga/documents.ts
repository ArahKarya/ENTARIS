// GA legal documents and certificates with versioned PDF uploads and expiry tracking, mounted with requirePerm('ga_documents') in index.ts.
// New version = max(versionNo) + 1 per document (unique documentId+versionNo); files live on disk, only the relative path is stored.

import { Router, type Response } from 'express';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AuthRequest } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { handleRouteError } from '../../utils/errors';
import { parseListPaging, parseSort } from '../../utils/listQuery';
import {
  buildGaDocumentWhere,
  daysToExpiry,
  DEFAULT_GA_DOCUMENT_SORT,
  deriveExpiryState,
  expiryWhere,
  expiryWindow,
  GA_DOCUMENT_SORT_FIELDS,
  gaDocumentOrderBy,
  type GaDocumentSummary,
} from '../../services/gaDocumentList';

const router = Router();

// File storage
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || './uploads');
const DIR = path.join(UPLOADS_DIR, 'ga', 'documents');
const DIR_REL = path.join('ga', 'documents');

// Validation schema (inline: ERP konvensi: Zod di route bila belum
//    ada di utils/schemas.ts). `code` opsional saat create; server
//    auto-generate dari documentType.code + tahun.
const DocumentSchema = z.object({
  code: z.string().max(100).optional().or(z.literal('')),
  title: z.string().min(1).max(200),
  typeId: z.string().min(1),
  assetId: z.string().optional().nullable(),
  issuedBy: z.string().optional().nullable(),
  issuedNumber: z.string().optional().nullable(),
  effectiveDate: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'REVOKED', 'ARCHIVED']).default('ACTIVE'),
  customFields: z.record(z.string(), z.unknown()).optional().nullable(),
});

// Multer (memory storage, max 20 MB, hanya PDF)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf');
  },
});

// Document code numbering
// Prefix `{TYPE_CODE}-{YYYY}-` (type code di-sanitize, dipotong 12 char).
async function resolveDocCodePrefix(
  tx: Prisma.TransactionClient,
  typeId: string,
): Promise<string | null> {
  const docType = await tx.gaDocumentType.findUnique({
    where: { id: typeId },
    select: { code: true },
  });
  if (!docType) return null;
  const typePrefix =
    docType.code.replace(/[^A-Z0-9_]/gi, '').toUpperCase().slice(0, 12) || 'DOC';
  const year = new Date().getFullYear();
  return `${typePrefix}-${year}-`;
}

// Hitung kode sekuensial berikutnya di bawah advisory xact lock.
// Harus dipanggil di dalam transaksi.
async function nextDocCodeInTx(
  tx: Prisma.TransactionClient,
  prefix: string,
): Promise<string> {
  let h = 0;
  for (let i = 0; i < prefix.length; i++) {
    h = ((h << 5) - h + prefix.charCodeAt(i)) | 0;
  }
  const lockKey = (h & 0x7fffffff) || 1;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

  const latest = await tx.gaDocument.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });

  const lastSeq = latest ? parseInt(latest.code.slice(prefix.length), 10) : 0;
  const next = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

// GET /api/ga/documents: without `page` returns an array (asset drawer and AIRA tools depend on it);
// with `page` returns `{ data, total, page, limit }` (limit <= 200) plus `expiryState`. Invalid filters -> 400.
router.get('/', async (req, res) => {
  try {
    if (req.query.page !== undefined) return await listDocumentsPaged(req.query as Record<string, unknown>, res);
    const where: Prisma.GaDocumentWhereInput = {};
    if (req.query.typeId) where.typeId = String(req.query.typeId);
    if (req.query.assetId) where.assetId = String(req.query.assetId);
    if (req.query.status) where.status = String(req.query.status) as Prisma.GaDocumentWhereInput['status'];
    if (req.query.q) {
      const q = String(req.query.q);
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { issuedNumber: { contains: q, mode: 'insensitive' } },
      ];
    }

    // expiring-soon: dokumen ACTIVE yang expiry-nya dalam N hari ke depan.
    const expiringDaysRaw = req.query.expiringDays ?? req.query.expiringSoon;
    if (expiringDaysRaw !== undefined) {
      const days = Number(expiringDaysRaw);
      const window = Number.isFinite(days) && days > 0 ? days : 60;
      const now = new Date();
      const cutoff = new Date(now.getTime() + window * 24 * 60 * 60 * 1000);
      where.status = 'ACTIVE';
      where.expiryDate = { gte: now, lte: cutoff };
    }

    const docs = await prisma.gaDocument.findMany({
      where,
      orderBy: [{ expiryDate: 'asc' }],
      include: {
        type: { select: { code: true, name: true, category: true } },
        asset: { select: { id: true, code: true, name: true } },
        versions: { orderBy: { versionNo: 'desc' }, take: 1 },
      },
    });

    const now = new Date();
    const enriched = docs.map((d) => {
      let daysToExpiry: number | null = null;
      if (d.expiryDate) {
        daysToExpiry = Math.floor(
          (d.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
      }
      return { ...d, daysToExpiry };
    });

    return res.json(enriched);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/documents', 'Gagal mengambil daftar dokumen.');
  }
});

const DOCUMENT_LIST_INCLUDE = {
  type: { select: { code: true, name: true, category: true } },
  asset: { select: { id: true, code: true, name: true } },
  versions: { orderBy: { versionNo: 'desc' }, take: 1 },
} satisfies Prisma.GaDocumentInclude;

async function listDocumentsPaged(query: Record<string, unknown>, res: Response) {
  const now = new Date();
  const filter = buildGaDocumentWhere(query, now);
  if (!filter.ok) return res.status(400).json({ error: filter.error });
  const { page, limit, skip } = parseListPaging(query, { defaultLimit: 25, maxLimit: 200 });
  const sort = parseSort(query.sort, GA_DOCUMENT_SORT_FIELDS, DEFAULT_GA_DOCUMENT_SORT);
  const [docs, total] = await prisma.$transaction([
    prisma.gaDocument.findMany({
      where: filter.where,
      orderBy: gaDocumentOrderBy(sort),
      skip,
      take: limit,
      include: DOCUMENT_LIST_INCLUDE,
    }),
    prisma.gaDocument.count({ where: filter.where }),
  ]);
  const window = expiryWindow(now);
  const data = docs.map((d) => ({
    ...d,
    daysToExpiry: daysToExpiry(d.expiryDate, now),
    expiryState: deriveExpiryState(d.status, d.expiryDate, window),
  }));
  return res.json({ data, total, page, limit });
}

// GET /api/ga/documents/summary — KPI counts (expired / expiring within 30
// days / valid) for the same filters as the paged list. Declared before '/:id'.
router.get('/summary', async (req, res) => {
  try {
    const now = new Date();
    const filter = buildGaDocumentWhere(req.query as Record<string, unknown>, now);
    if (!filter.ok) return res.status(400).json({ error: filter.error });
    const window = expiryWindow(now);
    const countWith = (extra?: Prisma.GaDocumentWhereInput) =>
      prisma.gaDocument.count({ where: extra ? { AND: [filter.where, extra] } : filter.where });
    const [count, expiredCount, expiringCount, validCount] = await Promise.all([
      countWith(),
      countWith(expiryWhere('expired', window)),
      countWith(expiryWhere('expiring', window)),
      countWith(expiryWhere('valid', window)),
    ]);
    const summary: GaDocumentSummary = { count, expiredCount, expiringCount, validCount };
    return res.json(summary);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/documents/summary', 'Gagal menghitung ringkasan dokumen.');
  }
});

// GET /api/ga/documents/:id — detail + semua versi
router.get('/:id', async (req, res) => {
  try {
    const doc = await prisma.gaDocument.findUnique({
      where: { id: String(req.params.id) },
      include: {
        type: true,
        asset: { select: { id: true, code: true, name: true } },
        versions: { orderBy: { versionNo: 'desc' } },
      },
    });
    if (!doc) return res.status(404).json({ error: 'Dokumen tidak ditemukan.' });
    return res.json(doc);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/documents/:id', 'Gagal mengambil detail dokumen.');
  }
});

// POST /api/ga/documents — buat dokumen (auto-generate code bila kosong)
router.post('/', async (req: AuthRequest, res) => {
  const input = validateBody(DocumentSchema, req.body, res);
  if (!input) return;

  try {
    const doc = await prisma.$transaction(async (tx) => {
      let code = input.code?.trim() ?? '';
      if (!code) {
        const prefix = await resolveDocCodePrefix(tx, input.typeId);
        if (!prefix) throw new Error('Tipe dokumen tidak ditemukan untuk auto-generate kode.');
        code = await nextDocCodeInTx(tx, prefix);
      }
      return tx.gaDocument.create({
        data: {
          code,
          title: input.title,
          typeId: input.typeId,
          assetId: input.assetId || null,
          issuedBy: input.issuedBy || null,
          issuedNumber: input.issuedNumber || null,
          effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : null,
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
          status: input.status,
          customFields: (input.customFields as Prisma.InputJsonValue | undefined) ?? undefined,
          createdBy: req.user!.userId,
        },
      });
    });
    return res.status(201).json({ id: doc.id, code: doc.code });
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/documents', 'Gagal membuat dokumen.');
  }
});

// PUT /api/ga/documents/:id — update dokumen
router.put('/:id', async (req, res) => {
  const input = validateBody(DocumentSchema.partial(), req.body, res);
  if (!input) return;

  try {
    const updated = await prisma.gaDocument.update({
      where: { id: String(req.params.id) },
      data: {
        code: input.code || undefined,
        title: input.title,
        typeId: input.typeId,
        assetId: input.assetId ?? null,
        issuedBy: input.issuedBy ?? null,
        issuedNumber: input.issuedNumber ?? null,
        effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : null,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
        status: input.status,
        customFields: (input.customFields as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    });
    return res.json({ id: updated.id });
  } catch (error) {
    return handleRouteError(res, error, 'PUT /ga/documents/:id', 'Gagal memperbarui dokumen.');
  }
});

// DELETE /api/ga/documents/:id — hapus dokumen (versi ikut terhapus via
// onDelete: Cascade). File fisik dibiarkan; cleanup di luar scope.
router.delete('/:id', async (req, res) => {
  try {
    await prisma.gaDocument.delete({ where: { id: String(req.params.id) } });
    return res.json({ message: 'Dokumen dihapus.' });
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /ga/documents/:id', 'Gagal menghapus dokumen.');
  }
});

// POST /api/ga/documents/:id/versions — upload versi baru (file PDF)
router.post('/:id/versions', upload.single('file'), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'File PDF wajib diupload.' });

  try {
    const documentId = String(req.params.id);
    const doc = await prisma.gaDocument.findUnique({
      where: { id: documentId },
      select: { id: true },
    });
    if (!doc) return res.status(404).json({ error: 'Dokumen tidak ditemukan.' });

    await fs.mkdir(DIR, { recursive: true });

    const last = await prisma.gaDocumentVersion.findFirst({
      where: { documentId },
      orderBy: { versionNo: 'desc' },
      select: { versionNo: true },
    });
    const nextVersion = (last?.versionNo ?? 0) + 1;

    const ext = path.extname(req.file.originalname) || '.pdf';
    const storedName = `${crypto.randomUUID()}${ext}`;
    const fullPath = path.join(DIR, storedName);
    await fs.writeFile(fullPath, req.file.buffer);

    const version = await prisma.gaDocumentVersion.create({
      data: {
        documentId,
        versionNo: nextVersion,
        filePath: path.join(DIR_REL, storedName),
        fileSize: req.file.size,
        uploadedBy: req.user!.userId,
        notes: (req.body.notes as string) || null,
      },
    });

    return res.status(201).json(version);
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/documents/:id/versions', 'Gagal mengupload versi dokumen.');
  }
});

// GET /api/ga/documents/:id/versions/:vid/file — download file versi.
// versionId di-scope ke documentId untuk mencegah IDOR antar dokumen.
router.get('/:id/versions/:vid/file', async (req, res) => {
  try {
    const v = await prisma.gaDocumentVersion.findFirst({
      where: { id: String(req.params.vid), documentId: String(req.params.id) },
      include: { document: { select: { code: true } } },
    });
    if (!v) return res.status(404).json({ error: 'File tidak ditemukan.' });

    // Path traversal guard: filePath tersimpan harus tetap di dalam UPLOADS_DIR.
    const safe = path.normalize(path.join(UPLOADS_DIR, v.filePath));
    if (safe !== UPLOADS_DIR && !safe.startsWith(UPLOADS_DIR + path.sep)) {
      return res.status(400).json({ error: 'Path file tidak valid.' });
    }

    const filename = `${v.document.code}-v${v.versionNo}${path.extname(v.filePath)}`;
    const safeAscii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\\r\n]/g, '_');
    const encoded = encodeURIComponent(filename);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeAscii}"; filename*=UTF-8''${encoded}`,
    );
    return res.sendFile(safe);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/documents/:id/versions/:vid/file', 'Gagal mengambil file.');
  }
});

export default router;
