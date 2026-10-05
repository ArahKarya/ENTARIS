import { Router } from 'express';
import { AuthRequest } from '../middleware/auth';
import { can } from '../services/permissionService';
import { loadMaintenanceDashboard } from '../services/dashboardMaintenance';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/dashboard/maintenance — mounted BEFORE the 'reports'-gated dashboard
// router: access is decided per source module (ga_maintenance / ga_vehicle /
// ga_documents), and only the permitted sources are loaded and returned.
router.get('/', async (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Tidak terautentikasi.' });
    const role = req.user.role;
    const [maintenance, vehicle, documents] = await Promise.all([
      can(role, 'ga_maintenance', 'view'),
      can(role, 'ga_vehicle', 'view'),
      can(role, 'ga_documents', 'view'),
    ]);
    if (!maintenance && !vehicle && !documents) {
      return res.status(403).json({ error: 'Akses ditolak: tidak punya izin modul pemeliharaan.' });
    }
    return res.json(await loadMaintenanceDashboard({ maintenance, vehicle, documents }));
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/maintenance error');
    return res.status(500).json({ error: 'Gagal mengambil data pemeliharaan.' });
  }
});

export default router;
