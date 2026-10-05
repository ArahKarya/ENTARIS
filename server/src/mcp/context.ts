// Konteks per request MCP: identifikasi aktor dari actor assertion (atau aktor default token).
//   assertion ada  → verifikasi HMAC + TTL + nonce sekali-pakai → user harus aktif & terdaftar AIRA
//   assertion tak ada → pakai token.defaultActorUserId (CLI/dev); tanpa itu → 401

import type { McpToken } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ASSERTION_FUTURE_SKEW_SEC, ASSERTION_TTL_SEC, type AssertionChannel } from './constants';
import { verifyAssertion } from './assertion';
import { consumeNonce, getSigningSecret } from './tokenService';

export interface ActorContext {
  id: string;
  fullName: string;
  email: string;
  role: string;
  airaTier: string;
  airaJabatan: string | null;
  channel: AssertionChannel | null;
  groupFloor: boolean;
  ref?: string;
  /** true bila identitas berasal dari assertion bertanda tangan; false = aktor default token. */
  viaAssertion: boolean;
}

export type ContextError = {
  ok: false;
  status: 401 | 403;
  code: string;
  message: string;
};

export type ActorResult = { ok: true; actor: ActorContext | null } | ContextError;

const fail = (status: 401 | 403, code: string, message: string): ContextError => ({ ok: false, status, code, message });

async function loadRegisteredUser(userId: string): Promise<ContextError | { ok: true; user: NonNullable<Awaited<ReturnType<typeof findUser>>> }> {
  const user = await findUser(userId);
  if (!user) return fail(403, 'actor_unknown', 'User aktor tidak dikenal di Entaris.');
  if (!user.isActive) return fail(403, 'actor_inactive', 'User aktor tidak aktif.');
  if (!user.airaEnabled) return fail(403, 'actor_not_registered', 'User belum diberi Akses AIRA (Manajemen Pengguna).');
  return { ok: true, user };
}

function findUser(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, fullName: true, email: true, role: true, isActive: true, airaEnabled: true, airaTier: true, airaJabatan: true },
  });
}

function header(h: string | string[] | undefined): string | undefined {
  return Array.isArray(h) ? h[0] : h;
}

/**
 * @param needsActor false untuk method protokol (initialize/ping): aktor opsional, tetapi
 *                   assertion yang DIKIRIM tetap diverifikasi penuh (tak ada jalur lunak).
 */
export async function resolveActor(
  headers: Record<string, string | string[] | undefined>,
  token: McpToken,
  needsActor: boolean,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<ActorResult> {
  const payloadB64 = header(headers['x-entaris-actor']);
  const sig = header(headers['x-entaris-actor-sig']);

  if (payloadB64 !== undefined || sig !== undefined) {
    const v = verifyAssertion(payloadB64 ?? '', sig ?? '', getSigningSecret(token), nowSec);
    if (!v.ok) return fail(401, v.code, v.message);
    const a = v.assertion;
    // Nonce sekali pakai; disimpan sampai melewati jendela TTL (+ skew) agar replay tetap tertolak.
    const fresh = await consumeNonce(token.id, a.nonce, new Date((a.ts + ASSERTION_TTL_SEC + ASSERTION_FUTURE_SKEW_SEC) * 1000));
    if (!fresh) return fail(401, 'actor_nonce_replayed', 'Actor assertion sudah pernah dipakai (nonce replay).');
    const u = await loadRegisteredUser(a.uid);
    if (!u.ok) return u;
    return {
      ok: true,
      actor: { ...toActor(u.user), channel: a.ch, groupFloor: a.gf, ref: a.ref, viaAssertion: true },
    };
  }

  if (token.defaultActorUserId) {
    const u = await loadRegisteredUser(token.defaultActorUserId);
    if (!u.ok) return u;
    return { ok: true, actor: { ...toActor(u.user), channel: 'cli', groupFloor: false, viaAssertion: false } };
  }
  if (needsActor) return fail(401, 'actor_required', 'Actor assertion (X-Entaris-Actor + X-Entaris-Actor-Sig) wajib; token ini tidak punya aktor default.');
  return { ok: true, actor: null };
}

function toActor(u: NonNullable<Awaited<ReturnType<typeof findUser>>>) {
  return { id: u.id, fullName: u.fullName, email: u.email, role: u.role, airaTier: u.airaTier, airaJabatan: u.airaJabatan };
}
