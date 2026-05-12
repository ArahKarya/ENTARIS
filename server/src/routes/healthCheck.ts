// Admin-only diagnostic dashboard endpoints. Heavy lifting (check SQL +
// preview/fix transactions) lives in routes/health/{checks,fixes}.ts —
// this file is now just dispatch + audit-log wrapping.
import { Router } from 'express';
import { roleMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import {
  type CheckResult,
  checkAleSync,
  checkAccountBalanceDrift,
  checkUnbalancedJournals,
  checkOrphanAle,
  checkStockMovementMismatch,
  checkWarehouseStockDrift,
} from './health/checks';
import {
  previewAleSync,
  previewAccountBalanceDrift,
  previewOrphanAle,
  fixAleSync,
  fixAccountBalanceDrift,
  fixOrphanAle,
} from './health/fixes';

const router = Router();

// ── GET /api/health-check — Run all diagnostic checks in parallel ───────────
router.get('/', roleMiddleware(['Admin']), async (_req, res) => {
  try {
    const checks: CheckResult[] = await Promise.all([
      checkAleSync(),
      checkAccountBalanceDrift(),
      checkUnbalancedJournals(),
      checkOrphanAle(),
      checkStockMovementMismatch(),
      checkWarehouseStockDrift(),
    ]);

    const overallStatus = checks.some((c) => c.status === 'error')
      ? 'error'
      : checks.some((c) => c.status === 'warning')
        ? 'warning'
        : 'ok';

    res.json({ success: true, data: { status: overallStatus, checks } });
  } catch (error) {
    logger.error(error, 'Health check failed');
    res.status(500).json({ success: false, error: 'Gagal menjalankan health check' });
  }
});

// ── GET /api/health-check/preview/:check — Preview what fix will change ─────
router.get('/preview/:check', roleMiddleware(['Admin']), async (req, res) => {
  const check = String(req.params.check ?? '');

  try {
    let preview: { description: string; count: number; details: unknown[]; warning?: string };

    switch (check) {
      case 'ale-sync':
        preview = await previewAleSync();
        break;
      case 'account-balance-drift':
        preview = await previewAccountBalanceDrift();
        break;
      case 'orphan-ale':
        preview = await previewOrphanAle();
        break;
      default:
        return res.status(400).json({ success: false, error: 'Check tidak dapat di-preview' });
    }

    res.json({ success: true, data: { check, ...preview } });
  } catch (error) {
    logger.error(error, `Health check preview failed: ${check}`);
    res.status(500).json({ success: false, error: 'Gagal membuat preview' });
  }
});

// ── POST /api/health-check/fix/:check — Auto-fix a specific check ────────────
router.post('/fix/:check', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  const check = String(req.params.check ?? '');
  const userId = req.user?.userId;
  const userAgent = Array.isArray(req.headers['user-agent'])
    ? req.headers['user-agent'][0]
    : req.headers['user-agent'];

  const actionMap: Record<string, string> = {
    'ale-sync': 'FIX_ALE_SYNC',
    'account-balance-drift': 'FIX_ACCOUNT_BALANCE_DRIFT',
    'orphan-ale': 'FIX_ORPHAN_ALE',
  };

  if (!actionMap[check]) {
    return res.status(400).json({ success: false, error: 'Check tidak dapat diperbaiki otomatis' });
  }

  const startedAt = new Date();
  try {
    let result: { fixed: number; message: string; snapshot?: unknown };

    switch (check) {
      case 'ale-sync':
        result = await fixAleSync();
        break;
      case 'account-balance-drift':
        result = await fixAccountBalanceDrift();
        break;
      case 'orphan-ale':
        result = await fixOrphanAle();
        break;
      default:
        return res.status(400).json({ success: false, error: 'Check tidak dapat diperbaiki otomatis' });
    }

    if (userId) {
      await prisma.auditLog.create({
        data: {
          userId,
          action: actionMap[check],
          entityType: 'health-check',
          entityId: check,
          newValues: {
            check,
            fixed: result.fixed,
            message: result.message,
            snapshot: result.snapshot ?? null,
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
          },
          ipAddress: req.ip,
          userAgent,
        },
      }).catch((err) => logger.error({ err }, 'Audit log write failed for health fix'));
    }

    logger.info({ check, userId, fixed: result.fixed }, 'Health check fix applied');
    res.json({ success: true, data: { fixed: result.fixed, message: result.message } });
  } catch (error) {
    logger.error(error, `Health check fix failed: ${check}`);
    if (userId) {
      await prisma.auditLog.create({
        data: {
          userId,
          action: `${actionMap[check]}_FAILED`,
          entityType: 'health-check',
          entityId: check,
          newValues: {
            check,
            error: error instanceof Error ? error.message : String(error),
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
          },
          ipAddress: req.ip,
          userAgent,
        },
      }).catch((err) => logger.error({ err }, 'Audit log write failed for health fix error'));
    }
    res.status(500).json({ success: false, error: 'Gagal memperbaiki masalah' });
  }
});

export default router;
