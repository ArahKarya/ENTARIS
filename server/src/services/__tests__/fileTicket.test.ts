import { describe, it, expect, beforeEach } from 'vitest';
import {
  FILE_TICKET_TTL_SEC,
  buildDownloadUrl,
  consumeJti,
  fileTicketSecret,
  resetUsedJtiForTests,
  signFileTicket,
  verifyFileTicket,
} from '../fileTicket';

const SECRET = 'test-secret';
const base = { uid: 'u1', kind: 'attachment' as const, ref: 'att-1', fn: 'nota.pdf' };

describe('fileTicket', () => {
  beforeEach(() => resetUsedJtiForTests());

  it('tiket valid diverifikasi dan membawa payload', () => {
    const t = signFileTicket(SECRET, base, 1000);
    const p = verifyFileTicket(SECRET, t, 1001);
    expect(p).toMatchObject({ v: 1, uid: 'u1', kind: 'attachment', ref: 'att-1', fn: 'nota.pdf', exp: 1000 + FILE_TICKET_TTL_SEC });
    expect(p?.jti.length).toBeGreaterThan(8);
  });

  it('kedaluwarsa ditolak', () => {
    const t = signFileTicket(SECRET, base, 1000);
    expect(verifyFileTicket(SECRET, t, 1000 + FILE_TICKET_TTL_SEC + 1)).toBeNull();
  });

  it('rahasia salah ditolak', () => {
    const t = signFileTicket(SECRET, base, 1000);
    expect(verifyFileTicket('lain', t, 1001)).toBeNull();
  });

  it('payload dimanipulasi ditolak', () => {
    const t = signFileTicket(SECRET, base, 1000);
    const [b64, sig] = t.split('.');
    const forged = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    forged.uid = 'penyerang';
    const b64f = Buffer.from(JSON.stringify(forged)).toString('base64url');
    expect(verifyFileTicket(SECRET, `${b64f}.${sig}`, 1001)).toBeNull();
  });

  it('format salah ditolak', () => {
    expect(verifyFileTicket(SECRET, 'abc', 1)).toBeNull();
    expect(verifyFileTicket(SECRET, 'a.b.c', 1)).toBeNull();
    expect(verifyFileTicket(SECRET, '.', 1)).toBeNull();
  });

  it('jenis tiket tak dikenal ditolak walau tanda tangan benar', () => {
    const t = signFileTicket(SECRET, { ...base, kind: 'lain' as never }, 1000);
    expect(verifyFileTicket(SECRET, t, 1001)).toBeNull();
  });

  it('jti hanya bisa dipakai sekali', () => {
    expect(consumeJti('j1', 2000, 1000)).toBe(true);
    expect(consumeJti('j1', 2000, 1001)).toBe(false);
    expect(consumeJti('j2', 2000, 1001)).toBe(true);
  });

  it('jti kedaluwarsa dibersihkan', () => {
    expect(consumeJti('j1', 1100, 1000)).toBe(true);
    expect(consumeJti('j1', 1100, 1200)).toBe(true);
  });

  it('dua tiket untuk objek yang sama punya jti berbeda', () => {
    const a = verifyFileTicket(SECRET, signFileTicket(SECRET, base, 1000), 1001);
    const b = verifyFileTicket(SECRET, signFileTicket(SECRET, base, 1000), 1001);
    expect(a?.jti).not.toBe(b?.jti);
  });

  it('buildDownloadUrl memakai PUBLIC_BASE_URL (tanpa garis miring akhir)', () => {
    expect(buildDownloadUrl('T', { PUBLIC_BASE_URL: 'https://erp.contoh.id/' } as NodeJS.ProcessEnv)).toEqual({
      url: 'https://erp.contoh.id/api/files/dl/T',
      absolute: true,
    });
  });

  it('buildDownloadUrl tanpa PUBLIC_BASE_URL → path relatif', () => {
    expect(buildDownloadUrl('T', {} as NodeJS.ProcessEnv)).toEqual({ url: '/api/files/dl/T', absolute: false });
  });

  it('fileTicketSecret butuh rahasia dan berbeda dari rahasia mentah', () => {
    expect(() => fileTicketSecret({} as NodeJS.ProcessEnv)).toThrow();
    const s = fileTicketSecret({ JWT_SECRET: 'abc' } as NodeJS.ProcessEnv);
    expect(s).not.toBe('abc');
    expect(s).toHaveLength(64);
  });
});
