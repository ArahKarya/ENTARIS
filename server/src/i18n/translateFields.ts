/**
 * Translates server-composed display text inside response data (not just `error`/`message`):
 * every string under one of `fields`, at any depth, goes through translateMessage. Use it only on
 * endpoints whose listed fields hold fixed labels built by the server; user data in other fields
 * is left alone. Returns a copy; the input is never mutated.
 */
import type { Language } from '../utils/language';
import { translateMessage } from './translateMessage';

export function translateFields<T>(value: T, lang: Language | null, fields: readonly string[]): T {
  if (lang !== 'en') return value;
  const wanted = new Set(fields);
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v === null || typeof v !== 'object' || v instanceof Date) return v;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(v as Record<string, unknown>)) {
      out[key] = typeof child === 'string' && wanted.has(key) ? translateMessage(child, lang) : walk(child);
    }
    return out;
  };
  return walk(value) as T;
}
