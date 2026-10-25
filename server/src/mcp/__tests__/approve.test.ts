import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-jwt-secret-value-0123456789';
  return {
    db: {
      approvalRequest: { updateMany: vi.fn(), update: vi.fn().mockResolvedValue({}), create: vi.fn(), findUnique: vi.fn() },
      user: { findUnique: vi.fn() },
      purchaseOrder: { findUnique: vi.fn() },
    },
    callHandler: vi.fn(),
    notifyUsers: vi.fn().mockResolvedValue(1),
    notifyAdmins: vi.fn().mockResolvedValue(1),
  };
});
vi.mock('../../lib/prisma', () => ({ prisma: m.db }));
vi.mock('../../services/notificationService', () => ({ notifyUsers: m.notifyUsers, notifyAdmins: m.notifyAdmins }));
vi.mock('../execute', async () => ({ ...(await vi.importActual<typeof import('../execute')>('../execute')), callHandler: m.callHandler }));

import { approveQueuedToolCall } from '../approve';
import { queueToolCall, renderConfirm, isAiToolDocumentType } from '../queue';
import { decideApproval } from '../../services/approvalDecision';

const PAYLOAD = {
  tool: 'party_create', args: { name: 'PT X', partyType: 'Customer' }, handler: 'POST /api/parties', risk: 'write',
  confirm: 'Buat pelanggan PT X.', actor: { userId: 'u1', name: 'Budi', role: 'Accountant', jabatan: 'Kasir' }, via: 'mcp', tokenName: 'aira-dev', channel: 'whatsapp',
};
const REQ = { id: 'apr-1', documentType: 'ai_tool:party_create', status: 'Pending', requestedBy: 'u1', payload: PAYLOAD } as never;

beforeEach(() => {
  vi.clearAllMocks();
  m.db.approvalRequest.updateMany.mockResolvedValue({ count: 1 });
  m.db.approvalRequest.update.mockResolvedValue({});
  m.db.user.findUnique.mockResolvedValue({ id: 'u1', role: 'Accountant', isActive: true, airaEnabled: true, fullName: 'Budi' });
  m.callHandler.mockResolvedValue({ status: 201, ok: true, body: { kind: 'json', data: { id: 'party-1', name: 'PT X', number: 'C-001' } } });
});

describe('queueToolCall', () => {
  it('stores documentType ai_tool:<name> + full payload for the ORIGINAL actor, renders confirm text', async () => {
    m.db.approvalRequest.create.mockResolvedValue({ id: 'apr-9' });
    const r = await queueToolCall({
      tool: { name: 'payreq_pay', handler: 'POST /api/payment-requests/:id/pay', risk: 'critical', confirm_template: 'Bayar pengajuan {id} senilai {amount}?' },
      args: { id: 'pr-1', amount: '150000' },
      actor: { id: 'u1', fullName: 'Budi', role: 'Accountant', airaJabatan: 'Kasir' },
      tokenName: 'aira-dev', channel: 'whatsapp', ref: 'wa:1', idempotencyKey: 'k',
    });
    expect(r).toEqual({ approvalId: 'apr-9', confirm: 'Bayar pengajuan pr-1 senilai 150000?' });
    const data = m.db.approvalRequest.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ documentType: 'ai_tool:payreq_pay', status: 'Pending', requestedBy: 'u1', amount: 150000 });
    expect(data.payload).toMatchObject({ tool: 'payreq_pay', handler: 'POST /api/payment-requests/:id/pay', via: 'mcp', tokenName: 'aira-dev', channel: 'whatsapp', actor: { userId: 'u1' }, args: { id: 'pr-1' } });
    expect(m.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ type: 'approval_pending', excludeUserId: 'u1' }));
  });

  it('shows the document number in the approval note but keeps the UUID in the stored args', async () => {
    const id = '0a3f1c2e-1111-4222-8333-444455556666';
    m.db.purchaseOrder.findUnique.mockResolvedValue({ poNumber: 'PO-202610-0001' });
    m.db.approvalRequest.create.mockResolvedValue({ id: 'apr-10' });
    const r = await queueToolCall({
      tool: { name: 'po_submit', handler: 'POST /api/purchase-orders/:id/submit', risk: 'write', confirm_template: 'Ajukan PO {id}?' },
      args: { id },
      actor: { id: 'u1', fullName: 'Budi', role: 'Accountant', airaJabatan: null },
      tokenName: 'aira-dev', channel: null,
    });
    expect(r.confirm).toBe('Ajukan PO PO-202610-0001?');
    const data = m.db.approvalRequest.create.mock.calls[0][0].data;
    expect(data.notes).toBe('Ajukan PO PO-202610-0001?');
    expect(data.payload).toMatchObject({ confirm: 'Ajukan PO PO-202610-0001?', args: { id } });
  });

  it('renderConfirm leaves unknown placeholders and never prints objects', () => {
    expect(renderConfirm('A {x} {y} {z}', { x: 1, z: { a: 1 } })).toBe('A 1 {y} {z}');
    expect(renderConfirm('{items} baris', { items: [1, 2, 3] })).toBe('3 baris');
    expect(isAiToolDocumentType('ai_tool:x')).toBe(true);
    expect(isAiToolDocumentType('ProductionRun')).toBe(false);
  });
});

