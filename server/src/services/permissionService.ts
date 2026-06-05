// Resolusi izin RBAC dinamis + cache in-memory (pola telegramService.getConfig).
// role (key) diambil dari JWT → diresolusi ke izin via cache (tanpa query DB
// per-request). invalidatePermissionCache() dipanggil tiap perubahan role/izin.

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { PermAction } from '../constants/modules';

interface EffectiveRole {
  exists: boolean;
  isSuperAdmin: boolean;
  isActive: boolean;
  modules: Map<string, { view: boolean; edit: boolean }>;
  caps: Set<string>;
}

let cache: Map<string, EffectiveRole> | null = null;

export function invalidatePermissionCache(): void {
  cache = null;
}

async function load(): Promise<Map<string, EffectiveRole>> {
  const map = new Map<string, EffectiveRole>();
  try {
    const roles = await prisma.role.findMany({
      include: { permissions: true, capabilities: true },
    });
    for (const r of roles) {
      const modules = new Map<string, { view: boolean; edit: boolean }>();
      for (const p of r.permissions) {
        modules.set(p.module, { view: p.canView || p.canEdit, edit: p.canEdit });
      }
      map.set(r.key, {
        exists: true,
        isSuperAdmin: r.isSuperAdmin,
        isActive: r.isActive,
        modules,
        caps: new Set(r.capabilities.map((c) => c.capability)),
      });
    }
  } catch (err) {
    logger.error({ err }, 'permissionService load gagal');
  }
  return map;
}

async function getRole(roleKey: string): Promise<EffectiveRole | null> {
  if (!cache) cache = await load();
  return cache.get(roleKey) ?? null;
}

/** Apakah role boleh aksi (view/edit) pada module. Super-admin selalu true. */
export async function can(roleKey: string, module: string, action: PermAction): Promise<boolean> {
  const r = await getRole(roleKey);
  if (!r || !r.isActive) return false;
  if (r.isSuperAdmin) return true;
  const m = r.modules.get(module);
  if (!m) return false;
  return action === 'edit' ? m.edit : m.view;
}

/** Apakah role punya capability. Super-admin selalu true. */
export async function hasCap(roleKey: string, capability: string): Promise<boolean> {
  const r = await getRole(roleKey);
  if (!r || !r.isActive) return false;
  if (r.isSuperAdmin) return true;
  return r.caps.has(capability);
}

/** Izin lengkap untuk dikirim ke client (login / /auth/me). */
export async function getEffectiveForClient(roleKey: string): Promise<{
  isSuperAdmin: boolean;
  permissions: Record<string, { view: boolean; edit: boolean }>;
  caps: string[];
}> {
  const r = await getRole(roleKey);
  if (!r) return { isSuperAdmin: false, permissions: {}, caps: [] };
  const permissions: Record<string, { view: boolean; edit: boolean }> = {};
  for (const [mod, v] of r.modules) permissions[mod] = v;
  return { isSuperAdmin: r.isSuperAdmin, permissions, caps: [...r.caps] };
}
