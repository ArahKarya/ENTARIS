// Konstanta layer MCP (AIRA). Satu tempat agar spesifikasi assertion/tier tidak tersebar.

/** Masa berlaku actor assertion (detik) sejak `ts`. */
export const ASSERTION_TTL_SEC = 120;
/** Toleransi jam: `ts` boleh lebih maju sebanyak ini dari jam server. */
export const ASSERTION_FUTURE_SKEW_SEC = 30;
/** Nonce disimpan sampai ts + TTL + skew supaya replay di dalam jendela tetap tertolak. */
export const NONCE_RETENTION_SEC = ASSERTION_TTL_SEC + ASSERTION_FUTURE_SKEW_SEC;

export const ASSERTION_CHANNELS = ['whatsapp', 'telegram', 'panel', 'cli'] as const;
export type AssertionChannel = (typeof ASSERTION_CHANNELS)[number];

/** Level AIRA per user. */
export const AIRA_TIERS = ['read', 'standard', 'direct'] as const;
export type AiraTier = (typeof AIRA_TIERS)[number];

/** Batas ukuran body JSON-RPC (cukup untuk jurnal ratusan baris, menolak payload liar). */
export const MCP_BODY_LIMIT = '256kb';
/** Batas karakter hasil tool yang dikirim ke agen sebelum dipotong. */
export const MAX_RESULT_CHARS = 60_000;
/** Timeout panggilan handler internal. */
export const HANDLER_TIMEOUT_MS = 60_000;
/** Masa berlaku JWT internal untuk satu panggilan handler (detik). */
export const INTERNAL_JWT_TTL_SEC = 120;
/** Default batas panggilan per menit per token. */
export const DEFAULT_RATE_LIMIT_PER_MIN = 120;

export const TOKEN_PREFIX = 'entmcp_';
export const SECRET_PREFIX = 'entsig_';
