/**
 * Design token bersama untuk SEMUA generator PDF (ERP + EAM).
 *
 * @react-pdf/renderer merender di luar DOM sehingga TIDAK bisa membaca
 * CSS variable Tailwind (`--primary: oklch(...)`) di index.css. Karena itu
 * nilai warna tema di-mirror manual di sini — SATU tempat, bukan hardcode
 * tersebar di tiap file PDF seperti sebelumnya.
 *
 * CATATAN WARNA: judul/garis memakai navy Entaris (BRAND.navy); isi tetap
 * hitam/abu supaya ramah cetak. Dokumen carbonless memakai CARBON (hitam-putih).
 *
 * Kalau tema UI berubah, ubah HANYA berkas ini.
 */

/** Warna brand Entaris (docs/brand/entaris/README.md) — navy untuk judul/garis, biru untuk aksen. */
export const BRAND = {
  navy: '#1B2B48',
  blue: '#2E5CA8',
  blueLt: '#EAF1FB',
} as const;

/** Ruang bawah halaman yang dicadangkan untuk PdfFooter (semua template). */
export const FOOTER_SPACE = 52;

/** Palet berwarna — dipakai laporan analitik & dokumen layar/arsip digital. */
export const C = {
  // Brand
  primary: '#1B2B48',    // navy Entaris
  primaryLt: '#EAF1FB',  // biru sangat muda (tanpa fill berat)
  accent: '#2E5CA8',     // biru Entaris

  // Netral
  dark: '#111827',
  mid: '#374151',
  muted: '#6b7280',
  faint: '#9ca3af',
  border: '#e5e7eb',
  bgLight: '#f9fafb',
  white: '#ffffff',
  black: '#000000',

  // Semantik status
  red: '#dc2626',
  redLt: '#fee2e2',
  redDk: '#b91c1c',
  green: '#16a34a',
  greenLt: '#dcfce7',
  greenDk: '#15803d',
  amber: '#d97706',
  amberLt: '#fffbeb',
  amberDk: '#b45309',
  orange: '#ea580c',
} as const;

/**
 * Palet dokumen cetak carbonless / dot-matrix (Surat Jalan, STT/BPB,
 * Transfer Gudang, Laporan Produksi). SENGAJA hitam-putih: background fill
 * tidak tembus ke rangkap 2/3 pada kertas NCR, jadi hierarki visual
 * mengandalkan ketebalan garis + bold, bukan warna.
 */
export const CARBON = {
  black: '#000000',
  white: '#ffffff',
  grey: '#555555',
  light: '#cccccc',
  shade: '#f5f5f5',
} as const;

/** Skala tipografi bersama. Helvetica = font bawaan react-pdf (tanpa unduh). */
export const F = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  oblique: 'Helvetica-Oblique',
} as const;

/** Ukuran halaman standar: laporan padat vs dokumen cetak. */
export const PAGE = {
  report: { paddingTop: 36, paddingBottom: 56, paddingHorizontal: 36, fontSize: 8.5 },
  compact: { paddingTop: 30, paddingBottom: 50, paddingHorizontal: 30, fontSize: 7.5 },
  document: { paddingTop: 32, paddingBottom: 24, paddingHorizontal: 32, fontSize: 10 },
} as const;

/** Varian pastel untuk badge status & angka di atas latar gelap. */
export const BADGE = {
  yellowLt: '#fef9c3',
  yellowDk: '#a16207',
  amberBorder: '#fde68a',
  amberText: '#92400e',
  greenSoft: '#86efac',
  redSoft: '#fca5a5',
} as const;

/** Gaya halaman dokumen carbonless (Surat Jalan, BPB, Transfer, Proses Produksi). */
export const NCR_PAGE = {
  fontFamily: F.regular,
  fontSize: 10,
  color: CARBON.black,
  paddingTop: 30,
  backgroundColor: CARBON.white,
  paddingHorizontal: 32,
} as const;
