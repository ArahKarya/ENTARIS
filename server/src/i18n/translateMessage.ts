/**
 * Translates Indonesian server messages (`error` / `message` in API responses) to English.
 * Exact entries are looked up first, then pattern entries (most specific first). Text captured by a
 * pattern placeholder is translated recursively, so `Gagal kirim: {0}` also translates a known `{0}`.
 * Unknown messages are returned unchanged. Indonesian is the source language, so `id` is a no-op.
 */
import type { Language } from '../utils/language';
import type { MessageDictionary } from './types';
import { AIRA_MESSAGES } from './messages/aira';
import { EAM_MESSAGES } from './messages/eam';
import { FINANCE_MESSAGES } from './messages/finance';
import { INVENTORY_MESSAGES } from './messages/inventory';
import { PURCHASING_MESSAGES } from './messages/purchasing';
import { SALES_MESSAGES } from './messages/sales';
import { SYSTEM_MESSAGES } from './messages/system';

export const MESSAGE_DICTIONARIES: readonly MessageDictionary[] = [
  SYSTEM_MESSAGES,
  SALES_MESSAGES,
  PURCHASING_MESSAGES,
  INVENTORY_MESSAGES,
  FINANCE_MESSAGES,
  EAM_MESSAGES,
  AIRA_MESSAGES,
];

const PLACEHOLDER = /\{(\d+)\}/g;
const MAX_DEPTH = 3;

interface CompiledPattern {
  key: string;
  regex: RegExp;
  /** Placeholder index for each capture group, in order of appearance in the key. */
  slots: number[];
  english: string;
  /** Length of the literal (non-placeholder) text; longer = more specific, tried first. */
  weight: number;
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const isPatternKey = (key: string): boolean => /\{\d+\}/.test(key);

function compilePattern(key: string, english: string): CompiledPattern {
  const slots: number[] = [];
  let source = '';
  let last = 0;
  for (const m of key.matchAll(PLACEHOLDER)) {
    source += escapeRegex(key.slice(last, m.index));
    source += '([\\s\\S]*?)';
    slots.push(Number(m[1]));
    last = (m.index ?? 0) + m[0].length;
  }
  source += escapeRegex(key.slice(last));
  const weight = key.replace(PLACEHOLDER, '').length;
  return { key, regex: new RegExp(`^${source}$`), slots, english, weight };
}

function buildIndex(dictionaries: readonly MessageDictionary[]) {
  const exact = new Map<string, string>();
  const patterns: CompiledPattern[] = [];
  for (const dict of dictionaries) {
    for (const [key, english] of Object.entries(dict)) {
      if (isPatternKey(key)) patterns.push(compilePattern(key, english));
      else exact.set(key, english);
    }
  }
  patterns.sort((a, b) => b.weight - a.weight);
  return { exact, patterns };
}

const INDEX = buildIndex(MESSAGE_DICTIONARIES);

function toEnglish(text: string, depth: number): string {
  const exact = INDEX.exact.get(text);
  if (exact !== undefined) return exact;
  if (depth >= MAX_DEPTH) return text;
  for (const p of INDEX.patterns) {
    const m = p.regex.exec(text);
    if (!m) continue;
    const values = new Map<number, string>();
    p.slots.forEach((slot, i) => values.set(slot, toEnglish(m[i + 1] ?? '', depth + 1)));
    return p.english.replace(PLACEHOLDER, (whole, n: string) => values.get(Number(n)) ?? whole);
  }
  return text;
}

export function translateMessage(text: string, lang: Language): string {
  if (lang !== 'en' || !text) return text;
  return toEnglish(text, 0);
}

/** True when the dictionary has an exact or pattern entry that matches `text` (used by the coverage test). */
export function hasTranslation(text: string): boolean {
  if (INDEX.exact.has(text)) return true;
  return INDEX.patterns.some((p) => p.key === text || p.regex.test(text));
}
