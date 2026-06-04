// Pengiriman notifikasi ke Telegram (Bot API) + cache konfigurasi.
//
// Prinsip: TIDAK BOLEH menghambat/menggagalkan operasi bisnis. `pushTelegram`
// never-throw + fire-and-forget (dipanggil dgn `void`). Konfigurasi diisi lewat
// UI Settings (tabel telegram_config); bot token = secret, tak pernah di-log.

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const TELEGRAM_API = 'https://api.telegram.org';
const SEND_TIMEOUT_MS = 5000;

interface TelegramConfigCache {
  enabled: boolean;
  botToken: string | null;
  chatId: string | null;
  notifyApproval: boolean;
  notifyInvoiceOverdue: boolean;
  notifyLowStock: boolean;
  personalEnabled: boolean;
}

let cache: TelegramConfigCache | null = null;
let cacheLoaded = false;

export function invalidateTelegramConfigCache(): void {
  cache = null;
  cacheLoaded = false;
}

async function getConfig(): Promise<TelegramConfigCache | null> {
  if (cacheLoaded) return cache;
  try {
    const row = await prisma.telegramConfig.findUnique({ where: { slug: 'default' } });
    cache = row
      ? {
          enabled: row.enabled,
          botToken: row.botToken,
          chatId: row.chatId,
          notifyApproval: row.notifyApproval,
          notifyInvoiceOverdue: row.notifyInvoiceOverdue,
          notifyLowStock: row.notifyLowStock,
          personalEnabled: row.personalEnabled,
        }
      : null;
  } catch (err) {
    logger.error({ err }, 'getTelegramConfig gagal (diabaikan)');
    cache = null;
  }
  cacheLoaded = true;
  return cache;
}

