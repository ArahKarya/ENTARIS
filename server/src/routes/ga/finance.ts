// GA Finance — DEPRECATED alias of /api/payment-requests/eam (Pengajuan Pembayaran
// > tab "Tagihan EAM"). Kept for one release so nothing external breaks; the
// UI no longer calls it. Mounted at /api/ga/finance with requirePerm('ga_finance').
// Remove together with the 'ga_finance' module once no role depends on it.
//
// Posting truth lives in services/gaFinance.ts + services/gaBillQueue.ts —
// this router only keeps the old request/response contract.
//
// Methods: JOURNAL (DR beban / CR kas-bank, lunas) | PURCHASE_INVOICE
// (DR beban / CR 2.1.1 Hutang Usaha, dilunasi lewat modul Pembayaran).
// Data historis (service log source='IMPORT') SENGAJA tidak muncul — dobel posting.

import { Router } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { handleRouteError } from '../../utils/errors';
import { loadGaBills, payGaBill, cancelGaBill } from '../../services/gaBillQueue';
import { EamPaySchema } from '../../utils/schemas';

const router = Router();

// ─── GET /bills — antrian tagihan GA yang belum masuk pembukuan ──────
router.get('/bills', async (req: AuthRequest, res) => {
  try {
    const kind = String(req.query.kind || 'ALL').toUpperCase();
    const includePaid = String(req.query.includePaid || 'false') === 'true';
    const bills = await loadGaBills(kind, includePaid);
    const pending = bills.filter((b) => !b.journalEntry);
    res.json({
      bills,
      summary: {
        pendingCount: pending.length,
        pendingAmount: pending.reduce((s, b) => s + b.amount, 0),
      },
    });
  } catch (error) {
    handleRouteError(res, error, 'GET /ga/finance/bills', 'Gagal memuat antrian tagihan GA.');
  }
});

router.post('/:kind/:id/pay', async (req: AuthRequest, res) => {
  try {
    const input = validateBody(EamPaySchema, req.body, res);
    if (!input) return;
    const result = await payGaBill(String(req.params.kind), String(req.params.id), input, req.user!.userId);
    res.json({ success: true, data: result });
  } catch (error) {
    handleRouteError(res, error, 'POST /ga/finance/:kind/:id/pay', 'Gagal memposting tagihan GA.');
  }
});

router.post('/:kind/:id/cancel', async (req: AuthRequest, res) => {
  try {
    const result = await cancelGaBill(String(req.params.kind), String(req.params.id));
    res.json({ success: true, data: result });
  } catch (error) {
    handleRouteError(res, error, 'POST /ga/finance/:kind/:id/cancel', 'Gagal membatalkan posting tagihan GA.');
  }
});

export default router;
