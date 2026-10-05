// Pengajuan Pembayaran (Payment Request) — /api/payment-requests.
//
// Mounted WITHOUT a module gate: every logged-in user may create requests and
// see their own, and supervisors decide on their subordinates' requests.
// Finance actions (verify / approve as finance / pay / cancel payment) and the
// "Semua" list check the 'payment_request' permission here, per endpoint;
// the director step checks the role snapshotted from ApprovalRule.
//
// GL (on pay): DR beban per baris (or DR Uang Muka Karyawan for CASH_ADVANCE /
// TRAVEL) / CR kas-bank. Cancel payment voids that journal.
// Stage 2: pertanggungjawaban uang muka (/:id/settlement/*) — requester submits
// realization lines, supervisor approves, Finance verifies accounts and posts
// DR beban / CR Uang Muka Karyawan (+ kas-bank for sisa / kurang bayar).
import { Router, type Response } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { AuthRequest } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { BusinessError, handleRouteError } from '../utils/errors';
import { firstString, parseListPaging, parseSort } from '../utils/listQuery';
import {
  ATTACHMENT_MIME,
  contentDisposition,
  deleteAttachment,
  detectMimeFromMagicBytes,
  getFullPath,
  saveAttachment,
} from '../utils/fileStorage';
import {
  PaymentRequestDecisionSchema,
  PaymentRequestInputSchema,
  PaymentRequestPaySchema,
  PaymentRequestReasonSchema,
  PaymentRequestSettlementDraftSchema,
  PaymentRequestSettlementPostSchema,
  PaymentRequestSettlementPreviewSchema,
  PaymentRequestVerifySchema,
} from '../utils/schemas';
import { can, isSuperAdminRole } from '../services/permissionService';
import eamRoutes from './paymentRequestEam';
import {
  PR_MODULE,
  PR_SCOPES,
  canViewRequest,
  checkCanDecide,
  checkCancelPayment,
  checkEditable,
  checkFinanceVerify,
  checkPayable,
  checkRequesterCancel,
  scopeWhere,
  type PrScope,
  type ViewerCtx,
} from '../services/paymentRequestRules';
import {
  DEFAULT_PAYMENT_REQUEST_SORT,
  PAYMENT_REQUEST_SORT_FIELDS,
  buildPaymentRequestWhere,
  paymentRequestOrderBy,
  summarizePaymentRequests,
} from '../services/paymentRequestList';
import {
  NotFoundError,
  approvePaymentRequestInTx,
  cancelPaymentRequestInTx,
  cancelPaymentRequestPaymentInTx,
  createPaymentRequestInTx,
  declinePaymentRequestInTx,
  payPaymentRequestInTx,
  submitPaymentRequestInTx,
  updatePaymentRequestInTx,
  verifyPaymentRequestAccountsInTx,
  type PrEvent,
} from '../services/paymentRequestService';
import { dispatchPaymentRequestEvents } from '../services/paymentRequestNotify';
import {
  OUTSTANDING_SETTLEMENT_STATUSES,
  SETTLEMENT_OVERDUE_DAYS,
  advanceAgeDays,
  checkCancelSettlementPosting,
  isAdvanceOverdue,
  checkSettlementDecide,
  checkSettlementEditable,
  summarizeAdvances,
} from '../services/paymentRequestSettlementRules';
import {
  approveSettlementInTx,
  cancelSettlementPostingInTx,
  postSettlementInTx,
  previewSettlementInTx,
  returnSettlementInTx,
  saveSettlementDraftInTx,
  submitSettlementInTx,
} from '../services/paymentRequestSettlementService';

const router = Router();

// Tagihan EAM (finance only) — registered before the '/:id' routes.
router.use('/eam', eamRoutes);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // same limits as /api/attachments
const MAX_FILES_PER_REQUEST = 10;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (ATTACHMENT_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new BusinessError(`Tipe file tidak didukung: ${file.mimetype}. Hanya JPG, PNG, WebP, dan PDF.`));
  },
});

