/*
 * AIRA usage price when the customer uses AI supplied by us: the AI provider's base price per million
 * tokens (USD) times the markup, converted to rupiah at the daily rate. The base prices were read from
 * the provider's public price page on 14 October 2026; recheck them before changing the markup or
 * adding a plan. Plans carry generic names on purpose, the model behind each is not published here.
 */

export const AIRA_MARKUP = 1.2;

/** Displayed prices are rounded to the nearest multiple of this many rupiah. */
const ROUNDING_RUPIAH = 100;

export type AiraPlan = {
  id: "standar" | "hemat";
  name: string;
  summary: string;
  baseUsdPerMillionTokens: { input: number; output: number };
};

export const AIRA_PLANS: readonly AiraPlan[] = [
  { id: "standar", name: "AI dari kami: Standar", summary: "Model yang lebih mampu untuk tugas rumit.", baseUsdPerMillionTokens: { input: 2, output: 10 } },
  { id: "hemat", name: "AI dari kami: Hemat", summary: "Model yang lebih ringan dan murah untuk tugas sederhana.", baseUsdPerMillionTokens: { input: 0.1, output: 0.5 } },
];

/** Customer price in rupiah per million tokens for a base USD price at the given USD to IDR rate. */
export function priceRupiah(baseUsd: number, usdToIdr: number): number {
  const raw = baseUsd * AIRA_MARKUP * usdToIdr;
  return Math.round(raw / ROUNDING_RUPIAH) * ROUNDING_RUPIAH;
}

export function formatRupiah(amount: number): string {
  return `Rp${new Intl.NumberFormat("id-ID").format(amount)}`;
}
