import { describe, it, expect } from 'vitest';
import { toPublicAiSetting } from '../settingsView';

const base = {
  id: 'set-1',
  agenticEnabled: true,
  serviceToken: 'a3f1c9e27b4d4e0f9c1a2b3c4d5e6f70',
  activeChannels: ['web'],
  whitelistModules: ['sales'],
  updatedAt: new Date('2026-10-03T00:00:00Z'),
};

describe('toPublicAiSetting', () => {
  it('never exposes the service token', () => {
    const view = toPublicAiSetting(base);
    expect(view).not.toHaveProperty('serviceToken');
    expect(JSON.stringify(view)).not.toContain(base.serviceToken);
  });

  it('reports whether a token is configured', () => {
    expect(toPublicAiSetting(base).hasServiceToken).toBe(true);
    expect(toPublicAiSetting({ ...base, serviceToken: null }).hasServiceToken).toBe(false);
    expect(toPublicAiSetting({ ...base, serviceToken: '' }).hasServiceToken).toBe(false);
  });

  it('keeps the non-secret fields', () => {
    const view = toPublicAiSetting(base);
    expect(view).toEqual({
      id: 'set-1',
      agenticEnabled: true,
      activeChannels: ['web'],
      whitelistModules: ['sales'],
      updatedAt: base.updatedAt,
      hasServiceToken: true,
    });
  });
});
