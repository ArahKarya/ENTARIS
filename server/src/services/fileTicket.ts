// Tiket unduh berkas: tautan bertanda tangan berumur pendek yang diberikan tool MCP kepada agen
// agar agen dapat mengambil berkas (PDF dokumen / isi lampiran) tanpa membawa biner di JSON-RPC.
//
//   tiket = base64url(JSON {v:1, uid, kind, ref, fn, exp, jti}) + '.' + hex(HMAC(secret, <string base64url persis>))
//
// Tiket mengikat PENGGUNA + OBJEK; ACL dicek ULANG saat unduh (bukan hanya saat tiket dibuat).
// Sekali pakai ditegakkan route unduh lewat `jti` (peta in-memory + kedaluwarsa; lihat consumeJti).

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const FILE_TICKET_TTL_SEC = 5 * 60;

export type FileTicketKind = 'attachment' | 'document-pdf';

export interface FileTicketPayload {
  v: 1;
  uid: string;
  kind: FileTicketKind;
  /** attachment: id lampiran. document-pdf: `<docType>:<id>[:att]`. */
  ref: string;
  /** nama berkas yang disarankan untuk unduhan. */
  fn: string;
  exp: number;
  jti: string;
}

const sign = (secret: string, b64: string): string => createHmac('sha256', secret).update(b64).digest('hex');

export function fileTicketSecret(env: NodeJS.ProcessEnv = process.env): string {
  const s = env.MCP_SECRET_KEY || env.JWT_SECRET;
  if (!s) throw new Error('MCP_SECRET_KEY atau JWT_SECRET harus diatur untuk menandatangani tiket unduh.');
  // Domain separation: kunci tiket unduh tidak sama dengan kunci lain yang diturunkan dari rahasia yang sama.
  return createHmac('sha256', s).update('entaris-file-ticket-v1').digest('hex');
}

export function signFileTicket(
  secret: string,
  input: { uid: string; kind: FileTicketKind; ref: string; fn: string },
  nowSec: number = Math.floor(Date.now() / 1000),
  ttlSec: number = FILE_TICKET_TTL_SEC,
): string {
  const payload: FileTicketPayload = {
    v: 1,
    uid: input.uid,
    kind: input.kind,
    ref: input.ref,
    fn: input.fn,
    exp: nowSec + ttlSec,
    jti: randomBytes(12).toString('base64url'),
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${b64}.${sign(secret, b64)}`;
}

export function verifyFileTicket(
  secret: string,
  ticket: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): FileTicketPayload | null {
  const [b64, sig, extra] = ticket.split('.');
  if (!b64 || !sig || extra !== undefined) return null;
  const expected = Buffer.from(sign(secret, b64), 'hex');
  const given = Buffer.from(sig, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) as FileTicketPayload;
    if (
      p.v !== 1 ||
      typeof p.uid !== 'string' ||
      (p.kind !== 'attachment' && p.kind !== 'document-pdf') ||
      typeof p.ref !== 'string' ||
      typeof p.fn !== 'string' ||
      typeof p.jti !== 'string' ||
      typeof p.exp !== 'number' ||
      p.exp < nowSec
    ) {
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

// ── Sekali pakai ────────────────────────────────────────────────────────────────
// Tiket hidup 5 menit dan hanya mengizinkan unduh milik pemilik; peta in-memory cukup untuk
// satu proses (app berjalan satu instance per tenant). Setelah restart tiket lama tetap
// kedaluwarsa dalam ≤5 menit, jadi jendela pemakaian ulang sangat kecil.
const usedJti = new Map<string, number>();

/** true jika jti belum pernah dipakai (dan menandainya). Entri kedaluwarsa dibersihkan. */
export function consumeJti(jti: string, exp: number, nowSec: number = Math.floor(Date.now() / 1000)): boolean {
  for (const [k, e] of usedJti) if (e < nowSec) usedJti.delete(k);
  if (usedJti.has(jti)) return false;
  usedJti.set(jti, exp);
  return true;
}

export function resetUsedJtiForTests(): void {
  usedJti.clear();
}

/**
 * URL unduh absolut. `PUBLIC_BASE_URL` (mis. https://erp.panganmasadepan.com) wajib agar agen di luar
 * jaringan bisa mengunduh; tanpa itu dikembalikan path relatif dan tool menyertakan peringatan.
 */
export function buildDownloadUrl(ticket: string, env: NodeJS.ProcessEnv = process.env): { url: string; absolute: boolean } {
  const base = (env.PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const path = `/api/files/dl/${ticket}`;
  return base ? { url: `${base}${path}`, absolute: true } : { url: path, absolute: false };
}
