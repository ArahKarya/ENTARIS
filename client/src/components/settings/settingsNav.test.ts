import { describe, expect, it } from 'vitest';
import { resolveSettingsTab, visibleSettingsNav } from './settingsNav';

describe('settingsNav', () => {
  it('hides RBAC-only sections without rbac.manage', () => {
    const ids = visibleSettingsNav(false).flatMap((g) => g.items.map((i) => i.id));
    expect(ids).not.toContain('roles');
    expect(ids).not.toContain('agentic');
    expect(visibleSettingsNav(false).map((g) => g.label)).toEqual(['Perusahaan', 'Sistem']);
    expect(visibleSettingsNav(true).flatMap((g) => g.items).length).toBe(10);
  });

  it('resolves ?tab= with a safe fallback', () => {
    expect(resolveSettingsTab('backup', visibleSettingsNav(true)).id).toBe('backup');
    expect(resolveSettingsTab('roles', visibleSettingsNav(false)).id).toBe('company');
    expect(resolveSettingsTab(null, visibleSettingsNav(true)).id).toBe('company');
    expect(resolveSettingsTab('nope', visibleSettingsNav(true)).id).toBe('company');
  });
});
