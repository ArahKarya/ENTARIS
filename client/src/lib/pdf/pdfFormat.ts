/**
 * Number/date formatters and the translator for every PDF, a thin layer over lib/format so no template
 * formats on its own. Everything resolves at generation time, so a PDF follows the language of the user
 * who prints it.
 */
import i18n from '../../i18n';
import { LOCALE, parseDate, formatDate, formatDateTime, formatNumber, formatRupiah, type NumericInput, type DateInput } from '../format';

/** Angka ber-grup id-ID; desimal hingga `maxDecimals` (nol di belakang dibuang). */
export const pdfNum = (n: NumericInput, maxDecimals = 0): string => formatNumber(n, { maxDecimals });
/** Angka dengan desimal tetap. */
export const pdfFixed = (n: NumericInput, decimals: number): string => formatNumber(n, { decimals });
/** "Rp 1.250.000" (tanpa desimal secara default). */
export const pdfRp = (n: NumericInput, decimals = 0): string => formatRupiah(n, { decimals });
/** Rupiah tanpa simbol, untuk sel tabel dengan kolom berjudul "(Rp)". */
export const pdfMoney = (n: NumericInput, decimals = 0): string => formatRupiah(n, { decimals, symbol: false });
/** "4 Oktober 2026" */
export const pdfDate = (d: DateInput): string => formatDate(d, 'long');
/** "04 Okt 2026" */
export const pdfDateShort = (d: DateInput): string => formatDate(d, 'medium');
/** "04 Okt 2026 14.05" */
export const pdfDateTime = (d: DateInput): string => formatDateTime(d);
/** Waktu cetak (saat ini). */
export const pdfNow = (): string => formatDateTime(new Date());

const hasCents = (n: NumericInput): boolean => {
  const v = Number(n ?? 0);
  return Number.isFinite(v) && Math.abs(v - Math.round(v)) > 0.0000001;
};
/** Rupiah tanpa simbol; desimal (2) hanya bila nilainya memang pecahan — tidak mengubah nilai. */
export const pdfMoneyAuto = (n: NumericInput): string => pdfMoney(n, hasCents(n) ? 2 : 0);
/** "Rp 1.250.000" atau "Rp 1.250.000,50" bila pecahan. */
export const pdfRpAuto = (n: NumericInput): string => pdfRp(n, hasCents(n) ? 2 : 0);

/** "Senin, 5 Oktober 2026" — tanggal panjang dengan nama hari (laporan harian). */
export const pdfDateWeekday = (d: DateInput): string => {
  const date = parseDate(d);
  return date ? date.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—';
};

/** "Okt 26" / "Oct 26" for a "YYYY-MM" month key. */
export const pdfMonthShort = (key: string): string => {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(LOCALE, { month: 'short', year: '2-digit', timeZone: 'UTC' });
};

/**
 * Translator for the `pdf` namespace. Call it inside the template (never at module level) so the
 * document uses the printing user's current language.
 */
export const pdfT = () => i18n.getFixedT(null, 'pdf');
export type PdfT = ReturnType<typeof pdfT>;

/** Start loading the `pdf` namespace; resolves once its strings are available. */
export const loadPdfStrings = (): Promise<void> => i18n.loadNamespaces('pdf');
