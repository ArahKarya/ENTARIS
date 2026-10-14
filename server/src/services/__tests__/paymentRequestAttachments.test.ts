import { beforeEach, describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

const db = vi.hoisted(() => ({
  paymentRequestAttachment: { count: vi.fn(), create: vi.fn() },
  chatAttachment: { findUnique: vi.fn() },
  chatMessage: { findMany: vi.fn() },
}));
vi.mock('../../lib/prisma', () => ({ prisma: db }));

const store = vi.hoisted(() => ({ dir: '' }));
vi.mock('../../utils/fileStorage', async () => {
  const actual = await vi.importActual<typeof import('../../utils/fileStorage')>('../../utils/fileStorage');
  return {
    ...actual,
    getFullPath: (p: string) => path.join(store.dir, p),
    saveAttachment: vi.fn(async (buf: Buffer, name: string, mime: string) => ({
      storedName: 'stored-' + name,
      filePath: '2026/10/stored-' + name,
      fileSize: buf.length,
      mimeType: mime,
    })),
  };
});

import { addPaymentRequestAttachments, cleanFileName, fileFromBase64, fileFromChat } from '../paymentRequestAttachments';
import { saveAttachment } from '../../utils/fileStorage';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const EXE = Buffer.from('MZ\x90\x00 bukan gambar atau pdf');

beforeEach(async () => {
  vi.clearAllMocks();
  store.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prattach-'));
  db.paymentRequestAttachment.count.mockResolvedValue(0);
  db.paymentRequestAttachment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'att-1', ...data }));
});

describe('cleanFileName', () => {
  it('membuang path, karakter kontrol, dan membatasi panjang', () => {
    expect(cleanFileName('C:\\x\\..\\nota.pdf')).toBe('nota.pdf');
    expect(cleanFileName('/etc/pass\u0000wd')).toBe('passwd');
    expect(cleanFileName('')).toBe('lampiran');
    expect(cleanFileName('a'.repeat(400))).toHaveLength(255);
  });
});

describe('fileFromBase64', () => {
  it('menerima PDF base64 (dengan/tanpa prefix data URL) dan memakai jenis dari isi berkas', () => {
    const f = fileFromBase64('nota.pdf', PDF.toString('base64'));
    expect(f.mimetype).toBe('application/pdf');
    expect(f.buffer.equals(PDF)).toBe(true);
    expect(fileFromBase64('nota.pdf', 'data:application/pdf;base64,' + PDF.toString('base64')).mimetype).toBe('application/pdf');
  });

  it('menolak base64 rusak, jenis tak dikenal, dan mimeType yang berbohong', () => {
    expect(() => fileFromBase64('x.pdf', '!!!bukan base64!!!')).toThrow(/base64/);
    expect(() => fileFromBase64('x.exe', EXE.toString('base64'))).toThrow(/tidak dikenali/);
    expect(() => fileFromBase64('x.pdf', PNG.toString('base64'), 'application/pdf')).toThrow(/tidak cocok/);
  });
});

describe('addPaymentRequestAttachments', () => {
  const file = (buffer: Buffer, mimetype: string, originalname = 'f') => ({ buffer, mimetype, originalname });

  it('menyimpan berkas valid dan mencatat pengunggah + scope', async () => {
    const out = await addPaymentRequestAttachments('pr-1', 'REQUEST', 'u-1', [file(PDF, 'application/pdf', 'nota.pdf')]);
    expect(out).toHaveLength(1);
    expect(saveAttachment).toHaveBeenCalledTimes(1);
    expect(db.paymentRequestAttachment.create.mock.calls[0][0].data).toMatchObject({
      paymentRequestId: 'pr-1',
      uploadedBy: 'u-1',
      scope: 'REQUEST',
      mimeType: 'application/pdf',
      fileName: 'nota.pdf',
    });
  });

  it('menolak tanpa berkas, berkas kosong, terlalu besar, dan jenis palsu — tanpa menyimpan apa pun', async () => {
    await expect(addPaymentRequestAttachments('pr-1', 'REQUEST', 'u', [])).rejects.toThrow(/Tidak ada file/);
    await expect(addPaymentRequestAttachments('pr-1', 'REQUEST', 'u', [file(Buffer.alloc(0), 'application/pdf')])).rejects.toThrow(/kosong/);
    await expect(
      addPaymentRequestAttachments('pr-1', 'REQUEST', 'u', [file(Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]), 'application/pdf')]),
    ).rejects.toThrow(/5 MB/);
    await expect(addPaymentRequestAttachments('pr-1', 'REQUEST', 'u', [file(EXE, 'application/pdf')])).rejects.toThrow(/tidak dikenali/);
    await expect(addPaymentRequestAttachments('pr-1', 'REQUEST', 'u', [file(PNG, 'application/pdf')])).rejects.toThrow(/tidak dikenali/);
    expect(saveAttachment).not.toHaveBeenCalled();
    expect(db.paymentRequestAttachment.create).not.toHaveBeenCalled();
  });

  it('menolak bila melewati batas 10 lampiran per scope', async () => {
    db.paymentRequestAttachment.count.mockResolvedValue(10);
    await expect(addPaymentRequestAttachments('pr-1', 'REQUEST', 'u', [file(PDF, 'application/pdf')])).rejects.toThrow(/Maksimal 10/);
    expect(db.paymentRequestAttachment.count).toHaveBeenCalledWith({ where: { paymentRequestId: 'pr-1', scope: 'REQUEST' } });
  });
});

