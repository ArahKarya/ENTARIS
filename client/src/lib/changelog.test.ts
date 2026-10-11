import { describe, expect, it } from 'vitest';
import { CHANGELOG, localizedChangelog } from './version';
import { CHANGELOG_EN } from './changelog.en';

describe('English changelog', () => {
  it('has an entry for every release with the same number of changes', () => {
    const missing = CHANGELOG.filter((e) => !CHANGELOG_EN[e.version]).map((e) => e.version);
    expect(missing, 'versions without an English entry').toEqual([]);
    for (const entry of CHANGELOG) {
      const en = CHANGELOG_EN[entry.version];
      expect(en.changes.length, `v${entry.version} change count`).toBe(entry.changes.length);
      expect(en.title.trim(), `v${entry.version} title`).not.toBe('');
    }
  });

  it('has no entries for unknown versions', () => {
    const known = new Set(CHANGELOG.map((e) => e.version));
    expect(Object.keys(CHANGELOG_EN).filter((v) => !known.has(v))).toEqual([]);
  });

  it('returns Indonesian unchanged and English when asked', () => {
    expect(localizedChangelog('id')).toBe(CHANGELOG);
    const en = localizedChangelog('en');
    expect(en).toHaveLength(CHANGELOG.length);
    expect(en[0].version).toBe(CHANGELOG[0].version);
    expect(en[0].date).toBe(CHANGELOG[0].date);
  });
});
