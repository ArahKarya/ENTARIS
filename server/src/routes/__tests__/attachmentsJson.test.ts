/**
 * POST /attachments/json (tool MCP att_upload) + tipe dokumen baru di /upload.
 * Aturan harus identik dengan /upload: izin edit modul induk, dokumen harus ada, batas jumlah/ukuran, magic byte.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const { prismaMock, storage } = vi.hoisted(() => ({
  prismaMock: {
    role: { findMany: vi.fn() },
    payment: { findUnique: vi.fn() },
    approvalRequest: { findUnique: vi.fn() },
    quotation: { findUnique: vi.fn() },
    proformaInvoice: { findUnique: vi.fn() },
    purchaseOrder: { findUnique: vi.fn() },
    productionRun: { findUnique: vi.fn() },
    fixedAsset: { findUnique: vi.fn() },
    transactionAttachment: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  },
  storage: { saveAttachment: vi.fn(), deleteAttachment: vi.fn(), detect: vi.fn() },
}));
vi.mock('../../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../utils/fileStorage', () => ({
  ATTACHMENT_MIME: ['application/pdf', 'image/png'],
  saveAttachment: storage.saveAttachment,
  deleteAttachment: storage.deleteAttachment,
  getFullPath: vi.fn((p: string) => `/nonexistent/${p}`),
  detectMimeFromMagicBytes: storage.detect,
}));

import { DEFAULT_MATRIX } from '../../constants/modules';
import { invalidatePermissionCache } from '../../services/permissionService';
import attachmentsRouter from '../attachments';

const PDF_B64 = Buffer.from('%PDF-1.4 hello world').toString('base64');
let server: Server;
let base = '';
const currentUser = { userId: 'u1', role: 'Accountant' };

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { user?: typeof currentUser }).user = currentUser;
    next();
  });
  app.use('/attachments', attachmentsRouter);
  await new Promise<void>((r) => {
    server = app.listen(0, () => r());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/attachments`;
});
afterAll(() => server.close());

beforeEach(() => {
  vi.clearAllMocks();
  invalidatePermissionCache();
  Object.assign(currentUser, { userId: 'u1', role: 'Accountant' });
  prismaMock.role.findMany.mockResolvedValue([
    { key: 'Admin', isSuperAdmin: true, isActive: true, permissions: [], capabilities: [] },
    ...Object.entries(DEFAULT_MATRIX).map(([key, perms]) => ({
      key,
      isSuperAdmin: false,
      isActive: true,
      permissions: Object.entries(perms).map(([module, a]) => ({ module, canView: true, canEdit: a === 'edit' })),
      capabilities: [],
    })),
  ]);
  prismaMock.quotation.findUnique.mockResolvedValue({ id: 'q1' });
  prismaMock.transactionAttachment.count.mockResolvedValue(0);
  storage.detect.mockReturnValue('application/pdf');
  storage.saveAttachment.mockResolvedValue({ storedName: 's.pdf', mimeType: 'application/pdf', fileSize: 20, filePath: 'x/s.pdf' });
  prismaMock.transactionAttachment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'a1', ...data }));
});

const post = (body: unknown) =>
  fetch(`${base}/json`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const ok = { referenceType: 'quotation', referenceId: 'q1', fileName: 'po-customer.pdf', contentBase64: PDF_B64 };

describe('POST /attachments/json', () => {
  it('melampirkan base64 ke tipe dokumen baru (quotation) → 201 dan tersimpan', async () => {
    const r = await post(ok);
    expect(r.status).toBe(201);
    const j = await r.json();
    expect(j).toHaveLength(1);
    expect(j[0]).toMatchObject({ referenceType: 'quotation', referenceId: 'q1', fileName: 'po-customer.pdf', uploadedBy: 'u1' });
    expect(storage.saveAttachment).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['proforma_invoice', 'proformaInvoice'],
    ['purchase_order', 'purchaseOrder'],
    ['production_run', 'productionRun'],
    ['fixed_asset', 'fixedAsset'],
  ] as const)('tipe %s → cek keberadaan dokumen di model yang benar', async (type, model) => {
    (prismaMock as unknown as Record<string, { findUnique: ReturnType<typeof vi.fn> }>)[model].findUnique.mockResolvedValue({ id: 'x1' });
    expect((await post({ ...ok, referenceType: type, referenceId: 'x1' })).status).toBe(201);
    expect((prismaMock as unknown as Record<string, { findUnique: ReturnType<typeof vi.fn> }>)[model].findUnique).toHaveBeenCalled();
  });

  it('404 bila dokumen induk tidak ada; tidak ada berkas tersimpan', async () => {
    prismaMock.quotation.findUnique.mockResolvedValue(null);
    const r = await post(ok);
    expect(r.status).toBe(404);
    expect(storage.saveAttachment).not.toHaveBeenCalled();
  });

  it('403 bila role tak punya izin edit modul induk (Viewer → quotation)', async () => {
    Object.assign(currentUser, { userId: 'u2', role: 'Viewer' });
    expect((await post(ok)).status).toBe(403);
    expect(storage.saveAttachment).not.toHaveBeenCalled();
  });

  it('400 untuk referenceType tak dikenal, base64 tanpa fileName, dan dua sumber sekaligus', async () => {
    expect((await post({ ...ok, referenceType: 'rahasia' })).status).toBe(400);
    expect((await post({ referenceType: 'quotation', referenceId: 'q1', contentBase64: PDF_B64 })).status).toBe(400);
    expect((await post({ ...ok, chatAttachmentId: 'c1' })).status).toBe(400);
  });

  it('menolak bila sudah 5 berkas pada dokumen yang sama', async () => {
    prismaMock.transactionAttachment.count.mockResolvedValue(5);
    const r = await post(ok);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/Maksimal 5 file/);
    expect(storage.saveAttachment).not.toHaveBeenCalled();
  });

  it('menolak isi yang bukan JPG/PNG/WebP/PDF (magic byte)', async () => {
    storage.detect.mockReturnValue(null);
    const r = await post(ok);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/tidak dikenali sebagai JPG\/PNG\/WebP\/PDF/);
    expect(storage.saveAttachment).not.toHaveBeenCalled();
  });
});