/** multer errors (size / type / count) → 400 with a readable message. */
const uploadFiles = (req: AuthRequest, res: Response, next: () => void) =>
  upload.array('files', 5)(req, res, (err: unknown) => {
    if (!err) return next();
    const code = (err as { code?: string }).code;
    const message =
      code === 'LIMIT_FILE_SIZE'
        ? 'Ukuran file maksimal 5 MB.'
        : code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Maksimal 5 file per unggahan.'
          : err instanceof Error ? err.message : 'Gagal mengupload lampiran.';
    return res.status(400).json({ error: message });
  });

async function viewerOf(req: AuthRequest): Promise<ViewerCtx> {
  const { userId, role } = req.user!;
  const [isSuperAdmin, isFinance, canViewAll] = await Promise.all([
    isSuperAdminRole(role),
    can(role, PR_MODULE, 'edit'),
    can(role, PR_MODULE, 'view'),
  ]);
  return { id: userId, role, isSuperAdmin, isFinance, canViewAll };
}

function fail(res: Response, error: unknown, context: string, fallback: string) {
  if (error instanceof NotFoundError) return res.status(404).json({ error: error.message });
  return handleRouteError(res, error, context, fallback);
}

const parseScope = (v: unknown): PrScope => {
  const s = firstString(v);
  return (PR_SCOPES as readonly string[]).includes(s ?? '') ? (s as PrScope) : 'mine';
};

/** Load a request the viewer may see, or throw NotFound (no existence leak). */
async function visibleRequest(id: string, ctx: ViewerCtx) {
  const pr = await prisma.paymentRequest.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      requesterId: true,
      supervisorId: true,
      directorRole: true,
      settlementStatus: true,
      settlementSupervisorId: true,
    },
  });
  if (!pr || !canViewRequest(pr, ctx)) throw new NotFoundError('Pengajuan tidak ditemukan.');
  return pr;
}

const LIST_SELECT = {
  id: true,
  number: true,
  status: true,
  purpose: true,
  payeeKind: true,
  payeeName: true,
  totalAmount: true,
  neededBy: true,
  createdAt: true,
  submittedAt: true,
  paidAt: true,
  paymentDate: true,
  settlementStatus: true,
  settlementDeadline: true,
  directorRole: true,
  type: { select: { id: true, name: true, kind: true } },
  requester: { select: { id: true, fullName: true } },
} as const;

async function badgeCounts(ctx: ViewerCtx) {
  const approvalsWhere = scopeWhere('approvals', ctx)!;
  const payableWhere = scopeWhere('payable', ctx);
  const [approvals, payable] = await Promise.all([
    prisma.paymentRequest.count({ where: approvalsWhere }),
    payableWhere ? prisma.paymentRequest.count({ where: payableWhere }) : Promise.resolve(0),
  ]);
  return { approvals, payable };
}

