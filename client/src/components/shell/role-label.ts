/** Display-name keys for the built-in roles (server/prisma/schema.prisma). */
import i18n from '@/i18n';
const ROLE_KEYS = {
  Admin: 'roles.admin',
  Accountant: 'roles.accountant',
  StaffProduksi: 'roles.staffProduksi',
  Viewer: 'roles.viewer',
} as const;

/** Role code → label in the current language; custom roles are shown as-is, missing → "User". */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return i18n.t('roles.user');
  const key = ROLE_KEYS[role as keyof typeof ROLE_KEYS];
  return key ? i18n.t(key) : role;
}

/** Up to two initials for the avatar ("Budi Santoso" → "BS"). */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}
