// Kartu konfirmasi aksi tulis dari AIRA (event SSE `aira.confirm`): giliran berakhir, kartu disimpan
// di parts pesan asisten, lalu pilihan pengguna (ya/batal) dikirim pada giliran berikutnya ke engine
// sebagai metadata `konfirmasi`. Engine yang menegakkan pemilik, kedaluwarsa dan sekali-pakai; di
// sini kartu juga harus milik sesi ini dan belum dijawab, supaya tombol lama tidak dapat dipakai ulang.

import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

const MAX_TEXT = 400;
const MAX_FACTS = 8;
const MAX_LABEL = 40;
const MAX_VALUE = 80;
const ID_RE = /^[0-9a-f-]{8,64}$/i;

export type ConfirmChoice = 'ya' | 'batal';

export interface ConfirmPrompt {
  id: string;
  tool: string;
  tindakan: string;
  konfirmasi: string;
  efek: string;
  rincian: Array<{ label: string; value: string }>;
  expiresAt: string;
  /** diisi saat pengguna menjawab */
  answered?: ConfirmChoice;
}

const clip = (v: unknown, n: number): string => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

/** Bentuk aman dari event `aira.confirm`; null bila tidak sah. */
export function parseConfirm(data: string): ConfirmPrompt | null {
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : '';
  const expires = typeof r.expires_at === 'string' ? new Date(r.expires_at) : null;
  const konfirmasi = clip(r.konfirmasi, MAX_TEXT);
  if (!ID_RE.test(id) || !expires || Number.isNaN(expires.getTime()) || !konfirmasi) return null;
  const facts = Array.isArray(r.rincian) ? r.rincian : [];
  return {
    id,
    tool: clip(r.tool, 80),
    tindakan: clip(r.tindakan, 20),
    konfirmasi,
    efek: clip(r.efek, MAX_TEXT),
    rincian: facts
      .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
      .map((f) => ({ label: clip(f.label, MAX_LABEL), value: clip(f.value, MAX_VALUE) }))
      .filter((f) => f.label && f.value)
      .slice(0, MAX_FACTS),
    expiresAt: expires.toISOString(),
  };
}

/**
 * Tandai kartu `id` sebagai dijawab. Hanya kartu pada pesan asisten TERAKHIR sesi ini (status ok),
 * belum dijawab dan belum kedaluwarsa. Dipanggil di bawah lease giliran sesi (satu giliran per
 * sesi), jadi baca-lalu-tulis di sini tidak berlomba.
 */
export async function claimConfirmCard(sessionId: string, id: string, choice: ConfirmChoice, now = new Date()): Promise<boolean> {
  if (!ID_RE.test(id)) return false;
  const message = await prisma.chatMessage.findFirst({
    where: { sessionId, role: 'assistant' },
    orderBy: { seq: 'desc' },
    select: { id: true, parts: true, status: true },
  });
  const parts = (message?.parts ?? null) as { confirm?: ConfirmPrompt } | null;
  const card = parts?.confirm;
  if (!message || message.status !== 'ok' || !card || card.id !== id || card.answered || new Date(card.expiresAt) <= now) return false;
  await prisma.chatMessage.update({
    where: { id: message.id },
    data: { parts: { ...parts, confirm: { ...card, answered: choice } } as Prisma.InputJsonValue },
  });
  return true;
}