// GET /meta — current user context for the form & tabs.
router.get('/meta', async (req: AuthRequest, res) => {
  try {
    const ctx = await viewerOf(req);
    const [me, last, badges, myAdvances] = await Promise.all([
      prisma.user.findUnique({
        where: { id: ctx.id },
        select: { id: true, fullName: true, supervisor: { select: { id: true, fullName: true, isActive: true } } },
      }),
      prisma.paymentRequest.findFirst({
        where: { requesterId: ctx.id, payeeKind: 'EMPLOYEE', bankAccountNo: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { bankName: true, bankAccountNo: true, bankAccountHolder: true, department: true },
      }),
      badgeCounts(ctx),
      prisma.paymentRequest.findMany({
        where: { requesterId: ctx.id, status: 'PAID', settlementStatus: { in: [...OUTSTANDING_SETTLEMENT_STATUSES] } },
        select: { requesterId: true, totalAmount: true, paymentDate: true, settlementDeadline: true, requester: { select: { fullName: true } } },
      }),
    ]);
    const mine = summarizeAdvances(myAdvances.map((r) => ({ ...r, requesterName: r.requester.fullName })));
    return res.json({
      openAdvances: {
        count: mine.count,
        amount: mine.amount,
        overdueCount: mine.overdueCount,
        overdueAmount: mine.overdueAmount,
        oldestDays: mine.byEmployee[0]?.oldestDays ?? 0,
      },
      overdueDays: SETTLEMENT_OVERDUE_DAYS,
      me,
      role: ctx.role,
      isFinance: ctx.isFinance,
      canViewAll: ctx.canViewAll,
      isSuperAdmin: ctx.isSuperAdmin,
      lastPayee: last,
      badges,
    });
  } catch (error) {
    return fail(res, error, 'GET /payment-requests/meta', 'Gagal memuat data pengajuan.');
  }
});

// GET / — paged list for a scope (mine | approvals | payable | all).
router.get('/', async (req: AuthRequest, res) => {
  try {
    const ctx = await viewerOf(req);
    const scope = scopeWhere(parseScope(req.query.scope), ctx);
    if (!scope) return res.status(403).json({ error: 'Akses ditolak: Tidak memiliki izin.' });
    const query = req.query as Record<string, unknown>;
    const built = buildPaymentRequestWhere(query, scope);
    if (!built.ok) return res.status(400).json({ error: built.error });
    const { page, limit, skip } = parseListPaging(query, { defaultLimit: 25, maxLimit: 500 });
    const sort = parseSort(query.sort, PAYMENT_REQUEST_SORT_FIELDS, DEFAULT_PAYMENT_REQUEST_SORT);
    const [data, total] = await Promise.all([
      prisma.paymentRequest.findMany({ where: built.where, select: LIST_SELECT, orderBy: paymentRequestOrderBy(sort), skip, take: limit }),
      prisma.paymentRequest.count({ where: built.where }),
    ]);
    return res.json({ data, total, page, limit });
  } catch (error) {
    return fail(res, error, 'GET /payment-requests', 'Gagal mengambil daftar pengajuan.');
  }
});

// GET /summary — KPI per status for the same scope + filters, plus tab badges.
router.get('/summary', async (req: AuthRequest, res) => {
  try {
    const ctx = await viewerOf(req);
    const scope = scopeWhere(parseScope(req.query.scope), ctx);
    if (!scope) return res.status(403).json({ error: 'Akses ditolak: Tidak memiliki izin.' });
    const built = buildPaymentRequestWhere(req.query as Record<string, unknown>, scope);
    if (!built.ok) return res.status(400).json({ error: built.error });
    const [groups, badges] = await Promise.all([
      prisma.paymentRequest.groupBy({ by: ['status'], where: built.where, _count: { _all: true }, _sum: { totalAmount: true } }),
      badgeCounts(ctx),
    ]);
    return res.json({ ...summarizePaymentRequests(groups), badges });
  } catch (error) {
    return fail(res, error, 'GET /payment-requests/summary', 'Gagal menghitung ringkasan pengajuan.');
  }
});

// GET /advances/summary — outstanding employee advances (same visibility as the "Belum
// Dipertanggungjawabkan" tab): totals, overdue and a per-employee breakdown.
router.get('/advances/summary', async (req: AuthRequest, res) => {
  try {
    const ctx = await viewerOf(req);
    const scope = scopeWhere('advances', ctx)!;
    const rows = await prisma.paymentRequest.findMany({
      where: scope,
      select: { requesterId: true, totalAmount: true, paymentDate: true, settlementDeadline: true, requester: { select: { fullName: true } } },
    });
    return res.json(summarizeAdvances(rows.map((r) => ({ ...r, requesterName: r.requester.fullName }))));
  } catch (error) {
    return fail(res, error, 'GET /payment-requests/advances/summary', 'Gagal menghitung uang muka karyawan.');
  }
});

// GET /attachments/:attId — download / preview (same visibility as the request).
router.get('/attachments/:attId', async (req: AuthRequest, res) => {
  try {
    const ctx = await viewerOf(req);
    const att = await prisma.paymentRequestAttachment.findUnique({ where: { id: req.params.attId as string } });
    if (!att) return res.status(404).json({ error: 'File tidak ditemukan.' });
    await visibleRequest(att.paymentRequestId, ctx);
    res.setHeader('Content-Type', att.mimeType);
    res.setHeader('Content-Disposition', contentDisposition(att.fileName, att.mimeType.startsWith('image/') || att.mimeType === 'application/pdf'));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(getFullPath(att.filePath));
  } catch (error) {
    return fail(res, error, 'GET /payment-requests/attachments/:attId', 'Gagal mengambil file.');
  }
});

// GET /:id — detail + allowed actions for the current user.
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const ctx = await viewerOf(req);
    const ref = await visibleRequest(req.params.id as string, ctx);
    const pr = await prisma.paymentRequest.findUniqueOrThrow({
      where: { id: ref.id },
      include: {
        type: true,
        requester: { select: { id: true, fullName: true, email: true } },
        supervisor: { select: { id: true, fullName: true } },
        party: { select: { id: true, name: true } },
        costCenter: { select: { id: true, code: true, name: true } },
        cashAccount: { select: { id: true, accountNumber: true, name: true } },
        paidBy: { select: { id: true, fullName: true } },
        journalEntry: { select: { id: true, entryNumber: true, status: true } },
        lines: {
          orderBy: { lineNo: 'asc' },
          include: { expenseAccount: { select: { id: true, accountNumber: true, name: true } } },
        },
        settlementSupervisor: { select: { id: true, fullName: true } },
        settlementCashAccount: { select: { id: true, accountNumber: true, name: true } },
        settlementJournal: { select: { id: true, entryNumber: true, status: true } },
        settlementLines: {
          orderBy: { lineNo: 'asc' },
          include: { expenseAccount: { select: { id: true, accountNumber: true, name: true } } },
        },
        attachments: { orderBy: { createdAt: 'asc' } },
        history: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { id: true, fullName: true } } } },
      },
    });
    const isRequester = pr.requesterId === ctx.id;
    const decide = checkCanDecide(pr, ctx);
    const settleDecide = checkSettlementDecide(pr, ctx);
    const actions = {
      edit: checkEditable(pr, ctx.id).ok,
      submit: checkEditable(pr, ctx.id).ok,
      decide: decide.ok,
      step: decide.ok ? decide.step : null,
      verify: checkFinanceVerify(pr, ctx).ok,
      pay: checkPayable(pr, ctx).ok,
      cancel: isRequester && checkRequesterCancel(pr, ctx.id).ok,
      cancelPayment: checkCancelPayment(pr, ctx).ok,
      viewJournal: await can(ctx.role, 'journal', 'view'),
      settlement: {
        edit: checkSettlementEditable(pr, ctx.id).ok,
        decide: settleDecide.ok,
        step: settleDecide.ok ? settleDecide.step : null,
        post: settleDecide.ok && settleDecide.step === 'FINANCE',
        cancelPosting: checkCancelSettlementPosting(pr, ctx).ok,
      },
    };
    const outstanding = pr.status === 'PAID' && (OUTSTANDING_SETTLEMENT_STATUSES as readonly string[]).includes(pr.settlementStatus ?? '');
    const advanceAge = outstanding
      ? { days: advanceAgeDays(pr.paymentDate), overdue: isAdvanceOverdue(pr), overdueDays: SETTLEMENT_OVERDUE_DAYS }
      : null;
    return res.json({ ...pr, advanceAge, actions });
  } catch (error) {
    return fail(res, error, 'GET /payment-requests/:id', 'Gagal mengambil detail pengajuan.');
  }
});

