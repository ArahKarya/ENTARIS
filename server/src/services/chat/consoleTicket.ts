// Tiket konsol engine AIRA: masuk ke konsol pengaturan engine sebagai pengguna Entaris yang sedang
// login (hanya pemegang rbac.manage). Sekali pakai (jti), berlaku CONSOLE_TICKET_TTL_SEC.
//
//   tiket = base64url(JSON {v:2, aud:'console', uid, name, jti, exp}) + '.' + hex(HMAC(K, <base64url persis>))
//   K     = HMAC-SHA256(AIRA_ENGINE_TURN_SECRET, 'aira-console-ticket-v1')
//
// Kunci turunan + v/aud berbeda dari tiket giliran (v:1, ditandatangani langsung dengan turn
// secret), sehingga kedua jenis tiket tidak pernah bisa saling menggantikan.

import { createHmac, randomBytes } from 'node:crypto';

export const CONSOLE_TICKET_TTL_SEC = 60;
const MAX_NAME_CHARS = 100;
const KEY_LABEL = 'aira-console-ticket-v1';

export interface ConsoleTicketPayload {
  v: 2;
  aud: 'console';
  uid: string;
  name: string;
  jti: string;
  exp: number;
}

export function signConsoleTicket(
  turnSecret: string,
  uid: string,
  name: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  jti: string = randomBytes(16).toString('hex'),
): { ticket: string; expiresAt: number } {
  const payload: ConsoleTicketPayload = {
    v: 2,
    aud: 'console',
    uid,
    name: name.slice(0, MAX_NAME_CHARS),
    jti,
    exp: nowSec + CONSOLE_TICKET_TTL_SEC,
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const key = createHmac('sha256', turnSecret).update(KEY_LABEL).digest();
  return { ticket: `${b64}.${createHmac('sha256', key).update(b64).digest('hex')}`, expiresAt: payload.exp };
}
