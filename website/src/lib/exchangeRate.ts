/*
 * Daily USD to IDR rate for the AIRA price table. Primary source: Frankfurter (European Central Bank
 * reference rates, no key). Secondary: open.er-api.com. If both fail, the last rate written below is
 * used and labelled with its own date, so the page never shows an empty or invented number.
 */

export type UsdIdrRate = { rate: number; date: string; live: boolean };

const FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=IDR";
const OPEN_ER_URL = "https://open.er-api.com/v6/latest/USD";
const REVALIDATE_SECONDS = 60 * 60 * 24;
const FETCH_TIMEOUT_MS = 8000;

/** Used only when every source fails. Update the date whenever the number is updated. */
export const FALLBACK_RATE: UsdIdrRate = { rate: 17881, date: "2026-10-13", live: false };

/** A plausible band for USD to IDR; anything outside it is treated as a bad response, not a rate. */
const MIN_PLAUSIBLE = 5000;
const MAX_PLAUSIBLE = 50000;

const isPlausible = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= MIN_PLAUSIBLE && n <= MAX_PLAUSIBLE;
const isIsoDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function parseFrankfurter(json: unknown): UsdIdrRate | null {
  const body = json as { date?: unknown; rates?: { IDR?: unknown } } | null;
  const rate = body?.rates?.IDR;
  if (!isPlausible(rate) || !isIsoDate(body?.date)) return null;
  return { rate, date: body.date, live: true };
}

export function parseOpenEr(json: unknown): UsdIdrRate | null {
  const body = json as { result?: unknown; time_last_update_unix?: unknown; rates?: { IDR?: unknown } } | null;
  const rate = body?.rates?.IDR;
  const unix = body?.time_last_update_unix;
  if (body?.result !== "success" || !isPlausible(rate) || typeof unix !== "number") return null;
  return { rate, date: new Date(unix * 1000).toISOString().slice(0, 10), live: true };
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function getUsdIdrRate(): Promise<UsdIdrRate> {
  const sources: readonly [string, (json: unknown) => UsdIdrRate | null][] = [
    [FRANKFURTER_URL, parseFrankfurter],
    [OPEN_ER_URL, parseOpenEr],
  ];
  for (const [url, parse] of sources) {
    try {
      const parsed = parse(await fetchJson(url));
      if (parsed) return parsed;
    } catch {
      // try the next source
    }
  }
  return FALLBACK_RATE;
}

/** "13 Oktober 2026" from an ISO date. */
export function formatRateDate(isoDate: string): string {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${isoDate}T00:00:00Z`));
}
