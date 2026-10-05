// Actor assertion (spesifikasi: docs/ai-tools/ARSITEKTUR-MCP.md).
//   X-Entaris-Actor:     base64url(JSON {v:1, uid, ch, gf, ts, nonce, ref?})
//   X-Entaris-Actor-Sig: hex HMAC-SHA256(signingSecret, <string base64url persis>)
// Urutan verifikasi: bentuk → tanda tangan (constant-time) → kedaluwarsa → (pemanggil) nonce.

import { z } from 'zod';
import { ASSERTION_CHANNELS, ASSERTION_FUTURE_SKEW_SEC, ASSERTION_TTL_SEC } from './constants';
import { verifySignature } from './crypto';

const AssertionSchema = z.object({
  v: z.literal(1),
  uid: z.string().min(1).max(64),
  ch: z.enum(ASSERTION_CHANNELS),
  gf: z.boolean(),
  ts: z.number().int().positive(),
  nonce: z.string().min(8).max(100),
  ref: z.string().max(200).optional(),
});
export type ActorAssertion = z.infer<typeof AssertionSchema>;

export type AssertionErrorCode =
  | 'actor_assertion_malformed'
  | 'actor_signature_invalid'
  | 'actor_assertion_expired'
  | 'actor_assertion_future';

export type AssertionResult =
  | { ok: true; assertion: ActorAssertion }
  | { ok: false; code: AssertionErrorCode; message: string };

const fail = (code: AssertionErrorCode, message: string): AssertionResult => ({ ok: false, code, message });

export function verifyAssertion(
  payloadB64: string,
  sigHex: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): AssertionResult {
  if (!payloadB64 || !sigHex || payloadB64.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(payloadB64)) {
    return fail('actor_assertion_malformed', 'Header actor assertion tidak lengkap atau bukan base64url.');
  }
  // Tanda tangan diperiksa SEBELUM payload di-parse: payload palsu tidak pernah dipercaya.
  if (!verifySignature(secret, payloadB64, sigHex)) {
    return fail('actor_signature_invalid', 'Tanda tangan actor assertion tidak valid.');
  }
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return fail('actor_assertion_malformed', 'Payload actor assertion bukan JSON.');
  }
  const parsed = AssertionSchema.safeParse(json);
  if (!parsed.success) {
    return fail('actor_assertion_malformed', `Payload actor assertion tidak valid: ${parsed.error.issues[0]?.message ?? '?'}`);
  }
  const a = parsed.data;
  if (nowSec - a.ts > ASSERTION_TTL_SEC) return fail('actor_assertion_expired', 'Actor assertion kedaluwarsa (TTL 120 detik).');
  if (a.ts - nowSec > ASSERTION_FUTURE_SKEW_SEC) return fail('actor_assertion_future', 'Timestamp actor assertion terlalu jauh di masa depan (cek jam server Hermes).');
  return { ok: true, assertion: a };
}
