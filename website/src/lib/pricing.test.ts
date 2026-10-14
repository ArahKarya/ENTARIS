import { describe, expect, it } from "vitest";
import { AIRA_PLANS, formatRupiah, priceRupiah } from "./airaPricing";
import { FALLBACK_RATE, formatRateDate, parseFrankfurter, parseOpenEr } from "./exchangeRate";

describe("priceRupiah", () => {
  it("applies the 1.2 markup, converts at the rate and rounds to Rp100", () => {
    expect(priceRupiah(2, 17881)).toBe(42900);
    expect(priceRupiah(10, 17881)).toBe(214600);
    expect(priceRupiah(0.1, 17881)).toBe(2100);
    expect(priceRupiah(0.5, 17881)).toBe(10700);
  });

  it("scales with the daily rate", () => {
    expect(priceRupiah(10, 16000)).toBe(192000);
  });

  it("keeps every plan priced above its converted base cost", () => {
    for (const plan of AIRA_PLANS) {
      const { input, output } = plan.baseUsdPerMillionTokens;
      expect(priceRupiah(input, 17881)).toBeGreaterThan(input * 17881 - 100);
      expect(priceRupiah(output, 17881)).toBeGreaterThan(output * 17881 - 100);
    }
  });
});

describe("formatRupiah", () => {
  it("uses Indonesian thousands separators", () => {
    expect(formatRupiah(42900)).toBe("Rp42.900");
    expect(formatRupiah(2100)).toBe("Rp2.100");
  });
});

describe("exchange rate parsing", () => {
  it("reads a Frankfurter response", () => {
    expect(parseFrankfurter({ amount: 1, base: "USD", date: "2026-10-13", rates: { IDR: 17881 } })).toEqual({ rate: 17881, date: "2026-10-13", live: true });
  });

  it("reads an open.er-api response and derives the date", () => {
    const parsed = parseOpenEr({ result: "success", time_last_update_unix: 1791936152, rates: { IDR: 17900.5 } });
    expect(parsed).toEqual({ rate: 17900.5, date: "2026-10-14", live: true });
  });

  it("rejects missing, implausible or malformed data", () => {
    expect(parseFrankfurter(null)).toBeNull();
    expect(parseFrankfurter({ date: "2026-10-13", rates: {} })).toBeNull();
    expect(parseFrankfurter({ date: "2026-10-13", rates: { IDR: 1 } })).toBeNull();
    expect(parseFrankfurter({ date: "kemarin", rates: { IDR: 17881 } })).toBeNull();
    expect(parseOpenEr({ result: "error", rates: { IDR: 17881 } })).toBeNull();
    expect(parseOpenEr({ result: "success", time_last_update_unix: 1, rates: { IDR: "17881" } })).toBeNull();
  });

  it("has a plausible labelled fallback", () => {
    expect(FALLBACK_RATE.live).toBe(false);
    expect(FALLBACK_RATE.rate).toBeGreaterThan(5000);
  });

  it("formats the date in Indonesian", () => {
    expect(formatRateDate("2026-10-13")).toBe("13 Oktober 2026");
  });
});
