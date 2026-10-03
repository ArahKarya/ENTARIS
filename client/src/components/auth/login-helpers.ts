/**
 * Pure helpers for the login flow (no React, no DOM) so they can be unit tested.
 */

export type LoginFailure =
  | { kind: 'invalid' }
  | { kind: 'rate-limited'; lockedUntil: number | null }
  | { kind: 'network' }
  | { kind: 'server' };

type HeaderBag = Record<string, unknown> | undefined;

/** Seed placeholder from older installs; treated as "not filled in". */
const PLACEHOLDER_COMPANY = 'nama perusahaan anda';

function headerValue(headers: HeaderBag, name: string): string | null {
  if (!headers) return null;
  const value = headers[name] ?? headers[name.toLowerCase()];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

/**
 * Seconds until the login limiter resets, from `RateLimit-Reset` (delta seconds,
 * IETF draft-6 as sent by express-rate-limit) or `Retry-After` (seconds or HTTP date).
 */
export function retryAfterSeconds(headers: HeaderBag, now: number = Date.now()): number | null {
  const reset = headerValue(headers, 'ratelimit-reset');
  if (reset !== null && /^\d+$/.test(reset.trim())) return Number(reset.trim());

  const retry = headerValue(headers, 'retry-after');
  if (retry === null) return null;
  if (/^\d+$/.test(retry.trim())) return Number(retry.trim());
  const at = Date.parse(retry);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.round((at - now) / 1000));
}

/** "14:32" style countdown; partial seconds round up so it never shows 0:00 early. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

interface AxiosLikeError {
  response?: { status?: number; headers?: HeaderBag };
}

export function classifyLoginError(error: unknown, now: number = Date.now()): LoginFailure {
  const response = (error as AxiosLikeError | null)?.response;
  if (!response || typeof response.status !== 'number') return { kind: 'network' };
  if (response.status === 401) return { kind: 'invalid' };
  if (response.status === 429) {
    const seconds = retryAfterSeconds(response.headers, now);
    return { kind: 'rate-limited', lockedUntil: seconds === null ? null : now + seconds * 1000 };
  }
  return { kind: 'server' };
}

/** Company name to show in the workspace chip, or null when not configured. */
export function tenantName(companyName: string | null | undefined): string | null {
  const name = companyName?.trim() ?? '';
  if (!name || name.toLowerCase() === PLACEHOLDER_COMPANY) return null;
  return name;
}

const HELP_MESSAGE = 'Halo, saya perlu bantuan untuk masuk ke Entaris (reset kata sandi).';

/** wa.me link for an Indonesian number ("0812…", "+62 812…", "812…"), or null. */
export function whatsappHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  const international = digits.startsWith('62')
    ? digits
    : digits.startsWith('0')
      ? `62${digits.slice(1)}`
      : `62${digits}`;
  return `https://wa.me/${international}?text=${encodeURIComponent(HELP_MESSAGE)}`;
}

export function mailtoHref(email: string | null | undefined): string | null {
  const address = (email ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return null;
  const subject = encodeURIComponent('Bantuan masuk Entaris');
  const body = encodeURIComponent(HELP_MESSAGE);
  return `mailto:${address}?subject=${subject}&body=${body}`;
}

/** Only same-app absolute paths are allowed as a post-login destination. */
export function safeRedirectTarget(from: unknown): string {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return '/';
  if (from === '/login' || from.startsWith('/login?') || from.startsWith('/login/')) return '/';
  return from;
}
