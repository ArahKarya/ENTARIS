/**
 * Client-side mirror of the server's user schemas (server/src/utils/schemas.ts
 * CreateUserSchema / UpdateUserSchema) so the form shows errors per field
 * before submitting. The server stays the source of truth.
 */

export interface UserFormValues {
  fullName: string;
  username: string;
  email: string;
  role: string;
  password: string;
}

export type UserFormErrors = Partial<Record<keyof UserFormValues, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Same rules as the server password schema; undefined when valid. */
export function passwordError(password: string): string | undefined {
  if (password.length < 8) return 'Kata sandi minimal 8 karakter.';
  if (!/[A-Z]/.test(password)) return 'Kata sandi harus mengandung huruf besar.';
  if (!/[0-9]/.test(password)) return 'Kata sandi harus mengandung angka.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Kata sandi harus mengandung karakter spesial.';
  return undefined;
}

/** Per-field errors; password is required only when creating. */
export function validateUserForm(values: UserFormValues, isEdit: boolean): UserFormErrors {
  const errors: UserFormErrors = {};
  if (values.fullName.trim().length < 2) errors.fullName = 'Nama lengkap minimal 2 karakter.';
  if (values.username.trim().length < 3) errors.username = 'Nama pengguna minimal 3 karakter.';
  if (!EMAIL.test(values.email.trim())) errors.email = 'Format email tidak valid.';
  if (!values.role) errors.role = 'Peran wajib dipilih.';
  if (!isEdit || values.password) {
    const pw = values.password ? passwordError(values.password) : 'Kata sandi wajib diisi untuk pengguna baru.';
    if (pw) errors.password = pw;
  }
  return errors;
}
