// API kelola Role & matriks izin (RBAC dinamis). Hanya untuk pemegang capability
// 'rbac.manage' (default: Admin/super). Setiap perubahan meng-invalidate cache izin.

import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, requireCap, requirePerm } from '../middleware/auth';
import { handleRouteError } from '../utils/errors';
import { invalidatePermissionCache } from '../services/permissionService';
import { MODULES, MODULE_KEYS, CAPABILITIES, CAPABILITY_KEYS } from '../constants/modules';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/roles/assignable — daftar ringkas role (key+name) utk dropdown pilih
// role saat buat/edit user. Cukup izin modul 'users' (tak perlu rbac.manage).
router.get('/assignable', requirePerm('users'), async (_req, res) => {
  try {
    const roles = await prisma.role.findMany({
      where: { isActive: true },
      select: { key: true, name: true },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    res.json(roles);
  } catch (error) {
    return handleRouteError(res, error, 'GET /roles/assignable', 'Gagal mengambil daftar role.');
  }
});

// Endpoint kelola RBAC di bawah ini butuh hak 'rbac.manage'.
router.use(requireCap('rbac.manage'));

// GET /api/roles/catalog — daftar modul & capability utk membangun UI matriks.
router.get('/catalog', (_req, res) => {
  res.json({ modules: MODULES, capabilities: CAPABILITIES });
});

// GET /api/roles — daftar role + matriks + caps + jumlah user pemakai.
router.get('/', async (_req, res) => {
  try {
    const roles = await prisma.role.findMany({
      include: { permissions: true, capabilities: true },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    // Hitung jumlah user per role (key).
    const counts = await prisma.user.groupBy({ by: ['role'], _count: { _all: true } });
    const countByKey = new Map(counts.map((c) => [c.role, c._count._all]));
    const data = roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      isSuperAdmin: r.isSuperAdmin,
      isActive: r.isActive,
      userCount: countByKey.get(r.key) ?? 0,
      permissions: r.permissions.map((p) => ({ module: p.module, canView: p.canView, canEdit: p.canEdit })),
      caps: r.capabilities.map((c) => c.capability),
    }));
    res.json(data);
  } catch (error) {
    return handleRouteError(res, error, 'GET /roles', 'Gagal mengambil daftar role.');
  }
});

function slugifyKey(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

interface PermInput { module: string; canView?: boolean; canEdit?: boolean }

export function sanitizePermissions(raw: unknown): { module: string; canView: boolean; canEdit: boolean }[] {
  if (!Array.isArray(raw)) return [];
  const out: { module: string; canView: boolean; canEdit: boolean }[] = [];
  for (const p of raw as PermInput[]) {
    if (!p || !MODULE_KEYS.includes(p.module)) continue;
    const canEdit = !!p.canEdit;
    const canView = !!p.canView || canEdit; // edit menyiratkan view
    if (!canView && !canEdit) continue;
    out.push({ module: p.module, canView, canEdit });
  }
  return out;
}

function sanitizeCaps(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set((raw as string[]).filter((c) => CAPABILITY_KEYS.includes(c)))];
}

// POST /api/roles — buat role custom.
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { name, description } = req.body ?? {};
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Nama role minimal 2 karakter.' });
    }
    const key = (req.body?.key && slugifyKey(req.body.key)) || slugifyKey(name);
    if (!key) return res.status(400).json({ error: 'Key role tidak valid.' });
    const existing = await prisma.role.findUnique({ where: { key } });
    if (existing) return res.status(400).json({ error: `Role dengan key "${key}" sudah ada.` });

    const role = await prisma.role.create({
      data: {
        key,
        name: name.trim(),
        description: typeof description === 'string' ? description.trim() : null,
        isSystem: false,
        isSuperAdmin: false,
        permissions: { create: sanitizePermissions(req.body?.permissions) },
        capabilities: { create: sanitizeCaps(req.body?.caps).map((capability) => ({ capability })) },
      },
      include: { permissions: true, capabilities: true },
    });
    invalidatePermissionCache();
    logger.info({ roleKey: key, by: req.user!.userId }, 'RBAC role created');
    res.status(201).json(role);
  } catch (error) {
    return handleRouteError(res, error, 'POST /roles', 'Gagal membuat role.');
  }
});

// PUT /api/roles/:id — update nama/deskripsi/aktif + ganti matriks & caps.
// Role super-admin (Admin): matriks/caps diabaikan (selalu full); hanya nama/desk.
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const role = await prisma.role.findUnique({ where: { id: req.params.id as string } });
    if (!role) return res.status(404).json({ error: 'Role tidak ditemukan.' });

    const { name, description, isActive } = req.body ?? {};
    const data: any = {};
    if (typeof name === 'string' && name.trim().length >= 2) data.name = name.trim();
    if (typeof description === 'string') data.description = description.trim();
    // isActive tak boleh menonaktifkan role sistem/super (anti-lockout).
    if (typeof isActive === 'boolean' && !role.isSystem) data.isActive = isActive;

    await prisma.$transaction(async (tx) => {
      await tx.role.update({ where: { id: role.id }, data });
      // Super-admin: jangan ubah matriks/caps (selalu full akses).
      if (!role.isSuperAdmin) {
        if (Array.isArray(req.body?.permissions)) {
          await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
          const perms = sanitizePermissions(req.body.permissions);
          if (perms.length) await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, ...p })) });
        }
        if (Array.isArray(req.body?.caps)) {
          await tx.roleCapability.deleteMany({ where: { roleId: role.id } });
          const caps = sanitizeCaps(req.body.caps);
          if (caps.length) await tx.roleCapability.createMany({ data: caps.map((capability) => ({ roleId: role.id, capability })) });
        }
      }
    });
    invalidatePermissionCache();
    logger.info({ roleKey: role.key, by: req.user!.userId }, 'RBAC role updated');
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, 'PUT /roles/:id', 'Gagal memperbarui role.');
  }
});

// DELETE /api/roles/:id — hanya role custom yang tak dipakai user.
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const role = await prisma.role.findUnique({ where: { id: req.params.id as string } });
    if (!role) return res.status(404).json({ error: 'Role tidak ditemukan.' });
    if (role.isSystem) return res.status(400).json({ error: 'Role bawaan tidak dapat dihapus.' });
    const inUse = await prisma.user.count({ where: { role: role.key } });
    if (inUse > 0) {
      return res.status(400).json({ error: `Role masih dipakai ${inUse} user. Pindahkan user ke role lain dulu.` });
    }
    await prisma.role.delete({ where: { id: role.id } });
    invalidatePermissionCache();
    logger.info({ roleKey: role.key, by: req.user!.userId }, 'RBAC role deleted');
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /roles/:id', 'Gagal menghapus role.');
  }
});

export default router;
