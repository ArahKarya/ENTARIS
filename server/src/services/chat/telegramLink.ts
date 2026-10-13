// Kode penautan Telegram: Entaris menandatangani tiket link untuk pengguna yang login, engine
// menukarnya dengan kode sekali pakai (10 menit) + deep link t.me. Entaris tidak menyimpan kode;
// pengguna mengirim /link <kode> ke bot, atau membuka deep link.

import { BusinessError } from '../../utils/errors';
import { type EngineConfig } from './config';
import { signLinkTicket } from './consoleTicket';

const TIMEOUT_MS = 10_000;
const WINDOW_MS = 10 * 60_000;
export const LINK_CODES_PER_WINDOW = 5;

export interface TelegramLink {
  linkCode: string;
  expiresAt: string;
  bot: string | null;
  deepLink: string | null;
}

const requests = new Map<string, number[]>();

/** Batas pembuatan kode per pengguna (in-memory per proses). */
export function allowLinkRequest(userId: string, now: number = Date.now()): boolean {
  const recent = (requests.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LINK_CODES_PER_WINDOW) {
    requests.set(userId, recent);
    return false;
  }
  requests.set(userId, [...recent, now]);
  return true;
}

/** Hanya untuk tes. */
export function resetLinkRequests(): void {
  requests.clear();
}

interface EngineAnswer {
  code?: unknown;
  expiresAt?: unknown;
  bot?: unknown;
  deepLink?: unknown;
  error?: { code?: unknown };
}

const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export async function requestLinkCode(
  cfg: EngineConfig,
  user: { id: string; name: string },
  fetchImpl: typeof fetch = fetch,
): Promise<TelegramLink> {
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.turnSecret) {
    throw new BusinessError('AIRA Engine belum dikonfigurasi: isi AIRA_ENGINE_URL, AIRA_ENGINE_KEY, dan AIRA_ENGINE_TURN_SECRET di server.');
  }
  const { ticket } = signLinkTicket(cfg.turnSecret, user.id, user.name);
  let res: Response;
  try {
    res = await fetchImpl(`${cfg.baseUrl}/v1/telegram/link-codes`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ticket }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new BusinessError('AIRA Engine tidak dapat dihubungi. Coba lagi sebentar.');
  }
  const body = (await res.json().catch(() => ({}))) as EngineAnswer;
  if (res.status === 409 && body.error?.code === 'telegram_disabled') {
    throw new BusinessError('Bot Telegram AIRA belum aktif. Hubungi administrator.');
  }
  if (!res.ok) {
    throw new BusinessError('AIRA Engine menolak permintaan kode penautan. Hubungi administrator.');
  }
  const linkCode = text(body.code);
  const expiresAt = text(body.expiresAt);
  if (!linkCode || !expiresAt) throw new BusinessError('AIRA Engine menolak permintaan kode penautan. Hubungi administrator.');
  const deepLink = text(body.deepLink);
  return {
    linkCode,
    expiresAt,
    bot: text(body.bot),
    // Only a t.me link is ever handed to the browser.
    deepLink: deepLink && deepLink.startsWith('https://t.me/') ? deepLink : null,
  };
}