/** Run a transition in a transaction, then notify (after commit). */
async function runTransition(
  res: Response,
  context: string,
  fallback: string,
  fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<{ request: unknown; events: PrEvent[] }>,
) {
  try {
    const out = await prisma.$transaction(fn, { timeout: 20_000 });
    void dispatchPaymentRequestEvents(out.events);
    return res.json(out.request);
  } catch (error) {
    return fail(res, error, context, fallback);
  }
}

// POST / — create a draft (any logged-in user).
router.post('/', async (req: AuthRequest, res) => {
  const body = validateBody(PaymentRequestInputSchema, req.body, res);
  if (!body) return;
  try {
    const ctx = await viewerOf(req);
    const pr = await prisma.$transaction((tx) => createPaymentRequestInTx(tx, ctx, body));
    logger.info({ id: pr.id, number: pr.number, by: ctx.id }, 'Payment request created');
    return res.status(201).json(pr);
  } catch (error) {
    return fail(res, error, 'POST /payment-requests', 'Gagal membuat pengajuan.');
  }
});

// PUT /:id — edit while DRAFT / REVISION (requester only).
router.put('/:id', async (req: AuthRequest, res) => {
  const body = validateBody(PaymentRequestInputSchema, req.body, res);
  if (!body) return;
  try {
    const ctx = await viewerOf(req);
    await visibleRequest(req.params.id as string, ctx);
    const pr = await prisma.$transaction((tx) => updatePaymentRequestInTx(tx, req.params.id as string, ctx, body));
    return res.json(pr);
  } catch (error) {
    return fail(res, error, 'PUT /payment-requests/:id', 'Gagal menyimpan pengajuan.');
  }
});

