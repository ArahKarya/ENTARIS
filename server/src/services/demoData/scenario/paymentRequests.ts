// Payment requests (Pengajuan Pembayaran) through the real workflow. A staff user requests; each
// approval step is taken by the user the rules require (the requester's supervisor, then finance,
// then the director role when an approval rule applies), because nobody may approve their own
// request. Results: a paid reimbursement, a cash advance paid and settled, and one request still
// waiting for finance.

import { prisma } from '../../../lib/prisma';
import { DemoApiError, type DemoActor } from '../api';
import { windowDate, ymd, type DemoContext } from '../context';
import type { BackOfficeAccounts } from './backOffice';

type RequestType = { id: string; code: string; kind: string; requiresSettlement: boolean; requiresAttachment: boolean; isActive: boolean };
type RequestState = { id: string; number: string; status: string; directorRole: string | null; supervisorId: string | null; settlementStatus: string | null; settlementSupervisorId: string | null };

async function findType(ctx: DemoContext, kind: string, needsSettlement: boolean): Promise<string> {
  const types = await ctx.api.get<RequestType[]>(ctx.admin, '/payment-request-types');
  const usable = types.find((t) => t.isActive && t.kind === kind && !t.requiresAttachment && t.requiresSettlement === needsSettlement);
  if (usable) return usable.id;
  const { data } = await ctx.api.post<{ id: string }>(ctx.admin, '/payment-request-types', {
    code: kind === 'CASH_ADVANCE' ? 'DEMO-UM' : 'DEMO-RB',
    name: kind === 'CASH_ADVANCE' ? 'Uang Muka Kerja' : 'Penggantian Biaya',
    kind,
    requiresSettlement: needsSettlement,
  });
  await ctx.record('payment_request_types', data.id);
  return data.id;
}

/** Active user by id (supervisor snapshots are stored on the request when it is submitted). */
async function activeUser(id: string | null): Promise<DemoActor | null> {
  if (!id) return null;
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, isActive: true } });
  return u?.isActive ? { id: u.id, role: u.role } : null;
}

/** The director step may only be taken by a super admin or a user holding the request's director role. */
async function directorFor(ctx: DemoContext, pr: RequestState, requesterId: string): Promise<DemoActor | null> {
  if (pr.directorRole) {
    const u = await prisma.user.findFirst({ where: { role: pr.directorRole, isActive: true, id: { not: requesterId } }, select: { id: true, role: true } });
    if (u) return u;
  }
  const admin = await prisma.role.findFirst({ where: { key: ctx.admin.role, isSuperAdmin: true }, select: { key: true } });
  return admin ? ctx.admin : null;
}

/** Walk the request through every approval step until APPROVED (or stop at `stopAt`). */
async function approveThrough(ctx: DemoContext, requester: DemoActor, id: string, stopAt?: string): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const pr = await ctx.api.get<RequestState>(requester, `/payment-requests/${id}`);
    if (pr.status === 'APPROVED' || pr.status === stopAt) return;
    const approver =
      pr.status === 'SUBMITTED' ? await activeUser(pr.supervisorId) : pr.status === 'PENDING_DIRECTOR' ? await directorFor(ctx, pr, requester.id) : ctx.admin;
    if (!approver) throw new Error(`Pengajuan ${pr.number} menunggu persetujuan, tetapi tidak ada pengguna aktif yang berwenang menyetujuinya.`);
    await ctx.api.post(approver, `/payment-requests/${id}/approve`, { note: 'Disetujui' });
  }
}

async function settleSubmit(ctx: DemoContext, requester: DemoActor, id: string): Promise<void> {
  await ctx.api.post(requester, `/payment-requests/${id}/settlement/submit`);
  const pr = await ctx.api.get<RequestState>(requester, `/payment-requests/${id}`);
  if (pr.settlementStatus !== 'SUBMITTED') return;
  const sup = await activeUser(pr.settlementSupervisorId ?? pr.supervisorId);
  if (!sup) throw new Error(`Pertanggungjawaban ${pr.number} menunggu atasan, tetapi atasan pengaju tidak aktif.`);
  await ctx.api.post(sup, `/payment-requests/${id}/settlement/approve`, { note: 'Sesuai nota' });
}

