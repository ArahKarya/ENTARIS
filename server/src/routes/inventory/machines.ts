import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { roleMiddleware } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { CreateMachineSchema, UpdateMachineSchema } from '../../utils/schemas';
import { handleRouteError } from '../../utils/errors';
import { logger } from '../../lib/logger';

const router = Router();

// GET /api/inventory/machines
// Filter: ?active=true|false (default: returns all)
router.get('/', async (req, res) => {
  try {
    const where: any = {};
    if (req.query.active !== undefined) {
      where.isActive = req.query.active === 'true';
    }
    const machines = await prisma.machine.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return res.json({ data: machines });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/machines error');
    return res.status(500).json({ error: 'Gagal mengambil daftar mesin.' });
  }
});

// GET /api/inventory/machines/:id
router.get('/:id', async (req, res) => {
  try {
    const machine = await prisma.machine.findUnique({
      where: { id: req.params.id as string },
    });
    if (!machine) return res.status(404).json({ error: 'Mesin tidak ditemukan.' });
    return res.json(machine);
  } catch (error) {
    logger.error({ error }, 'GET /inventory/machines/:id error');
    return res.status(500).json({ error: 'Gagal mengambil detail mesin.' });
  }
});

// POST /api/inventory/machines
router.post('/', roleMiddleware(['Admin', 'Accountant']), async (req, res) => {
  const body = validateBody(CreateMachineSchema, req.body, res);
  if (!body) return;
  try {
    const machine = await prisma.machine.create({
      data: {
        code: body.code.trim(),
        name: body.name.trim(),
        idealRatePerHour: body.idealRatePerHour ?? null,
        unit: body.unit ?? 'kg',
        isActive: body.isActive ?? true,
        notes: body.notes ?? null,
      },
    });
    return res.status(201).json(machine);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: `Kode mesin "${req.body?.code}" sudah ada.` });
    }
    return handleRouteError(res, error, 'POST /inventory/machines', 'Gagal membuat mesin.');
  }
});

// PUT /api/inventory/machines/:id
router.put('/:id', roleMiddleware(['Admin', 'Accountant']), async (req, res) => {
  const body = validateBody(UpdateMachineSchema, req.body, res);
  if (!body) return;
  try {
    const machine = await prisma.machine.update({
      where: { id: req.params.id as string },
      data: {
        ...(body.code !== undefined ? { code: body.code.trim() } : {}),
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.idealRatePerHour !== undefined ? { idealRatePerHour: body.idealRatePerHour } : {}),
        ...(body.unit !== undefined ? { unit: body.unit } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });
    return res.json(machine);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Mesin tidak ditemukan.' });
    }
    if (error.code === 'P2002') {
      return res.status(409).json({ error: `Kode mesin "${req.body?.code}" sudah ada.` });
    }
    return handleRouteError(res, error, 'PUT /inventory/machines/:id', 'Gagal memperbarui mesin.');
  }
});

// DELETE /api/inventory/machines/:id
// Block hard-delete when the machine is referenced by any production run or
// downtime row — preserves historical OEE traceability. Suggest deactivating.
router.delete('/:id', roleMiddleware(['Admin', 'Accountant']), async (req, res) => {
  const id = req.params.id as string;
  try {
    const [runCount, downtimeCount] = await Promise.all([
      prisma.productionRun.count({ where: { machineId: id } }),
      prisma.productionDowntime.count({ where: { machineId: id } }),
    ]);
    if (runCount > 0 || downtimeCount > 0) {
      return res.status(409).json({
        error:
          `Mesin tidak bisa dihapus karena sudah dipakai di ${runCount} proses produksi` +
          (downtimeCount > 0 ? ` dan ${downtimeCount} catatan downtime` : '') +
          '. Nonaktifkan mesin saja agar histori OEE tetap utuh.',
      });
    }
    await prisma.machine.delete({ where: { id } });
    return res.json({ message: 'Mesin dihapus.', deleted: true });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Mesin tidak ditemukan.' });
    }
    return handleRouteError(res, error, 'DELETE /inventory/machines/:id', 'Gagal menghapus mesin.');
  }
});

export default router;
