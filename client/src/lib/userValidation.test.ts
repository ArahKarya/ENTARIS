import { describe, it, expect } from 'vitest';
import { passwordError, validateUserForm } from './userValidation';

const base = { fullName: 'Budi Santoso', username: 'budi', email: 'budi@contoh.id', role: 'Viewer', password: 'Rahasia1!' };

describe('passwordError', () => {
  it('mirrors the server rules', () => {
    expect(passwordError('Ab1!')).toMatch(/minimal 8/);
    expect(passwordError('abcdefg1!')).toMatch(/huruf besar/);
    expect(passwordError('Abcdefgh!')).toMatch(/angka/);
    expect(passwordError('Abcdefg12')).toMatch(/spesial/);
    expect(passwordError('Rahasia1!')).toBeUndefined();
  });
});

describe('validateUserForm', () => {
  it('accepts a valid new user', () => {
    expect(validateUserForm(base, false)).toEqual({});
  });

  it('requires a password only when creating', () => {
    expect(validateUserForm({ ...base, password: '' }, false).password).toMatch(/wajib/);
    expect(validateUserForm({ ...base, password: '' }, true)).toEqual({});
    expect(validateUserForm({ ...base, password: 'short' }, true).password).toMatch(/minimal 8/);
  });

  it('flags each invalid field', () => {
    const e = validateUserForm({ fullName: 'A', username: 'ab', email: 'x', role: '', password: 'Rahasia1!' }, false);
    expect(Object.keys(e).sort()).toEqual(['email', 'fullName', 'role', 'username']);
  });
});