export function schedulePaymentRequests(ctx: DemoContext, acc: () => BackOfficeAccounts): void {
  const staff = ctx.staff;
  if (!staff || staff.id === ctx.admin.id) {
    ctx.skip('Pengajuan pembayaran', 'tidak ada pengguna staf untuk menjadi pengaju');
    return;
  }
  const guard = (label: string, fn: () => Promise<void>) => async () => {
    try {
      await fn();
    } catch (err) {
      // A company may have narrowed the staff role or set a director the demo cannot act as.
      if (err instanceof DemoApiError && [401, 403].includes(err.status)) return ctx.skip(label, err.message);
      throw err;
    }
  };

  ctx.schedule(windowDate(ctx, 1, 20), 'Pengajuan penggantian biaya', guard('Pengajuan penggantian biaya', async () => {
    const { data } = await ctx.api.post<{ id: string }>(staff, '/payment-requests', {
      typeId: await findType(ctx, 'REIMBURSEMENT', false),
      payeeKind: 'EMPLOYEE',
      payeeName: 'Andi Saputra',
      purpose: 'Penggantian pembelian ATK dan materai untuk dokumen kontrak',
      lines: [
        { description: 'Kertas, map, dan tinta printer', amount: 350_000, expenseAccountId: acc().supplies },
        { description: 'Materai 10.000 (12 lembar)', amount: 120_000, expenseAccountId: acc().supplies },
      ],
    });
    await ctx.api.post(staff, `/payment-requests/${data.id}/submit`);
    await approveThrough(ctx, staff, data.id);
    await ctx.api.post(ctx.admin, `/payment-requests/${data.id}/pay`, { cashAccountId: ctx.accounts.cash, paymentDate: ymd(windowDate(ctx, 1, 21)) });
  }));

  ctx.schedule(windowDate(ctx, 2, 10), 'Uang muka perjalanan', guard('Uang muka perjalanan', async () => {
    const { data } = await ctx.api.post<{ id: string }>(staff, '/payment-requests', {
      typeId: await findType(ctx, 'CASH_ADVANCE', true),
      payeeKind: 'EMPLOYEE',
      payeeName: 'Andi Saputra',
      purpose: 'Uang muka survei supplier gabah ke sentra panen',
      lines: [
        { description: 'Bensin dan tol', amount: 1_200_000 },
        { description: 'Penginapan dua malam', amount: 900_000 },
        { description: 'Uang makan', amount: 400_000 },
      ],
    });
    await ctx.api.post(staff, `/payment-requests/${data.id}/submit`);
    await approveThrough(ctx, staff, data.id);
    await ctx.api.post(ctx.admin, `/payment-requests/${data.id}/pay`, { cashAccountId: ctx.accounts.cash, paymentDate: ymd(windowDate(ctx, 2, 11)) });

    // Settlement: spent less than the advance, the rest goes back to petty cash.
    await ctx.api.put(staff, `/payment-requests/${data.id}/settlement`, {
      note: 'Nota terlampir di map keuangan',
      lines: [
        { description: 'Bensin dan tol', amount: 1_050_000, expenseAccountId: acc().transport },
        { description: 'Penginapan dua malam', amount: 900_000, expenseAccountId: acc().transport },
        { description: 'Uang makan', amount: 300_000, expenseAccountId: acc().meals },
      ],
    });
    await settleSubmit(ctx, staff, data.id);
    await ctx.api.post(ctx.admin, `/payment-requests/${data.id}/settlement/post`, {
      settlementDate: ymd(windowDate(ctx, 2, 16)),
      cashAccountId: ctx.accounts.cash,
    });
  }));

  ctx.schedule(windowDate(ctx, 2, 25), 'Pengajuan menunggu keuangan', guard('Pengajuan menunggu keuangan', async () => {
    const { data } = await ctx.api.post<{ id: string }>(staff, '/payment-requests', {
      typeId: await findType(ctx, 'REIMBURSEMENT', false),
      payeeKind: 'EMPLOYEE',
      payeeName: 'Andi Saputra',
      purpose: 'Penggantian biaya parkir dan tol pengiriman minggu ini',
      lines: [{ description: 'Parkir dan tol (5 rit)', amount: 185_000, expenseAccountId: acc().transport }],
    });
    await ctx.api.post(staff, `/payment-requests/${data.id}/submit`);
    await approveThrough(ctx, staff, data.id, 'PENDING_FINANCE');
  }));
}
