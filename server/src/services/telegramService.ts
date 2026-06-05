// Pengiriman notifikasi ke Telegram (Bot API) + cache konfigurasi.
//
// Prinsip: TIDAK BOLEH menghambat/menggagalkan operasi bisnis. `pushTelegram`
// never-throw + fire-and-forget (dipanggil dgn `void`). Konfigurasi diisi lewat
// UI Settings (tabel telegram_config); bot token = secret, tak pernah di-log.

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { hasCap } from './permissionService';

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

/** Low-level: POST sendMessage. Return {ok,error}. Dipakai test + pushTelegram.
 *  `replyMarkup` opsional: inline keyboard / force_reply (diteruskan apa adanya). */
export async function sendTelegramRaw(
  botToken: string,
  chatId: string,
  text: string,
  replyMarkup?: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
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

/** Jawab callback_query (hilangkan loading di tombol + tampilkan toast). Best-effort. */
async function answerCallbackQuery(botToken: string, callbackQueryId: string, text?: string): Promise<void> {
  try {
    await fetch(`${TELEGRAM_API}/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, ...(text ? { text, show_alert: false } : {}) }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch { /* never throw */ }
}

/** Edit teks pesan (mis. hapus tombol setelah diputuskan). Best-effort. */
async function editMessageText(botToken: string, chatId: string | number, messageId: number, text: string): Promise<void> {
  try {
    await fetch(`${TELEGRAM_API}/bot${botToken}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch { /* never throw */ }
}

/** Inline keyboard utk japri approval_pending (hanya di DM admin). */
function approvalKeyboard(requestId: string): unknown {
  return {
    inline_keyboard: [
      [
        { text: '✅ Setuju', callback_data: `apv:approve:${requestId}` },
        { text: '❌ Tolak', callback_data: `apv:reject:${requestId}` },
      ],
      [{ text: '✍️ Minta Revisi', callback_data: `apv:revise:${requestId}` }],
    ],
  };
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
export async function pushTelegramToUser(input: {
  chatId: string;
  type: string;
  title: string;
  message: string;
  // Bila diisi & type=approval_pending → pesan disertai tombol aksi (DM admin).
  requestId?: string;
  // Bila true, sertakan tombol approval. Dipakai utk membatasi tombol hanya ke admin.
  withApprovalButtons?: boolean;
}): Promise<void> {
  try {
    const cfg = await getConfig();
    if (!cfg || !cfg.enabled || !cfg.personalEnabled || !cfg.botToken) return;
    if (!typeEnabled(cfg, input.type)) return;
    const text = `<b>${escapeHtml(input.title)}</b>\n${escapeHtml(input.message)}`;
    const replyMarkup =
      input.type === 'approval_pending' && input.requestId && input.withApprovalButtons
        ? approvalKeyboard(input.requestId)
        : undefined;
    const result = await sendTelegramRaw(cfg.botToken, input.chatId, text, replyMarkup);
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
 * Tangani penekanan tombol approval (apv:<action>:<reqId>).
 * Keamanan: penekan WAJIB user Admin aktif yang tertaut (telegramChatId = from.id).
 * Never-throw.
 */
async function handleApprovalCallback(botToken: string, cb: any): Promise<void> {
  try {
    const cbId: string = cb.id;
    const data: string = cb.data ?? '';
    const fromId = cb.from?.id;
    const chatId = cb.message?.chat?.id;
    const messageId = cb.message?.message_id;
    const baseText: string = cb.message?.text ?? '';

    const parts = data.split(':');
    if (parts[0] !== 'apv' || parts.length < 3) {
      void answerCallbackQuery(botToken, cbId);
      return;
    }
    const action = parts[1] as 'approve' | 'reject' | 'revise';
    const requestId = parts.slice(2).join(':');

    // Verifikasi penekan = Admin aktif yang tertaut.
    const user = fromId != null
      ? await prisma.user.findFirst({
          where: { telegramChatId: String(fromId) },
          select: { id: true, role: true, isActive: true, fullName: true },
        })
      : null;
    // Hanya user aktif dgn capability 'approval.decide' (default Admin/super) yang boleh.
    if (!user || !user.isActive || !(await hasCap(user.role, 'approval.decide'))) {
      void answerCallbackQuery(botToken, cbId, 'Anda tidak berwenang menyetujui pengajuan.');
      return;
    }

    if (action === 'revise') {
      // Langkah-1: minta alasan via force_reply. Simpan state pending.
      await prisma.telegramPendingRevise.upsert({
        where: { chatId: String(chatId) },
        update: { requestId, actorUserId: user.id, createdAt: new Date() },
        create: { chatId: String(chatId), requestId, actorUserId: user.id },
      });
      void answerCallbackQuery(botToken, cbId, 'Balas dengan alasan revisi.');
      void sendTelegramRaw(
        botToken,
        String(chatId),
        '✍️ <b>Minta Revisi</b>\nBalas pesan ini dengan alasan revisi untuk pengaju.',
        { force_reply: true, input_field_placeholder: 'Alasan revisi…' },
      );
      return;
    }

    // approve / reject → eksekusi keputusan (sumber kebenaran tunggal).
    const { decideApproval } = await import('./approvalDecision');
    const result = await decideApproval({ requestId, action, actorUserId: user.id });

    if (!result.ok) {
      void answerCallbackQuery(botToken, cbId, result.error || 'Gagal memproses.');
      if (chatId != null && messageId != null) {
        void editMessageText(botToken, chatId, messageId, `${escapeHtml(baseText)}\n\n⚠️ ${escapeHtml(result.error || 'Gagal memproses.')}`);
      }
      return;
    }

    const statusLine =
      result.status === 'Approved'
        ? `✅ <b>Disetujui</b> oleh ${escapeHtml(user.fullName)}${result.docNumber ? ` — dokumen ${escapeHtml(result.docNumber)} dibuat` : ''}`
        : `❌ <b>Ditolak</b> oleh ${escapeHtml(user.fullName)}`;
    void answerCallbackQuery(botToken, cbId, result.status === 'Approved' ? 'Disetujui.' : 'Ditolak.');
    if (chatId != null && messageId != null) {
      void editMessageText(botToken, chatId, messageId, `${escapeHtml(baseText)}\n\n${statusLine}`);
    }
  } catch (err) {
    logger.warn({ err }, 'handleApprovalCallback error (diabaikan)');
  }
}

/**
 * Langkah-2 alur revisi: balasan teks admin dipakai sebagai alasan revisi.
 * Hanya berlaku bila ada pending utk chat ini. Never-throw.
 */
async function handleRevisionReply(botToken: string, chatId: string, text: string): Promise<void> {
  try {
    const pending = await prisma.telegramPendingRevise.findUnique({ where: { chatId } });
    if (!pending) return; // bukan balasan revisi → abaikan
    const reason = text.trim();
    if (!reason) {
      void sendTelegramRaw(botToken, chatId, '⚠️ Alasan revisi tidak boleh kosong. Balas lagi dengan alasannya.', { force_reply: true });
      return;
    }
    const { decideApproval } = await import('./approvalDecision');
    const result = await decideApproval({
      requestId: pending.requestId,
      action: 'revise',
      actorUserId: pending.actorUserId,
      note: reason,
    });
    await prisma.telegramPendingRevise.delete({ where: { chatId } }).catch(() => {});
    void sendTelegramRaw(
      botToken,
      chatId,
      result.ok
        ? '✍️ <b>Revisi diminta</b>\nPengaju telah diberi tahu untuk memperbaiki pengajuan.'
        : `⚠️ ${escapeHtml(result.error || 'Gagal meminta revisi.')}`,
    );
  } catch (err) {
    logger.warn({ err }, 'handleRevisionReply error (diabaikan)');
  }
}

/**
 * Poll getUpdates: tautkan /start <kode>, proses tombol approval (callback_query),
 * & tangkap balasan alasan revisi. Dipanggil cron tiap menit. Never-throw.
 * Tanpa webhook → getUpdates aman.
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

      // 1) Tombol approval (callback_query) — hanya admin tertaut yang boleh.
      if (upd.callback_query) {
        await handleApprovalCallback(cfg.botToken, upd.callback_query);
        continue;
      }

      const msg = upd.message;
      const text: string | undefined = msg?.text;
      const chatId = msg?.chat?.id;
      if (!text || chatId == null) continue;

      // 2) Penautan akun: /start <kode>
      const m = text.match(/^\/start\s+(\S+)/);
      if (m) {
        const code = m[1];
        const user = await prisma.user.findUnique({ where: { telegramLinkCode: code }, select: { id: true } });
        if (!user) continue;
        await prisma.user.update({
          where: { id: user.id },
          data: { telegramChatId: String(chatId), telegramLinkCode: null },
        });
        void sendTelegramRaw(cfg.botToken, String(chatId), '✅ <b>Telegram tertaut</b>\nAnda akan menerima notifikasi sistem di sini.');
        continue;
      }

      // 3) Balasan alasan revisi (langkah-2 dari tombol Minta Revisi).
      await handleRevisionReply(cfg.botToken, String(chatId), text);
    }
    if (maxId > 0) {
      await prisma.telegramConfig.update({ where: { slug: 'default' }, data: { lastUpdateId: BigInt(maxId) } });
    }
  } catch (err) {
    logger.warn({ err }, 'pollTelegramUpdates error (diabaikan)');
  }
}
