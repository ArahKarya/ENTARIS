import { describe, expect, it } from 'vitest';
import type { ResourceKey } from 'i18next';

const files = import.meta.glob<{ default: ResourceKey }>('../locales/*/*.json', { eager: true });

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

function byLanguage(lng: string): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const [path, mod] of Object.entries(files)) {
    const [, l, ns] = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path) ?? [];
    if (l === lng && ns) out.set(ns, flatten(mod.default as Tree));
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{\{\s*(\w+)/g)].map((m) => m[1]).sort();

describe('locale files', () => {
  const id = byLanguage('id');
  const en = byLanguage('en');

  it('have the same namespaces in every language', () => {
    expect([...en.keys()].sort()).toEqual([...id.keys()].sort());
  });

  for (const [ns, idKeys] of id) {
    it(`${ns}: same keys and placeholders in en`, () => {
      const enKeys = en.get(ns) ?? new Map<string, string>();
      expect([...enKeys.keys()].sort()).toEqual([...idKeys.keys()].sort());
      for (const [key, text] of idKeys) {
        expect(placeholders(enKeys.get(key) ?? ''), `${ns}:${key}`).toEqual(placeholders(text));
        expect(text.trim(), `${ns}:${key} is empty`).not.toBe('');
      }
    });
  }
});
