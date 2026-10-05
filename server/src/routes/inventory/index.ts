import { Router } from 'express';
import { requirePerm, requireWrite } from '../../middleware/auth';
import itemsRouter from './items';
import movementsRouter from './movements';
import productionRunDraftsRouter from './productionRunDrafts';
import productionRunsRouter from './productionRuns';
import productionCostStandardsRouter from './productionCostStandards';
import productionProcessesRouter from './productionProcesses';
import machinesRouter from './machines';
import dashboardRouter from './dashboard';

const router = Router();

// RBAC: items & data referensi produksi → GET terbuka (dipakai form), tulis ter-gate.
// Movements/dashboard (riwayat & dashboard stok) → view+edit modul 'inventory'.
// Production runs/cost/process/machine → modul 'production'.
router.use('/items', requireWrite('inventory'), itemsRouter);
router.use('/movements', requirePerm('inventory'), movementsRouter);
router.use('/dashboard', requirePerm('inventory'), dashboardRouter);
router.use('/production-runs/drafts', requirePerm('production'), productionRunDraftsRouter);
router.use('/production-runs', requirePerm('production'), productionRunsRouter);
router.use('/production-cost-standards', requireWrite('production'), productionCostStandardsRouter);
router.use('/production-processes', requireWrite('production'), productionProcessesRouter);
router.use('/machines', requireWrite('production'), machinesRouter);

export default router;
