import { describe, expect, it } from 'vitest';
import { LanguageSchema, resolveLanguage } from '../language';

describe('resolveLanguage', () => {
  it('prefers the user choice, then the company default, then Indonesian', () => {
    expect(resolveLanguage('en', 'id')).toBe('en');
    expect(resolveLanguage(null, 'en')).toBe('en');
    expect(resolveLanguage(null, null)).toBe('id');
    expect(resolveLanguage('fr', 'xx')).toBe('id');
  });

  it('accepts only supported languages', () => {
    expect(LanguageSchema.safeParse('en').success).toBe(true);
    expect(LanguageSchema.safeParse('fr').success).toBe(false);
  });
});
