/**
 * /attachments routes follow the parent document's RBAC module (view to read, edit to upload/delete).
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
    salesOrder: { findUnique: vi.fn() },
    transactionAttachment: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  },
  storage: { deleteAttachment: vi.fn(), saveAttachment: vi.fn() },
}));
vi.mock('../../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../utils/fileStorage', () => ({
  ATTACHMENT_MIME: ['application/pdf'],
  saveAttachment: storage.saveAttachment,
  deleteAttachment: storage.deleteAttachment,
  getFullPath: vi.fn((p: string) => `/nonexistent/${p}`),
  detectMimeFromMagicBytes: vi.fn(() => 'application/pdf'),
}));

import { DEFAULT_MATRIX } from '../../constants/modules';
import { invalidatePermissionCache } from '../../services/permissionService';
import attachmentsRouter from '../attachments';

let server: Server;
let base = '';
let currentUser = { userId: 'u1', role: 'Admin' };

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
afterAll(() => {
  server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  invalidatePermissionCache();
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
  prismaMock.payment.findUnique.mockResolvedValue({ paymentType: 'Pay' });
  prismaMock.transactionAttachment.findMany.mockResolvedValue([{ id: 'att-1' }]);
});

const as = (role: string, userId = 'u1') => {
  currentUser = { userId, role };
};
const ATT_PAYMENT = { id: 'att-1', referenceType: 'payment', referenceId: 'pay-1', uploadedBy: 'u1', filePath: 'a.pdf', mimeType: 'application/pdf', fileName: 'a.pdf' };

describe('GET /attachments/:referenceType/:referenceId', () => {
  it('lists attachments for a role with view on the module', async () => {
    as('Viewer');
    const res = await fetch(`${base}/sales_order/so-1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 'att-1' }]);
  });

  it('returns 403 without view on the module', async () => {
    as('StaffProduksi');
    const res = await fetch(`${base}/payment/pay-1`);
    expect(res.status).toBe(403);
    expect(prismaMock.transactionAttachment.findMany).not.toHaveBeenCalled();
  });

  it('rejects an unknown reference type', async () => {
    as('Admin');
    expect((await fetch(`${base}/payroll/x`)).status).toBe(400);
  });
});

describe('GET /attachments/file/:id', () => {
  it('denies reading a payment proof without payment view', async () => {
    as('StaffProduksi');
    prismaMock.transactionAttachment.findUnique.mockResolvedValue(ATT_PAYMENT);
    expect((await fetch(`${base}/file/att-1`)).status).toBe(403);
  });
});

describe('GET /attachments/invoice/:type/:id/related', () => {
  it('needs view on the invoice module', async () => {
    as('StaffProduksi');
    expect((await fetch(`${base}/invoice/sales/si-1/related`)).status).toBe(403);
  });
});

describe('DELETE /attachments/:id', () => {
  it('lets an Accountant (payment edit) delete a payment attachment', async () => {
    as('Accountant', 'someone-else');
    prismaMock.transactionAttachment.findUnique.mockResolvedValue(ATT_PAYMENT);
    const res = await fetch(`${base}/att-1`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(storage.deleteAttachment).toHaveBeenCalledWith('a.pdf');
    expect(prismaMock.transactionAttachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
  });

  it('keeps Admin allowed', async () => {
    as('Admin', 'admin');
    prismaMock.transactionAttachment.findUnique.mockResolvedValue(ATT_PAYMENT);
    expect((await fetch(`${base}/att-1`, { method: 'DELETE' })).status).toBe(200);
  });

  it('denies a Viewer even as the uploader (view only)', async () => {
    as('Viewer', 'u1');
    prismaMock.transactionAttachment.findUnique.mockResolvedValue({ ...ATT_PAYMENT, referenceType: 'sales_order', referenceId: 'so-1' });
    const res = await fetch(`${base}/att-1`, { method: 'DELETE' });
    expect(res.status).toBe(403);
    expect(storage.deleteAttachment).not.toHaveBeenCalled();
    expect(prismaMock.transactionAttachment.delete).not.toHaveBeenCalled();
  });
});

describe('POST /attachments/upload', () => {
  const upload = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    fd.append('files', new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' }), 'a.pdf');
    return fetch(`${base}/upload`, { method: 'POST', body: fd });
  };

  it('denies upload without edit on the module', async () => {
    as('Viewer');
    const res = await upload({ referenceType: 'sales_order', referenceId: 'so-1' });
    expect(res.status).toBe(403);
    expect(storage.saveAttachment).not.toHaveBeenCalled();
  });

  it('allows upload with edit on the module', async () => {
    as('StaffProduksi');
    prismaMock.salesOrder.findUnique.mockResolvedValue({ id: 'so-1' });
    prismaMock.transactionAttachment.count.mockResolvedValue(0);
    storage.saveAttachment.mockResolvedValue({ storedName: 's', mimeType: 'application/pdf', fileSize: 4, filePath: 'p' });
    prismaMock.transactionAttachment.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 'new', ...data }));
    const res = await upload({ referenceType: 'sales_order', referenceId: 'so-1' });
    expect(res.status).toBe(201);
    expect(storage.saveAttachment).toHaveBeenCalledTimes(1);
  });
});

describe('POST /attachments/counts', () => {
  it('needs view on the module', async () => {
    as('StaffProduksi');
    const res = await fetch(`${base}/counts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ referenceType: 'journal', referenceIds: ['je-1'] }),
    });
    expect(res.status).toBe(403);
  });

  it('returns counts for a payment viewer', async () => {
    as('Viewer');
    prismaMock.transactionAttachment.groupBy.mockResolvedValue([{ referenceId: 'pay-1', _count: { id: 2 } }]);
    const res = await fetch(`${base}/counts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ referenceType: 'payment', referenceIds: ['pay-1'] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ 'pay-1': 2 });
  });
});
