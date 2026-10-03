/** Indonesian display names for the UserRole enum (server/prisma/schema.prisma). */
const ROLE_LABELS: Record<string, string> = {
  Admin: 'Administrator',
  Accountant: 'Akuntan',
  StaffProduksi: 'Staf Produksi',
  Viewer: 'Peninjau',
};

/** Role code → Indonesian label; unknown codes are shown as-is, missing → "Pengguna". */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return 'Pengguna';
  return ROLE_LABELS[role] ?? role;
}

/** Up to two initials for the avatar ("Budi Santoso" → "BS"). */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}
