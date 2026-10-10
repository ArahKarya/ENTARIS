/**
 * Translates API response messages to the caller's language.
 * The client sends `X-Entaris-Lang: id|en`; without it, `Accept-Language` decides. Requests that carry
 * neither header (MCP loopback, scripts) are never translated. Only string `error` / `message` fields
 * (top level, and inside `details`, `errors`, `rowErrors`, `warnings`) are touched; data is never changed.
 */
import type { NextFunction, Request, Response } from 'express';
import { DEFAULT_LANGUAGE, isLanguage, type Language } from '../utils/language';
import { translateMessage } from '../i18n/translateMessage';

export const LANGUAGE_HEADER = 'x-entaris-lang';
const NESTED_KEYS = ['details', 'errors', 'rowErrors', 'warnings'] as const;
const MESSAGE_KEYS = ['error', 'message'] as const;

function fromAcceptLanguage(header: string): Language {
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { lang: tag.trim().toLowerCase().split('-')[0], q: q ? Number(q.slice(2)) : 1 };
    })
    .filter((x) => x.lang && Number.isFinite(x.q) && x.q > 0)
    .sort((a, b) => b.q - a.q);
  return ranked.map((x) => x.lang).find(isLanguage) ?? DEFAULT_LANGUAGE;
}

/** The response language for this request, or null when it sent no language header at all. */
export function requestLanguage(req: Pick<Request, 'get'>): Language | null {
  const explicit = req.get(LANGUAGE_HEADER)?.trim().toLowerCase();
  if (isLanguage(explicit)) return explicit;
  const accept = req.get('accept-language');
  if (accept?.trim()) return fromAcceptLanguage(accept);
  return explicit ? DEFAULT_LANGUAGE : null;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

/**
 * Walks a nested payload. Strings are translated only where they are messages: inside message arrays
 * (`errors`, `rowErrors`, `warnings`, Zod `_errors`) or under an `error` / `message` key.
 */
function translateNested(value: unknown, lang: Language, isMessage: boolean, depth: number): unknown {
  if (depth > 5) return value;
  if (typeof value === 'string') return isMessage ? translateMessage(value, lang) : value;
  if (Array.isArray(value)) return value.map((v) => translateNested(v, lang, isMessage, depth + 1));
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    const childIsMessage = key === '_errors' || (MESSAGE_KEYS as readonly string[]).includes(key);
    out[key] = translateNested(v, lang, childIsMessage, depth + 1);
  }
  return out;
}

/** Returns a translated copy of a response body; the original object is never mutated. */
export function translateBody(body: unknown, lang: Language): unknown {
  if (lang === DEFAULT_LANGUAGE || !isPlainObject(body)) return body;
  let out: Record<string, unknown> | null = null;
  const set = (key: string, next: unknown) => {
    if (next === body[key]) return;
    out ??= { ...body };
    out[key] = next;
  };
  for (const key of MESSAGE_KEYS) {
    const v = body[key];
    if (typeof v === 'string') set(key, translateMessage(v, lang));
  }
  for (const key of NESTED_KEYS) {
    const v = body[key];
    if (v !== undefined) set(key, translateNested(v, lang, key !== 'details', 0));
  }
  return out ?? body;
}

export function responseLanguage(req: Request, res: Response, next: NextFunction): void {
  const lang = requestLanguage(req);
  if (lang && lang !== DEFAULT_LANGUAGE) {
    const json = res.json.bind(res);
    res.json = (body?: unknown) => json(translateBody(body, lang));
  }
  next();
}
