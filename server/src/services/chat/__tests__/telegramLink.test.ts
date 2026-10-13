import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signLinkTicket, signConsoleTicket } from '../consoleTicket';
import { getEngineConfig } from '../config';
import { allowLinkRequest, LINK_CODES_PER_WINDOW, requestLinkCode, resetLinkRequests } from '../telegramLink';
import { redactSecrets } from '../../../utils/redact';

const SECRET = 't'.repeat(40);
const CFG = getEngineConfig({ AIRA_ENGINE_URL: 'http://engine:8642/v1', AIRA_ENGINE_KEY: 'k'.repeat(40), AIRA_ENGINE_TURN_SECRET: SECRET });

function answer(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}

describe('link ticket', () => {
  it('matches the engine reference vector byte for byte', () => {
    const expected =
      'eyJ2IjoyLCJhdWQiOiJsaW5rIiwidWlkIjoidTEiLCJuYW1lIjoiQWRtaW4iLCJqdGkiOiIwMTIzNDU2Nzg5YWJjZGVmIiwiZXhwIjoxNzAwMDAwMDYwfQ' +
      '.f095128db58708d25dd604b5ef3e619693a3b1f17097995a51c5c4797d8cee21';
    expect(signLinkTicket(SECRET, 'u1', 'Admin', 1_700_000_000, '0123456789abcdef').ticket).toBe(expected);
  });

  it('differs from a console ticket for the same inputs', () => {
    const a = signLinkTicket(SECRET, 'u1', 'Admin', 1_700_000_000, '0123456789abcdef').ticket;
    const b = signConsoleTicket(SECRET, 'u1', 'Admin', 1_700_000_000, '0123456789abcdef').ticket;
    expect(a.split('.')[1]).not.toBe(b.split('.')[1]);
  });
});

describe('requestLinkCode', () => {
  it('posts a link ticket with the engine key and returns the code', async () => {
    const fetchImpl = answer(200, { code: 'ABCD-EFGH', expiresAt: '2026-10-13T08:10:00+00:00', bot: 'airates_bot', deepLink: 'https://t.me/airates_bot?start=link-ABCDEFGH' });
    const out = await requestLinkCode(CFG, { id: 'u1', name: 'Budi' }, fetchImpl as unknown as typeof fetch);
    expect(out).toEqual({ linkCode: 'ABCD-EFGH', expiresAt: '2026-10-13T08:10:00+00:00', bot: 'airates_bot', deepLink: 'https://t.me/airates_bot?start=link-ABCDEFGH' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://engine:8642/v1/telegram/link-codes');
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${'k'.repeat(40)}`);
    const ticket = JSON.parse(String(init.body)).ticket as string;
    const payload = JSON.parse(Buffer.from(ticket.split('.')[0]!, 'base64url').toString('utf8'));
    expect(payload).toMatchObject({ v: 2, aud: 'link', uid: 'u1', name: 'Budi' });
  });

  it('drops a deep link that is not t.me', async () => {
    const fetchImpl = answer(200, { code: 'ABCD-EFGH', expiresAt: 'x', bot: null, deepLink: 'javascript:alert(1)' });
    const out = await requestLinkCode(CFG, { id: 'u1', name: 'B' }, fetchImpl as unknown as typeof fetch);
    expect(out.deepLink).toBeNull();
  });

  it('explains a disabled bot, a refusal, an offline engine and missing config', async () => {
    const user = { id: 'u1', name: 'B' };
    await expect(requestLinkCode(CFG, user, answer(409, { error: { code: 'telegram_disabled' } }) as unknown as typeof fetch)).rejects.toThrow('belum aktif');
    await expect(requestLinkCode(CFG, user, answer(401, { error: { code: 'invalid_ticket' } }) as unknown as typeof fetch)).rejects.toThrow('menolak');
    const offline = vi.fn(async () => { throw new TypeError('fetch failed'); });
    await expect(requestLinkCode(CFG, user, offline as unknown as typeof fetch)).rejects.toThrow('tidak dapat dihubungi');
    await expect(requestLinkCode(getEngineConfig({}), user)).rejects.toThrow('belum dikonfigurasi');
  });
});

describe('link request limit and audit', () => {
  beforeEach(() => resetLinkRequests());

  it('allows a few codes per user per window', () => {
    for (let i = 0; i < LINK_CODES_PER_WINDOW; i++) expect(allowLinkRequest('u1', 1_000)).toBe(true);
    expect(allowLinkRequest('u1', 1_000)).toBe(false);
    expect(allowLinkRequest('u2', 1_000)).toBe(true);
    expect(allowLinkRequest('u1', 1_000 + 10 * 60_000)).toBe(true);
  });

  it('keeps the code out of the audit trail', () => {
    expect(redactSecrets({ linkCode: 'ABCD-EFGH', deepLink: 'https://t.me/x?start=link-ABCDEFGH', bot: 'x' })).toEqual({
      linkCode: '[REDACTED]',
      deepLink: '[REDACTED]',
      bot: 'x',
    });
  });
});
