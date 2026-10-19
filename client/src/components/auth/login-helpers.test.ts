import { describe, expect, it } from 'vitest';
import {
  classifyLoginError,
  formatCountdown,
  mailtoHref,
  retryAfterSeconds,
  safeRedirectTarget,
  tenantName,
  whatsappHref,
} from './login-helpers';

describe('retryAfterSeconds', () => {
  it('prefers RateLimit-Reset (delta seconds)', () => {
    expect(retryAfterSeconds({ 'ratelimit-reset': '872', 'retry-after': '900' })).toBe(872);
  });

  it('falls back to Retry-After seconds', () => {
    expect(retryAfterSeconds({ 'retry-after': '60' })).toBe(60);
  });

  it('accepts an HTTP-date Retry-After', () => {
    const now = Date.parse('2026-10-03T10:00:00Z');
    expect(retryAfterSeconds({ 'retry-after': 'Sat, 03 Oct 2026 10:02:00 GMT' }, now)).toBe(120);
  });

  it('returns null when no usable header is present', () => {
    expect(retryAfterSeconds({})).toBeNull();
    expect(retryAfterSeconds({ 'ratelimit-reset': 'abc' })).toBeNull();
    expect(retryAfterSeconds(undefined)).toBeNull();
  });
});

describe('formatCountdown', () => {
  it('formats minutes and seconds', () => {
    expect(formatCountdown(872_000)).toBe('14:32');
    expect(formatCountdown(5_000)).toBe('0:05');
  });

  it('rounds partial seconds up and never goes negative', () => {
    expect(formatCountdown(1_200)).toBe('0:02');
    expect(formatCountdown(-10)).toBe('0:00');
  });
});

describe('classifyLoginError', () => {
  const now = 1_000_000;

  it('maps 401 to invalid credentials', () => {
    expect(classifyLoginError({ response: { status: 401 } }, now)).toEqual({ kind: 'invalid' });
  });

  it('maps 429 with headers to a lock deadline', () => {
    expect(
      classifyLoginError({ response: { status: 429, headers: { 'ratelimit-reset': '30' } } }, now),
    ).toEqual({ kind: 'rate-limited', lockedUntil: now + 30_000 });
  });

  it('maps 429 without headers to an open-ended rate limit', () => {
    expect(classifyLoginError({ response: { status: 429, headers: {} } }, now)).toEqual({
      kind: 'rate-limited',
      lockedUntil: null,
    });
  });

  it('maps a missing response to a network error', () => {
    expect(classifyLoginError({ request: {} }, now)).toEqual({ kind: 'network' });
    expect(classifyLoginError(new Error('boom'), now)).toEqual({ kind: 'network' });
  });

  it('maps any other status to a server error', () => {
    expect(classifyLoginError({ response: { status: 500 } }, now)).toEqual({ kind: 'server' });
    expect(classifyLoginError({ response: { status: 400 } }, now)).toEqual({ kind: 'server' });
  });
});

describe('tenantName', () => {
  it('hides empty and placeholder company names', () => {
    expect(tenantName(null)).toBeNull();
    expect(tenantName('   ')).toBeNull();
    expect(tenantName('Nama Perusahaan Anda')).toBeNull();
    expect(tenantName(' nama perusahaan anda ')).toBeNull();
  });

  it('returns a trimmed real name', () => {
    expect(tenantName('  PT Sukses Makmur ')).toBe('PT Sukses Makmur');
  });
});

describe('contact links', () => {
  it('builds a wa.me link with an Indonesian country code', () => {
    expect(whatsappHref('0812-3456-7890')).toMatch(/^https:\/\/wa\.me\/6281234567890\?text=/);
    expect(whatsappHref('+62 812 3456 7890')).toMatch(/^https:\/\/wa\.me\/6281234567890\?/);
    expect(whatsappHref('812345678')).toMatch(/^https:\/\/wa\.me\/62812345678\?/);
  });

  it('returns null for empty or too-short phone numbers', () => {
    expect(whatsappHref('')).toBeNull();
    expect(whatsappHref(null)).toBeNull();
    expect(whatsappHref('12-3')).toBeNull();
  });

  it('builds a mailto link only for plausible emails', () => {
    expect(mailtoHref('admin@pt.co.id')).toMatch(/^mailto:admin@pt\.co\.id\?subject=/);
    expect(mailtoHref('')).toBeNull();
    expect(mailtoHref('bukan-email')).toBeNull();
  });
});

describe('safeRedirectTarget', () => {
  it('keeps in-app paths', () => {
    expect(safeRedirectTarget('/sales?status=Draft')).toBe('/sales?status=Draft');
  });

  it('falls back to / for missing, external or login targets', () => {
    expect(safeRedirectTarget(undefined)).toBe('/');
    expect(safeRedirectTarget('https://evil.example')).toBe('/');
    expect(safeRedirectTarget('//evil.example')).toBe('/');
    expect(safeRedirectTarget('/login?alasan=sesi')).toBe('/');
    expect(safeRedirectTarget(42)).toBe('/');
  });
});
