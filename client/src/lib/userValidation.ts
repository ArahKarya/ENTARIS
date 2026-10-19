/**
 * Client-side mirror of the server's user schemas (server/src/utils/schemas.ts
 * CreateUserSchema / UpdateUserSchema) so the form shows errors per field
 * before submitting. The server stays the source of truth. Messages: `common:validation.*`.
 */
import i18n from '@/i18n';

const msg = (key: 'passwordMin' | 'passwordUpper' | 'passwordDigit' | 'passwordSpecial' | 'fullNameMin' | 'usernameMin' | 'emailInvalid' | 'roleRequired' | 'passwordRequired', min?: number) =>
  i18n.t(`validation.${key}`, { ns: 'common', min });

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
  if (password.length < 8) return msg('passwordMin', 8);
  if (!/[A-Z]/.test(password)) return msg('passwordUpper');
  if (!/[0-9]/.test(password)) return msg('passwordDigit');
  if (!/[^A-Za-z0-9]/.test(password)) return msg('passwordSpecial');
  return undefined;
}

/** Per-field errors; password is required only when creating. */
export function validateUserForm(values: UserFormValues, isEdit: boolean): UserFormErrors {
  const errors: UserFormErrors = {};
  if (values.fullName.trim().length < 2) errors.fullName = msg('fullNameMin', 2);
  if (values.username.trim().length < 3) errors.username = msg('usernameMin', 3);
  if (!EMAIL.test(values.email.trim())) errors.email = msg('emailInvalid');
  if (!values.role) errors.role = msg('roleRequired');
  if (!isEdit || values.password) {
    const pw = values.password ? passwordError(values.password) : msg('passwordRequired');
    if (pw) errors.password = pw;
  }
  return errors;
}