router.post('/:id/submit', async (req: AuthRequest, res) => {
  const ctx = await viewerOf(req);
  return runTransition(res, 'POST /payment-requests/:id/submit', 'Gagal mengajukan.', async (tx) => {
    await visibleRequest(req.params.id as string, ctx);
    return submitPaymentRequestInTx(tx, req.params.id as string, ctx);
  });
});

router.post('/:id/approve', async (req: AuthRequest, res) => {
  const body = validateBody(PaymentRequestDecisionSchema, req.body ?? {}, res);
  if (!body) return;
  const ctx = await viewerOf(req);
  return runTransition(res, 'POST /payment-requests/:id/approve', 'Gagal menyetujui pengajuan.', async (tx) => {
    await visibleRequest(req.params.id as string, ctx);
    return approvePaymentRequestInTx(tx, req.params.id as string, ctx, body);
  });
});

for (const [path, mode] of [['reject', 'REJECT'], ['return', 'RETURN']] as const) {
  router.post(`/:id/${path}`, async (req: AuthRequest, res) => {
    const body = validateBody(PaymentRequestReasonSchema, req.body, res);
    if (!body) return;
    const ctx = await viewerOf(req);
    return runTransition(res, `POST /payment-requests/:id/${path}`, 'Gagal memproses pengajuan.', async (tx) => {
      await visibleRequest(req.params.id as string, ctx);
      return declinePaymentRequestInTx(tx, req.params.id as string, ctx, mode, body.reason);
    });
  });
}

router.post('/:id/cancel', async (req: AuthRequest, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 1000) : null;
  const ctx = await viewerOf(req);
  return runTransition(res, 'POST /payment-requests/:id/cancel', 'Gagal membatalkan pengajuan.', async (tx) => {
    await visibleRequest(req.params.id as string, ctx);
    return cancelPaymentRequestInTx(tx, req.params.id as string, ctx, reason);
  });
});

// PUT /:id/accounts — finance sets the expense account per line.
router.put('/:id/accounts', async (req: AuthRequest, res) => {
  const body = validateBody(PaymentRequestVerifySchema, req.body, res);
  if (!body) return;
  try {
    const ctx = await viewerOf(req);
    await visibleRequest(req.params.id as string, ctx);
    const pr = await prisma.$transaction((tx) => verifyPaymentRequestAccountsInTx(tx, req.params.id as string, ctx, body.lineAccounts));
    return res.json(pr);
  } catch (error) {
    return fail(res, error, 'PUT /payment-requests/:id/accounts', 'Gagal menyimpan akun biaya.');
  }
});

router.post('/:id/pay', async (req: AuthRequest, res) => {
  const body = validateBody(PaymentRequestPaySchema, req.body, res);
  if (!body) return;
  const ctx = await viewerOf(req);
  return runTransition(res, 'POST /payment-requests/:id/pay', 'Gagal membayar pengajuan.', async (tx) => {
    await visibleRequest(req.params.id as string, ctx);
    const out = await payPaymentRequestInTx(tx, req.params.id as string, ctx, body);
    logger.info({ id: out.request.id, journal: out.journal.entryNumber, by: ctx.id }, 'Payment request paid');
    return out;
  });
});

