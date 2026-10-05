// Konfigurasi panel chat AIRA (semua dari ENV; tidak ada di Settings UI).

export interface EngineConfig {
  /** Basis URL engine AIRA (tanpa /v1). null bila belum dikonfigurasi. */
  baseUrl: string | null;
  apiKey: string | null;
  model: string;
  /** Batas diam (ms) tanpa byte dari engine sebelum giliran dianggap timeout. */
  timeoutMs: number;
  /** Rahasia penanda tiket giliran (HMAC); kosong = tiket tidak dibuat. */
  turnSecret: string | null;
  /** Sisipkan tiket giliran sebagai baris pertama pesan pengguna terakhir. */
  turnInMessage: boolean;
  /** Teruskan PDF sebagai bagian `file` OpenAI (default: tolak, engine hanya membaca gambar). */
  acceptPdf: boolean;
}

function intEnv(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number): number {
  const n = Number(env[key]);
  return Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : fallback;
}

export function getEngineConfig(env: NodeJS.ProcessEnv = process.env): EngineConfig {
  const raw = env.AIRA_ENGINE_URL?.trim();
  const baseUrl = raw ? raw.replace(/\/+$/, '').replace(/\/v1$/, '') : null;
  return {
    baseUrl,
    apiKey: env.AIRA_ENGINE_KEY?.trim() || null,
    model: env.AIRA_ENGINE_MODEL?.trim() || 'aira',
    timeoutMs: intEnv(env, 'AIRA_ENGINE_TIMEOUT_MS', 120_000, 1_000, 900_000),
    turnSecret: env.AIRA_ENGINE_TURN_SECRET?.trim() || null,
    turnInMessage: env.AIRA_ENGINE_TURN_IN_MESSAGE !== 'false',
    acceptPdf: env.AIRA_ENGINE_ACCEPT_PDF === 'true',
  };
}

export const isEngineConfigured = (c: EngineConfig = getEngineConfig()): boolean => !!c.baseUrl && !!c.apiKey;

export interface ChatLimits {
  maxInputChars: number;
  turnsPerMinute: number;
  /** Anggaran jendela konteks (token ≈ karakter / 4) untuk pesan terbaru. */
  windowTokens: number;
  /** Batas keras jendela saat peringkasan gagal (pesan mentah tetap dikirim sejauh muat). */
  hardWindowTokens: number;
  /** Selang flush teks asisten ke DB selama streaming (ms). */
  flushMs: number;
}

export function getChatLimits(env: NodeJS.ProcessEnv = process.env): ChatLimits {
  const windowTokens = intEnv(env, 'AIRA_CHAT_WINDOW_TOKENS', 6_000, 200, 200_000);
  return {
    maxInputChars: intEnv(env, 'AIRA_CHAT_MAX_INPUT_CHARS', 8_000, 100, 100_000),
    turnsPerMinute: intEnv(env, 'AIRA_CHAT_TURNS_PER_MIN', 20, 1, 1_000),
    windowTokens,
    hardWindowTokens: intEnv(env, 'AIRA_CHAT_HARD_WINDOW_TOKENS', windowTokens * 3, windowTokens, 400_000),
    flushMs: intEnv(env, 'AIRA_CHAT_FLUSH_MS', 1_500, 50, 60_000),
  };
}

/** Retensi (hari) sesi ARSIP; undefined = tidak pernah dihapus otomatis (default). */
export function getRetentionDays(env: NodeJS.ProcessEnv = process.env): number | undefined {
  const n = Number(env.AIRA_CHAT_RETENTION_DAYS);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : undefined;
}