describe('fileFromChat', () => {
  const write = async (rel: string, buf: Buffer) => {
    const full = path.join(store.dir, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buf);
  };

  it('chatAttachmentId milik sendiri → isi berkas dibaca dari penyimpanan', async () => {
    await write('2026/10/a.pdf', PDF);
    db.chatAttachment.findUnique.mockResolvedValue({ fileName: 'tagihan.pdf', mimeType: 'application/pdf', filePath: '2026/10/a.pdf', message: { session: { userId: 'u-1' } } });
    const f = await fileFromChat('u-1', { chatAttachmentId: 'ca-1' });
    expect(f).toMatchObject({ originalname: 'tagihan.pdf', mimetype: 'application/pdf' });
    expect(f.buffer.equals(PDF)).toBe(true);
  });

  it('chatAttachmentId milik orang lain atau tak ada → ditolak (tidak bocor beda-pengguna)', async () => {
    db.chatAttachment.findUnique.mockResolvedValue({ fileName: 'x.pdf', mimeType: 'application/pdf', filePath: 'x', message: { session: { userId: 'orang-lain' } } });
    await expect(fileFromChat('u-1', { chatAttachmentId: 'ca-1' })).rejects.toThrow(/tidak ditemukan/);
    db.chatAttachment.findUnique.mockResolvedValue(null);
    await expect(fileFromChat('u-1', { chatAttachmentId: 'ca-2' })).rejects.toThrow(/tidak ditemukan/);
  });

  it('tanpa id: pakai lampiran giliran chat dari ref, hanya sesi milik pengguna', async () => {
    await write('2026/10/b.png', PNG);
    db.chatMessage.findMany.mockResolvedValue([{ attachments: [{ fileName: 'foto.png', mimeType: 'image/png', filePath: '2026/10/b.png' }] }]);
    const f = await fileFromChat('u-1', { ref: 'sess-1:turn-9' });
    expect(f.originalname).toBe('foto.png');
    expect(db.chatMessage.findMany.mock.calls[0][0].where).toMatchObject({ sessionId: 'sess-1', turnId: 'turn-9', role: 'user', session: { userId: 'u-1' } });
  });

  it('tanpa id & tanpa ref → pesan jelas; ref tanpa lampiran → pesan jelas', async () => {
    await expect(fileFromChat('u-1', {})).rejects.toThrow(/Tidak ada konteks chat/);
    db.chatMessage.findMany.mockResolvedValue([{ attachments: [] }]);
    await expect(fileFromChat('u-1', { ref: 's:t' })).rejects.toThrow(/Tidak ada lampiran/);
  });

  it('berkas hilang dari disk → pesan jelas (bukan 500)', async () => {
    db.chatAttachment.findUnique.mockResolvedValue({ fileName: 'x.pdf', mimeType: 'application/pdf', filePath: 'tidak/ada.pdf', message: { session: { userId: 'u-1' } } });
    await expect(fileFromChat('u-1', { chatAttachmentId: 'ca-1' })).rejects.toThrow(/tidak tersedia/);
  });
});
