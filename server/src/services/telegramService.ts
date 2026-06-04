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
