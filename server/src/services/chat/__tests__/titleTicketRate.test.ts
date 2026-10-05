import { beforeEach, describe, expect, it } from 'vitest';
import { deriveTitle } from '../title';
import { signTurnTicket, verifyTurnTicket, turnMarkerLine, TURN_TICKET_TTL_SEC } from '../turnTicket';
import { checkTurnRate, resetTurnRate } from '../rateLimit';
import { getChatLimits, getEngineConfig, getRetentionDays, isEngineConfigured } from '../config';
import { makeSnippet } from '../snippet';

describe('deriveTitle', () => {
  it('uses the first clause, drops greetings/fillers, capitalises', () => {
    expect(deriveTitle('Halo AIRA, tolong ringkas piutang jatuh tempo minggu ini. Terima kasih')).toBe('Ringkas piutang jatuh tempo minggu ini');
  });
  it('truncates long text at a word boundary with an ellipsis', () => {
    const t = deriveTitle('buat draft buku kas dari foto nota belanja bulanan toko cabang pusat Lampung selatan');
    expect(t.length).toBeLessThanOrEqual(61);
    expect(t.endsWith('…')).toBe(true);
  });
  it('falls back for empty/whitespace input', () => {
    expect(deriveTitle('   \n ')).toBe('Percakapan baru');
    expect(deriveTitle('???')).toBe('Percakapan baru');
  });
});

describe('turn ticket', () => {
  const secret = 'rahasia-bersama-uji-0123456789abcdef';
  it('round-trips uid and ref', () => {
    const t = signTurnTicket(secret, 'u1', 's1:t1', 1_000);
    expect(verifyTurnTicket(secret, t, 1_100)).toMatchObject({ uid: 'u1', ref: 's1:t1' });
  });
  it('rejects tampering, wrong secret, expiry and malformed input', () => {
    const t = signTurnTicket(secret, 'u1', 's1:t1', 1_000);
    const [b64, sig] = t.split('.');
    const forged = `${Buffer.from(JSON.stringify({ v: 1, uid: 'admin', ref: 'x', exp: 99999999999 })).toString('base64url')}.${sig}`;
    expect(verifyTurnTicket(secret, forged, 1_100)).toBeNull();
    expect(verifyTurnTicket('lain-lain-lain-lain-lain-lain-xx', t, 1_100)).toBeNull();
    expect(verifyTurnTicket(secret, t, 1_000 + TURN_TICKET_TTL_SEC + 1)).toBeNull();
    expect(verifyTurnTicket(secret, b64, 1_100)).toBeNull();
    expect(verifyTurnTicket(secret, 'a.b.c', 1_100)).toBeNull();
    expect(turnMarkerLine(t)).toBe(`[[entaris-turn:${t}]]`);
  });
});

describe('turn rate limit', () => {
  beforeEach(() => resetTurnRate());
  it('allows up to the limit per user per minute, then reports retry-after, per user', () => {
    for (let i = 0; i < 3; i++) expect(checkTurnRate('a', 3, 1_000 + i).ok).toBe(true);
    const r = checkTurnRate('a', 3, 2_000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(checkTurnRate('b', 3, 2_000).ok).toBe(true);
    expect(checkTurnRate('a', 3, 1_000 + 61_000).ok).toBe(true);
  });
});

describe('config', () => {
  it('normalises the engine base URL and requires url + key', () => {
    expect(getEngineConfig({ AIRA_ENGINE_URL: 'http://x:1/v1/', AIRA_ENGINE_KEY: 'k' } as never).baseUrl).toBe('http://x:1');
    expect(isEngineConfigured(getEngineConfig({ AIRA_ENGINE_URL: 'http://x:1' } as never))).toBe(false);
    expect(isEngineConfigured(getEngineConfig({ AIRA_ENGINE_URL: 'http://x:1', AIRA_ENGINE_KEY: 'k' } as never))).toBe(true);
    expect(getEngineConfig({} as never).timeoutMs).toBe(120_000);
    expect(getEngineConfig({ AIRA_ENGINE_TIMEOUT_MS: '5000' } as never).timeoutMs).toBe(5_000);
  });
  it('retention is off by default and only on for positive integers', () => {
    expect(getRetentionDays({} as never)).toBeUndefined();
    expect(getRetentionDays({ AIRA_CHAT_RETENTION_DAYS: '0' } as never)).toBeUndefined();
    expect(getRetentionDays({ AIRA_CHAT_RETENTION_DAYS: '90' } as never)).toBe(90);
  });
  it('limits have sane defaults and hard window >= soft window', () => {
    const l = getChatLimits({} as never);
    expect(l.turnsPerMinute).toBe(20);
    expect(l.hardWindowTokens).toBeGreaterThanOrEqual(l.windowTokens);
  });
});

describe('makeSnippet', () => {
  it('centres on the match with ellipses', () => {
    const s = makeSnippet(`${'a '.repeat(100)}KEMBANG-77 ${'b '.repeat(100)}`, 'kembang-77');
    expect(s).toContain('KEMBANG-77');
    expect(s.startsWith('…')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
  });
});
