// Siklus hidup token servis MCP: buat, autentikasi Bearer, revoke, rotate secret.
// Token mentah & signing secret HANYA dikembalikan sekali (saat dibuat / rotate).

import type { McpToken } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { BusinessError } from '../utils/errors';
import { DEFAULT_RATE_LIMIT_PER_MIN, TOKEN_PREFIX } from './constants';
import {
  decryptSecret,
  encryptSecret,
  generateMcpToken,
  generateSigningSecret,
  sha256Hex,
  tokenPrefix,
} from './crypto';

export type McpTokenStatus = 'active' | 'revoked' | 'expired';
export type PublicMcpToken = Omit<McpToken, 'tokenHash' | 'signingSecretEnc'> & { status: McpTokenStatus };

export function tokenStatus(t: Pick<McpToken, 'revokedAt' | 'expiresAt'>, now: Date = new Date()): McpTokenStatus {
  if (t.revokedAt) return 'revoked';
  if (t.expiresAt && t.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}

export function toPublicToken(t: McpToken): PublicMcpToken {
  const { tokenHash, signingSecretEnc, ...rest } = t;
  return { ...rest, status: tokenStatus(t) };
}

/** User yang boleh dijadikan aktor default: ada, aktif, terdaftar AIRA. */
export async function assertRegisteredActor(userId: string): Promise<void> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, airaEnabled: true, fullName: true } });
  if (!u) throw new BusinessError('User aktor default tidak ditemukan.');
  if (!u.isActive) throw new BusinessError(`User ${u.fullName} tidak aktif.`);
  if (!u.airaEnabled) throw new BusinessError(`User ${u.fullName} belum diberi Akses AIRA (Manajemen Pengguna).`);
}

export interface CreateTokenInput {
  name: string;
  defaultActorUserId?: string | null;
  expiresAt?: Date | null;
  rateLimitPerMin?: number;
  createdById: string;
}

export async function createMcpToken(input: CreateTokenInput): Promise<{ record: PublicMcpToken; token: string; signingSecret: string }> {
  if (input.defaultActorUserId) await assertRegisteredActor(input.defaultActorUserId);
  const token = generateMcpToken();
  const signingSecret = generateSigningSecret();
  const row = await prisma.mcpToken.create({
    data: {
      name: input.name,
      prefix: tokenPrefix(token),
      tokenHash: sha256Hex(token),
      signingSecretEnc: encryptSecret(signingSecret),
      defaultActorUserId: input.defaultActorUserId ?? null,
      expiresAt: input.expiresAt ?? null,
      rateLimitPerMin: input.rateLimitPerMin ?? DEFAULT_RATE_LIMIT_PER_MIN,
      createdById: input.createdById,
    },
  });
  return { record: toPublicToken(row), token, signingSecret };
}

export type BearerResult =
  | { ok: true; token: McpToken }
  | { ok: false; status: 401; code: 'token_missing' | 'token_invalid' | 'token_revoked' | 'token_expired'; message: string };

/** Autentikasi `Authorization: Bearer entmcp_…` → baris token aktif. */
export async function authenticateBearer(authHeader: string | undefined, now: Date = new Date()): Promise<BearerResult> {
  const m = /^Bearer\s+(\S+)$/i.exec(authHeader ?? '');
  if (!m) return { ok: false, status: 401, code: 'token_missing', message: 'Header Authorization: Bearer <token MCP> wajib.' };
  const raw = m[1];
  if (!raw.startsWith(TOKEN_PREFIX) || raw.length > 200) {
    return { ok: false, status: 401, code: 'token_invalid', message: 'Token MCP tidak dikenal.' };
  }
  const row = await prisma.mcpToken.findUnique({ where: { tokenHash: sha256Hex(raw) } });
  if (!row) return { ok: false, status: 401, code: 'token_invalid', message: 'Token MCP tidak dikenal.' };
  const st = tokenStatus(row, now);
  if (st === 'revoked') return { ok: false, status: 401, code: 'token_revoked', message: 'Token MCP sudah dicabut.' };
  if (st === 'expired') return { ok: false, status: 401, code: 'token_expired', message: 'Token MCP sudah kedaluwarsa.' };
  return { ok: true, token: row };
}

export function getSigningSecret(token: Pick<McpToken, 'signingSecretEnc'>): string {
  return decryptSecret(token.signingSecretEnc);
}

export async function revokeMcpToken(id: string): Promise<PublicMcpToken> {
  const existing = await prisma.mcpToken.findUnique({ where: { id } });
  if (!existing) throw new BusinessError('Token MCP tidak ditemukan.');
  if (existing.revokedAt) return toPublicToken(existing);
  return toPublicToken(await prisma.mcpToken.update({ where: { id }, data: { revokedAt: new Date() } }));
}

export async function rotateSigningSecret(id: string): Promise<{ record: PublicMcpToken; signingSecret: string }> {
  const existing = await prisma.mcpToken.findUnique({ where: { id } });
  if (!existing) throw new BusinessError('Token MCP tidak ditemukan.');
  if (existing.revokedAt) throw new BusinessError('Token sudah dicabut; buat token baru.');
  const signingSecret = generateSigningSecret();
  const row = await prisma.mcpToken.update({ where: { id }, data: { signingSecretEnc: encryptSecret(signingSecret) } });
  return { record: toPublicToken(row), signingSecret };
}

// Tulis lastUsed paling sering sekali per menit per token (hindari write per panggilan).
const lastTouch = new Map<string, number>();
export function touchToken(id: string, ip: string | undefined, nowMs: number = Date.now()): void {
  if (nowMs - (lastTouch.get(id) ?? 0) < 60_000) return;
  lastTouch.set(id, nowMs);
  void prisma.mcpToken
    .update({ where: { id }, data: { lastUsedAt: new Date(nowMs), lastUsedIp: ip ?? null } })
    .catch(() => lastTouch.delete(id));
}

/** Hapus nonce kedaluwarsa (dipanggil scheduler). */
export async function purgeExpiredNonces(now: Date = new Date()): Promise<number> {
  const r = await prisma.mcpNonce.deleteMany({ where: { expiresAt: { lt: now } } });
  return r.count;
}

/** Tandai nonce terpakai. false = sudah pernah dipakai (replay). Insert unik = atomik lintas replika. */
export async function consumeNonce(tokenId: string, nonce: string, expiresAt: Date): Promise<boolean> {
  try {
    await prisma.mcpNonce.create({ data: { tokenId, nonce, expiresAt } });
    return true;
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2002') return false;
    throw err;
  }
}
