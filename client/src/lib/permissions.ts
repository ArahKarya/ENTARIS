// Helper izin RBAC sisi client. Membaca user (beserta permissions/caps/isSuperAdmin)
// dari localStorage — diisi saat login & di-refresh /auth/me saat app load.
// Server tetap sumber kebenaran; ini hanya untuk menampilkan/menyembunyikan UI.

export type PermAction = 'view' | 'edit';

export interface StoredUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  isSuperAdmin?: boolean;
  permissions?: Record<string, { view: boolean; edit: boolean }>;
  caps?: string[];
}

export function getStoredUser(): StoredUser | null {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

export function isSuperAdmin(): boolean {
  return !!getStoredUser()?.isSuperAdmin;
}

/** Boleh akses modul (view/edit)? Super-admin selalu true. */
export function can(module: string, action: PermAction = 'view'): boolean {
  const u = getStoredUser();
  if (!u) return false;
  if (u.isSuperAdmin) return true;
  const p = u.permissions?.[module];
  if (!p) return false;
  return action === 'edit' ? p.edit : p.view || p.edit;
}

/** Punya capability (mis. 'doc.cancel', 'approval.decide')? Super-admin selalu true. */
export function cap(name: string): boolean {
  const u = getStoredUser();
  if (!u) return false;
  if (u.isSuperAdmin) return true;
  return !!u.caps?.includes(name);
}
