import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    role: { findMany: vi.fn() },
    payment: { findUnique: vi.fn() },
    approvalRequest: { findUnique: vi.fn() },
  },
}));
vi.mock('../../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { DEFAULT_MATRIX, MODULE_KEYS } from '../../constants/modules';
import { invalidatePermissionCache } from '../permissionService';
import { checkAttachmentAccess, ATTACHMENT_MODULES } from '../attachmentAccess';

// Built-in roles with the default permission matrix, plus a custom role for capability checks.
function seedRoles(extra: Array<{ key: string; perms?: Record<string, 'view' | 'edit'>; caps?: string[] }> = []) {
  const toRole = (key: string, perms: Record<string, 'view' | 'edit'>, caps: string[] = [], isSuperAdmin = false) => ({
    key,
    isSuperAdmin,
    isActive: true,
    permissions: Object.entries(perms).map(([module, a]) => ({ module, canView: true, canEdit: a === 'edit' })),
    capabilities: caps.map((capability) => ({ capability })),
  });
  prismaMock.role.findMany.mockResolvedValue([
    toRole('Admin', {}, [], true),
    ...Object.entries(DEFAULT_MATRIX).map(([key, perms]) => toRole(key, perms)),
    ...extra.map((r) => toRole(r.key, r.perms ?? {}, r.caps)),
  ]);
}

const actor = (role: string, userId = 'u1') => ({ userId, role });

beforeEach(() => {
  vi.clearAllMocks();
  invalidatePermissionCache();
  seedRoles();
  prismaMock.payment.findUnique.mockResolvedValue({ paymentType: 'Pay' });
});

describe('ATTACHMENT_MODULES', () => {
  it('only references modules from constants/modules.ts', () => {
    const used = Object.values(ATTACHMENT_MODULES).flatMap((m) => [...m.view, ...m.edit]);
    for (const key of used) expect(MODULE_KEYS).toContain(key);
  });
});

describe('checkAttachmentAccess', () => {
  it('always allows Admin', async () => {
    for (const type of ['payment', 'journal', 'sales_invoice', 'goods_receipt']) {
      expect(await checkAttachmentAccess(actor('Admin'), type, 'doc-1', 'edit')).toEqual({ ok: true });
    }
  });

  it('follows the module matrix: StaffProduksi edits purchase invoices but not payments or sales invoices', async () => {
    expect((await checkAttachmentAccess(actor('StaffProduksi'), 'purchase_invoice', 'pi-1', 'edit')).ok).toBe(true);
    expect((await checkAttachmentAccess(actor('StaffProduksi'), 'goods_receipt', 'gr-1', 'view')).ok).toBe(true);
    expect(await checkAttachmentAccess(actor('StaffProduksi'), 'payment', 'pay-1', 'view')).toEqual({
      ok: false, status: 403, error: 'Akses ditolak: Tidak memiliki izin.',
    });
    expect((await checkAttachmentAccess(actor('StaffProduksi'), 'sales_invoice', 'si-1', 'edit')).ok).toBe(false);
  });

  it('separates view from edit: Viewer reads sales order files but cannot upload or delete', async () => {
    expect((await checkAttachmentAccess(actor('Viewer'), 'sales_order', 'so-1', 'view')).ok).toBe(true);
    expect((await checkAttachmentAccess(actor('Viewer'), 'sales_order', 'so-1', 'edit')).ok).toBe(false);
    expect((await checkAttachmentAccess(actor('Viewer'), 'purchase_invoice', 'pi-1', 'view')).ok).toBe(false);
  });

  it('lets journal attachments be read from the cash ledger (payment view) but edited only with journal edit', async () => {
    seedRoles([{ key: 'Kasir', perms: { payment: 'edit' } }]);
    expect((await checkAttachmentAccess(actor('Kasir'), 'journal', 'je-1', 'view')).ok).toBe(true);
    expect((await checkAttachmentAccess(actor('Kasir'), 'journal', 'je-1', 'edit')).ok).toBe(false);
  });

  it('grants deposit payments to the deposit module', async () => {
    seedRoles([{ key: 'DepositOnly', perms: { customer_deposit: 'edit' } }]);
    prismaMock.payment.findUnique.mockResolvedValue({ paymentType: 'CustomerDeposit' });
    expect((await checkAttachmentAccess(actor('DepositOnly'), 'payment', 'pay-1', 'edit')).ok).toBe(true);
    prismaMock.payment.findUnique.mockResolvedValue({ paymentType: 'Receive' });
    expect((await checkAttachmentAccess(actor('DepositOnly'), 'payment', 'pay-2', 'edit')).ok).toBe(false);
    prismaMock.payment.findUnique.mockResolvedValue({ paymentType: 'VendorDeposit' });
    expect((await checkAttachmentAccess(actor('DepositOnly'), 'payment', 'pay-3', 'view')).ok).toBe(false);
  });

  it('denies unknown reference types and anonymous requests', async () => {
    expect((await checkAttachmentAccess(actor('Admin'), 'salary_slip', 'x', 'view')).ok).toBe(false);
    expect((await checkAttachmentAccess(undefined, 'sales_order', 'so-1', 'view')).ok).toBe(false);
  });

  it('denies a role that was deactivated', async () => {
    prismaMock.role.findMany.mockResolvedValue([
      { key: 'Accountant', isSuperAdmin: false, isActive: false, permissions: [{ module: 'payment', canView: true, canEdit: true }], capabilities: [] },
    ]);
    expect((await checkAttachmentAccess(actor('Accountant'), 'payment', 'pay-1', 'view')).ok).toBe(false);
  });

  describe('approval requests', () => {
    beforeEach(() => prismaMock.approvalRequest.findUnique.mockResolvedValue({ requestedBy: 'owner' }));

    it('lets the requester upload and approvals viewers read', async () => {
      expect((await checkAttachmentAccess(actor('Viewer', 'owner'), 'approval_request', 'ar-1', 'edit')).ok).toBe(true);
      expect((await checkAttachmentAccess(actor('StaffProduksi', 'other'), 'approval_request', 'ar-1', 'view')).ok).toBe(true);
    });

    it('denies other users editing, and readers without the approvals module', async () => {
      expect((await checkAttachmentAccess(actor('StaffProduksi', 'other'), 'approval_request', 'ar-1', 'edit')).ok).toBe(false);
      expect((await checkAttachmentAccess(actor('Viewer', 'other'), 'approval_request', 'ar-1', 'view')).ok).toBe(false);
    });

    it('allows approval.view_all holders and reports a missing request', async () => {
      seedRoles([{ key: 'Auditor', caps: ['approval.view_all'] }]);
      expect((await checkAttachmentAccess(actor('Auditor', 'x'), 'approval_request', 'ar-1', 'edit')).ok).toBe(true);
      prismaMock.approvalRequest.findUnique.mockResolvedValue(null);
      expect(await checkAttachmentAccess(actor('Viewer', 'x'), 'approval_request', 'ar-9', 'edit')).toEqual({
        ok: false, status: 404, error: 'Pengajuan tidak ditemukan.',
      });
    });
  });
});
