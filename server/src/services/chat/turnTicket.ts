// Tiket giliran: bukti bertanda tangan bahwa Entaris (bukan pengguna) menetapkan siapa (`uid`)
// dan giliran mana (`ref`) yang sedang dilayani. Dikirim ke engine bersama permintaan agar hook
// sisi engine dapat menandatangani actor assertion per panggilan MCP tanpa mempercayai teks
// percakapan. HMAC-SHA256 dengan rahasia bersama (AIRA_ENGINE_TURN_SECRET).
//
//   tiket = base64url(JSON {v:1, uid, ref, exp}) + '.' + hex(HMAC(secret, <string base64url persis>))

import { createHmac, timingSafeEqual } from 'node:crypto';

export const TURN_TICKET_TTL_SEC = 30 * 60;
export const TURN_MARKER_PREFIX = '[[entaris-turn:';

export interface TurnTicketPayload {
  v: 1;
  uid: string;
  ref: string;
  exp: number;
}

const sign = (secret: string, b64: string): string => createHmac('sha256', secret).update(b64).digest('hex');

export function signTurnTicket(secret: string, uid: string, ref: string, nowSec: number = Math.floor(Date.now() / 1000)): string {
  const payload: TurnTicketPayload = { v: 1, uid, ref, exp: nowSec + TURN_TICKET_TTL_SEC };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${b64}.${sign(secret, b64)}`;
}

export function verifyTurnTicket(secret: string, ticket: string, nowSec: number = Math.floor(Date.now() / 1000)): TurnTicketPayload | null {
  const [b64, sig, extra] = ticket.split('.');
  if (!b64 || !sig || extra !== undefined) return null;
  const expected = Buffer.from(sign(secret, b64), 'hex');
  const given = Buffer.from(sig, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) as TurnTicketPayload;
    if (p.v !== 1 || typeof p.uid !== 'string' || typeof p.ref !== 'string' || typeof p.exp !== 'number' || p.exp < nowSec) return null;
    return p;
  } catch {
    return null;
  }
}

/** Baris penanda untuk disisipkan di awal pesan pengguna terakhir (hanya ke engine, tidak disimpan). */
export const turnMarkerLine = (ticket: string): string => `${TURN_MARKER_PREFIX}${ticket}]]`;
