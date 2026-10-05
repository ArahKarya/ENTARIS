import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db } = vi.hoisted(() => {
  const db: any = {
    mcpToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    mcpNonce: { create: vi.fn(), deleteMany: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  return { db };
});
vi.mock('../../lib/prisma', () => ({ prisma: db }));

import { authenticateBearer, consumeNonce, createMcpToken, getSigningSecret, revokeMcpToken, rotateSigningSecret, toPublicToken, tokenStatus } from '../tokenService';
import { sha256Hex } from '../crypto';

process.env.MCP_SECRET_KEY = 'unit-test-mcp-key-0123456789';

const base = {
  id: 't1', name: 'aira-dev', prefix: 'entmcp_abcdef', tokenHash: 'h', signingSecretEnc: 'enc', defaultActorUserId: null,
  expiresAt: null, revokedAt: null, lastUsedAt: null, lastUsedIp: null, createdById: 'admin', createdAt: new Date(), rateLimitPerMin: 120,
};

beforeEach(() => vi.clearAllMocks());

describe('createMcpToken', () => {
  it('stores only the hash + encrypted secret and returns the plaintext once', async () => {
    db.mcpToken.create.mockImplementation(async ({ data }: any) => ({ ...base, ...data, id: 't1' }));
    const r = await createMcpToken({ name: 'aira-dev', createdById: 'admin' });
    const data = db.mcpToken.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(sha256Hex(r.token));
    expect(JSON.stringify(data)).not.toContain(r.token);
    expect(JSON.stringify(data)).not.toContain(r.signingSecret);
    expect(data.signingSecretEnc.startsWith('v1.')).toBe(true);
    expect(r.record).not.toHaveProperty('tokenHash');
    expect(r.record).not.toHaveProperty('signingSecretEnc');
    expect(r.record.status).toBe('active');
    db.mcpToken.findUnique.mockResolvedValue({ ...base, ...data });
    expect(getSigningSecret({ signingSecretEnc: data.signingSecretEnc })).toBe(r.signingSecret);
  });

  it('refuses a default actor that is unknown, inactive or not registered for AIRA', async () => {
    db.user.findUnique.mockResolvedValueOnce(null);
    await expect(createMcpToken({ name: 'x', createdById: 'a', defaultActorUserId: 'nope' })).rejects.toThrow(/tidak ditemukan/);
    db.user.findUnique.mockResolvedValueOnce({ isActive: false, airaEnabled: true, fullName: 'Budi' });
    await expect(createMcpToken({ name: 'x', createdById: 'a', defaultActorUserId: 'u' })).rejects.toThrow(/tidak aktif/);
    db.user.findUnique.mockResolvedValueOnce({ isActive: true, airaEnabled: false, fullName: 'Budi' });
    await expect(createMcpToken({ name: 'x', createdById: 'a', defaultActorUserId: 'u' })).rejects.toThrow(/Akses AIRA/);
    expect(db.mcpToken.create).not.toHaveBeenCalled();
  });
});

describe('authenticateBearer', () => {
  it('rejects missing/garbage headers without touching the DB', async () => {
    for (const h of [undefined, '', 'Basic abc', 'Bearer', 'Bearer not-a-token']) {
      expect(await authenticateBearer(h)).toMatchObject({ ok: false, status: 401 });
    }
    expect(db.mcpToken.findUnique).not.toHaveBeenCalled();
  });

  it('looks up by sha256(token) and distinguishes unknown/revoked/expired', async () => {
    db.mcpToken.findUnique.mockResolvedValueOnce(null);
    expect(await authenticateBearer('Bearer entmcp_unknown')).toMatchObject({ ok: false, code: 'token_invalid' });
    expect(db.mcpToken.findUnique).toHaveBeenCalledWith({ where: { tokenHash: sha256Hex('entmcp_unknown') } });
    db.mcpToken.findUnique.mockResolvedValueOnce({ ...base, revokedAt: new Date() });
    expect(await authenticateBearer('Bearer entmcp_x')).toMatchObject({ ok: false, code: 'token_revoked' });
    db.mcpToken.findUnique.mockResolvedValueOnce({ ...base, expiresAt: new Date(Date.now() - 1000) });
    expect(await authenticateBearer('Bearer entmcp_x')).toMatchObject({ ok: false, code: 'token_expired' });
    db.mcpToken.findUnique.mockResolvedValueOnce(base);
    expect(await authenticateBearer('Bearer entmcp_x')).toMatchObject({ ok: true });
  });
});

describe('lifecycle', () => {
  it('tokenStatus / toPublicToken', () => {
    expect(tokenStatus({ revokedAt: null, expiresAt: null })).toBe('active');
    expect(tokenStatus({ revokedAt: new Date(), expiresAt: null })).toBe('revoked');
    expect(toPublicToken(base as any)).not.toHaveProperty('signingSecretEnc');
  });

  it('revoke is idempotent; rotate refuses a revoked token and returns a new secret once', async () => {
    db.mcpToken.findUnique.mockResolvedValue({ ...base, revokedAt: new Date() });
    await revokeMcpToken('t1');
    expect(db.mcpToken.update).not.toHaveBeenCalled();
    await expect(rotateSigningSecret('t1')).rejects.toThrow(/dicabut/);
    db.mcpToken.findUnique.mockResolvedValue(base);
    db.mcpToken.update.mockImplementation(async ({ data }: any) => ({ ...base, ...data }));
    const r = await rotateSigningSecret('t1');
    expect(r.signingSecret.startsWith('entsig_')).toBe(true);
    expect(JSON.stringify(db.mcpToken.update.mock.calls[0][0])).not.toContain(r.signingSecret);
  });
});

describe('consumeNonce', () => {
  it('first use true, replay (unique violation) false, other errors propagate', async () => {
    db.mcpNonce.create.mockResolvedValueOnce({});
    expect(await consumeNonce('t', 'n', new Date())).toBe(true);
    db.mcpNonce.create.mockRejectedValueOnce({ code: 'P2002' });
    expect(await consumeNonce('t', 'n', new Date())).toBe(false);
    db.mcpNonce.create.mockRejectedValueOnce(new Error('db down'));
    await expect(consumeNonce('t', 'n', new Date())).rejects.toThrow('db down');
  });
});