router.post('/:id/cancel-payment', async (req: AuthRequest, res) => {
  const body = validateBody(PaymentRequestReasonSchema, req.body, res);
  if (!body) return;
  const ctx = await viewerOf(req);
  return runTransition(res, 'POST /payment-requests/:id/cancel-payment', 'Gagal membatalkan pembayaran.', async (tx) => {
    await visibleRequest(req.params.id as string, ctx);
    return cancelPaymentRequestPaymentInTx(tx, req.params.id as string, ctx, body.reason);
  });
});

// ─── Pertanggungjawaban (settlement) ─────────────────────────────────────────

// PUT /:id/settlement — requester saves the realization lines (status unchanged).
router.put('/:id/settlement', async (req: AuthRequest, res) => {
  const body = validateBody(PaymentRequestSettlementDraftSchema, req.body, res);
  if (!body) return;
  try {
    const ctx = await viewerOf(req);
    await visibleRequest(req.params.id as string, ctx);
    const pr = await prisma.$transaction((tx) => saveSettlementDraftInTx(tx, req.params.id as string, ctx, body));
    return res.json(pr);
  } catch (error) {
    return fail(res, error, 'PUT /payment-requests/:id/settlement', 'Gagal menyimpan pertanggungjawaban.');
  }
});

router.post('/:id/settlement/submit', async (req: AuthRequest, res) => {
  const ctx = await viewerOf(req);
  return runTransition(res, 'POST /payment-requests/:id/settlement/submit', 'Gagal mengajukan pertanggungjawaban.', async (tx) => {
    await visibleRequest(req.params.id as string, ctx);
    return submitSettlementInTx(tx, req.params.id as string, ctx);
  });
});

// Supervisor approval (Finance step is /settlement/post).
router.post('/:id/settlement/approve', async (req: AuthRequest, res) => {
  const body = validateBody(PaymentRequestDecisionSchema, req.body ?? {}, res);
  if (!body) return;
  const ctx = await viewerOf(req);
  return runTransition(res, 'POST /payment-requests/:id/settlement/approve', 'Gagal menyetujui pertanggungjawaban.', async (tx) => {
    await visibleRequest(req.params.id as string, ctx);
    return approveSettlementInTx(tx, req.params.id as string, ctx, body.note);
  });
});

router.post('/:id/settlement/return', async (req: AuthRequest, res) => {
  const body = validateBody(PaymentRequestReasonSchema, req.body, res);
  if (!body) return;
  const ctx = await viewerOf(req);
  return runTransition(res, 'POST /payment-requests/:id/settlement/return', 'Gagal mengembalikan pertanggungjawaban.', async (tx) => {
    await visibleRequest(req.params.id as string, ctx);
    return returnSettlementInTx(tx, req.params.id as string, ctx, body.reason);
  });
});

// POST /:id/settlement/preview — DR/CR journal preview for the finance step (nothing saved).
router.post('/:id/settlement/preview', async (req: AuthRequest, res) => {
  const body = validateBody(PaymentRequestSettlementPreviewSchema, req.body ?? {}, res);
  if (!body) return;
  try {
    const ctx = await viewerOf(req);
    await visibleRequest(req.params.id as string, ctx);
    const preview = await prisma.$transaction((tx) => previewSettlementInTx(tx, req.params.id as string, body));
    return res.json(preview);
  } catch (error) {
    return fail(res, error, 'POST /payment-requests/:id/settlement/preview', 'Gagal menghitung pratinjau jurnal.');
  }
});

router.post('/:id/settlement/post', async (req: AuthRequest, res) => {
  const body = validateBody(PaymentRequestSettlementPostSchema, req.body, res);
  if (!body) return;
  const ctx = await viewerOf(req);
  return runTransition(res, 'POST /payment-requests/:id/settlement/post', 'Gagal memposting pertanggungjawaban.', async (tx) => {
    await visibleRequest(req.params.id as string, ctx);
    const out = await postSettlementInTx(tx, req.params.id as string, ctx, body);
    logger.info({ id: out.request.id, journal: out.journal.entryNumber, mode: out.preview.mode, by: ctx.id }, 'Payment request settlement posted');
    return out;
  });
});

