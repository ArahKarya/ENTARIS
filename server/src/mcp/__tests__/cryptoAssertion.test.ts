import { describe, it, expect } from 'vitest';
import { decryptSecret, encryptSecret, generateMcpToken, generateSigningSecret, sha256Hex, signPayload, tokenPrefix, verifySignature } from '../crypto';
import { verifyAssertion } from '../assertion';

const ENV = { MCP_SECRET_KEY: 'k-1-unit-test-key-0123456789abcdef', JWT_SECRET: 'jwt-unit-test-secret' } as NodeJS.ProcessEnv;
const SECRET = 'entsig_test-secret';
const NOW = 1_800_000_000;

function make(over: Record<string, unknown> = {}, secret = SECRET) {
  const payload = { v: 1, uid: 'u1', ch: 'whatsapp', gf: false, ts: NOW, nonce: 'nonce-12345678', ref: 'wa:chat1', ...over };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { b64, sig: signPayload(secret, b64) };
}

describe('crypto', () => {
  it('generates distinct prefixed tokens/secrets', () => {
    const a = generateMcpToken();
    expect(a.startsWith('entmcp_')).toBe(true);
    expect(a).not.toBe(generateMcpToken());
    expect(generateSigningSecret().startsWith('entsig_')).toBe(true);
    expect(tokenPrefix(a)).toHaveLength(13);
  });

  it('sha256Hex is stable hex-64 and never equals input', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('encrypt/decrypt roundtrip; ciphertext is randomised and tamper-evident', () => {
    const enc = encryptSecret('entsig_rahasia', ENV);
    expect(enc).not.toContain('rahasia');
    expect(encryptSecret('entsig_rahasia', ENV)).not.toBe(enc);
    expect(decryptSecret(enc, ENV)).toBe('entsig_rahasia');
    const [v, iv, tag, ct] = enc.split('.');
    const flipped = `${v}.${iv}.${tag}.${ct.slice(0, -2)}AA`;
    expect(() => decryptSecret(flipped, ENV)).toThrow();
  });

  it('a different key cannot decrypt; JWT_SECRET is the fallback key', () => {
    const enc = encryptSecret('x', ENV);
    expect(() => decryptSecret(enc, { ...ENV, MCP_SECRET_KEY: 'other-key' })).toThrow();
    const fb = { JWT_SECRET: 'only-jwt' } as NodeJS.ProcessEnv;
    expect(decryptSecret(encryptSecret('y', fb), fb)).toBe('y');
    expect(() => encryptSecret('z', {} as NodeJS.ProcessEnv)).toThrow();
  });

  it('verifySignature is exact and never throws on garbage', () => {
    const { b64, sig } = make();
    expect(verifySignature(SECRET, b64, sig)).toBe(true);
    expect(verifySignature(SECRET, b64, sig.toUpperCase())).toBe(true);
    expect(verifySignature(SECRET, b64 + 'A', sig)).toBe(false);
    expect(verifySignature('other', b64, sig)).toBe(false);
    expect(verifySignature(SECRET, b64, 'zz')).toBe(false);
    expect(verifySignature(SECRET, b64, sig.slice(2))).toBe(false);
  });
});

describe('verifyAssertion', () => {
  it('accepts a valid assertion', () => {
    const { b64, sig } = make();
    const r = verifyAssertion(b64, sig, SECRET, NOW + 5);
    expect(r).toMatchObject({ ok: true, assertion: { uid: 'u1', ch: 'whatsapp', gf: false, ref: 'wa:chat1' } });
  });

  it('rejects a bad signature before looking at the payload', () => {
    const { b64 } = make();
    expect(verifyAssertion(b64, 'a'.repeat(64), SECRET, NOW)).toMatchObject({ ok: false, code: 'actor_signature_invalid' });
  });

  it('rejects a payload signed with the wrong secret (forged uid)', () => {
    const { b64, sig } = make({ uid: 'admin' }, 'attacker-secret');
    expect(verifyAssertion(b64, sig, SECRET, NOW)).toMatchObject({ ok: false, code: 'actor_signature_invalid' });
  });

  it('enforces the 120 s TTL and the future skew', () => {
    const { b64, sig } = make();
    expect(verifyAssertion(b64, sig, SECRET, NOW + 120)).toMatchObject({ ok: true });
    expect(verifyAssertion(b64, sig, SECRET, NOW + 121)).toMatchObject({ ok: false, code: 'actor_assertion_expired' });
    expect(verifyAssertion(b64, sig, SECRET, NOW - 30)).toMatchObject({ ok: true });
    expect(verifyAssertion(b64, sig, SECRET, NOW - 31)).toMatchObject({ ok: false, code: 'actor_assertion_future' });
  });

  it('rejects malformed shapes (even when correctly signed)', () => {
    for (const over of [{ v: 2 }, { ch: 'sms' }, { gf: 'no' }, { uid: '' }, { nonce: 'x' }, { ts: 1.5 }]) {
      const { b64, sig } = make(over);
      expect(verifyAssertion(b64, sig, SECRET, NOW)).toMatchObject({ ok: false, code: 'actor_assertion_malformed' });
    }
    expect(verifyAssertion('', '', SECRET, NOW)).toMatchObject({ ok: false, code: 'actor_assertion_malformed' });
    expect(verifyAssertion('not base64!', 'a'.repeat(64), SECRET, NOW)).toMatchObject({ ok: false, code: 'actor_assertion_malformed' });
    const b64 = Buffer.from('not json').toString('base64url');
    expect(verifyAssertion(b64, signPayload(SECRET, b64), SECRET, NOW)).toMatchObject({ ok: false, code: 'actor_assertion_malformed' });
  });
});
