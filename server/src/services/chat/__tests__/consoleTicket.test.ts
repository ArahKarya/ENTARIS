import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { CONSOLE_TICKET_TTL_SEC, signConsoleTicket } from '../consoleTicket';
import { getEngineConfig } from '../config';
import { signTurnTicket, verifyTurnTicket } from '../turnTicket';

const SECRET = 't'.repeat(40);

describe('consoleTicket', () => {
  it('matches the engine reference vector byte for byte', () => {
    // Produced by the engine's reference signer for the same inputs.
    const expected =
      'eyJ2IjoyLCJhdWQiOiJjb25zb2xlIiwidWlkIjoidTEiLCJuYW1lIjoiQWRtaW4iLCJqdGkiOiIwMTIzNDU2Nzg5YWJjZGVmIiwiZXhwIjoxNzAwMDAwMDYwfQ' +
      '.84de5e79453ab31409d752f51b0567d6efe9e70705f6455b2de2b9e0d0383dab';
    const { ticket, expiresAt } = signConsoleTicket(SECRET, 'u1', 'Admin', 1_700_000_000, '0123456789abcdef');
    expect(ticket).toBe(expected);
    expect(expiresAt).toBe(1_700_000_000 + CONSOLE_TICKET_TTL_SEC);
  });

  it('cannot be used as a turn ticket and is not signed with the raw secret', () => {
    const { ticket } = signConsoleTicket(SECRET, 'u1', 'Admin', Math.floor(Date.now() / 1000));
    expect(verifyTurnTicket(SECRET, ticket)).toBeNull();
    const [b64, sig] = ticket.split('.');
    expect(sig).not.toBe(createHmac('sha256', SECRET).update(b64!).digest('hex'));
    expect(verifyTurnTicket(SECRET, signTurnTicket(SECRET, 'u1', 'r'))).not.toBeNull();
  });

  it('keeps the name short', () => {
    const { ticket } = signConsoleTicket(SECRET, 'u1', 'x'.repeat(500), 1_700_000_000);
    const payload = JSON.parse(Buffer.from(ticket.split('.')[0]!, 'base64url').toString('utf8')) as { name: string };
    expect(payload.name).toHaveLength(100);
  });

  it('uses a fresh jti for every ticket', () => {
    const a = signConsoleTicket(SECRET, 'u1', 'Admin', 1_700_000_000).ticket;
    const b = signConsoleTicket(SECRET, 'u1', 'Admin', 1_700_000_000).ticket;
    expect(a).not.toBe(b);
  });
});

describe('consoleUrl', () => {
  it('defaults to the engine URL and accepts an explicit browser-facing URL', () => {
    expect(getEngineConfig({ AIRA_ENGINE_URL: 'http://127.0.0.1:8642/v1/' }).consoleUrl).toBe('http://127.0.0.1:8642/admin');
    expect(getEngineConfig({ AIRA_CONSOLE_URL: 'https://aira.contoh.com/admin/' }).consoleUrl).toBe('https://aira.contoh.com/admin');
    expect(getEngineConfig({ AIRA_CONSOLE_URL: 'javascript:alert(1)' }).consoleUrl).toBeNull();
    expect(getEngineConfig({}).consoleUrl).toBeNull();
    for (const bad of ['https://x/admin?a=1', 'https://x/admin#frag', 'https://user:pw@x/admin', 'ftp://x/admin']) {
      expect(getEngineConfig({ AIRA_CONSOLE_URL: bad }).consoleUrl).toBeNull();
    }
  });
});