router.post('/:id/settlement/cancel-posting', async (req: AuthRequest, res) => {
  const body = validateBody(PaymentRequestReasonSchema, req.body, res);
  if (!body) return;
  const ctx = await viewerOf(req);
  return runTransition(res, 'POST /payment-requests/:id/settlement/cancel-posting', 'Gagal membatalkan posting pertanggungjawaban.', async (tx) => {
    await visibleRequest(req.params.id as string, ctx);
    return cancelSettlementPostingInTx(tx, req.params.id as string, ctx, body.reason);
  });
});

// ─── Attachments (requester, while DRAFT / REVISION; settlement scope while OPEN / REVISION) ──

const scopeOf = (v: unknown): 'REQUEST' | 'SETTLEMENT' => (firstString(v) === 'settlement' ? 'SETTLEMENT' : 'REQUEST');

router.post('/:id/attachments', uploadFiles, async (req: AuthRequest, res) => {
  try {
    const ctx = await viewerOf(req);
    const id = req.params.id as string;
    const pr = await visibleRequest(id, ctx);
    const scope = scopeOf(req.query.scope);
    const editable = scope === 'SETTLEMENT' ? checkSettlementEditable(pr, ctx.id) : checkEditable(pr, ctx.id);
    if (!editable.ok) return res.status(400).json({ error: editable.error });
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) return res.status(400).json({ error: 'Tidak ada file yang diupload.' });
    const existing = await prisma.paymentRequestAttachment.count({ where: { paymentRequestId: id, scope } });
    if (existing + files.length > MAX_FILES_PER_REQUEST) {
      return res.status(400).json({ error: `Maksimal ${MAX_FILES_PER_REQUEST} lampiran per pengajuan.` });
    }
    for (const f of files) {
      const detected = detectMimeFromMagicBytes(f.buffer);
      if (!detected || detected !== f.mimetype) {
        return res.status(400).json({ error: `File "${f.originalname}" tidak dikenali sebagai JPG/PNG/WebP/PDF.` });
      }
    }
    const created = [];
    for (const f of files) {
      const saved = await saveAttachment(f.buffer, f.originalname, f.mimetype);
      created.push(
        await prisma.paymentRequestAttachment.create({
          data: {
            paymentRequestId: id,
            fileName: f.originalname.slice(0, 255),
            storedName: saved.storedName,
            mimeType: saved.mimeType,
            fileSize: saved.fileSize,
            filePath: saved.filePath,
            uploadedBy: ctx.id,
            scope,
          },
        }),
      );
    }
    return res.status(201).json(created);
  } catch (error) {
    return fail(res, error, 'POST /payment-requests/:id/attachments', 'Gagal mengupload lampiran.');
  }
});

router.delete('/:id/attachments/:attId', async (req: AuthRequest, res) => {
  try {
    const ctx = await viewerOf(req);
    const id = req.params.id as string;
    const pr = await visibleRequest(id, ctx);
    const att = await prisma.paymentRequestAttachment.findFirst({ where: { id: req.params.attId as string, paymentRequestId: id } });
    if (!att) return res.status(404).json({ error: 'File tidak ditemukan.' });
    const editable = att.scope === 'SETTLEMENT' ? checkSettlementEditable(pr, ctx.id) : checkEditable(pr, ctx.id);
    if (!editable.ok) return res.status(400).json({ error: editable.error });
    await prisma.paymentRequestAttachment.delete({ where: { id: att.id } });
    await deleteAttachment(att.filePath).catch((err) => logger.warn({ err, id: att.id }, 'attachment file delete failed'));
    return res.json({ ok: true });
  } catch (error) {
    return fail(res, error, 'DELETE /payment-requests/:id/attachments/:attId', 'Gagal menghapus lampiran.');
  }
});

export default router;