describe('approveQueuedToolCall (execution as the original actor)', () => {
  it('approve runs the stored call as the requester, then marks Approved with the result', async () => {
    const r = await approveQueuedToolCall(REQ, 'admin-1', 'oke');
    expect(r).toMatchObject({ ok: true, status: 'Approved', docNumber: 'C-001', documentType: 'ai_tool:party_create' });
    const call = m.callHandler.mock.calls[0][0];
    expect(call).toMatchObject({ actor: { id: 'u1', role: 'Accountant' }, approvalId: 'apr-1', tokenName: 'aira-dev', args: { name: 'PT X' } });
    const upd = m.db.approvalRequest.update.mock.calls[0][0].data;
    expect(upd).toMatchObject({ status: 'Approved', approvedBy: 'admin-1', documentNumber: 'C-001', notes: 'oke' });
    expect(upd.payload.result).toMatchObject({ status: 201 });
    expect(m.notifyUsers).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userIds: ['u1'], type: 'approval_approved' }));
  });

  it('is claimed atomically: a second approver gets "sudah diproses" and nothing runs', async () => {
    m.db.approvalRequest.updateMany.mockResolvedValue({ count: 0 });
    const r = await approveQueuedToolCall(REQ, 'admin-2', '');
    expect(r).toMatchObject({ ok: false, error: 'Pengajuan sudah diproses.' });
    expect(m.callHandler).not.toHaveBeenCalled();
  });

  it('handler rejection (gate/validation) -> back to Pending with lastError, not Approved', async () => {
    m.callHandler.mockResolvedValue({ status: 400, ok: false, body: { kind: 'json', data: { error: 'Stok tidak mencukupi.' } } });
    const r = await approveQueuedToolCall(REQ, 'admin-1', '');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Stok tidak mencukupi.');
    const upd = m.db.approvalRequest.update.mock.calls[0][0].data;
    expect(upd.status).toBe('Pending');
    expect(upd.payload.lastError).toContain('Stok tidak mencukupi.');
    expect(m.notifyUsers).not.toHaveBeenCalled();
  });

  it('handler says partner not found -> lastError carries the corrective hint (party_search)', async () => {
    m.callHandler.mockResolvedValue({ status: 404, ok: false, body: { kind: 'json', data: { error: 'Data mitra tidak ditemukan.' } } });
    const r = await approveQueuedToolCall(REQ, 'admin-1', '');
    expect(r.ok).toBe(false);
    const upd = m.db.approvalRequest.update.mock.calls[0][0].data;
    expect(upd.payload.lastError).toContain('Data mitra tidak ditemukan.');
    expect(upd.payload.lastError).toContain('party_search');
    expect(upd.payload.lastErrorAt).toBeTruthy();
  });

  it('inactive requester or revoked AIRA access -> refuses to execute', async () => {
    m.db.user.findUnique.mockResolvedValueOnce({ id: 'u1', role: 'Accountant', isActive: false, airaEnabled: true, fullName: 'Budi' });
    expect((await approveQueuedToolCall(REQ, 'a', '')).error).toContain('tidak aktif');
    m.db.user.findUnique.mockResolvedValueOnce({ id: 'u1', role: 'Accountant', isActive: true, airaEnabled: false, fullName: 'Budi' });
    expect((await approveQueuedToolCall(REQ, 'a', '')).error).toContain('Akses AIRA');
    expect(m.callHandler).not.toHaveBeenCalled();
  });

  it('tool removed from registry or corrupt payload -> clean failure', async () => {
    expect((await approveQueuedToolCall({ ...(REQ as object), payload: { ...PAYLOAD, tool: 'tool_gone' } } as never, 'a', '')).error).toContain('tidak terdaftar');
    expect((await approveQueuedToolCall({ ...(REQ as object), payload: null } as never, 'a', '')).error).toContain('tidak valid');
  });
});

describe('decideApproval integration', () => {
  it('approve routes ai_tool:* to the stored-call executor; reject touches nothing else', async () => {
    m.db.approvalRequest.findUnique.mockResolvedValue(REQ);
    const ok = await decideApproval({ requestId: 'apr-1', action: 'approve', actorUserId: 'admin-1' });
    expect(ok).toMatchObject({ ok: true, status: 'Approved' });
    expect(m.callHandler).toHaveBeenCalledTimes(1);

    m.callHandler.mockClear();
    const rej = await decideApproval({ requestId: 'apr-1', action: 'reject', actorUserId: 'admin-1', note: 'Tidak perlu' });
    expect(rej).toMatchObject({ ok: true, status: 'Rejected' });
    expect(m.callHandler).not.toHaveBeenCalled();
    expect(m.db.approvalRequest.update.mock.calls.at(-1)![0].data).toMatchObject({ status: 'Rejected', rejectedBy: 'admin-1' });
  });
});
