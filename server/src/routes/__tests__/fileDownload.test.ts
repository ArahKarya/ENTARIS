/**
 * Tautan unduh bertanda tangan: pembuatan (POST /attachments/download-link) dan unduh (GET /files/dl/:ticket).
 * Menegaskan: ACL dicek di dua titik, tiket sekali pakai, tiket rusak/kedaluwarsa ditolak, pengguna nonaktif ditolak.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const ATT_ID = '11111111-1111-4111-8111-111111111111';
const dir = mkdtempSync(path.join(tmpdir(), 'dl-'));
const filePath = path.join(dir, 'nota.pdf');
writeFileSync(filePath, '%PDF-1.4 test');

vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-jwt-secret-value-0123456789';
});

const { prismaMock, access } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn() },
    transactionAttachment: { findUnique: vi.fn() },
  },
  access: { check: vi.fn() },
}));
vi.mock('../../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../utils/fileStorage', async () => {
  const real = await vi.importActual<typeof import('../../utils/fileStorage')>('../../utils/fileStorage');
  return { ...real, getFullPath: () => filePath };
});
vi.mock('../../services/attachmentAccess', async () => {
  const real = await vi.importActual<typeof import('../../services/attachmentAccess')>('../../services/attachmentAccess');
  return { ...real, checkAttachmentAccess: access.check };
});

import { resetUsedJtiForTests, signFileTicket, fileTicketSecret } from '../../services/fileTicket';
import attachmentLinks from '../attachmentLinks';
import files from '../files';

let server: Server;
let base = '';
const att = { id: ATT_ID, referenceType: 'sales_invoice', referenceId: 'inv-1', fileName: 'Nota Bayar.pdf', mimeType: 'application/pdf', fileSize: 13, filePath: 'x/nota.pdf' };

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.PUBLIC_BASE_URL = 'https://erp.contoh.id';
  const app = express();
  app.use(express.json());
  app.use('/files', files);
  app.use((req, _res, next) => {
    (req as express.Request & { user?: { userId: string; role: string } }).user = { userId: 'u1', role: 'Accountant' };
    next();
  });
  app.use('/attachments', attachmentLinks);
  await new Promise<void>((r) => {
    server = app.listen(0, () => r());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

beforeEach(() => {
  resetUsedJtiForTests();
  vi.clearAllMocks();
  access.check.mockResolvedValue({ ok: true });
  prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', role: 'Accountant', isActive: true });
  prismaMock.transactionAttachment.findUnique.mockResolvedValue(att);
});

const post = (body: unknown) =>
  fetch(`${base}/attachments/download-link`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const mkTicket = (over: Partial<{ uid: string; ref: string }> = {}) =>
  signFileTicket(fileTicketSecret(), { uid: over.uid ?? 'u1', kind: 'attachment', ref: over.ref ?? ATT_ID, fn: att.fileName });

describe('POST /attachments/download-link', () => {
  it('mengembalikan url absolut bertanda tangan + metadata', async () => {
    const r = await post({ attachmentId: ATT_ID });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.url).toMatch(/^https:\/\/erp\.contoh\.id\/api\/files\/dl\/.+\..+$/);
    expect(j).toMatchObject({ fileName: 'Nota Bayar.pdf', mimeType: 'application/pdf', size: 13, expiresInSeconds: 300, oneTimeUse: true });
    expect(j.warning).toBeUndefined();
    expect(access.check).toHaveBeenCalledWith({ userId: 'u1', role: 'Accountant' }, 'sales_invoice', 'inv-1', 'view');
  });

  it('403 bila tak punya izin view dokumen induk', async () => {
    access.check.mockResolvedValue({ ok: false, status: 403, error: 'Akses ditolak: Tidak memiliki izin.' });
    expect((await post({ attachmentId: ATT_ID })).status).toBe(403);
  });

  it('404 bila lampiran tidak ada; 400 bila id bukan UUID', async () => {
    prismaMock.transactionAttachment.findUnique.mockResolvedValue(null);
    expect((await post({ attachmentId: ATT_ID })).status).toBe(404);
    expect((await post({ attachmentId: 'bukan-uuid' })).status).toBe(400);
  });
});

describe('GET /files/dl/:ticket', () => {
  it('mengunduh berkas dengan header unduhan, lalu menolak pemakaian kedua (410)', async () => {
    const t = mkTicket();
    const r1 = await fetch(`${base}/files/dl/${t}`);
    expect(r1.status).toBe(200);
    expect(r1.headers.get('content-type')).toContain('application/pdf');
    expect(r1.headers.get('content-disposition')).toContain('attachment');
    expect(r1.headers.get('cache-control')).toContain('no-store');
    expect(await r1.text()).toBe('%PDF-1.4 test');
    expect((await fetch(`${base}/files/dl/${t}`)).status).toBe(410);
  });

  it('ACL dicek ULANG saat unduh: izin dicabut setelah tiket dibuat → 403 dan tiket tidak terkonsumsi', async () => {
    const t = mkTicket();
    access.check.mockResolvedValue({ ok: false, status: 403, error: 'Akses ditolak: Tidak memiliki izin.' });
    expect((await fetch(`${base}/files/dl/${t}`)).status).toBe(403);
    access.check.mockResolvedValue({ ok: true });
    expect((await fetch(`${base}/files/dl/${t}`)).status).toBe(200);
  });

  it('tiket rusak / rahasia salah → 401', async () => {
    expect((await fetch(`${base}/files/dl/abc.def`)).status).toBe(401);
    const forged = signFileTicket('rahasia-lain', { uid: 'u1', kind: 'attachment', ref: ATT_ID, fn: 'x.pdf' });
    expect((await fetch(`${base}/files/dl/${forged}`)).status).toBe(401);
  });

  it('tiket kedaluwarsa → 401', async () => {
    const t = signFileTicket(fileTicketSecret(), { uid: 'u1', kind: 'attachment', ref: ATT_ID, fn: 'x.pdf' }, 1000);
    expect((await fetch(`${base}/files/dl/${t}`)).status).toBe(401);
  });

  it('pengguna nonaktif atau hilang → 403', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', role: 'Accountant', isActive: false });
    expect((await fetch(`${base}/files/dl/${mkTicket()}`)).status).toBe(403);
    prismaMock.user.findUnique.mockResolvedValue(null);
    expect((await fetch(`${base}/files/dl/${mkTicket()}`)).status).toBe(403);
  });

  it('lampiran sudah dihapus → 404', async () => {
    prismaMock.transactionAttachment.findUnique.mockResolvedValue(null);
    expect((await fetch(`${base}/files/dl/${mkTicket()}`)).status).toBe(404);
  });

  it('tiket document-pdf → ref rusak 404 dan tidak mengonsumsi tiket', async () => {
    const t = signFileTicket(fileTicketSecret(), { uid: 'u1', kind: 'document-pdf', ref: 'tanpa-pemisah', fn: 'q.pdf' });
    expect((await fetch(`${base}/files/dl/${t}`)).status).toBe(404);
    expect((await fetch(`${base}/files/dl/${t}`)).status).toBe(404);
  });
});
