// Rate limit per token MCP: jendela geser in-memory (per proses). Cukup untuk satu instance
// (topologi saat ini). Multi-replika → batas efektif = limit × jumlah replika; pindahkan ke DB bila perlu.

const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

export interface RateResult {
  ok: boolean;
  retryAfterSec: number;
  remaining: number;
}

export function checkRate(tokenId: string, limitPerMin: number, now: number = Date.now()): RateResult {
  const limit = Math.max(1, limitPerMin);
  const recent = (hits.get(tokenId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(tokenId, recent);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000)), remaining: 0 };
  }
  recent.push(now);
  hits.set(tokenId, recent);
  return { ok: true, retryAfterSec: 0, remaining: limit - recent.length };
}

/** Untuk test. */
export function resetRateLimits(): void {
  hits.clear();
}
