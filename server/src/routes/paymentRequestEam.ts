// Tagihan EAM — antrian biaya EAM (pajak kendaraan, service, sparepart MR) di dalam
// Pengajuan Pembayaran. Mounted at /api/payment-requests/eam (paymentRequests.ts),
// FINANCE ONLY: every endpoint needs 'payment_request' edit.
//
// Posting/cancel reuse services/gaFinance.ts through services/gaBillQueue.ts —
// the same functions the deprecated /api/ga/finance alias calls, so there is a
// single source of GL truth and no double posting.
//
//   GET  /               paged list  { data, total, page, limit }
//   GET  /summary        { pendingCount, pendingAmount, matchedCount, matchedAmount }
//   POST /:kind/:id/pay  { method: JOURNAL | PURCHASE_INVOICE, accountId, ... }
//   POST /:kind/:id/cancel
import { Router, type NextFunction, type Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { handleRouteError } from '../utils/errors';
import { parseListPaging, parseSort } from '../utils/listQuery';
import { EamPaySchema } from '../utils/schemas';
import { can } from '../services/permissionService';
import { PR_MODULE } from '../services/paymentRequestRules';
import {
  DEFAULT_EAM_SORT,
  EAM_SORT_FIELDS,
  cancelGaBill,
  filterAndSortBills,
  loadGaBills,
  parseEamQuery,
  payGaBill,
  summarizeEam,
} from '../services/gaBillQueue';

const router = Router();

const requireFinance = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user && (await can(req.user.role, PR_MODULE, 'edit'))) return next();
  } catch {
    // fall through to deny
  }
  return res.status(403).json({ error: 'Akses ditolak: Tidak memiliki izin.' });
};
router.use(requireFinance);

router.get('/', async (req: AuthRequest, res) => {
  try {
    const query = req.query as Record<string, unknown>;
    const parsed = parseEamQuery(query);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const sort = parseSort(query.sort, EAM_SORT_FIELDS, DEFAULT_EAM_SORT);
    const { page, limit, skip } = parseListPaging(query, { defaultLimit: 25, maxLimit: 500 });
    const bills = await loadGaBills('ALL', parsed.query.posting !== 'pending');
    const rows = filterAndSortBills(bills, parsed.query, sort);
    return res.json({ data: rows.slice(skip, skip + limit), total: rows.length, page, limit });
  } catch (error) {
    return handleRouteError(res, error, 'GET /payment-requests/eam', 'Gagal memuat tagihan EAM.');
  }
});

router.get('/summary', async (req: AuthRequest, res) => {
  try {
    const parsed = parseEamQuery(req.query as Record<string, unknown>);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    // Load all kinds once (paid ones only when the filter needs them): the badge
    // counts the unposted queue across all kinds regardless of the other filters.
    const all = await loadGaBills('ALL', parsed.query.posting !== 'pending');
    const matched = filterAndSortBills(all, parsed.query, DEFAULT_EAM_SORT);
    return res.json(summarizeEam(all, matched));
  } catch (error) {
    return handleRouteError(res, error, 'GET /payment-requests/eam/summary', 'Gagal memuat ringkasan tagihan EAM.');
  }
});

router.post('/:kind/:id/pay', async (req: AuthRequest, res) => {
  try {
    const input = validateBody(EamPaySchema, req.body, res);
    if (!input) return;
    const result = await payGaBill(String(req.params.kind), String(req.params.id), input, req.user!.userId);
    return res.json({ success: true, data: result });
  } catch (error) {
    return handleRouteError(res, error, 'POST /payment-requests/eam/:kind/:id/pay', 'Gagal memposting tagihan EAM.');
  }
});

router.post('/:kind/:id/cancel', async (req: AuthRequest, res) => {
  try {
    const result = await cancelGaBill(String(req.params.kind), String(req.params.id));
    return res.json({ success: true, data: result });
  } catch (error) {
    return handleRouteError(res, error, 'POST /payment-requests/eam/:kind/:id/cancel', 'Gagal membatalkan posting tagihan EAM.');
  }
});

export default router;
