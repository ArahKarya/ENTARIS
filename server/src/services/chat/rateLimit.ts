// Batas giliran per pengguna (jendela geser 60 dtk, in-memory per proses).

const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

export type RateResult = { ok: true } | { ok: false; retryAfterSec: number };

export function checkTurnRate(userId: string, limit: number, now: number = Date.now()): RateResult {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(userId, recent);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000)) };
  }
  hits.set(userId, [...recent, now]);
  return { ok: true };
}

/** Hanya untuk tes. */
export function resetTurnRate(): void {
  hits.clear();
}
