import path from 'path';
import { describe, expect, it } from 'vitest';
import { scanDir } from './messageScanner';
import { hasTranslation } from '../translateMessage';

/**
 * Every user-facing message literal in the server (`error:` / `message:` properties, thrown errors,
 * handleRouteError fallbacks, Zod messages) must have an English entry in src/i18n/messages, so a
 * new Indonesian message cannot ship untranslated. Add the entry, or list the text below with a reason.
 */
const IGNORED = new Set<string>([
  // Already English: internal/diagnostic text, never shown as Indonesian copy.
  'CORS: origin {0} not allowed',
  'Token has been revoked.',
  'Invalid CSRF token.',
  '{0} timed out',
  '{0} spawn error: {1}',
  'File write error: {0}',
  '{0} exited {1}: {2}',
  'restore timed out',
  '{0} error: {1}',
  'Bot detected.',
  'No Admin user available to attribute public inquiry to',
  'Inventory item {0} not found during COGS backfill settle.',
  'HTTP {0}',
]);

/** Machine-readable error codes (`engine_busy`, `turn_in_progress`) are mapped to text by the client. */
const isErrorCode = (text: string) => /^[a-z0-9_]+$/.test(text);

const SRC = path.resolve(__dirname, '../..');

describe('server message dictionary coverage', () => {
  const messages = scanDir(SRC);

  it('finds the message literals', () => {
    expect(messages.length).toBeGreaterThan(1000);
    expect(messages.some((m) => m.file.startsWith('routes/'))).toBe(true);
  });

  it('has an English entry for every message', () => {
    const missing = [
      ...new Set(
        messages
          .filter((m) => !isErrorCode(m.text) && !IGNORED.has(m.text) && !hasTranslation(m.text))
          .map((m) => `${m.file}:${m.line}  ${m.text}`),
      ),
    ];
    expect(missing, `Add these to src/i18n/messages/*.ts:\n${missing.join('\n')}`).toEqual([]);
  });

  it('keeps the ignore list free of stale entries', () => {
    const texts = new Set(messages.map((m) => m.text));
    expect([...IGNORED].filter((t) => !texts.has(t))).toEqual([]);
  });
});
