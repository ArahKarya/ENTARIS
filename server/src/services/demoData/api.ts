// Loopback client for the demo-data generator. Every document is created by calling the app's own
// HTTP handlers as a real user (short-lived JWT marked via:'demo'), so RBAC, validation, approval
// gates, GL posting, stock/WAC and the audit trail behave exactly as in normal use.

import { generateShortLivedToken } from '../../utils/auth';

export interface DemoActor {
  id: string;
  role: string;
}

export class DemoApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly detail: string,
  ) {
    super(`${method} ${path} -> ${status}: ${detail}`);
    this.name = 'DemoApiError';
  }
}

export interface DemoApi {
  get<T = unknown>(actor: DemoActor, path: string): Promise<T>;
  post<T = unknown>(actor: DemoActor, path: string, body?: unknown): Promise<{ status: number; data: T }>;
  patch<T = unknown>(actor: DemoActor, path: string, body?: unknown): Promise<T>;
}

const TOKEN_TTL_SEC = 120;
const REQUEST_TIMEOUT_MS = 60_000;
/** Stays under the global /api limit of 300 requests per minute per IP (index.ts). */
export const DEFAULT_MIN_INTERVAL_MS = 230;
const MAX_RATE_LIMIT_RETRIES = 3;

export function createDemoApi(opts: { baseUrl?: string; minIntervalMs?: number } = {}): DemoApi {
  const baseUrl = opts.baseUrl ?? `http://127.0.0.1:${process.env.PORT || 3001}`;
  const minInterval = opts.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  let nextSlot = 0;

  async function throttle(): Promise<void> {
    const now = Date.now();
    const wait = nextSlot - now;
    nextSlot = Math.max(now, nextSlot) + minInterval;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }

  async function request<T>(actor: DemoActor, method: string, path: string, body?: unknown, attempt = 0): Promise<{ status: number; data: T }> {
    await throttle();
    const token = generateShortLivedToken({ userId: actor.id, role: actor.role, via: 'demo' }, TOKEN_TTL_SEC);
    const res = await fetch(`${baseUrl}/api${path}`, {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'user-agent': 'entaris-demo-data/1',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    // Rate-limited requests never reached the handler, so retrying them cannot double-post.
    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const retryAfter = Number(res.headers.get('retry-after')) || 5;
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 60) * 1000));
      return request<T>(actor, method, path, body, attempt + 1);
    }
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const detail = typeof data === 'object' && data && 'error' in data ? String((data as { error: unknown }).error) : text.slice(0, 300);
      throw new DemoApiError(method, path, res.status, detail);
    }
    return { status: res.status, data: data as T };
  }

  return {
    get: async <T>(actor: DemoActor, path: string) => (await request<T>(actor, 'GET', path)).data,
    post: <T>(actor: DemoActor, path: string, body?: unknown) => request<T>(actor, 'POST', path, body ?? {}),
    patch: async <T>(actor: DemoActor, path: string, body?: unknown) => (await request<T>(actor, 'PATCH', path, body ?? {})).data,
  };
}
