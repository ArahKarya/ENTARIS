// Tiket konsol AIRA Engine: masuk ke konsol pengaturan engine sebagai pengguna Entaris yang sedang
// login (hanya pemegang rbac.manage). Sekali pakai (jti), berlaku CONSOLE_TICKET_TTL_SEC.
//
//   tiket = base64url(JSON {v:2, aud:'console', uid, name, jti, exp}) + '.' + hex(HMAC(K, <base64url persis>))
//   K     = HMAC-SHA256(AIRA_ENGINE_TURN_SECRET, 'aira-console-ticket-v1')
//
// Kunci turunan + v/aud berbeda dari tiket giliran (v:1, ditandatangani langsung dengan turn
// secret), sehingga kedua jenis tiket tidak pernah bisa saling menggantikan.
//
// Tiket penautan Telegram memakai format yang sama dengan aud 'link' dan label kunci
// 'aira-link-ticket-v1': engine menukarnya dengan kode penautan sekali pakai untuk uid ini.

import { createHmac, randomBytes } from 'node:crypto';

export const CONSOLE_TICKET_TTL_SEC = 60;
const MAX_NAME_CHARS = 100;
const KEY_LABEL = 'aira-console-ticket-v1';
const LINK_KEY_LABEL = 'aira-link-ticket-v1';

type Audience = 'console' | 'link';

export interface ConsoleTicketPayload {
  v: 2;
  aud: Audience;
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
  return sign('console', KEY_LABEL, turnSecret, uid, name, nowSec, jti);
}

export function signLinkTicket(
  turnSecret: string,
  uid: string,
  name: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  jti: string = randomBytes(16).toString('hex'),
): { ticket: string; expiresAt: number } {
  return sign('link', LINK_KEY_LABEL, turnSecret, uid, name, nowSec, jti);
}

function sign(
  aud: Audience,
  label: string,
  turnSecret: string,
  uid: string,
  name: string,
  nowSec: number,
  jti: string,
): { ticket: string; expiresAt: number } {
  const payload: ConsoleTicketPayload = {
    v: 2,
    aud,
    uid,
    name: name.slice(0, MAX_NAME_CHARS),
    jti,
    exp: nowSec + CONSOLE_TICKET_TTL_SEC,
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const key = createHmac('sha256', turnSecret).update(label).digest();
  return { ticket: `${b64}.${createHmac('sha256', key).update(b64).digest('hex')}`, expiresAt: payload.exp };
}
