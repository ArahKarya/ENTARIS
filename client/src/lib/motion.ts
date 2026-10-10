/**
 * Motion levels and pure helpers (DESIGN.md "Gerak"). With nothing stored the level
 * follows the device: reduced motion -> 'none', otherwise 'smooth'.
 * public/theme-init.js mirrors resolveMotion so <html data-motion> is set before first paint.
 */
import { LOCALE } from './format';
export type MotionLevel = 'none' | 'minimal' | 'smooth' | 'lively';

export interface MotionMeta {
  id: MotionLevel;
  label: string;
  description: string;
}

export const MOTION_STORAGE_KEY = 'motion';
export const DEFAULT_MOTION: MotionLevel = 'smooth';
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export const MOTION_LEVELS: readonly MotionMeta[] = [
  { id: 'none', label: 'Tidak ada', description: 'Tanpa transisi. Semua berubah seketika.' },
  { id: 'minimal', label: 'Minimalis', description: 'Hanya buka dan tutup dialog, panel samping, dan menu.' },
  { id: 'smooth', label: 'Halus', description: 'Ditambah transisi saat kursor lewat dan saat berganti tab.' },
  { id: 'lively', label: 'Terasa hidup', description: 'Ditambah angka KPI yang menghitung naik dan grafik yang bergerak saat dimuat.' },
];

export function isMotionLevel(value: unknown): value is MotionLevel {
  return value === 'none' || value === 'minimal' || value === 'smooth' || value === 'lively';
}

/** Stored choice wins; without one, reduced-motion devices get 'none'. */
export function resolveMotion(stored: unknown, prefersReduced: boolean): MotionLevel {
  if (isMotionLevel(stored)) return stored;
  return prefersReduced ? 'none' : DEFAULT_MOTION;
}

export interface NumericParts {
  prefix: string;
  number: number;
  decimals: number;
  suffix: string;
}

/**
 * Splits a formatted value ("Rp 1.234.567", "12,5 jt", "-3%"; en-US: "Rp 1,234,567") into the
 * parts a count-up needs. Returns null when there is no number to animate.
 */
export function parseNumericParts(text: string, locale: string = LOCALE): NumericParts | null {
  const english = locale.startsWith('en');
  const group = english ? ',' : '.';
  const decimal = english ? '.' : ',';
  const g = `\\${group}`;
  const d = `\\${decimal}`;
  const match = new RegExp(`-?\\d{1,3}(?:${g}\\d{3})+(?:${d}\\d+)?|-?\\d+(?:${d}\\d+)?`).exec(text);
  if (!match) return null;
  const raw = match[0];
  const [intPart, fracPart = ''] = raw.split(decimal);
  const number = Number(`${intPart.split(group).join('')}.${fracPart || '0'}`);
  if (!Number.isFinite(number)) return null;
  return {
    prefix: text.slice(0, match.index),
    number,
    decimals: fracPart.length,
    suffix: text.slice(match.index + raw.length),
  };
}

export function formatNumericParts(parts: NumericParts, value: number, locale: string = LOCALE): string {
  const formatted = value.toLocaleString(locale, {
    minimumFractionDigits: parts.decimals,
    maximumFractionDigits: parts.decimals,
  });
  return `${parts.prefix}${formatted}${parts.suffix}`;
}

/** `scrollIntoView` behavior for the level currently on <html data-motion>. */
export function scrollBehavior(): ScrollBehavior {
  const level = typeof document === 'undefined' ? null : document.documentElement.dataset.motion;
  return level === 'none' || level === 'minimal' ? 'auto' : 'smooth';
}