/** Apakah jenis notifikasi ini diizinkan kirim ke Telegram (per-type toggle). */
function typeEnabled(cfg: TelegramConfigCache, type: string): boolean {
  switch (type) {
    case 'approval_pending':
      return cfg.notifyApproval;
    case 'invoice_overdue':
      return cfg.notifyInvoiceOverdue;
    case 'low_stock':
      return cfg.notifyLowStock;
    default:
      // Jenis lain (mis. keputusan approval) ikut terkirim selama master aktif.
      return true;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Low-level: POST sendMessage. Return {ok,error}. Dipakai test + pushTelegram. */
export async function sendTelegramRaw(
  botToken: string,
  chatId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: controller.signal,
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.description || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.name === 'AbortError' ? 'Timeout menghubungi Telegram.' : (err?.message || 'Gagal menghubungi Telegram.') };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Kirim notifikasi ke grup Telegram (fire-and-forget, never-throw).
 * Dipanggil dgn `void pushTelegram(...)` dari notificationService.
 */
export async function pushTelegram(input: { type: string; title: string; message: string }): Promise<void> {
  try {
    const cfg = await getConfig();
    if (!cfg || !cfg.enabled || !cfg.botToken || !cfg.chatId) return;
    if (!typeEnabled(cfg, input.type)) return;
    const text = `<b>${escapeHtml(input.title)}</b>\n${escapeHtml(input.message)}`;
    const result = await sendTelegramRaw(cfg.botToken, cfg.chatId, text);
    if (!result.ok) {
      logger.warn({ type: input.type, error: result.error }, 'pushTelegram gagal (diabaikan)');
    }
  } catch (err) {
    logger.warn({ err, type: input.type }, 'pushTelegram error (diabaikan)');
  }
}

/**
 * Kirim notifikasi JAPRI ke chat pribadi user (fire-and-forget, never-throw).
 * Dipanggil per-user dari notifyUsers utk user yang sudah tertaut.
 */
export async function pushTelegramToUser(input: { chatId: string; type: string; title: string; message: string }): Promise<void> {
  try {
    const cfg = await getConfig();
    if (!cfg || !cfg.enabled || !cfg.personalEnabled || !cfg.botToken) return;
    if (!typeEnabled(cfg, input.type)) return;
    const text = `<b>${escapeHtml(input.title)}</b>\n${escapeHtml(input.message)}`;
    const result = await sendTelegramRaw(cfg.botToken, input.chatId, text);
    if (!result.ok) {
      logger.warn({ type: input.type, error: result.error }, 'pushTelegramToUser gagal (diabaikan)');
    }
  } catch (err) {
    logger.warn({ err, type: input.type }, 'pushTelegramToUser error (diabaikan)');
  }
}

/** Kirim pesan uji ke chat tertentu (japri user). Return {ok,error} utk UI. */
export async function sendTestToChat(chatId: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getConfig();
  if (!cfg || !cfg.botToken) return { ok: false, error: 'Bot Telegram belum dikonfigurasi (Pengaturan → Notifikasi).' };
  if (!cfg.enabled) return { ok: false, error: 'Notifikasi Telegram nonaktif (aktifkan di Pengaturan → Notifikasi).' };
  return sendTelegramRaw(
    cfg.botToken,
    chatId,
    '<b>✅ Tes Notifikasi</b>\nTelegram Anda tertaut & siap menerima notifikasi sistem.',
  );
}

/** Apakah japri per-user aktif (utk short-circuit di notifyUsers). */
export async function isPersonalTelegramOn(): Promise<boolean> {
  const cfg = await getConfig();
  return !!(cfg && cfg.enabled && cfg.personalEnabled && cfg.botToken);
}

let botUsernameCache: string | null = null;
/** Username bot (utk deep link t.me/<bot>?start=<kode>). Cache. */
export async function getBotUsername(): Promise<string | null> {
  if (botUsernameCache) return botUsernameCache;
  const cfg = await getConfig();
  if (!cfg?.botToken) return null;
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${cfg.botToken}/getMe`, { signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
    const data: any = await res.json().catch(() => ({}));
    botUsernameCache = data?.result?.username ?? null;
    return botUsernameCache;
  } catch {
    return null;
  }
}

/**
 * Poll getUpdates, tautkan /start <kode> ke user (set telegramChatId).
 * Dipanggil cron tiap menit. Never-throw. Tanpa webhook → getUpdates aman.
 */
export async function pollTelegramUpdates(): Promise<void> {
  try {
    const cfg = await getConfig();
    if (!cfg || !cfg.enabled || !cfg.botToken) return;
    const row = await prisma.telegramConfig.findUnique({ where: { slug: 'default' }, select: { lastUpdateId: true } });
    const offset = row?.lastUpdateId ? Number(row.lastUpdateId) + 1 : undefined;
    const url = `${TELEGRAM_API}/bot${cfg.botToken}/getUpdates?timeout=0${offset ? `&offset=${offset}` : ''}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
    const data: any = await res.json().catch(() => ({}));
    if (!data?.ok || !Array.isArray(data.result) || data.result.length === 0) return;

    let maxId = 0;
    for (const upd of data.result) {
      if (typeof upd.update_id === 'number' && upd.update_id > maxId) maxId = upd.update_id;
      const msg = upd.message;
      const text: string | undefined = msg?.text;
      const chatId = msg?.chat?.id;
      if (!text || chatId == null) continue;
      const m = text.match(/^\/start\s+(\S+)/);
      if (!m) continue;
      const code = m[1];
      const user = await prisma.user.findUnique({ where: { telegramLinkCode: code }, select: { id: true } });
      if (!user) continue;
      await prisma.user.update({
        where: { id: user.id },
        data: { telegramChatId: String(chatId), telegramLinkCode: null },
      });
      // konfirmasi (best-effort)
      void sendTelegramRaw(cfg.botToken, String(chatId), '✅ <b>Telegram tertaut</b>\nAnda akan menerima notifikasi sistem di sini.');
    }
    if (maxId > 0) {
      await prisma.telegramConfig.update({ where: { slug: 'default' }, data: { lastUpdateId: BigInt(maxId) } });
    }
  } catch (err) {
    logger.warn({ err }, 'pollTelegramUpdates error (diabaikan)');
  }
}
