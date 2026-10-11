/**
 * Translation helpers for the Assets & Maintenance (eam) namespace, for code outside components
 * (models, column defs, option lists). Values are looked up on every read so they follow the
 * current UI language.
 */
import i18n from '@/i18n';

/** Translate an `eam` key at call time. Accepts dynamic keys built from enum values. */
export function tEam(key: string, options?: Record<string, unknown>): string {
  return (i18n.t as (k: string, o?: Record<string, unknown>) => string)(`eam:${key}`, options);
}

/**
 * Lookup object (`LABELS[value]`) whose values are translated on every read:
 * `labelMap(['LOW', 'HIGH'], 'priority')` reads `eam:priority.LOW`, `eam:priority.HIGH`.
 */
export function labelMap<K extends string>(values: readonly K[], prefix: string): Readonly<Record<K, string>> {
  const out = {} as Record<K, string>;
  for (const value of values) {
    Object.defineProperty(out, value, { enumerable: true, get: () => tEam(`${prefix}.${value}`) });
  }
  return Object.freeze(out);
}
