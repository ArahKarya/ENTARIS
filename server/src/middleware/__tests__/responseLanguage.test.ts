import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { requestLanguage, responseLanguage, translateBody } from '../responseLanguage';

const req = (headers: Record<string, string>) =>
  ({ get: (name: string) => headers[name.toLowerCase()] }) as unknown as Request;

describe('requestLanguage', () => {
  it('prefers X-Entaris-Lang', () => {
    expect(requestLanguage(req({ 'x-entaris-lang': 'en', 'accept-language': 'id-ID' }))).toBe('en');
    expect(requestLanguage(req({ 'x-entaris-lang': 'ID ', 'accept-language': 'en-US' }))).toBe('id');
  });

  it('falls back to Accept-Language by quality', () => {
    expect(requestLanguage(req({ 'accept-language': 'en-US,en;q=0.9' }))).toBe('en');
    expect(requestLanguage(req({ 'accept-language': 'fr;q=1, en;q=0.5, id;q=0.8' }))).toBe('id');
    expect(requestLanguage(req({ 'accept-language': 'fr-FR' }))).toBe('id');
  });

  it('defaults to Indonesian for an unsupported X-Entaris-Lang', () => {
    expect(requestLanguage(req({ 'x-entaris-lang': 'de' }))).toBe('id');
  });

  it('returns null when the request names no language', () => {
    expect(requestLanguage(req({}))).toBeNull();
  });
});

describe('translateBody', () => {
  it('translates error and message without mutating the original', () => {
    const body = { error: 'Akun tidak ditemukan.', data: { name: 'Akun tidak ditemukan.' } };
    const out = translateBody(body, 'en') as typeof body;
    expect(out).toEqual({ error: 'Account not found.', data: { name: 'Akun tidak ditemukan.' } });
    expect(body.error).toBe('Akun tidak ditemukan.');
    expect(out).not.toBe(body);
  });

  it('translates messages inside errors, rowErrors and Zod details', () => {
    const body = {
      error: 'Data tidak valid.',
      errors: [{ row: 2, message: 'Kolom "name" wajib diisi.' }],
      rowErrors: ['Nominal harus lebih dari 0.'],
      details: { _errors: [], name: { _errors: ['Nama akun wajib diisi.'] }, label: 'Nama akun wajib diisi.' },
    };
    expect(translateBody(body, 'en')).toEqual({
      error: 'Invalid data.',
      errors: [{ row: 2, message: 'Column "name" is required.' }],
      rowErrors: ['Amount must be greater than 0.'],
      details: { _errors: [], name: { _errors: ['Account name is required.'] }, label: 'Nama akun wajib diisi.' },
    });
  });

  it('returns the same object for Indonesian, arrays and bodies without messages', () => {
    const body = { error: 'Akun tidak ditemukan.' };
    expect(translateBody(body, 'id')).toBe(body);
    const list = [{ message: 'Akun tidak ditemukan.' }];
    expect(translateBody(list, 'en')).toBe(list);
    const data = { id: 1, total: 5 };
    expect(translateBody(data, 'en')).toBe(data);
  });
});

describe('responseLanguage middleware', () => {
  const run = (headers: Record<string, string>, body: unknown) => {
    const sent = vi.fn((b: unknown) => b);
    const res = { json: sent } as unknown as Response;
    const next = vi.fn() as NextFunction;
    responseLanguage(req(headers), res, next);
    res.json(body);
    expect(next).toHaveBeenCalledOnce();
    return sent.mock.calls[0][0];
  };

  it('translates responses for English requests', () => {
    expect(run({ 'x-entaris-lang': 'en' }, { message: 'Akun dihapus.' })).toEqual({ message: 'Account deleted.' });
  });

  it('leaves Indonesian requests and requests without a language header alone', () => {
    expect(run({ 'x-entaris-lang': 'id' }, { message: 'Akun dihapus.' })).toEqual({ message: 'Akun dihapus.' });
    expect(run({}, { message: 'Akun dihapus.' })).toEqual({ message: 'Akun dihapus.' });
  });
});
