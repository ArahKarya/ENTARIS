// Bootstrap RBAC idempoten: pastikan 4 role bawaan + matriks izin default ada.
// Dipanggil saat boot (index.ts). HANYA mengisi role yang belum ada (tidak
// menimpa perubahan Admin). Selalu menjamin Admin = super-admin (anti-lockout).
// Matriks default mereproduksi akses lama → no-regression. Lihat constants/modules.ts.

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { BUILTIN_ROLES, DEFAULT_MATRIX, DEFAULT_CAPS, BACKFILL_MODULES } from '../constants/modules';
import { invalidatePermissionCache } from './permissionService';

export async function ensureRbacSeed(): Promise<void> {
  try {
    for (const def of BUILTIN_ROLES) {
      const existing = await prisma.role.findUnique({ where: { key: def.key } });

      if (!existing) {
        const role = await prisma.role.create({
          data: {
            key: def.key,
            name: def.name,
            description: def.description,
            isSystem: true,
            isSuperAdmin: def.isSuperAdmin,
          },
        });

        const matrix = DEFAULT_MATRIX[def.key];
        if (matrix) {
          await prisma.rolePermission.createMany({
            data: Object.entries(matrix).map(([module, action]) => ({
              roleId: role.id,
              module,
              canView: true,
              canEdit: action === 'edit',
            })),
            skipDuplicates: true,
          });
        }

        const caps = DEFAULT_CAPS[def.key] ?? [];
        if (caps.length > 0) {
          await prisma.roleCapability.createMany({
            data: caps.map((capability) => ({ roleId: role.id, capability })),
            skipDuplicates: true,
          });
        }
        logger.info({ role: def.key }, 'RBAC: role bawaan dibuat + matriks default');
      } else {
        // Jaga flag penting agar Admin selalu super-admin & role bawaan tetap isSystem.
        if (existing.isSystem !== true || existing.isSuperAdmin !== def.isSuperAdmin) {
          await prisma.role.update({
            where: { id: existing.id },
            data: { isSystem: true, isSuperAdmin: def.isSuperAdmin },
          });
        }
      }
    }

    // Backfill modul yang ditambahkan setelah rilis RBAC awal ke role sistem
    // existing — ONE-SHOT per module key: hanya bila belum ada satupun
    // RolePermission utk modul itu. roles.ts me-rewrite izin via
    // deleteMany+createMany, jadi backfill tanpa guard akan menghidupkan
    // kembali izin yang sengaja dicabut Admin tiap boot.
    for (const moduleKey of BACKFILL_MODULES) {
      const already = await prisma.rolePermission.count({ where: { module: moduleKey } });
      if (already > 0) continue;

      const systemRoles = await prisma.role.findMany({ where: { isSystem: true } });
      const rows = systemRoles.flatMap((role) => {
        const action = DEFAULT_MATRIX[role.key]?.[moduleKey];
        if (!action) return [];
        return [{ roleId: role.id, module: moduleKey, canView: true, canEdit: action === 'edit' }];
      });
      if (rows.length > 0) {
        await prisma.rolePermission.createMany({ data: rows, skipDuplicates: true });
        logger.info({ module: moduleKey, roles: rows.length }, 'RBAC: backfill izin modul baru ke role sistem');
      }
    }

    invalidatePermissionCache();
  } catch (err) {
    logger.error({ err }, 'ensureRbacSeed gagal (diabaikan saat boot)');
  }
}
