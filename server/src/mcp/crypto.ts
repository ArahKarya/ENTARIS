// Primitif kripto MCP: token servis (hanya sha256 yang disimpan), signing secret
// (AES-256-GCM at-rest, perlu didekripsi untuk memverifikasi HMAC), dan HMAC assertion.
//
// Kunci enkripsi diturunkan (HKDF-SHA256) dari env MCP_SECRET_KEY; bila kosong memakai
// JWT_SECRET. Memutar JWT_SECRET tanpa MCP_SECRET_KEY membuat secret lama tak terbaca →
// operator harus rotate-secret tiap token. Set MCP_SECRET_KEY terpisah agar rotasi JWT aman.

import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { SECRET_PREFIX, TOKEN_PREFIX } from './constants';

const ENC_VERSION = 'v1';

function keyMaterial(env: NodeJS.ProcessEnv): string {
  const m = env.MCP_SECRET_KEY || env.JWT_SECRET;
  if (!m) throw new Error('MCP_SECRET_KEY atau JWT_SECRET harus diatur untuk mengenkripsi signing secret MCP.');
  return m;
}

function deriveKey(env: NodeJS.ProcessEnv): Buffer {
  return Buffer.from(hkdfSync('sha256', keyMaterial(env), 'entaris-mcp-salt', 'signing-secret-aes-256-gcm', 32));
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function generateMcpToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

export function generateSigningSecret(): string {
  return SECRET_PREFIX + randomBytes(32).toString('base64url');
}

/** Teks aman ditampilkan (bukan rahasia) untuk mengenali token di daftar. */
export function tokenPrefix(token: string): string {
  return token.slice(0, TOKEN_PREFIX.length + 6);
}

/** Enkripsi signing secret → `v1.<iv>.<tag>.<ct>` (base64url). */
export function encryptSecret(plain: string, env: NodeJS.ProcessEnv = process.env): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(env), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENC_VERSION, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptSecret(enc: string, env: NodeJS.ProcessEnv = process.env): string {
  const [ver, iv, tag, ct] = enc.split('.');
  if (ver !== ENC_VERSION || !iv || !tag || !ct) throw new Error('Format signing secret tidak dikenal.');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(env), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}

/** HMAC-SHA256 hex atas string payload persis (base64url apa adanya). */
export function signPayload(secret: string, payloadB64: string): string {
  return createHmac('sha256', secret).update(payloadB64, 'utf8').digest('hex');
}

/** Bandingkan tanda tangan hex secara constant-time (panjang berbeda → false tanpa throw). */
export function verifySignature(secret: string, payloadB64: string, sigHex: string): boolean {
  if (!/^[0-9a-fA-F]{64}$/.test(sigHex)) return false;
  const expected = Buffer.from(signPayload(secret, payloadB64), 'hex');
  const given = Buffer.from(sigHex, 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
